import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { resolveExportFile } from "../../src/security/exportPath.js";

describe("resolveExportFile", () => {
  it("keeps a plain file name inside the export directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-export-"));
    const resolved = resolveExportFile(root, "case report.md");
    expect(resolved).toBe(path.join(realpathSync(root), "case-report.md"));
  });

  it("rejects traversal, absolute paths, and escaping symlinks", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-export-"));
    const outside = mkdtempSync(path.join(tmpdir(), "dl-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret");
    symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape.md"));

    expect(() => resolveExportFile(root, "../secret.txt")).toThrow(AppError);
    expect(() => resolveExportFile(root, path.join(outside, "secret.txt"))).toThrow(AppError);
    expect(() => resolveExportFile(root, "escape.md")).toThrow(AppError);
  });
});
