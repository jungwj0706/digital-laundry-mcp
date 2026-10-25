import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { AppError, errorResult } from "../domain/errors.js";
import { toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import type { ProviderRuntime } from "../providers/selectSearchProvider.js";
import { safeFetch } from "../security/safeFetch.js";

export function registerFetchTool(server: McpServer, config: AppConfig, deps: ProviderRuntime = {}): void {
  server.registerTool(
    "fetch_public_page",
    {
      title: "공개 페이지 발췌",
      description:
        "사용자가 고른 공개 http 또는 https 주소에 접속해 제목과 짧은 발췌만 가져옵니다. confirmExternalFetch가 true일 때만 접속합니다. 로그인, 캡차, 페이월은 우회하지 않으며 본문을 저장하지 않습니다.",
      inputSchema: z.object({
        url: z.string().url().max(2000),
        confirmExternalFetch: z.boolean(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          url: z.string(),
          contentType: z.string(),
          title: z.string(),
          excerpt: z.string(),
          untrusted: z.literal(true),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      if (input.confirmExternalFetch !== true) {
        const error = new AppError(
          "consent_required",
          "외부 페이지 접속 동의가 없어 가져오지 않았습니다.",
          false,
          "confirmExternalFetch를 true로 다시 호출하세요.",
        );
        logEvent({
          event: "tool",
          toolName: "fetch_public_page",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: error.errorCode,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(error);
      }
      try {
        const page = await safeFetch(input.url, {
          timeoutMs: config.httpTimeoutMs,
          maxBytes: config.httpMaxBytes,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          ...(deps.lookup ? { lookup: deps.lookup } : {}),
        });
        logEvent({
          event: "tool",
          toolName: "fetch_public_page",
          durationMs: Date.now() - started,
          resultCount: 1,
          correlationId: crypto.randomUUID(),
        });
        return {
          content: [{ type: "text" as const, text: `${page.title}\n${page.excerpt.slice(0, 400)}` }],
          structuredContent: { ok: true as const, ...page },
        };
      } catch (error) {
        const app = error instanceof AppError
          ? error
          : new AppError("provider_error", "페이지를 가져오지 못했습니다.", true, "주소를 확인하세요.");
        logEvent({
          event: "tool",
          toolName: "fetch_public_page",
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
