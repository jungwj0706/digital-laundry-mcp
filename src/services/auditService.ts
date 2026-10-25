import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env.js";
import type { AuditResult, Finding } from "../domain/types.js";
import { analyzeFootprint } from "../domain/scoring.js";
import { AppError } from "../domain/errors.js";
import type { ProviderRuntime } from "../providers/selectSearchProvider.js";
import { selectSearchProvider } from "../providers/selectSearchProvider.js";
import { saveAudit } from "./auditCache.js";
import { planQueries } from "./queryPlanner.js";
import { executeSearch } from "./searchService.js";

const RISK_RANK = {
  critical_review: 0,
  high: 1,
  unknown: 2,
  moderate: 3,
  low: 4,
} as const;

export interface AuditRequest {
  aliases: string[];
  keywords?: string[];
  domains?: string[];
  includeEmailSearch?: boolean;
  emailAddresses?: string[];
  maxResultsPerQuery?: number;
  maxQueries?: number;
  confirmExternalSearch: boolean;
  demoMode?: boolean;
}

export async function runDigitalLaundryAudit(
  config: AppConfig,
  request: AuditRequest,
  deps: ProviderRuntime = {},
): Promise<AuditResult> {
  if (request.confirmExternalSearch !== true) {
    throw new AppError(
      "consent_required",
      "외부 검색 동의가 없어 점검을 시작하지 않았습니다.",
      false,
      "전송에 동의하면 confirmExternalSearch를 true로 다시 호출하세요.",
    );
  }
  const selected = selectSearchProvider(config, request.demoMode, deps);
  if (selected instanceof AppError) {
    throw selected;
  }
  const plan = planQueries({
    aliases: request.aliases,
    ...(request.keywords ? { keywords: request.keywords } : {}),
    ...(request.domains ? { domains: request.domains } : {}),
    ...(request.includeEmailSearch !== undefined
      ? { includeEmailSearch: request.includeEmailSearch }
      : {}),
    ...(request.emailAddresses ? { emailAddresses: request.emailAddresses } : {}),
    maxQueries: Math.min(request.maxQueries ?? 8, config.searchMaxQueries),
  });
  const run = await executeSearch({
    provider: selected.provider,
    queries: plan.queries,
    count: Math.min(request.maxResultsPerQuery ?? 10, config.searchMaxResults),
    pauseMs: selected.mode === "live" ? 100 : 0,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
  });
  const auditId = randomUUID();
  const findings = run.results
    .map((result) => toFinding(auditId, result, request.aliases, request.keywords))
    .sort(compareFindings);
  const summary = {
    low: findings.filter((item) => item.riskLevel === "low").length,
    moderate: findings.filter((item) => item.riskLevel === "moderate").length,
    high: findings.filter((item) => item.riskLevel === "high").length,
    criticalReview: findings.filter((item) => item.riskLevel === "critical_review").length,
    needsManualReview: findings.filter((item) => item.verificationRequired || item.urgentHumanSupport).length,
    unknown: findings.filter((item) => item.riskLevel === "unknown").length,
  };
  const audit: AuditResult = {
    auditId,
    mode: selected.mode,
    provider: selected.provider.name,
    searchedAt: new Date().toISOString(),
    queriesExecutedCount: run.queriesExecutedCount,
    totalResults: findings.length,
    findings,
    summary,
    partialFailures: run.partialFailures,
    coverageNotice: selected.mode === "demo"
      ? "시연용 가상 데이터입니다. 공개 웹 전체를 조사한 것이 아니며, 점수는 법적 판단이 아닙니다."
      : "공개 웹 검색 결과만 포함합니다. 로그인 뒤의 글은 보지 않았고, 점수는 법적 판단이 아닙니다.",
    nextSteps: [
      "각 결과의 일치 신뢰도와 위험 점수를 따로 읽으세요.",
      "본인 글인지, 작성 당시 나이와 식별 정보가 있는지는 사용자가 확인해야 합니다.",
      "삭제나 신고는 이 점검으로 제출되지 않습니다.",
    ],
  };
  saveAudit(audit);
  return audit;
}

function toFinding(
  auditId: string,
  result: { id: string; sourceType: Finding["sourceType"]; title: string; url: string; domain: string; snippet?: string; isDemo: boolean },
  aliases: string[],
  keywords: string[] | undefined,
): Finding {
  const analysis = analyzeFootprint({
    title: result.title,
    ...(result.snippet !== undefined ? { snippet: result.snippet } : {}),
    aliases,
    ...(keywords ? { keywords } : {}),
  });
  return {
    id: result.id,
    auditId,
    sourceType: result.sourceType,
    title: result.title,
    url: result.url,
    domain: result.domain,
    ...(result.snippet !== undefined ? { snippet: result.snippet } : {}),
    matchConfidence: analysis.matchConfidence,
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    signals: analysis.signals,
    reasons: analysis.reasons,
    unknowns: analysis.unknowns,
    authorRelation: "unknown",
    recommendedNextSteps: analysis.recommendedNextSteps,
    verificationRequired: true,
    isDemo: result.isDemo,
    urgentHumanSupport: analysis.urgentHumanSupport,
  };
}

function compareFindings(left: Finding, right: Finding): number {
  if (left.urgentHumanSupport !== right.urgentHumanSupport) {
    return left.urgentHumanSupport ? -1 : 1;
  }
  const rank = RISK_RANK[left.riskLevel] - RISK_RANK[right.riskLevel];
  if (rank !== 0) {
    return rank;
  }
  return (right.riskScore ?? -1) - (left.riskScore ?? -1);
}
