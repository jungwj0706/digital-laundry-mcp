import { README_SECTIONS } from "../config/constants.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { KakaoSearchProvider } from "./search/KakaoSearchProvider.js";
import { DemoSearchProvider } from "./search/DemoSearchProvider.js";
import type { SearchProvider } from "./interfaces.js";

export interface ProviderRuntime {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  lookup?: (hostname: string) => Promise<string[]>;
}

export function selectSearchProvider(
  config: AppConfig,
  demoMode: boolean | undefined,
  deps: ProviderRuntime = {},
): { provider: SearchProvider; mode: "live" | "demo" } | AppError {
  const useDemo = demoMode ?? config.demoMode;
  if (useDemo) {
    return { provider: new DemoSearchProvider(), mode: "demo" };
  }
  if (config.kakaoRestApiKey.length === 0) {
    return new AppError(
      "provider_not_configured",
      `카카오 REST API 키가 없습니다. README의 ${README_SECTIONS.liveSearch} 절을 확인하세요.`,
      false,
      "KAKAO_REST_API_KEY를 설정하거나 demoMode를 true로 실행하세요.",
    );
  }
  return {
    provider: new KakaoSearchProvider(
      config.kakaoRestApiKey,
      deps.fetchImpl ?? fetch,
      config.httpTimeoutMs,
      deps.sleep,
    ),
    mode: "live",
  };
}
