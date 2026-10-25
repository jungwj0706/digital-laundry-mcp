import { POLICY_CHECKED_AT, POLICY_VERSION } from "../config/constants.js";

export const ERASER_URLS = {
  intro: "https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=260",
  requestTypes: "https://www.privacy.go.kr/front/rghtFrgtFrt/selectRequestType.do",
  onlineAge14OrOlder: "https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=273",
  under14: "https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=275",
} as const;

export const ERASER_CONTACTS = {
  phone: "02-2135-8362",
  hours: "평일 09:00-18:00",
  under14Email: "help@delete.or.kr",
} as const;

const DISCLAIMER =
  "이 안내는 법률 자문이 아닙니다. 지원 여부는 개인정보 포털 등 담당 기관이 판단하며, 이 서버는 신청을 제출하지 않습니다.";

export type ErasureRoute =
  | "self_post_delete_or_search_restriction"
  | "other_person_post_consultation"
  | "self_delete_guidance"
  | "general_platform_report"
  | "needs_more_evidence"
  | "urgent_human_support";

export type EligibilityStatus =
  | "likely_supported"
  | "likely_not_supported"
  | "consultation_route"
  | "self_delete_guidance"
  | "needs_more_information";

export interface EligibilityInput {
  applicantAge: number;
  postAgeAtCreation: "under_19" | "19_or_older" | "unknown";
  author: "self" | "other" | "unknown";
  includesIdentifyingInformation: "yes" | "no" | "unknown";
  canDeleteDirectly?: "yes" | "no" | "unknown";
  hasAuthorshipEvidence?: "yes" | "no" | "unknown";
  urgentConcern?: boolean;
}

export interface PolicyAssessment {
  route: ErasureRoute;
  eligibilityStatus: EligibilityStatus;
  reasons: string[];
  missingFacts: string[];
  recommendedRequestTypes: string[];
  officialUrl: string;
  additionalUrls: { label: string; url: string }[];
  contacts: string[];
  policyVersion: string;
  policyCheckedAt: string;
  disclaimer: string;
  applicantUnder14: boolean;
}

function contacts(under14: boolean): string[] {
  const phone = `${ERASER_CONTACTS.phone} (${ERASER_CONTACTS.hours})`;
  return under14 ? [phone, ERASER_CONTACTS.under14Email] : [phone];
}

function shell(under14: boolean, officialUrl: string): Pick<
  PolicyAssessment,
  "officialUrl" | "additionalUrls" | "contacts" | "policyVersion" | "policyCheckedAt" | "disclaimer" | "applicantUnder14"
> {
  return {
    officialUrl,
    additionalUrls: under14
      ? [
          { label: "지우개 서비스 소개", url: ERASER_URLS.intro },
          { label: "14세 미만 안내", url: ERASER_URLS.under14 },
        ]
      : [
          { label: "지우개 서비스 소개", url: ERASER_URLS.intro },
          { label: "만 14세 이상 온라인 신청 안내", url: ERASER_URLS.onlineAge14OrOlder },
        ],
    contacts: contacts(under14),
    policyVersion: POLICY_VERSION,
    policyCheckedAt: POLICY_CHECKED_AT,
    disclaimer: DISCLAIMER,
    applicantUnder14: under14,
  };
}

export function assessEraserEligibility(input: EligibilityInput): PolicyAssessment {
  const under14 = input.applicantAge < 14;
  const directDelete = input.canDeleteDirectly ?? "unknown";
  if (input.urgentConcern === true) {
    return {
      ...shell(under14, ERASER_URLS.intro),
      route: "urgent_human_support",
      eligibilityStatus: "consultation_route",
      reasons: ["피해 우려가 표시되어 신청 자격보다 공식 상담과 신고 창구를 먼저 안내합니다."],
      missingFacts: [],
      recommendedRequestTypes: ["공식 상담", "긴급 신고"],
      contacts: ["112", "182", ...contacts(under14)],
    };
  }
  if (input.author === "other") {
    return {
      ...shell(under14, ERASER_URLS.intro),
      route: "other_person_post_consultation",
      eligibilityStatus: "consultation_route",
      reasons: ["다른 사람이 작성한 게시물은 자기게시물 삭제 신청으로 안내하지 않습니다."],
      missingFacts: input.applicantAge >= 30 ? ["만 30세 미만 신청 연령 기준에도 해당하지 않습니다."] : [],
      recommendedRequestTypes: ["상담"],
    };
  }
  if (input.applicantAge >= 30) {
    return {
      ...shell(under14, ERASER_URLS.intro),
      route: "self_delete_guidance",
      eligibilityStatus: "likely_not_supported",
      reasons: ["지우개 서비스의 신청 연령 안내는 만 30세 미만입니다."],
      missingFacts: [],
      recommendedRequestTypes: ["플랫폼에서 직접 삭제", "플랫폼 고객센터 문의"],
    };
  }
  const missingFacts: string[] = [];
  if (input.postAgeAtCreation === "unknown") {
    missingFacts.push("게시물을 만 19세 미만에 작성했는지 확인되지 않았습니다.");
  }
  if (input.author === "unknown") {
    missingFacts.push("작성자가 본인인지 확인되지 않았습니다.");
  }
  if (input.includesIdentifyingInformation === "unknown") {
    missingFacts.push("개인을 알아볼 수 있는 정보가 포함됐는지 확인되지 않았습니다.");
  }
  if (missingFacts.length > 0) {
    return {
      ...shell(under14, under14 ? ERASER_URLS.under14 : ERASER_URLS.intro),
      route: "needs_more_evidence",
      eligibilityStatus: "needs_more_information",
      reasons: ["작성 시기, 작성자, 개인정보 포함 여부가 모두 확인되기 전에는 지원 가능성을 확정하지 않습니다."],
      missingFacts,
      recommendedRequestTypes: [],
    };
  }
  if (
    input.includesIdentifyingInformation === "no"
    || input.postAgeAtCreation === "19_or_older"
    || directDelete === "yes"
  ) {
    const reasons: string[] = [];
    if (input.includesIdentifyingInformation === "no") {
      reasons.push("개인을 알아볼 수 있는 정보가 없다고 표시되어 직접 삭제 안내가 우선입니다.");
    }
    if (input.postAgeAtCreation === "19_or_older") {
      reasons.push("만 19세 이후에 작성한 게시물로 표시되어 청소년기 자기게시물 지원 대상과 다릅니다.");
    }
    if (directDelete === "yes") {
      reasons.push("게시물을 직접 삭제할 수 있다고 표시되었습니다.");
    }
    return {
      ...shell(under14, under14 ? ERASER_URLS.under14 : ERASER_URLS.intro),
      route: "self_delete_guidance",
      eligibilityStatus: "self_delete_guidance",
      reasons,
      missingFacts: [],
      recommendedRequestTypes: ["플랫폼에서 직접 삭제", "플랫폼 신고 또는 고객센터 문의"],
    };
  }
  if (directDelete === "unknown") {
    return {
      ...shell(under14, under14 ? ERASER_URLS.under14 : ERASER_URLS.intro),
      route: "needs_more_evidence",
      eligibilityStatus: "needs_more_information",
      reasons: ["직접 삭제할 수 없는 경우에 지원을 검토하므로, 그 사실이 확인되기 전에는 가능성을 확정하지 않습니다."],
      missingFacts: ["직접 삭제 가능 여부가 확인되지 않았습니다."],
      recommendedRequestTypes: [],
    };
  }
  const evidenceGaps: string[] = [];
  if ((input.hasAuthorshipEvidence ?? "unknown") !== "yes") {
    evidenceGaps.push("본인이 작성했음을 보여주는 입증자료가 아직 없습니다.");
  }
  return {
    ...shell(under14, under14 ? ERASER_URLS.under14 : ERASER_URLS.requestTypes),
    route: "self_post_delete_or_search_restriction",
    eligibilityStatus: "likely_supported",
    reasons: [
      "만 30세 미만, 만 19세 미만 작성, 본인 작성, 식별 정보 포함, 직접 삭제 불가로 표시된 조합입니다.",
      "이는 지원 가능성이며 담당 기관의 인정을 의미하지 않습니다.",
    ],
    missingFacts: evidenceGaps,
    recommendedRequestTypes: under14
      ? ["법정대리인 동의 후 14세 미만 공식 안내로 접수"]
      : ["게시물 삭제", "검색결과 제한"],
  };
}

export function erasureGuidance(): PolicyAssessment {
  return {
    ...shell(false, ERASER_URLS.intro),
    route: "needs_more_evidence",
    eligibilityStatus: "needs_more_information",
    reasons: [
      `저장된 안내의 확인일은 ${POLICY_CHECKED_AT}입니다. 신청 전에 공식 페이지에서 같은 기준인지 다시 확인하세요.`,
      "신청 연령은 만 30세 미만, 게시물은 만 19세 미만에 본인이 작성했고 식별 정보가 있으며 직접 삭제가 어려운 경우를 지원 가능성으로 봅니다.",
      "만 14세 미만은 법정대리인 동의가 필요하며, 성인용 온라인 신청을 기본 경로로 제시하지 않습니다.",
    ],
    missingFacts: [],
    recommendedRequestTypes: ["공식 안내 재확인"],
    additionalUrls: [
      { label: "지우개 서비스 소개", url: ERASER_URLS.intro },
      { label: "신청 유형", url: ERASER_URLS.requestTypes },
      { label: "만 14세 이상 온라인 신청 안내", url: ERASER_URLS.onlineAge14OrOlder },
      { label: "14세 미만 안내", url: ERASER_URLS.under14 },
    ],
    contacts: [ERASER_CONTACTS.phone, ERASER_CONTACTS.hours, ERASER_CONTACTS.under14Email],
  };
}
