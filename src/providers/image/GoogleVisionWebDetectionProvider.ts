import { AppError } from "../../domain/errors.js";
import { README_SECTIONS } from "../../config/constants.js";
import type { Finding } from "../../domain/types.js";
import { analyzeFootprint } from "../../domain/scoring.js";
import { safeReadBytes } from "../../security/safeFetch.js";
import { decodeImageInput, inspectImage } from "./imageBytes.js";

export interface VisionImage {
  bytes: Buffer;
}

export interface VisionCandidate {
  matchType: "full" | "partial" | "visually_similar" | "matching_page";
  url: string;
  title: string;
}

interface VisionPage {
  url?: string;
  pageTitle?: string;
}

interface VisionResponse {
  responses?: Array<{
    webDetection?: {
      fullMatchingImages?: Array<{ url?: string }>;
      partialMatchingImages?: Array<{ url?: string }>;
      visuallySimilarImages?: Array<{ url?: string }>;
      pagesWithMatchingImages?: VisionPage[];
    };
    error?: { code?: number; message?: string };
  }>;
}

function providerError(status: number): AppError {
  if (status === 429) {
    return new AppError("provider_rate_limited", "이미지 검색 제공자의 요청 한도에 도달했습니다.", true, "잠시 후 다시 시도하세요.");
  }
  return new AppError("provider_error", "이미지 검색 제공자가 결과를 반환하지 않았습니다.", status >= 500, "잠시 후 다시 시도하세요.");
}

export class GoogleVisionWebDetectionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number,
  ) {}

  async detect(image: Buffer, maxResults: number): Promise<VisionCandidate[]> {
    if (this.apiKey.length === 0) {
      throw new AppError(
        "image_provider_not_configured",
        `Google Cloud Vision API 키가 없습니다. README의 ${README_SECTIONS.imageSearch} 절을 확인하세요.`,
        false,
        "키를 설정하면 이미지 후보를 찾을 수 있습니다. 텍스트 검색은 계속 사용할 수 있습니다.",
      );
    }
    let response: Response;
    try {
      response = await this.fetchImpl("https://vision.googleapis.com/v1/images:annotate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          requests: [{
            image: { content: image.toString("base64") },
            features: [{ type: "WEB_DETECTION", maxResults }],
          }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AppError("provider_timeout", "이미지 검색 시간이 초과되었습니다.", true, "잠시 후 다시 시도하세요.");
      }
      throw new AppError("provider_error", "이미지 검색 제공자에 연결하지 못했습니다.", true, "잠시 후 다시 시도하세요.");
    }
    if (!response.ok) {
      throw providerError(response.status);
    }
    const payload = await response.json() as VisionResponse;
    const first = payload.responses?.[0];
    if (first?.error) {
      throw providerError(first.error.code === 8 ? 429 : 500);
    }
    const web = first?.webDetection;
    const candidates: VisionCandidate[] = [];
    const push = (matchType: VisionCandidate["matchType"], url: string | undefined, title: string): void => {
      if (!url || candidates.length >= maxResults || candidates.some((item) => item.url === url)) {
        return;
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return;
        }
      } catch {
        return;
      }
      candidates.push({ matchType, url, title });
    };
    for (const item of web?.fullMatchingImages ?? []) push("full", item.url, "완전 일치 유사 이미지 후보");
    for (const item of web?.partialMatchingImages ?? []) push("partial", item.url, "부분 일치 유사 이미지 후보");
    for (const item of web?.visuallySimilarImages ?? []) push("visually_similar", item.url, "시각적으로 비슷한 이미지 후보");
    for (const page of web?.pagesWithMatchingImages ?? []) push("matching_page", page.url, page.pageTitle || "이미지가 포함된 페이지 후보");
    return candidates;
  }
}

export function candidatesToFindings(candidates: VisionCandidate[]): Finding[] {
  const auditId = "image-search";
  return candidates.map((candidate) => {
    const analysis = analyzeFootprint({
      title: candidate.title,
      imageMatchType: candidate.matchType,
    });
    return {
      id: crypto.randomUUID(),
      auditId,
      sourceType: "image_web_detection" as const,
      title: candidate.title,
      url: candidate.url,
      domain: new URL(candidate.url).hostname,
      matchConfidence: analysis.matchConfidence,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      signals: analysis.signals,
      reasons: [
        "이미지 검색 제공자가 유사 이미지 페이지를 반환했습니다. 같은 사람이라는 뜻이 아닙니다.",
        ...analysis.reasons,
      ],
      unknowns: analysis.unknowns,
      authorRelation: "unknown" as const,
      recommendedNextSteps: analysis.recommendedNextSteps,
      verificationRequired: true,
      isDemo: false,
      urgentHumanSupport: analysis.urgentHumanSupport,
    };
  });
}

export async function loadImageBytes(input: {
  imageBase64?: string;
  publicImageUrl?: string;
  maxBytes: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<string[]>;
}): Promise<Buffer> {
  const hasBytes = Boolean(input.imageBase64);
  const hasUrl = Boolean(input.publicImageUrl);
  if (hasBytes === hasUrl) {
    throw new AppError("invalid_input", "이미지 파일 또는 공개 이미지 주소 중 하나만 전달하세요.", false, "입력을 하나만 남기세요.");
  }
  const bytes = input.imageBase64
    ? decodeImageInput(input.imageBase64)
    : (await safeReadBytes(input.publicImageUrl ?? "", {
        timeoutMs: input.timeoutMs,
        maxBytes: input.maxBytes,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.lookup ? { lookup: input.lookup } : {}),
      })).bytes;
  inspectImage(bytes, input.maxBytes);
  return bytes;
}
