import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { AppError, errorResult } from "../domain/errors.js";
import { partialFailureSchema, searchResultSchema, toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import { selectSearchProvider, type ProviderRuntime } from "../providers/selectSearchProvider.js";
import { applyDomains, planQueries } from "../services/queryPlanner.js";
import { executeSearch } from "../services/searchService.js";

export type SearchDependencies = ProviderRuntime;

const previewInputSchema = z.object({
  aliases: z.array(z.string().min(1).max(80)).min(1).max(10),
  keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
  domains: z.array(z.string().min(1).max(253)).max(10).optional(),
  includeEmailSearch: z.boolean().optional(),
  emailAddresses: z.array(z.string().max(200)).max(3).optional(),
  maxQueries: z.number().int().min(1).max(20).optional(),
});

const previewOutputSchema = z.object({
  ok: z.literal(true),
  queries: z.array(z.string()),
  queryCount: z.number().int(),
  truncated: z.boolean(),
});

const searchInputSchema = z.object({
  queries: z.array(z.string().min(1).max(200)).min(1).max(10),
  domains: z.array(z.string().min(1).max(253)).max(10).optional(),
  count: z.number().int().min(1).max(20).optional(),
  confirmExternalSearch: z.boolean(),
  demoMode: z.boolean().optional(),
});

const searchOutputSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(["live", "demo"]),
  provider: z.string(),
  results: z.array(searchResultSchema),
  partialFailures: z.array(partialFailureSchema),
  queriesExecutedCount: z.number().int(),
});

function consentError(): AppError {
  return new AppError(
    "consent_required",
    "외부 검색 동의가 없어 검색을 실행하지 않았습니다. 별칭과 검색어가 검색 제공자에게 전송될 수 있습니다.",
    false,
    "전송에 동의하면 confirmExternalSearch를 true로 다시 호출하세요.",
  );
}

export function registerSearchTools(
  server: McpServer,
  config: AppConfig,
  deps: SearchDependencies = {},
): void {
  server.registerTool(
    "preview_search_queries",
    {
      title: "검색어 미리보기",
      description:
        "외부 전송 없이 별칭, 키워드, 도메인 조합을 미리 보여 줍니다. 전화번호, 주소, 주민등록번호는 만들지 않습니다.",
      inputSchema: previewInputSchema,
      outputSchema: z.union([previewOutputSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      try {
        const plan = planQueries({
          aliases: input.aliases,
          ...(input.keywords ? { keywords: input.keywords } : {}),
          ...(input.domains ? { domains: input.domains } : {}),
          ...(input.includeEmailSearch !== undefined
            ? { includeEmailSearch: input.includeEmailSearch }
            : {}),
          ...(input.emailAddresses ? { emailAddresses: input.emailAddresses } : {}),
          maxQueries: Math.min(input.maxQueries ?? 8, config.searchMaxQueries),
        });
        logEvent({
          event: "tool",
          toolName: "preview_search_queries",
          durationMs: Date.now() - started,
          resultCount: plan.queries.length,
          correlationId: crypto.randomUUID(),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `검색어 ${plan.queries.length}개를 만들었습니다. 아직 외부로 전송하지 않았습니다.${plan.truncated ? " 상한 때문에 일부를 생략했습니다." : ""}`,
            },
          ],
          structuredContent: {
            ok: true as const,
            queries: plan.queries,
            queryCount: plan.queries.length,
            truncated: plan.truncated,
          },
        };
      } catch (error) {
        const app = error instanceof AppError ? error : new AppError("invalid_input", "검색어를 만들지 못했습니다.", false, "입력값을 확인하세요.");
        logEvent({
          event: "tool",
          toolName: "preview_search_queries",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: app.errorCode,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(app);
      }
    },
  );

  server.registerTool(
    "search_public_footprints",
    {
      title: "공개 흔적 검색",
      description:
        "사용자가 지정한 검색어로 공개 웹을 검색합니다. 검색어는 카카오 다음 검색으로 전송될 수 있으며 confirmExternalSearch가 true일 때만 실행합니다. 데모 모드는 합성 데이터만 반환합니다. 이 도구는 게시물을 삭제하거나 신고하지 않습니다.",
      inputSchema: searchInputSchema,
      outputSchema: z.union([searchOutputSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      if (input.confirmExternalSearch !== true) {
        const error = consentError();
        logEvent({
          event: "tool",
          toolName: "search_public_footprints",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: error.errorCode,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(error);
      }
      const selected = selectSearchProvider(config, input.demoMode, deps);
      if (selected instanceof AppError) {
        logEvent({
          event: "tool",
          toolName: "search_public_footprints",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: selected.errorCode,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(selected);
      }
      try {
        const restricted = applyDomains(
          input.queries,
          input.domains,
          config.searchMaxQueries,
        );
        const count = Math.min(input.count ?? 10, config.searchMaxResults);
        const run = await executeSearch({
          provider: selected.provider,
          queries: restricted,
          count,
          pauseMs: selected.mode === "live" ? 100 : 0,
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
        });
        logEvent({
          event: "tool",
          toolName: "search_public_footprints",
          durationMs: Date.now() - started,
          resultCount: run.results.length,
          provider: selected.provider.name,
          correlationId: crypto.randomUUID(),
        });
        const summary = [
          `${selected.mode === "demo" ? "시연용 가상 데이터" : "라이브 검색"} 결과 ${run.results.length}건`,
          `제공자 ${selected.provider.name}`,
          `실행한 검색어 ${run.queriesExecutedCount}개`,
          run.partialFailures.length > 0 ? `일부 실패 ${run.partialFailures.length}건` : "실패한 검색어 없음",
        ].join("\n");
        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            ok: true as const,
            mode: selected.mode,
            provider: selected.provider.name,
            results: run.results,
            partialFailures: run.partialFailures,
            queriesExecutedCount: run.queriesExecutedCount,
          },
        };
      } catch (error) {
        const app = error instanceof AppError ? error : new AppError("provider_error", "검색을 완료하지 못했습니다.", true, "잠시 후 다시 시도하세요.");
        logEvent({
          event: "tool",
          toolName: "search_public_footprints",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: app.errorCode,
          provider: selected.provider.name,
          correlationId: crypto.randomUUID(),
        });
        return errorResult(app);
      }
    },
  );
}
