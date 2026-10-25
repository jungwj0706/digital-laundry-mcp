import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function hugePng(): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(20_000, 16);
  bytes.writeUInt32BE(20_000, 20);
  return bytes.toString("base64");
}

const lookup = async (): Promise<string[]> => ["8.8.8.8"];

describe("public page and image search", () => {
  it("requires consent, blocks a private redirect, and maps vision results without storing the image", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("vision.googleapis.com")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-goog-api-key")).toBe("vision-key-should-stay-hidden");
        return new Response(JSON.stringify({
          responses: [{
            webDetection: {
              fullMatchingImages: [{ url: "https://example.test/full.png" }],
              pagesWithMatchingImages: [{ url: "https://example.test/page", pageTitle: "후보 페이지" }],
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/robots.txt")) {
        return new Response("missing", { status: 404 });
      }
      if (url.includes("/pic.png")) {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
      }
      return new Response("<html><title>공개</title><body><script>alert(1)</script>본문</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };
    try {
      const config = parseConfig({
        DL_DEMO_MODE: "true",
        GOOGLE_CLOUD_VISION_API_KEY: "vision-key-should-stay-hidden",
      });
      await withMcpClient(() => createServer(config, { fetchImpl, lookup }), async (client) => {
        const denied = await client.callTool({
          name: "fetch_public_page",
          arguments: { url: "https://public.example/post", confirmExternalFetch: false },
        });
        expect(denied.structuredContent).toMatchObject({ errorCode: "consent_required" });

        const page = await client.callTool({
          name: "fetch_public_page",
          arguments: { url: "https://public.example/post", confirmExternalFetch: true },
        });
        const pageBody = page.structuredContent as { title: string; excerpt: string; untrusted: boolean };
        expect(pageBody.title).toBe("공개");
        expect(pageBody.excerpt).toContain("본문");
        expect(pageBody.excerpt).not.toContain("alert");
        expect(pageBody.untrusted).toBe(true);

        const imageDenied = await client.callTool({
          name: "find_image_reuse_candidates",
          arguments: { imageBase64: TINY_PNG, confirmExternalImageProcessing: false },
        });
        expect(imageDenied.structuredContent).toMatchObject({ errorCode: "consent_required" });

        const redirected = await client.callTool({
          name: "find_image_reuse_candidates",
          arguments: {
            publicImageUrl: "https://public.example/pic.png",
            confirmExternalImageProcessing: true,
          },
        });
        expect(redirected.structuredContent).toMatchObject({ errorCode: "unsafe_url" });
        expect(calls.some((url) => url.includes("127.0.0.1"))).toBe(false);

        const found = await client.callTool({
          name: "find_image_reuse_candidates",
          arguments: { imageBase64: TINY_PNG, confirmExternalImageProcessing: true, maxResults: 5 },
        });
        const body = found.structuredContent as {
          findings: { sourceType: string; reasons: string[]; url: string }[];
        };
        expect(body.findings.map((item) => item.url)).toEqual([
          "https://example.test/full.png",
          "https://example.test/page",
        ]);
        expect(body.findings.every((item) => item.sourceType === "image_web_detection")).toBe(true);
        expect(body.findings[0]?.reasons.join(" ")).toContain("유사 이미지");
        expect(JSON.stringify(found)).not.toContain(TINY_PNG);

        const tooBig = await client.callTool({
          name: "find_image_reuse_candidates",
          arguments: { imageBase64: hugePng(), confirmExternalImageProcessing: true },
        });
        expect(tooBig.structuredContent).toMatchObject({ errorCode: "image_too_large" });

        const status = await client.callTool({ name: "get_service_status", arguments: {} });
        expect(status.isError).toBeUndefined();
      });
    } finally {
      console.error = original;
    }
    expect(lines.join("\n")).not.toContain("vision-key-should-stay-hidden");
    expect(lines.join("\n")).not.toContain(TINY_PNG);
  });

  it("keeps text tools available when the image provider key is missing", async () => {
    const calls: string[] = [];
    await withMcpClient(
      () => createServer(parseConfig({ DL_DEMO_MODE: "true" }), {
        fetchImpl: async (input) => {
          calls.push(String(input));
          return new Response("nope");
        },
        lookup,
      }),
      async (client) => {
        const missing = await client.callTool({
          name: "find_image_reuse_candidates",
          arguments: {
            publicImageUrl: "https://public.example/pic.png",
            confirmExternalImageProcessing: true,
          },
        });
        expect(missing.structuredContent).toMatchObject({ errorCode: "image_provider_not_configured" });
        const tools = await client.listTools();
        expect(tools.tools.some((tool) => tool.name === "search_public_footprints")).toBe(true);
      },
    );
    expect(calls).toHaveLength(0);
  });
});
