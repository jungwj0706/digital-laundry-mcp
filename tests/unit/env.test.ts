import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, isEncryptionKey, parseConfig } from "../../src/config/env.js";
import { logEvent } from "../../src/logging/logger.js";

const validKey = Buffer.alloc(32, 7).toString("base64");

describe("parseConfig", () => {
  it("defaults to demo mode and disabled persistence", () => {
    const config = parseConfig({});
    expect(config.demoMode).toBe(true);
    expect(config.persistenceEnabled).toBe(false);
    expect(config.braveSearchApiKey).toBe("");
    expect(config.retentionDays).toBe(30);
  });

  it("rejects invalid values without echoing them", () => {
    const secret = "not-a-boolean-secret";
    expect(() => parseConfig({ DL_DEMO_MODE: secret })).toThrow(ConfigError);
    try {
      parseConfig({ DL_DEMO_MODE: secret, DL_RETENTION_DAYS: "0" });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain(secret);
      expect(error).toMatchObject({
        names: expect.arrayContaining(["DL_DEMO_MODE", "DL_RETENTION_DAYS"]),
      });
    }
  });

  it("enables persistence only with a 32-byte key", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-env-"));
    const disabled = parseConfig(
      { DL_ENABLE_PERSISTENCE: "true", DL_DATA_ENCRYPTION_KEY: "short" },
      root,
    );
    expect(disabled.persistenceEnabled).toBe(false);
    expect(isEncryptionKey(validKey)).toBe(true);
    const enabled = parseConfig(
      {
        DL_ENABLE_PERSISTENCE: "true",
        DL_DATA_ENCRYPTION_KEY: validKey,
        DL_EXPORT_DIR: root,
      },
      root,
    );
    expect(enabled.persistenceEnabled).toBe(true);
    expect(enabled.exportDirectoryReady).toBe(true);
  });
});

describe("logEvent", () => {
  it("writes only allowlisted fields to stderr", () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      logEvent({
        event: "tool",
        toolName: "get_service_status",
        durationMs: 3,
        resultCount: 1,
        correlationId: "corr-1",
      });
    } finally {
      console.error = original;
    }
    const payload = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "correlationId",
      "durationMs",
      "event",
      "resultCount",
      "toolName",
    ]);
  });
});
