import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import type { AuditResult } from "../../src/domain/types.js";
import { AppError } from "../../src/domain/errors.js";
import { clearAuditCache, saveAudit } from "../../src/services/auditCache.js";
import {
  deleteLocalData,
  exportCaseReport,
  getCaseDetails,
  listCases,
  saveAuditAsCase,
  updateCaseStatus,
} from "../../src/services/caseService.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

function configFor(root: string, enabled: boolean) {
  return parseConfig({
    DL_DEMO_MODE: "true",
    DL_ENABLE_PERSISTENCE: enabled ? "true" : "false",
    DL_DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DL_DATABASE_PATH: path.join(root, "cases.sqlite"),
    DL_EXPORT_DIR: path.join(root, "exports"),
    DL_RETENTION_DAYS: "30",
  }, root);
}

const audit: AuditResult = {
  auditId: "audit-case",
  mode: "demo",
  provider: "demo",
  searchedAt: "2026-10-25T00:00:00.000Z",
  queriesExecutedCount: 1,
  totalResults: 1,
  findings: [{
    id: "finding-case",
    auditId: "audit-case",
    sourceType: "demo",
    title: "case-title-should-stay-encrypted",
    url: "https://example.test/secretpathzzzz",
    domain: "example.test",
    snippet: "snippet-secret-phrase",
    matchConfidence: "low",
    riskScore: 10,
    riskLevel: "low",
    signals: [],
    reasons: ["이유"],
    unknowns: [],
    authorRelation: "unknown",
    recommendedNextSteps: ["확인"],
    verificationRequired: true,
    isDemo: true,
    urgentHumanSupport: false,
  }],
  summary: { low: 1, moderate: 0, high: 0, criticalReview: 0, needsManualReview: 1, unknown: 0 },
  partialFailures: [],
  coverageNotice: "시연",
  nextSteps: ["확인"],
};

describe("local cases", () => {
  it("stores encrypted fields, skips snippets by default, and enforces retention and consent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-cases-"));
    const config = configFor(root, true);
    clearAuditCache();
    const now = new Date("2026-10-25T00:00:00.000Z");
    saveAudit(audit, now.getTime());
    expect(() => saveAuditAsCase(config, {
      auditId: audit.auditId,
      caseTitle: "case-title-should-stay-encrypted",
      confirmedUserSave: false,
    }, now)).toThrow(AppError);

    const saved = saveAuditAsCase(config, {
      auditId: audit.auditId,
      caseTitle: "case-title-should-stay-encrypted",
      confirmedUserSave: true,
      retentionDays: 1,
    }, now);
    const raw = readFileSync(config.databasePath);
    expect(raw.includes(Buffer.from("case-title-should-stay-encrypted"))).toBe(false);
    expect(raw.includes(Buffer.from("secretpathzzzz"))).toBe(false);
    expect(raw.includes(Buffer.from("snippet-secret-phrase"))).toBe(false);

    const details = getCaseDetails(config, saved.caseId, now);
    expect(details.findings[0]?.snippet).toBeUndefined();
    expect(details.findings[0]?.url).toContain("secretpathzzzz");

    const updated = updateCaseStatus(config, { caseId: saved.caseId, status: "user_submitted" }, now);
    expect(updated.userAsserted).toBe(true);
    expect(getCaseDetails(config, saved.caseId, now).status).toBe("user_submitted");

    expect(() => exportCaseReport(config, {
      caseId: saved.caseId,
      format: "markdown",
      fileName: "../outside.md",
      confirmedExport: true,
    }, now)).toThrow(AppError);
    expect(existsSync(path.join(root, "outside.md"))).toBe(false);

    const later = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(listCases(config, {}, later).cases).toHaveLength(0);
  });

  it("previews deletion and refuses a save when persistence is off", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dl-cases-off-"));
    const enabled = configFor(root, true);
    const disabled = configFor(path.join(root, "off"), false);
    clearAuditCache();
    saveAudit(audit);
    const saved = saveAuditAsCase(enabled, {
      auditId: audit.auditId,
      caseTitle: "미리보기",
      confirmedUserSave: true,
      retentionDays: 30,
    });
    const preview = deleteLocalData(enabled, {
      scope: "case",
      caseId: saved.caseId,
      confirmedDelete: false,
      previewOnly: true,
    });
    expect(preview.preview).toBe(true);
    expect(getCaseDetails(enabled, saved.caseId).id).toBe(saved.caseId);

    await withMcpClient(() => createServer(disabled), async (client) => {
      const denied = await client.callTool({
        name: "save_audit_as_case",
        arguments: {
          auditId: audit.auditId,
          caseTitle: "없음",
          confirmedUserSave: true,
        },
      });
      expect(denied.structuredContent).toMatchObject({ errorCode: "storage_disabled" });
    });
  });
});
