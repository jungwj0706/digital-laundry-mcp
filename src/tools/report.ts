import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { AppError, errorResult } from "../domain/errors.js";
import { findingSchema, toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import { createCleanupReport } from "../services/reportService.js";

const inputSchema = z.object({
  auditId: z.string().min(1).max(80).optional(),
  findings: z.array(findingSchema).max(50).optional(),
  format: z.enum(["markdown", "json", "html"]),
  redactSensitive: z.boolean().optional(),
});

const outputSchema = z.object({
  ok: z.literal(true),
  format: z.enum(["markdown", "json", "html"]),
  content: z.string(),
  demo: z.boolean(),
});

export function registerReportTool(server: McpServer): void {
  server.registerTool(
    "create_cleanup_report",
    {
      title: "정리 보고서",
      description:
        "점검 결과나 finding 목록으로 Markdown, JSON, HTML 보고서를 만듭니다. 파일을 쓰지 않습니다. HTML은 외부 텍스트를 이스케이프합니다.",
      inputSchema,
      outputSchema: z.union([outputSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      try {
        const report = createCleanupReport({
          format: input.format,
          ...(input.auditId ? { auditId: input.auditId } : {}),
          ...(input.findings ? { findings: input.findings } : {}),
          ...(input.redactSensitive !== undefined ? { redactSensitive: input.redactSensitive } : {}),
        });
        logEvent({
          event: "tool",
          toolName: "create_cleanup_report",
          durationMs: Date.now() - started,
          resultCount: 1,
          correlationId: crypto.randomUUID(),
        });
        return {
          content: [{ type: "text" as const, text: report.content }],
          structuredContent: { ok: true as const, ...report },
        };
      } catch (error) {
        const app = error instanceof AppError
          ? error
          : new AppError("invalid_input", "보고서를 만들지 못했습니다.", false, "입력값을 확인하세요.");
        logEvent({
          event: "tool",
          toolName: "create_cleanup_report",
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
