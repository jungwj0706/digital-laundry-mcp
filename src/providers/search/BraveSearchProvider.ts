import { AppError } from "../../domain/errors.js";
import type { ProviderSearchHit, SearchProvider, SearchQuery } from "../interfaces.js";

interface BraveWebResult {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  age?: unknown;
}

const RETRY_DELAYS_MS = [200, 400];

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  readonly sourceType = "web" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  ) {}

  async search(query: SearchQuery, count: number): Promise<ProviderSearchHit[]> {
    if (this.apiKey.length === 0) {
      throw new AppError(
        "provider_not_configured",
        "Brave Search API 키가 없습니다. README의 라이브 검색 설정 절을 확인하세요.",
        false,
        "BRAVE_SEARCH_API_KEY를 설정하거나 데모 모드로 실행하세요.",
      );
    }

    let lastError: AppError | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.request(query.text, count);
      } catch (error) {
        lastError = toProviderError(error);
        const delay = RETRY_DELAYS_MS[attempt];
        if (!lastError.retryable || delay === undefined) {
          throw lastError;
        }
        await this.sleep(delay);
      }
    }
    throw lastError ?? new AppError("provider_error", "검색 제공자 요청에 실패했습니다.", true, "잠시 후 다시 시도하세요.");
  }

  private async request(text: string, count: number): Promise<ProviderSearchHit[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", text);
    url.searchParams.set("count", String(count));
    url.searchParams.set("country", "KR");
    url.searchParams.set("search_lang", "ko");
    url.searchParams.set("safesearch", "strict");

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-subscription-token": this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AppError(
          "provider_timeout",
          "검색 요청 시간이 초과되었습니다.",
          true,
          "잠시 후 다시 시도하세요.",
        );
      }
      throw new AppError(
        "provider_error",
        "검색 제공자에 연결하지 못했습니다.",
        true,
        "네트워크 상태를 확인한 뒤 다시 시도하세요.",
      );
    }

    if (response.status === 429) {
      throw new AppError(
        "provider_rate_limited",
        "검색 제공자의 요청 한도에 도달했습니다.",
        true,
        "잠시 후 다시 시도하세요.",
      );
    }
    if (!response.ok) {
      throw new AppError(
        "provider_error",
        "검색 제공자가 오류를 반환했습니다.",
        response.status >= 500,
        "잠시 후 다시 시도하세요.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AppError(
        "provider_error",
        "검색 제공자 응답을 해석하지 못했습니다.",
        false,
        "잠시 후 다시 시도하세요.",
      );
    }
    return mapBraveResults(payload);
  }
}

function mapBraveResults(payload: unknown): ProviderSearchHit[] {
  const web = (payload as { web?: { results?: unknown } } | null)?.web;
  const results = Array.isArray(web?.results) ? web.results : [];
  const hits: ProviderSearchHit[] = [];
  for (const item of results) {
    const record = item as BraveWebResult;
    if (typeof record.title !== "string" || typeof record.url !== "string") {
      continue;
    }
    hits.push({
      title: record.title.slice(0, 300),
      url: record.url,
      ...(typeof record.description === "string"
        ? { snippet: record.description.slice(0, 500) }
        : {}),
      ...(typeof record.age === "string" ? { publishedAt: record.age.slice(0, 40) } : {}),
    });
  }
  return hits;
}

function toProviderError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(
    "provider_error",
    "검색 제공자 요청에 실패했습니다.",
    true,
    "잠시 후 다시 시도하세요.",
  );
}
