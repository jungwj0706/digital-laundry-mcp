import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import type { Finding } from "../domain/types.js";
import { readAudit, clearAuditCache, countAudits } from "./auditCache.js";
import { createCleanupReport } from "./reportService.js";
import { redactSensitive } from "../security/redact.js";
import { resolveExportFile } from "../security/exportPath.js";
import {
  CASE_STATUSES,
  type CaseStatus,
  type StoredCase,
  withCaseStore,
} from "../storage/sqliteStore.js";

const NEXT_STEP: Record<CaseStatus, string> = {
  found: "본인 게시물인지 확인하세요.",
  user_verified: "입증자료를 준비하세요.",
  evidence_gathering: "신청 또는 문의 초안을 검토하세요.",
  draft_ready: "공식 경로에서 직접 제출할지 정하세요.",
  user_submitted: "사용자가 제출했다고 표시한 기록입니다. 서버가 제출을 확인하지는 않았습니다.",
  waiting_for_response: "답변을 기다리거나 추가 요청을 기록하세요.",
  additional_evidence_requested: "요청된 자료만 추가로 준비하세요.",
  resolved: "종료해도 되는지 확인하세요.",
  closed: "로컬 기록을 더 이상 쓰지 않으면 삭제할 수 있습니다.",
};

export function assertRetention(config: AppConfig, requested: number | undefined): number {
  const cap = Math.min(30, config.retentionDays);
  if (requested === undefined) {
    return cap;
  }
  if (!Number.isInteger(requested) || requested < 1 || requested > cap) {
    throw new AppError(
      "invalid_input",
      `보존 기간은 1일부터 ${cap}일까지로만 줄일 수 있습니다.`,
      false,
      "기본값보다 짧거나 같은 일수를 입력하세요.",
    );
  }
  return requested;
}

function requireSaveConsent(confirmed: boolean): void {
  if (confirmed !== true) {
    throw new AppError(
      "consent_required",
      "저장 확인이 없어 사건을 저장하지 않았습니다.",
      false,
      "내용을 확인한 뒤 confirmedUserSave를 true로 다시 호출하세요.",
    );
  }
}

export function saveAuditAsCase(
  config: AppConfig,
  input: {
    auditId: string;
    caseTitle: string;
    confirmedUserSave: boolean;
    includeSnippets?: boolean;
    retentionDays?: number;
  },
  now = new Date(),
): { caseId: string; status: CaseStatus; expiresAt: string; snippetStored: boolean } {
  requireSaveConsent(input.confirmedUserSave);
  const audit = readAudit(input.auditId, now.getTime());
  if (!audit) {
    throw new AppError("not_found", "저장할 점검 결과가 메모리에 없습니다.", false, "점검을 다시 실행하세요.");
  }
  const retentionDays = assertRetention(config, input.retentionDays);
  const includeSnippets = input.includeSnippets === true;
  const caseId = crypto.randomUUID();
  const expires = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  withCaseStore(config, now, (store) => {
    store.insertCase({
      id: caseId,
      title: input.caseTitle,
      status: "found",
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      auditId: audit.auditId,
      provider: audit.provider,
      mode: audit.mode,
      includeSnippets,
      findings: audit.findings.map((finding) => ({
        id: finding.id,
        url: finding.url,
        title: finding.title,
        ...(includeSnippets && finding.snippet ? { snippet: finding.snippet } : {}),
        domain: finding.domain,
        sourceType: finding.sourceType,
        matchConfidence: finding.matchConfidence,
        riskScore: finding.riskScore,
        riskLevel: finding.riskLevel,
        isDemo: finding.isDemo,
        urgentHumanSupport: finding.urgentHumanSupport,
      })),
    });
  });
  return {
    caseId,
    status: "found",
    expiresAt: expires.toISOString(),
    snippetStored: includeSnippets,
  };
}

export function listCases(
  config: AppConfig,
  input: { status?: CaseStatus; page?: number; pageSize?: number },
  now = new Date(),
): { cases: Array<StoredCase & { nextStep: string }>; page: number } {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 50);
  const cases = withCaseStore(config, now, (store) =>
    store.listCases(input.status, pageSize, (page - 1) * pageSize));
  return {
    page,
    cases: cases.map((item) => ({
      ...item,
      title: redactSensitive(item.title),
      nextStep: NEXT_STEP[item.status],
    })),
  };
}

export function getCaseDetails(config: AppConfig, caseId: string, now = new Date()): StoredCase & { nextStep: string } {
  const found = withCaseStore(config, now, (store) => store.getCase(caseId));
  if (!found) {
    throw new AppError("not_found", "해당 사건이 없습니다.", false, "list_cases로 식별자를 확인하세요.");
  }
  return { ...found, nextStep: NEXT_STEP[found.status] };
}

export function updateCaseStatus(
  config: AppConfig,
  input: { caseId: string; status: CaseStatus; note?: string },
  now = new Date(),
): { caseId: string; status: CaseStatus; userAsserted: boolean } {
  if (!CASE_STATUSES.includes(input.status)) {
    throw new AppError("invalid_input", "허용되지 않은 상태입니다.", false, "정해진 상태 값만 사용하세요.");
  }
  const updated = withCaseStore(config, now, (store) =>
    store.updateStatus(input.caseId, input.status, input.note, now));
  if (!updated) {
    throw new AppError("not_found", "상태를 바꿀 사건이 없습니다.", false, "사건 식별자를 확인하세요.");
  }
  return {
    caseId: input.caseId,
    status: input.status,
    userAsserted: input.status === "user_submitted",
  };
}

export function exportCaseReport(
  config: AppConfig,
  input: { caseId: string; format: "markdown" | "json" | "html"; fileName: string; confirmedExport: boolean },
  now = new Date(),
): { fileName: string; warning: string } {
  if (input.confirmedExport !== true) {
    throw new AppError(
      "consent_required",
      "내보내기 확인이 없어 파일을 쓰지 않았습니다.",
      false,
      "confirmedExport를 true로 다시 호출하세요.",
    );
  }
  const stored = getCaseDetails(config, input.caseId, now);
  const findings = stored.findings.map((finding) => toReportFinding(stored.id, finding));
  const report = createCleanupReport({ findings, format: input.format, redactSensitive: true });
  mkdirSync(config.exportDir, { recursive: true });
  const target = resolveExportFile(config.exportDir, input.fileName);
  writeFileSync(target, report.content, { encoding: "utf8", mode: 0o600 });
  return {
    fileName: path.basename(target),
    warning: "내보낸 파일은 암호화되지 않은 평문이며 이 기기에 남습니다.",
  };
}

export function deleteLocalData(
  config: AppConfig,
  input: {
    scope: "all" | "case" | "profile" | "cache";
    caseId?: string;
    confirmedDelete: boolean;
    previewOnly?: boolean;
  },
  now = new Date(),
): {
  preview: boolean;
  deleted: { scope: string; count: number }[];
  failures: { scope: string; message: string }[];
} {
  if (input.confirmedDelete !== true && input.previewOnly !== true) {
    throw new AppError(
      "consent_required",
      "삭제 확인이 없어 아무것도 지우지 않았습니다.",
      false,
      "previewOnly로 개수를 보거나 confirmedDelete를 true로 호출하세요.",
    );
  }
  const deleted: { scope: string; count: number }[] = [];
  const failures: { scope: string; message: string }[] = [];
  const preview = input.previewOnly === true;
  const touchStore = input.scope !== "cache";
  if (touchStore && !config.persistenceEnabled) {
    failures.push({ scope: input.scope, message: "로컬 저장이 꺼져 있어 사건 파일을 바꾸지 못했습니다." });
  }
  if (input.scope === "cache" || input.scope === "all") {
    const count = countAudits(now.getTime());
    if (!preview) {
      clearAuditCache();
    }
    deleted.push({ scope: "cache", count });
  }
  if (!touchStore || !config.persistenceEnabled) {
    return { preview, deleted, failures };
  }
  withCaseStore(config, now, (store) => {
    const counts = store.counts();
    if (input.scope === "all") {
      if (preview) {
        deleted.push({ scope: "cases", count: counts.cases }, { scope: "profile", count: counts.consents });
        return;
      }
      deleted.push({ scope: "cases", count: store.deleteAllCases() });
      return;
    }
    if (input.scope === "profile") {
      deleted.push({ scope: "profile", count: preview ? counts.consents : store.deleteConsents() });
      return;
    }
    if (!input.caseId) {
      failures.push({ scope: "case", message: "caseId가 필요합니다." });
      return;
    }
    const exists = store.getCase(input.caseId);
    if (!exists) {
      failures.push({ scope: "case", message: "해당 사건이 없습니다." });
      return;
    }
    if (preview) {
      deleted.push({ scope: "case", count: 1 });
      return;
    }
    deleted.push({ scope: "case", count: store.deleteCase(input.caseId) ? 1 : 0 });
  });
  return { preview, deleted, failures };
}

function toReportFinding(caseId: string, finding: StoredCase["findings"][number]): Finding {
  const riskLevel = finding.riskLevel === "low"
    || finding.riskLevel === "moderate"
    || finding.riskLevel === "high"
    || finding.riskLevel === "critical_review"
    || finding.riskLevel === "unknown"
    ? finding.riskLevel
    : "unknown";
  return {
    id: finding.id,
    auditId: caseId,
    sourceType: finding.sourceType,
    title: finding.title,
    url: finding.url,
    domain: finding.domain,
    ...(finding.snippet ? { snippet: finding.snippet } : {}),
    matchConfidence: finding.matchConfidence,
    riskScore: finding.riskScore,
    riskLevel,
    signals: [],
    reasons: ["저장된 로컬 사건에서 복원했습니다."],
    unknowns: [],
    authorRelation: "unknown",
    recommendedNextSteps: ["사용자가 저장한 상태를 확인하세요."],
    verificationRequired: true,
    isDemo: finding.isDemo,
    urgentHumanSupport: finding.urgentHumanSupport,
  };
}
