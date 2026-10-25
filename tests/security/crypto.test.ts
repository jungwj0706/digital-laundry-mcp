import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, isEncryptionKey } from "../../src/security/crypto.js";

describe("field encryption", () => {
  it("round-trips with the right key and rejects the wrong key", () => {
    const key = Buffer.alloc(32, 4);
    const payload = encryptField(key, "https://example.test/post");
    expect(decryptField(key, payload)).toBe("https://example.test/post");
    expect(() => decryptField(Buffer.alloc(32, 5), payload)).toThrow(/복호화/);
  });

  it("prints a usable key without writing it to stderr", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-encryption-key.mjs"], {
      encoding: "utf8",
    });
    const key = result.stdout.trim();
    expect(result.status).toBe(0);
    expect(isEncryptionKey(key)).toBe(true);
    expect(result.stderr).not.toContain(key);
  });
});
