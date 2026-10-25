import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { README_SECTIONS, POLICY_CHECKED_AT } from "../config/constants.js";
import { readServerVersion, type AppConfig } from "../config/env.js";
import { logEvent } from "../logging/logger.js";

const missingItemSchema = z.object({
  name: z.string(),
  readmeSection: z.string(),
});

export const serviceStatusSchema = z.object({
  serverVersion: z.string(),
  demoMode: z.boolean(),
  searchProviderConfigured: z.boolean(),
  imageProviderConfigured: z.boolean(),
  persistenceEnabled: z.boolean(),
  policyCheckedAt: z.string(),
  exportDirectoryReady: z.boolean(),
  missingConfiguration: z.array(missingItemSchema),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export function buildServiceStatus(config: AppConfig): ServiceStatus {
  const missingConfiguration: ServiceStatus["missingConfiguration"] = [];
  if (config.braveSearchApiKey.length === 0) {
    missingConfiguration.push({
      name: "BRAVE_SEARCH_API_KEY",
      readmeSection: README_SECTIONS.liveSearch,
    });
  }
  if (config.googleCloudVisionApiKey.length === 0) {
    missingConfiguration.push({
      name: "GOOGLE_CLOUD_VISION_API_KEY",
      readmeSection: README_SECTIONS.imageSearch,
    });
  }
  if (config.persistenceRequested && !config.encryptionKeyValid) {
    missingConfiguration.push({
      name: "DL_DATA_ENCRYPTION_KEY",
      readmeSection: README_SECTIONS.localStorage,
    });
  }
  if (!config.exportDirectoryReady) {
    missingConfiguration.push({
      name: "DL_EXPORT_DIR",
      readmeSection: README_SECTIONS.export,
    });
  }

  return {
    serverVersion: readServerVersion(),
    demoMode: config.demoMode,
    searchProviderConfigured: config.braveSearchApiKey.length > 0,
    imageProviderConfigured: config.googleCloudVisionApiKey.length > 0,
    persistenceEnabled: config.persistenceEnabled,
    policyCheckedAt: POLICY_CHECKED_AT,
    exportDirectoryReady: config.exportDirectoryReady,
    missingConfiguration,
  };
}

function summarize(status: ServiceStatus): string {
  const missing =
    status.missingConfiguration.length === 0
      ? "누락된 설정 없음"
      : status.missingConfiguration
          .map((item) => `${item.name} (${item.readmeSection})`)
          .join(", ");
  return [
    `서버 버전 ${status.serverVersion}`,
    `데모 모드 ${status.demoMode ? "켜짐" : "꺼짐"}`,
    `검색 제공자 ${status.searchProviderConfigured ? "설정됨" : "미설정"}`,
    `이미지 제공자 ${status.imageProviderConfigured ? "설정됨" : "미설정"}`,
    `영구 저장 ${status.persistenceEnabled ? "사용" : "사용 안 함"}`,
    `정책 확인일 ${status.policyCheckedAt}`,
    `내보내기 디렉터리 ${status.exportDirectoryReady ? "준비됨" : "준비되지 않음"}`,
    `설정 안내: ${missing}`,
  ].join("\n");
}

export function registerStatusTool(server: McpServer, config: AppConfig): void {
  server.registerTool(
    "get_service_status",
    {
      title: "서비스 상태",
      description:
        "디지털 빨래 서버의 설정 상태를 확인합니다. API 키 값은 반환하지 않습니다. 누락된 환경 변수는 이름과 README 절만 안내합니다.",
      inputSchema: z.object({}),
      outputSchema: serviceStatusSchema,
      annotations: { readOnlyHint: true },
    },
    async () => {
      const started = Date.now();
      const status = buildServiceStatus(config);
      logEvent({
        event: "tool",
        toolName: "get_service_status",
        durationMs: Date.now() - started,
        resultCount: 1,
        correlationId: crypto.randomUUID(),
      });
      return {
        content: [{ type: "text", text: summarize(status) }],
        structuredContent: status,
      };
    },
  );
}
