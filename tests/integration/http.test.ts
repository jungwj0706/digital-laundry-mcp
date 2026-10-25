import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../../src/config/env.js";
import { createAuthorizedHandler } from "../../src/http.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const token = "http-token-0123456789";

describe("authenticated http and recipe", () => {
  it("serves loopback mcp at port 3333 without a bearer token", async () => {
    const config = parseConfig({ DL_DEMO_MODE: "true" });
    expect(config.httpPort).toBe(3333);
    const handle = createAuthorizedHandler(config);
    const response = await handle(new Request("http://127.0.0.1:3333/mcp", {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: "{}",
    }));
    expect(response.status).not.toBe(401);
  });

  it("rejects a short token and a request without the bearer header", async () => {
    expect(() => parseConfig({
      DL_HTTP_ENABLED: "true",
      DL_HTTP_AUTH_TOKEN: "short-secret",
    })).toThrow(ConfigError);
    try {
      parseConfig({ DL_HTTP_ENABLED: "true", DL_HTTP_AUTH_TOKEN: "short-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret");
    }

    const config = parseConfig({
      DL_DEMO_MODE: "true",
      DL_HTTP_ENABLED: "true",
      DL_HTTP_AUTH_TOKEN: token,
    });
    const handle = createAuthorizedHandler(config);
    const denied = await handle(new Request("http://127.0.0.1/mcp?token=short-secret", { method: "POST" }));
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain(token);

    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1/mcp"), {
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${token}`);
        return handle(new Request(url, { ...init, headers }));
      },
    });
    const client = new Client(
      { name: "digital-laundry-test", version: "0.0.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === "run_digital_laundry_audit")).toBe(true);
      const audit = await client.callTool({
        name: "run_digital_laundry_audit",
        arguments: { aliases: ["하늘"], confirmExternalSearch: true, demoMode: true, maxQueries: 1 },
      });
      expect(audit.structuredContent).toMatchObject({ mode: "demo" });
    } finally {
      await client.close();
    }
  });

  it("keeps the consent gate, demo label, and no-submit rule in the recipe", () => {
    const recipe = readFileSync(path.join(root, "recipes", "digital-laundry.md"), "utf8");
    const guide = readFileSync(path.join(root, "docs", "VOOY.md"), "utf8");
    expect(recipe).toContain("confirmExternalSearch");
    expect(recipe).toContain("시연용 가상 데이터");
    expect(recipe).toContain("제출하지 않습니다");
    expect(guide).toContain("Bearer");
    expect(guide).toContain("쿼리");
  });
});
