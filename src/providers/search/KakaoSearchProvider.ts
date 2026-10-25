import { AppError } from "../../domain/errors.js";
import type { ProviderSearchHit, SearchProvider, SearchQuery } from "../interfaces.js";

interface KakaoWebDocument {
  title?: unknown;
  url?: unknown;
  contents?: unknown;
  datetime?: unknown;
}

const RETRY_DELAYS_MS = [200, 400];
const SEARCH_URL = "https://dapi.kakao.com/v2/search/web";

export class KakaoSearchProvider implements SearchProvider {
  readonly name = "kakao";
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
        "카카오 REST API 키가 없습니다. README의 라이브 검색 설정 절을 확인하세요.",
        false,
        "KAKAO_REST_API_KEY를 설정하거나 데모 모드로 실행하세요.",
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
    const size = Math.min(50, Math.max(1, Math.floor(count)));
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", text);
    url.searchParams.set("sort", "accuracy");
    url.searchParams.set("size", String(size));

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `KakaoAK ${this.apiKey}`,
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
    return mapKakaoResults(payload);
  }
}

function stripKakaoMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function mapKakaoResults(payload: unknown): ProviderSearchHit[] {
  const documents = (payload as { documents?: unknown } | null)?.documents;
  const results = Array.isArray(documents) ? documents : [];
  const hits: ProviderSearchHit[] = [];
  for (const item of results) {
    const record = item as KakaoWebDocument;
    if (typeof record.title !== "string" || typeof record.url !== "string") {
      continue;
    }
    const title = stripKakaoMarkup(record.title).slice(0, 300);
    if (title.length === 0) {
      continue;
    }
    const snippet =
      typeof record.contents === "string" ? stripKakaoMarkup(record.contents).slice(0, 500) : "";
    hits.push({
      title,
      url: record.url,
      ...(snippet.length > 0 ? { snippet } : {}),
      ...(typeof record.datetime === "string" ? { publishedAt: record.datetime.slice(0, 40) } : {}),
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
