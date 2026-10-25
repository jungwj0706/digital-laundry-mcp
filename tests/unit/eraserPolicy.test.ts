import { describe, expect, it } from "vitest";
import { ERASER_URLS, assessEraserEligibility } from "../../src/policy/eraserPolicy.js";
import { createEvidenceChecklist } from "../../src/services/evidenceService.js";
import { draftErasureRequest, draftPlatformReport } from "../../src/services/requestDraftService.js";

const supported = {
  applicantAge: 20,
  postAgeAtCreation: "under_19" as const,
  author: "self" as const,
  includesIdentifyingInformation: "yes" as const,
  canDeleteDirectly: "no" as const,
};

describe("eraser eligibility", () => {
  it("keeps likely support when authorship evidence is still missing", () => {
    const result = assessEraserEligibility(supported);
    expect(result.route).toBe("self_post_delete_or_search_restriction");
    expect(result.eligibilityStatus).toBe("likely_supported");
    expect(result.missingFacts.join(" ")).toContain("입증자료");
    expect(result.officialUrl).toBe(ERASER_URLS.requestTypes);
  });

  it("does not confirm eligibility while author, age, or identifying info is unknown", () => {
    const result = assessEraserEligibility({ ...supported, author: "unknown" });
    expect(result.route).toBe("needs_more_evidence");
    expect(result.eligibilityStatus).toBe("needs_more_information");
  });

  it("routes another person's post to consultation", () => {
    const result = assessEraserEligibility({ ...supported, author: "other" });
    expect(result.route).toBe("other_person_post_consultation");
    expect(result.eligibilityStatus).toBe("consultation_route");
    const draft = draftErasureRequest({
      ...supported,
      author: "other",
      urls: ["https://example.test/post"],
      userStatement: "본인이 작성했습니다",
    });
    expect(draft.route).toBe("other_person_post_consultation");
    expect(draft.body).toContain("자기게시물 삭제 신청이 아닙니다");
    expect(draft.body).not.toContain("삭제를 신청합니다");
    expect(draft.body).toContain("[게시 날짜 미확인]");
  });

  it("treats age 30, later posts, direct deletion, and missing identifiers as self-delete guidance", () => {
    expect(assessEraserEligibility({ ...supported, applicantAge: 30 }).eligibilityStatus).toBe("likely_not_supported");
    expect(assessEraserEligibility({ ...supported, postAgeAtCreation: "19_or_older" }).route).toBe("self_delete_guidance");
    expect(assessEraserEligibility({ ...supported, canDeleteDirectly: "yes" }).eligibilityStatus).toBe("self_delete_guidance");
    expect(assessEraserEligibility({ ...supported, includesIdentifyingInformation: "no" }).route).toBe("self_delete_guidance");
  });

  it("uses the under-14 official page and email instead of the adult form", () => {
    const result = assessEraserEligibility({ ...supported, applicantAge: 13 });
    expect(result.applicantUnder14).toBe(true);
    expect(result.officialUrl).toBe(ERASER_URLS.under14);
    expect(result.officialUrl).not.toBe(ERASER_URLS.requestTypes);
    expect(result.contacts.join(" ")).toContain("help@delete.or.kr");
    expect(result.recommendedRequestTypes.join(" ")).toContain("법정대리인");
  });

  it("prioritizes urgent human support", () => {
    const result = assessEraserEligibility({ ...supported, urgentConcern: true });
    expect(result.route).toBe("urgent_human_support");
    expect(result.contacts).toContain("112");
  });
});

describe("evidence and platform drafts", () => {
  it("rejects secrets and leaves unknown facts unconfirmed", () => {
    const checklist = createEvidenceChecklist({
      author: "unknown",
      includesIdentifyingInformation: "unknown",
      postAgeAtCreation: "unknown",
      requestedOutcome: "unknown",
      availableEvidence: ["password", "주민등록번호"],
    });
    expect(checklist.rejectedEvidence).toEqual(["password", "주민등록번호"]);
    expect(checklist.items.some((item) => item.code === "password")).toBe(false);
    expect(checklist.redactionGuidance.join(" ")).toContain("비밀번호");
    expect(checklist.unconfirmed.length).toBeGreaterThan(0);
  });

  it("does not cite an unverified platform policy", () => {
    const draft = draftPlatformReport({});
    expect(draft.body).toContain("정책을 인용하지 않았습니다");
    expect(draft.body).toContain("[확인한 사실 미제공]");
    expect(draft.notice).toContain("자동으로 제출되지 않습니다");
  });
});
