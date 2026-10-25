import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

describe("get_service_status", () => {
  it("lists the tool and hides credential values", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-status-"));
    const kakaoKey = "kakao-test-key-should-never-appear";
    const visionKey = "vision-test-key-should-never-appear";
    const config = parseConfig(
      {
        DL_DEMO_MODE: "true",
        DL_ENABLE_PERSISTENCE: "true",
        KAKAO_REST_API_KEY: kakaoKey,
        GOOGLE_CLOUD_VISION_API_KEY: visionKey,
        DL_EXPORT_DIR: root,
      },
      root,
    );
    expect(config.persistenceEnabled).toBe(false);

    await withMcpClient(
      () => createServer(config),
      async (client) => {
        const listed = await client.listTools();
        expect(listed.tools.map((tool) => tool.name)).toContain("get_service_status");

        const result = await client.callTool({
          name: "get_service_status",
          arguments: {},
        });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain(kakaoKey);
        expect(serialized).not.toContain(visionKey);
        expect(result.structuredContent).toMatchObject({
          demoMode: true,
          searchProviderConfigured: true,
          imageProviderConfigured: true,
          persistenceEnabled: false,
          policyCheckedAt: "2026-10-25",
          exportDirectoryReady: true,
        });
        const missing = (
          result.structuredContent as { missingConfiguration: { name: string }[] }
        ).missingConfiguration.map((item) => item.name);
        expect(missing).toContain("DL_DATA_ENCRYPTION_KEY");
        expect(missing).not.toContain("KAKAO_REST_API_KEY");
      },
    );
  });
});
