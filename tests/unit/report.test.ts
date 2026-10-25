import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/domain/types.js";
import { clearAuditCache, saveAudit } from "../../src/services/auditCache.js";
import { createCleanupReport } from "../../src/services/reportService.js";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

const finding: Finding = {
  id: "finding-1",
  auditId: "audit-report",
  sourceType: "demo",
  title: "<script>alert(1)</script>",
  url: "https://example.test/posts/note",
  domain: "example.test",
  snippet: "연락 person@example.test 그리고 010-0000-0000",
  matchConfidence: "low",
  riskScore: 60,
  riskLevel: "high",
  signals: [],
  reasons: ["연락처 신호"],
  unknowns: ["작성자 미확인"],
  authorRelation: "unknown",
  recommendedNextSteps: ["직접 확인"],
  verificationRequired: true,
  isDemo: true,
  urgentHumanSupport: false,
};

describe("createCleanupReport", () => {
  it("includes the required sections, demo label, redaction, and html escaping", () => {
    clearAuditCache();
    saveAudit({
      auditId: "audit-report",
      mode: "demo",
      provider: "demo",
      searchedAt: "2026-10-25T00:00:00.000Z",
      queriesExecutedCount: 1,
      totalResults: 1,
      findings: [finding],
      summary: { low: 0, moderate: 0, high: 1, criticalReview: 0, needsManualReview: 1, unknown: 0 },
      partialFailures: [],
      coverageNotice: "시연 범위",
      nextSteps: ["확인"],
    });
    const markdown = createCleanupReport({ auditId: "audit-report", format: "markdown" });
    for (const heading of ["조사 범위", "검색 시각", "제공자", "발견 결과", "일치 신뢰도", "위험 점수", "불확실성", "권장 경로", "공식 링크"]) {
      expect(markdown.content).toContain(heading);
    }
    expect(markdown.content).toContain("시연용 가상 데이터");
    expect(markdown.content).toContain("자동으로 제출되지 않습니다");
    expect(markdown.content).toContain("[email]");
    expect(markdown.content).toContain("[phone]");
    expect(markdown.content).not.toContain("person@example.test");

    const html = createCleanupReport({ auditId: "audit-report", format: "html", redactSensitive: false });
    expect(html.content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html.content).not.toContain("<script>");
    expect(html.content).toContain("person@example.test");
  });

  it("returns not_found for an unknown audit through the tool", async () => {
    clearAuditCache();
    await withMcpClient(
      () => createServer(parseConfig({ DL_DEMO_MODE: "true" })),
      async (client) => {
        const result = await client.callTool({
          name: "create_cleanup_report",
          arguments: { auditId: "missing-audit", format: "json" },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ errorCode: "not_found" });
      },
    );
  });
});
