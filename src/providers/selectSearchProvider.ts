import { README_SECTIONS } from "../config/constants.js";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { BraveSearchProvider } from "./search/BraveSearchProvider.js";
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
  if (config.braveSearchApiKey.length === 0) {
    return new AppError(
      "provider_not_configured",
      `Brave Search API 키가 없습니다. README의 ${README_SECTIONS.liveSearch} 절을 확인하세요.`,
      false,
      "BRAVE_SEARCH_API_KEY를 설정하거나 demoMode를 true로 실행하세요.",
    );
  }
  return {
    provider: new BraveSearchProvider(
      config.braveSearchApiKey,
      deps.fetchImpl ?? fetch,
      config.httpTimeoutMs,
      deps.sleep,
    ),
    mode: "live",
  };
}
