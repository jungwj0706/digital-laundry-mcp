import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { analyzeFootprint, OFFICIAL_SUPPORT_CONTACTS } from "../domain/scoring.js";
import { AppError, errorResult } from "../domain/errors.js";
import {
  auditResultSchema,
  authorRelationSchema,
  matchConfidenceSchema,
  riskLevelSchema,
  signalSchema,
  toolFailureSchema,
} from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import type { ProviderRuntime } from "../providers/selectSearchProvider.js";
import { runDigitalLaundryAudit } from "../services/auditService.js";

const analyzeInputSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(300),
  snippet: z.string().max(500).optional(),
  pageText: z.string().max(8000).optional(),
  aliases: z.array(z.string().min(1).max(80)).max(10).optional(),
  keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
  imageMatchType: z.enum(["full", "partial", "visually_similar", "matching_page"]).optional(),
  userConfirmedUrl: z.boolean().optional(),
  authorRelation: authorRelationSchema.optional(),
});

const analyzeOutputSchema = z.object({
  ok: z.literal(true),
  url: z.string(),
  authorRelation: authorRelationSchema,
  matchConfidence: matchConfidenceSchema,
  riskScore: z.number().int().min(0).max(100).nullable(),
  riskLevel: riskLevelSchema,
  signals: z.array(signalSchema),
  reasons: z.array(z.string()),
  unknowns: z.array(z.string()),
  verificationQuestions: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  urgentHumanSupport: z.boolean(),
  officialContacts: z.array(z.string()),
  sourceNotes: z.array(z.object({
    source: z.enum(["title", "snippet", "page_text", "user_confirmed", "image_provider"]),
    note: z.string(),
  })),
  disclaimer: z.string(),
});

const auditInputSchema = z.object({
  aliases: z.array(z.string().min(1).max(80)).min(1).max(10),
  keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
  domains: z.array(z.string().min(1).max(253)).max(10).optional(),
  includeEmailSearch: z.boolean().optional(),
  emailAddresses: z.array(z.string().max(200)).max(3).optional(),
  maxResultsPerQuery: z.number().int().min(1).max(20).optional(),
  maxQueries: z.number().int().min(1).max(20).optional(),
  confirmExternalSearch: z.boolean(),
  demoMode: z.boolean().optional(),
});

const auditOutputSchema = auditResultSchema.extend({ ok: z.literal(true) });

export function registerAnalysisTools(
  server: McpServer,
  config: AppConfig,
  deps: ProviderRuntime = {},
): void {
  server.registerTool(
    "analyze_footprint_candidate",
    {
      title: "흔적 후보 분석",
      description:
        "이미 찾은 공개 페이지 후보의 일치 신뢰도와 위험 점수를 근거와 함께 계산합니다. 페이지 본문은 사용자가 넣은 불신 데이터이며, 위험 점수는 법적 판단이 아닙니다.",
      inputSchema: analyzeInputSchema,
      outputSchema: z.union([analyzeOutputSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      const analysis = analyzeFootprint({
        title: input.title,
        ...(input.snippet !== undefined ? { snippet: input.snippet } : {}),
        ...(input.pageText !== undefined ? { pageText: input.pageText } : {}),
        ...(input.aliases ? { aliases: input.aliases } : {}),
        ...(input.keywords ? { keywords: input.keywords } : {}),
        ...(input.imageMatchType ? { imageMatchType: input.imageMatchType } : {}),
        ...(input.userConfirmedUrl !== undefined ? { userConfirmedUrl: input.userConfirmedUrl } : {}),
      });
      logEvent({
        event: "tool",
        toolName: "analyze_footprint_candidate",
        durationMs: Date.now() - started,
        resultCount: analysis.signals.length,
        correlationId: crypto.randomUUID(),
      });
      const summary = [
        `일치 신뢰도 ${analysis.matchConfidence}`,
        `위험 ${analysis.riskLevel}${analysis.riskScore === null ? "" : ` ${analysis.riskScore}`}`,
        analysis.urgentHumanSupport
          ? `사람 지원이 필요합니다. ${OFFICIAL_SUPPORT_CONTACTS.join(", ")}`
          : "긴급 지원 신호는 없습니다.",
        "점수는 법적 판단이 아닙니다.",
      ].join("\n");
      return {
        content: [{ type: "text" as const, text: summary }],
        structuredContent: {
          ok: true as const,
          url: input.url,
          authorRelation: input.authorRelation ?? "unknown",
          ...analysis,
          disclaimer: "critical_review를 포함해 모든 위험 등급은 검토 순서일 뿐 위법 여부의 확정이 아닙니다.",
        },
      };
    },
  );

  server.registerTool(
    "run_digital_laundry_audit",
    {
      title: "디지털 세탁 점검",
      description:
        "별칭으로 공개 웹을 검색하고 위험과 일치 신뢰도를 설명합니다. confirmExternalSearch가 true일 때만 검색 제공자에게 별칭이 전송됩니다. 게시물을 삭제하거나 신고하지 않습니다.",
      inputSchema: auditInputSchema,
      outputSchema: z.union([auditOutputSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      try {
        const audit = await runDigitalLaundryAudit(config, input, deps);
        logEvent({
          event: "tool",
          toolName: "run_digital_laundry_audit",
          durationMs: Date.now() - started,
          resultCount: audit.totalResults,
          provider: audit.provider,
          correlationId: crypto.randomUUID(),
        });
        return {
          content: [{
            type: "text" as const,
            text: [
              `${audit.mode === "demo" ? "시연용 가상 데이터" : "라이브"} 점검 ${audit.totalResults}건`,
              `실행한 검색어 ${audit.queriesExecutedCount}개`,
              `높음 ${audit.summary.high}, 긴급 검토 ${audit.summary.criticalReview}, 불명 ${audit.summary.unknown}`,
              audit.coverageNotice,
            ].join("\n"),
          }],
          structuredContent: { ok: true as const, ...audit },
        };
      } catch (error) {
        const app = error instanceof AppError
          ? error
          : new AppError("provider_error", "점검을 완료하지 못했습니다.", true, "잠시 후 다시 시도하세요.");
        logEvent({
          event: "tool",
          toolName: "run_digital_laundry_audit",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: app.errorCode,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(app);
      }
    },
  );
}
