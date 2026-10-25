import { describe, expect, it } from "vitest";
import type { SearchResult } from "../../src/domain/types.js";
import { dedupeResults } from "../../src/services/dedupe.js";

function result(url: string, title: string): SearchResult {
  return {
    id: url,
    sourceType: "web",
    provider: "kakao",
    title,
    url,
    domain: "example.test",
    retrievedAt: "2026-10-25T00:00:00.000Z",
    isDemo: false,
  };
}

describe("dedupeResults", () => {
  it("collapses tracking parameters and the same title on a domain", () => {
    const unique = dedupeResults([
      result("https://Example.test/posts/club?utm_source=ad&b=1", "동아리 글"),
      result("https://example.test/posts/club?b=1&fbclid=abc", "동아리 글"),
      result("https://example.test/posts/other", "다른 글"),
    ]);
    expect(unique.map((item) => item.url)).toEqual([
      "https://example.test/posts/club?b=1",
      "https://example.test/posts/other",
    ]);
  });
});
