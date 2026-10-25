import { describe, expect, it } from "vitest";
import { assertHostname, normalizeUrl } from "../../src/domain/url.js";
import { AppError } from "../../src/domain/errors.js";

describe("normalizeUrl", () => {
  it("lowercases the host and drops fragments and tracking parameters", () => {
    expect(
      normalizeUrl("HTTPS://Example.COM/path/?b=2&utm_source=ad&fbclid=abc&a=1#section"),
    ).toBe("https://example.com/path?a=1&b=2");
  });

  it("rejects non-http schemes and userinfo", () => {
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(AppError);
    expect(() => normalizeUrl("ftp://example.test/file")).toThrow(AppError);
    expect(() => normalizeUrl("https://user:secret@example.test/a")).toThrow(AppError);
  });
});

describe("assertHostname", () => {
  it("accepts a bare hostname and rejects paths", () => {
    expect(assertHostname("Example.TEST")).toBe("example.test");
    expect(() => assertHostname("example.test/path")).toThrow(AppError);
    expect(() => assertHostname("https://example.test")).toThrow(AppError);
  });
});
