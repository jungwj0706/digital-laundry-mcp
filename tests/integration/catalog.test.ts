import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";
import { createServer } from "../../src/server.js";
import { withMcpClient } from "../helpers/mcpClient.js";

const TOOLS = [
  "get_service_status",
  "preview_search_queries",
  "search_public_footprints",
  "analyze_footprint_candidate",
  "run_digital_laundry_audit",
  "check_eraser_eligibility",
  "get_erasure_guidance",
  "create_evidence_checklist",
  "draft_erasure_request",
  "draft_platform_report",
  "create_cleanup_report",
  "save_audit_as_case",
  "list_cases",
  "get_case_details",
  "update_case_status",
  "export_case_report",
  "delete_local_data",
  "fetch_public_page",
  "find_image_reuse_candidates",
];

describe("catalog and demo flow", () => {
  it("lists the tools, resources, and prompts and completes a demo audit", async () => {
    await withMcpClient(() => createServer(parseConfig({ DL_DEMO_MODE: "true" })), async (client) => {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      for (const name of TOOLS) {
        expect(names).toContain(name);
      }
      const resources = await client.listResources();
      const uris = resources.resources.map((resource) => resource.uri);
      expect(uris).toContain("digital-laundry://demo/scenario");
      expect(uris).toContain("digital-laundry://guides/eraser-service");

      const prompt = await client.getPrompt({
        name: "full_digital_footprint_audit",
        arguments: { aliases: "하늘" },
      });
      const promptText = JSON.stringify(prompt);
      expect(promptText).toContain("동의");
      expect(promptText).toContain("confirmExternalSearch");
      expect(promptText).not.toContain("동의를 생략");

      const status = await client.callTool({ name: "get_service_status", arguments: {} });
      expect(status.structuredContent).toMatchObject({ demoMode: true });

      const audit = await client.callTool({
        name: "run_digital_laundry_audit",
        arguments: { aliases: ["하늘"], confirmExternalSearch: true, demoMode: true, maxQueries: 1 },
      });
      const auditBody = audit.structuredContent as {
        ok: boolean;
        mode: string;
        auditId: string;
        findings: { isDemo: boolean }[];
      };
      expect(auditBody.ok).toBe(true);
      expect(auditBody.mode).toBe("demo");
      expect(auditBody.findings.every((finding) => finding.isDemo)).toBe(true);

      const eligibility = await client.callTool({
        name: "check_eraser_eligibility",
        arguments: {
          applicantAge: 20,
          postAgeAtCreation: "under_19",
          author: "self",
          includesIdentifyingInformation: "yes",
          canDeleteDirectly: "no",
        },
      });
      expect(eligibility.structuredContent).toMatchObject({ eligibilityStatus: "likely_supported" });

      const evidence = await client.callTool({
        name: "create_evidence_checklist",
        arguments: {
          author: "self",
          includesIdentifyingInformation: "yes",
          postAgeAtCreation: "under_19",
          requestedOutcome: "delete",
        },
      });
      expect(evidence.structuredContent).toMatchObject({ ok: true });

      const draft = await client.callTool({
        name: "draft_erasure_request",
        arguments: {
          applicantAge: 20,
          postAgeAtCreation: "under_19",
          author: "self",
          includesIdentifyingInformation: "yes",
          canDeleteDirectly: "no",
          urls: ["https://example.test/posts/note"],
        },
      });
      expect(JSON.stringify(draft.structuredContent)).toContain("자동으로 제출되지 않습니다");

      const report = await client.callTool({
        name: "create_cleanup_report",
        arguments: { auditId: auditBody.auditId, format: "markdown" },
      });
      const reportBody = report.structuredContent as { content: string; demo: boolean };
      expect(reportBody.demo).toBe(true);
      expect(reportBody.content).toContain("시연용 가상 데이터");
    });
  });

  it("hides the demo resource outside demo mode", async () => {
    await withMcpClient(() => createServer(parseConfig({ DL_DEMO_MODE: "false" })), async (client) => {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).not.toContain("digital-laundry://demo/scenario");
    });
  });
});
