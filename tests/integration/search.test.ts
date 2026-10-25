import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

const noopSleep = (): Promise<void> => Promise.resolve();

describe("public footprint search", () => {
  it("returns labeled demo results and does not call the network", async () => {
    const calls: string[] = [];
    const config = parseConfig({ DL_DEMO_MODE: "true" });
    await withMcpClient(
      () =>
        createServer(config, {
          fetchImpl: async (input) => {
            calls.push(String(input));
            return new Response("nope");
          },
          sleep: noopSleep,
        }),
      async (client) => {
        const preview = await client.callTool({
          name: "preview_search_queries",
          arguments: { aliases: ["uniquealiaszzzz"], maxQueries: 4 },
        });
        expect(preview.structuredContent).toMatchObject({
          ok: true,
          queries: ["uniquealiaszzzz"],
        });

        const result = await client.callTool({
          name: "search_public_footprints",
          arguments: {
            queries: ["uniquealiaszzzz"],
            confirmExternalSearch: true,
            demoMode: true,
          },
        });
        const body = result.structuredContent as {
          mode: string;
          results: { isDemo: boolean; title: string; sourceType: string; url: string }[];
        };
        expect(body.mode).toBe("demo");
        expect(body.results.length).toBeGreaterThan(0);
        expect(body.results.every((item) => item.isDemo && item.sourceType === "demo")).toBe(true);
        expect(body.results.every((item) => item.title.includes("시연용 가상 데이터"))).toBe(true);
        expect(body.results.every((item) => item.url.startsWith("https://example.test/"))).toBe(true);
        expect(new Set(body.results.map((item) => item.url)).size).toBe(body.results.length);
      },
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses a live search without consent or an api key", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response("nope");
    };
    const missing = parseConfig({ DL_DEMO_MODE: "false" });
    await withMcpClient(
      () => createServer(missing, { fetchImpl, sleep: noopSleep }),
      async (client) => {
        const denied = await client.callTool({
          name: "search_public_footprints",
          arguments: { queries: ["uniquealiaszzzz"], confirmExternalSearch: false },
        });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent).toMatchObject({ errorCode: "consent_required" });

        const unconfigured = await client.callTool({
          name: "search_public_footprints",
          arguments: { queries: ["uniquealiaszzzz"], confirmExternalSearch: true, demoMode: false },
        });
        expect(unconfigured.isError).toBe(true);
        expect(unconfigured.structuredContent).toMatchObject({
          errorCode: "provider_not_configured",
        });
      },
    );
    expect(calls).toHaveLength(0);
  });

  it("keeps successful results when one query fails and retries rate limits", async () => {
    const calls: string[] = [];
    const apiKey = "test-key-should-stay-out-of-logs";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://dapi.kakao.com/v2/search/web");
      expect(url.toString()).not.toContain(apiKey);
      expect(new Headers(init?.headers).get("authorization")).toBe(`KakaoAK ${apiKey}`);
      calls.push(url.searchParams.get("query") ?? "");
      const query = url.searchParams.get("query");
      if (query === "first-query") {
        return new Response("limited", { status: 429 });
      }
      if (query === "bad-query") {
        return new Response("bad", { status: 400 });
      }
      return new Response(
        JSON.stringify({
          documents: [
            {
              title: "<b>공개</b> 게시글",
              url: "https://example.test/live",
              contents: "스니펫 &amp; 설명",
              datetime: "2026-01-02T03:04:05.000+09:00",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const config = parseConfig({
      DL_DEMO_MODE: "false",
      KAKAO_REST_API_KEY: apiKey,
    });
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    try {
      await withMcpClient(
        () => createServer(config, { fetchImpl, sleep: noopSleep }),
        async (client) => {
          const result = await client.callTool({
            name: "search_public_footprints",
            arguments: {
              queries: ["bad-query", "good-query"],
              confirmExternalSearch: true,
              demoMode: false,
              count: 5,
            },
          });
          const body = result.structuredContent as {
            ok: boolean;
            results: { url: string; isDemo: boolean }[];
            partialFailures: { code: string }[];
          };
          expect(body.ok).toBe(true);
          expect(body.results.map((item) => item.url)).toEqual(["https://example.test/live"]);
          expect(body.results[0]).toMatchObject({
            isDemo: false,
            title: "공개 게시글",
            snippet: "스니펫 & 설명",
            provider: "kakao",
          });
          expect(body.partialFailures.map((item) => item.code)).toContain("provider_error");

          await client.callTool({
            name: "search_public_footprints",
            arguments: {
              queries: ["first-query"],
              confirmExternalSearch: true,
              demoMode: false,
            },
          });
        },
      );
    } finally {
      console.error = original;
    }
    expect(calls.filter((query) => query === "first-query")).toHaveLength(3);
    const logs = lines.join("\n");
    expect(logs).not.toContain("bad-query");
    expect(logs).not.toContain("good-query");
    expect(logs).not.toContain("test-key-should-stay-out-of-logs");
  });
});
