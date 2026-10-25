import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { clearAuditCache, readAudit } from "../../src/services/auditCache.js";
import { withMcpClient } from "../helpers/mcpClient.js";

describe("run_digital_laundry_audit", () => {
  it("scores demo findings without sending the alias to the network or the log", async () => {
    clearAuditCache();
    const calls: string[] = [];
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      await withMcpClient(
        () =>
          createServer(parseConfig({ DL_DEMO_MODE: "true" }), {
            fetchImpl: async (input) => {
              calls.push(String(input));
              return new Response("nope");
            },
            sleep: async () => undefined,
          }),
        async (client) => {
          const denied = await client.callTool({
            name: "run_digital_laundry_audit",
            arguments: { aliases: ["uniquealiaszzzz"], confirmExternalSearch: false },
          });
          expect(denied.isError).toBe(true);

          const result = await client.callTool({
            name: "run_digital_laundry_audit",
            arguments: {
              aliases: ["uniquealiaszzzz"],
              confirmExternalSearch: true,
              demoMode: true,
              maxQueries: 1,
            },
          });
          const body = result.structuredContent as {
            ok: boolean;
            auditId: string;
            mode: string;
            queriesExecutedCount: number;
            findings: { isDemo: boolean; riskLevel: string; matchConfidence: string; title: string }[];
            queries?: unknown;
          };
          expect(body.ok).toBe(true);
          expect(body.mode).toBe("demo");
          expect(body.queries).toBeUndefined();
          expect(body.queriesExecutedCount).toBe(1);
          expect(body.findings.length).toBeGreaterThan(0);
          expect(body.findings.every((item) => item.isDemo && item.title.includes("시연용 가상 데이터"))).toBe(true);
          expect(body.findings.some((item) => item.riskLevel === "high" || item.riskLevel === "critical_review")).toBe(true);
          expect(body.findings.every((item) => item.matchConfidence !== item.riskLevel || item.riskLevel === "unknown")).toBe(true);
          expect(readAudit(body.auditId)).toBeDefined();
        },
      );
    } finally {
      console.error = original;
    }
    expect(calls).toHaveLength(0);
    expect(lines.join("\n")).not.toContain("uniquealiaszzzz");
  });
});
