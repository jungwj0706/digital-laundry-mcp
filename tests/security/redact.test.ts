import { describe, expect, it } from "vitest";
import { logEvent } from "../../src/logging/logger.js";
import { redactSensitive } from "../../src/security/redact.js";

describe("redactSensitive", () => {
  it("removes emails, url paths, and long secrets from logs", () => {
    const secret = "brave-live-key-value-0123456789";
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      logEvent({
        event: "tool",
        toolName: `search user@example.com ${secret} https://example.test/private?q=nickname`,
        errorCode: "provider_error",
        provider: "brave",
        correlationId: "11111111-1111-4111-8111-111111111111",
      });
    } finally {
      console.error = original;
    }
    const line = lines[0] ?? "";
    expect(line).not.toContain("user@example.com");
    expect(line).not.toContain(secret);
    expect(line).not.toContain("/private");
    expect(line).not.toContain("q=nickname");
    expect(line).toContain("11111111-1111-4111-8111-111111111111");
    expect(redactSensitive("owner@example.test")).toBe("[email]");
  });
});
