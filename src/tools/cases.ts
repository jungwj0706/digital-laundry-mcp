import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { AppError, errorResult } from "../domain/errors.js";
import { toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import {
  deleteLocalData,
  exportCaseReport,
  getCaseDetails,
  listCases,
  saveAuditAsCase,
  updateCaseStatus,
} from "../services/caseService.js";
import { CASE_STATUSES } from "../storage/sqliteStore.js";

const statusSchema = z.enum(CASE_STATUSES);

function finish(toolName: string, text: string, structuredContent: Record<string, unknown>, error?: AppError) {
  logEvent({
    event: "tool",
    toolName,
    durationMs: 0,
    resultCount: error ? 0 : 1,
    ...(error ? { errorCode: error.errorCode } : {}),
    correlationId: crypto.randomUUID(),
  });
  if (error) {
    return errorResult(error);
  }
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

function failure(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError("storage_disabled", "로컬 저장을 처리하지 못했습니다.", false, "저장 설정을 확인하세요.");
}

export function registerCaseTools(server: McpServer, config: AppConfig): void {
  server.registerTool(
    "save_audit_as_case",
    {
      title: "점검 결과 저장",
      description:
        "메모리에 있는 점검 결과를 암호화된 로컬 사건으로 저장합니다. confirmedUserSave가 true일 때만 저장합니다. 별칭, 검색어, 이미지 원본은 저장하지 않습니다.",
      inputSchema: z.object({
        auditId: z.string().min(1).max(80),
        caseTitle: z.string().min(1).max(120),
        confirmedUserSave: z.boolean(),
        includeSnippets: z.boolean().optional(),
        retentionDays: z.number().int().min(1).max(30).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          caseId: z.string(),
          status: statusSchema,
          expiresAt: z.string(),
          snippetStored: z.boolean(),
        }),
        toolFailureSchema,
      ]),
    },
    async (input) => {
      try {
        const saved = saveAuditAsCase(config, input);
        return finish(
          "save_audit_as_case",
          `사건을 저장했습니다. 상태 ${saved.status}. 스니펫 저장 ${saved.snippetStored ? "예" : "아니오"}.`,
          { ok: true, ...saved },
        );
      } catch (error) {
        const app = failure(error);
        return finish("save_audit_as_case", app.message, {}, app);
      }
    },
  );

  server.registerTool(
    "list_cases",
    {
      title: "사건 목록",
      description: "이 기기에 저장된 사건을 최대 50건씩 보여 줍니다. 제목의 이메일과 비밀값은 가립니다.",
      inputSchema: z.object({
        status: statusSchema.optional(),
        page: z.number().int().min(1).max(100).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          page: z.number(),
          cases: z.array(z.object({
            id: z.string(),
            title: z.string(),
            status: statusSchema,
            createdAt: z.string(),
            expiresAt: z.string(),
            findingCount: z.number(),
            nextStep: z.string(),
          })),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const listed = listCases(config, input);
        return finish(
          "list_cases",
          `사건 ${listed.cases.length}건`,
          {
            ok: true,
            page: listed.page,
            cases: listed.cases.map((item) => ({
              id: item.id,
              title: item.title,
              status: item.status,
              createdAt: item.createdAt,
              expiresAt: item.expiresAt,
              findingCount: item.findingCount,
              nextStep: item.nextStep,
            })),
          },
        );
      } catch (error) {
        const app = failure(error);
        return finish("list_cases", app.message, {}, app);
      }
    },
  );

  server.registerTool(
    "get_case_details",
    {
      title: "사건 상세",
      description: "저장된 사건과 암호화되어 있던 주소, 제목을 복호화해 보여 줍니다. 검색어 원문은 저장되어 있지 않습니다.",
      inputSchema: z.object({ caseId: z.string().min(1).max(80) }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          id: z.string(),
          title: z.string(),
          status: statusSchema,
          createdAt: z.string(),
          expiresAt: z.string(),
          nextStep: z.string(),
          findings: z.array(z.object({
            id: z.string(),
            url: z.string(),
            title: z.string(),
            snippet: z.string().optional(),
            domain: z.string(),
            riskLevel: z.string(),
            isDemo: z.boolean(),
          })),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const details = getCaseDetails(config, input.caseId);
        return finish("get_case_details", details.nextStep, {
          ok: true,
          id: details.id,
          title: details.title,
          status: details.status,
          createdAt: details.createdAt,
          expiresAt: details.expiresAt,
          nextStep: details.nextStep,
          findings: details.findings.map((finding) => ({
            id: finding.id,
            url: finding.url,
            title: finding.title,
            ...(finding.snippet ? { snippet: finding.snippet } : {}),
            domain: finding.domain,
            riskLevel: finding.riskLevel,
            isDemo: finding.isDemo,
          })),
        });
      } catch (error) {
        const app = failure(error);
        return finish("get_case_details", app.message, {}, app);
      }
    },
  );

  server.registerTool(
    "update_case_status",
    {
      title: "사건 상태 기록",
      description:
        "사용자가 직접 한 단계만 기록합니다. user_submitted는 사용자가 이미 제출했다고 표시한 것이며 서버가 제출을 확인하지 않습니다.",
      inputSchema: z.object({
        caseId: z.string().min(1).max(80),
        status: statusSchema,
        note: z.string().max(500).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          caseId: z.string(),
          status: statusSchema,
          userAsserted: z.boolean(),
        }),
        toolFailureSchema,
      ]),
    },
    async (input) => {
      try {
        const updated = updateCaseStatus(config, input);
        return finish(
          "update_case_status",
          updated.userAsserted
            ? "사용자가 제출했다고 기록했습니다. 실제 제출은 확인하지 않았습니다."
            : `상태를 ${updated.status}로 기록했습니다.`,
          { ok: true, ...updated },
        );
      } catch (error) {
        const app = failure(error);
        return finish("update_case_status", app.message, {}, app);
      }
    },
  );

  server.registerTool(
    "export_case_report",
    {
      title: "사건 보고서 내보내기",
      description:
        "저장된 사건을 설정된 내보내기 폴더에만 파일로 씁니다. confirmedExport가 true일 때만 기록하며, 결과 파일은 평문입니다.",
      inputSchema: z.object({
        caseId: z.string().min(1).max(80),
        format: z.enum(["markdown", "json", "html"]),
        fileName: z.string().min(1).max(120),
        confirmedExport: z.boolean(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          fileName: z.string(),
          warning: z.string(),
        }),
        toolFailureSchema,
      ]),
    },
    async (input) => {
      try {
        const exported = exportCaseReport(config, input);
        return finish("export_case_report", `${exported.fileName}\n${exported.warning}`, { ok: true, ...exported });
      } catch (error) {
        const app = failure(error);
        return finish("export_case_report", app.message, {}, app);
      }
    },
  );

  server.registerTool(
    "delete_local_data",
    {
      title: "로컬 데이터 삭제",
      description:
        "로컬 사건, 동의 기록, 메모리 캐시를 삭제합니다. confirmedDelete가 true일 때만 지우고, previewOnly는 개수만 보여 줍니다.",
      inputSchema: z.object({
        scope: z.enum(["all", "case", "profile", "cache"]),
        caseId: z.string().min(1).max(80).optional(),
        confirmedDelete: z.boolean(),
        previewOnly: z.boolean().optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          preview: z.boolean(),
          deleted: z.array(z.object({ scope: z.string(), count: z.number() })),
          failures: z.array(z.object({ scope: z.string(), message: z.string() })),
        }),
        toolFailureSchema,
      ]),
    },
    async (input) => {
      try {
        const result = deleteLocalData(config, input);
        return finish(
          "delete_local_data",
          result.preview ? "삭제 미리보기입니다. 데이터는 그대로입니다." : "요청한 삭제 결과입니다.",
          { ok: true, ...result },
        );
      } catch (error) {
        const app = failure(error);
        return finish("delete_local_data", app.message, {}, app);
      }
    },
  );
}
