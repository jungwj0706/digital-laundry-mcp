import { randomUUID } from "node:crypto";
import { AppError, type ErrorCode } from "../domain/errors.js";
import type { SearchResult } from "../domain/types.js";
import { normalizeUrl } from "../domain/url.js";
import type { SearchProvider } from "../providers/interfaces.js";
import { dedupeResults } from "./dedupe.js";

export interface PartialSearchFailure {
  provider: string;
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface SearchRun {
  results: SearchResult[];
  partialFailures: PartialSearchFailure[];
  queriesExecutedCount: number;
}

export async function executeSearch(input: {
  provider: SearchProvider;
  queries: string[];
  count: number;
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SearchRun> {
  const results: SearchResult[] = [];
  const partialFailures: PartialSearchFailure[] = [];
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const retrievedAt = new Date().toISOString();

  for (let index = 0; index < input.queries.length; index += 1) {
    const text = input.queries[index] ?? "";
    if (index > 0 && (input.pauseMs ?? 0) > 0) {
      await sleep(input.pauseMs ?? 0);
    }
    try {
      const hits = await input.provider.search({ text }, input.count);
      for (const hit of hits) {
        let canonical: string;
        try {
          canonical = normalizeUrl(hit.url);
        } catch {
          continue;
        }
        const domain = new URL(canonical).hostname;
        results.push({
          id: randomUUID(),
          sourceType: input.provider.sourceType === "demo" ? "demo" : "web",
          provider: input.provider.name,
          title: hit.title.slice(0, 300),
          url: canonical,
          domain,
          ...(hit.snippet ? { snippet: hit.snippet.slice(0, 500) } : {}),
          ...(hit.publishedAt ? { publishedAt: hit.publishedAt } : {}),
          retrievedAt,
          isDemo: input.provider.sourceType === "demo",
        });
      }
    } catch (error) {
      const app =
        error instanceof AppError
          ? error
          : new AppError("provider_error", "검색어 하나를 처리하지 못했습니다.", true, "잠시 후 다시 시도하세요.");
      partialFailures.push({
        provider: input.provider.name,
        code: app.errorCode,
        message: app.message,
        retryable: app.retryable,
      });
    }
  }

  return {
    results: dedupeResults(results),
    partialFailures,
    queriesExecutedCount: input.queries.length,
  };
}
