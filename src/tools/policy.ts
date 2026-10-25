import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { AppError, errorResult } from "../domain/errors.js";
import { toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import { assessEraserEligibility, erasureGuidance } from "../policy/eraserPolicy.js";
import { createEvidenceChecklist } from "../services/evidenceService.js";
import { draftErasureRequest, draftPlatformReport } from "../services/requestDraftService.js";

const triState = z.enum(["yes", "no", "unknown"]);
const ageState = z.enum(["under_19", "19_or_older", "unknown"]);
const authorState = z.enum(["self", "other", "unknown"]);

const eligibilityInputSchema = z.object({
  applicantAge: z.number().int().min(0).max(120),
  postAgeAtCreation: ageState,
  author: authorState,
  includesIdentifyingInformation: triState,
  canDeleteDirectly: triState.optional(),
  hasAuthorshipEvidence: triState.optional(),
  urgentConcern: z.boolean().optional(),
});

const assessmentSchema = z.object({
  ok: z.literal(true),
  route: z.enum([
    "self_post_delete_or_search_restriction",
    "other_person_post_consultation",
    "self_delete_guidance",
    "general_platform_report",
    "needs_more_evidence",
    "urgent_human_support",
  ]),
  eligibilityStatus: z.enum([
    "likely_supported",
    "likely_not_supported",
    "consultation_route",
    "self_delete_guidance",
    "needs_more_information",
  ]),
  reasons: z.array(z.string()),
  missingFacts: z.array(z.string()),
  recommendedRequestTypes: z.array(z.string()),
  officialUrl: z.string().url(),
  additionalUrls: z.array(z.object({ label: z.string(), url: z.string().url() })),
  contacts: z.array(z.string()),
  policyVersion: z.string(),
  policyCheckedAt: z.string(),
  disclaimer: z.string(),
  applicantUnder14: z.boolean(),
});

function logged<T>(toolName: string, resultCount: number, value: T): T {
  logEvent({
    event: "tool",
    toolName,
    durationMs: 0,
    resultCount,
    correlationId: crypto.randomUUID(),
  });
  return value;
}

export function registerPolicyTools(server: McpServer): void {
  server.registerTool(
    "check_eraser_eligibility",
    {
      title: "지우개 경로 판단",
      description:
        "개인정보 포털 지우개 서비스의 저장된 안내를 기준으로 경로 가능성을 정리합니다. 법률 자문이 아니고 신청을 제출하지 않습니다. 정확한 생년월일은 요구하지 않습니다.",
      inputSchema: eligibilityInputSchema,
      outputSchema: z.union([assessmentSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const assessment = assessEraserEligibility(input);
      return logged("check_eraser_eligibility", 1, {
        content: [{
          type: "text" as const,
          text: `${assessment.route}\n${assessment.eligibilityStatus}\n${assessment.disclaimer}`,
        }],
        structuredContent: { ok: true as const, ...assessment },
      });
    },
  );

  server.registerTool(
    "get_erasure_guidance",
    {
      title: "지우개 안내",
      description: "저장된 지우개 서비스 안내, 공식 링크, 확인일을 반환합니다. 최신 여부는 공식 페이지에서 다시 확인해야 합니다.",
      inputSchema: z.object({}),
      outputSchema: z.union([assessmentSchema, toolFailureSchema]),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const guidance = erasureGuidance();
      return logged("get_erasure_guidance", 1, {
        content: [{ type: "text" as const, text: guidance.reasons.join("\n") }],
        structuredContent: { ok: true as const, ...guidance },
      });
    },
  );

  server.registerTool(
    "create_evidence_checklist",
    {
      title: "입증자료 체크리스트",
      description: "사용자가 직접 준비할 입증자료 목록입니다. 주민등록번호, 비밀번호, 인증코드는 받지 않습니다.",
      inputSchema: z.object({
        url: z.string().url().max(2000).optional(),
        author: authorState,
        includesIdentifyingInformation: triState,
        postAgeAtCreation: ageState,
        availableEvidence: z.array(z.string().max(80)).max(20).optional(),
        requestedOutcome: z.enum(["delete", "search_restriction", "consultation", "unknown"]),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          items: z.array(z.object({
            code: z.string(),
            required: z.boolean(),
            purpose: z.string(),
            status: z.enum(["present", "missing"]),
            manualStep: z.string(),
          })),
          unconfirmed: z.array(z.string()),
          redactionGuidance: z.array(z.string()),
          rejectedEvidence: z.array(z.string()),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const checklist = createEvidenceChecklist(input);
      return logged("create_evidence_checklist", checklist.items.length, {
        content: [{
          type: "text" as const,
          text: checklist.redactionGuidance.join("\n"),
        }],
        structuredContent: { ok: true as const, ...checklist },
      });
    },
  );

  server.registerTool(
    "draft_erasure_request",
    {
      title: "지우개 신청 초안",
      description:
        "사용자가 고칠 신청 또는 상담 초안을 만듭니다. 자동 제출하지 않습니다. 없는 작성자, 날짜, 본문, 증거는 만들지 않습니다. 타인 게시물은 상담 문안으로만 작성합니다.",
      inputSchema: eligibilityInputSchema.extend({
        urls: z.array(z.string().url().max(2000)).max(20).optional(),
        userStatement: z.string().max(2000).optional(),
        desiredOutcome: z.string().max(200).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          route: z.string(),
          title: z.string(),
          body: z.string(),
          urls: z.array(z.string()),
          evidenceList: z.array(z.string()),
          missingItems: z.array(z.string()),
          officialUrl: z.string().url(),
          notice: z.string(),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const draft = draftErasureRequest(input);
        return logged("draft_erasure_request", 1, {
          content: [{ type: "text" as const, text: `${draft.title}\n${draft.notice}\n${draft.body}` }],
          structuredContent: { ok: true as const, ...draft },
        });
      } catch (error) {
        const app = error instanceof AppError
          ? error
          : new AppError("invalid_input", "초안을 만들지 못했습니다.", false, "입력값을 확인하세요.");
        return errorResult(app);
      }
    },
  );

  server.registerTool(
    "draft_platform_report",
    {
      title: "플랫폼 문의 초안",
      description:
        "플랫폼 신고 또는 개인정보 문의용 검토 초안입니다. 확인하지 않은 플랫폼 정책은 인용하지 않고, 자동으로 제출하지 않습니다.",
      inputSchema: z.object({
        platform: z.string().max(120).optional(),
        domain: z.string().max(253).optional(),
        url: z.string().url().max(2000).optional(),
        issueType: z.string().max(200).optional(),
        confirmedFacts: z.string().max(2000).optional(),
        desiredAction: z.string().max(200).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          title: z.string(),
          body: z.string(),
          checklist: z.array(z.string()),
          notice: z.string(),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const draft = draftPlatformReport(input);
      return logged("draft_platform_report", 1, {
        content: [{ type: "text" as const, text: `${draft.title}\n${draft.notice}\n${draft.body}` }],
        structuredContent: { ok: true as const, ...draft },
      });
    },
  );
}
