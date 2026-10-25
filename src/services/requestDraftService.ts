import { assessEraserEligibility, type EligibilityInput, type ErasureRoute } from "../policy/eraserPolicy.js";

export interface ErasureDraftInput extends EligibilityInput {
  urls?: string[];
  userStatement?: string;
  desiredOutcome?: string;
}

export interface ErasureDraft {
  route: ErasureRoute;
  title: string;
  body: string;
  urls: string[];
  evidenceList: string[];
  missingItems: string[];
  officialUrl: string;
  notice: string;
}

const NOTICE = "이 초안은 자동으로 제출되지 않습니다. 사실관계를 고친 뒤 공식 경로에서 직접 제출해야 합니다.";

function placeholder(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : `[${label} 미제공]`;
}

export function draftErasureRequest(input: ErasureDraftInput): ErasureDraft {
  const assessment = assessEraserEligibility(input);
  const urls = input.urls && input.urls.length > 0 ? input.urls : ["[게시물 주소 미제공]"];
  const statement = placeholder(input.userStatement, "사용자 설명");
  const outcome = placeholder(input.desiredOutcome, "원하는 조치");
  const missingItems = [
    ...assessment.missingFacts,
    "[게시 날짜 미확인]",
    "[게시물 본문 미제공]",
  ];
  if (assessment.route === "other_person_post_consultation" || assessment.route === "urgent_human_support") {
    return {
      route: assessment.route,
      title: assessment.route === "urgent_human_support" ? "공식 상담 및 피해 지원 문의" : "타인 게시물 상담 요청",
      body: [
        "이 문안은 자기게시물 삭제 신청이 아닙니다.",
        "사용자는 아래 주소를 다른 사람의 게시물로 표시했거나, 우선 상담이 필요하다고 표시했습니다.",
        `주소: ${urls.join(", ")}`,
        `사용자가 제공한 설명: ${statement}`,
        "작성자 이름: [작성자 이름 미제공]",
        "게시 날짜: [게시 날짜 미확인]",
        "게시물 본문: [게시물 본문 미제공]",
        `연락 창구: ${assessment.contacts.join(", ")}`,
      ].join("\n"),
      urls,
      evidenceList: ["공개 주소", "사용자가 직접 확인한 사실만"],
      missingItems,
      officialUrl: assessment.officialUrl,
      notice: NOTICE,
    };
  }
  return {
    route: assessment.route,
    title: assessment.eligibilityStatus === "likely_supported"
      ? "자기게시물 삭제 또는 검색제한 검토 요청 초안"
      : "사실 확인 전 검토용 메모",
    body: [
      assessment.eligibilityStatus === "likely_supported"
        ? "아래는 사용자가 확인한 사실만으로 적은 검토 초안입니다."
        : "지원 가능성을 확정할 수 없어, 빈칸은 플레이스홀더로 남겼습니다.",
      `주소: ${urls.join(", ")}`,
      `작성자: ${input.author === "self" ? "본인이 작성했다고 사용자가 표시함" : "[작성자 미확인]"}`,
      "게시 날짜: [게시 날짜 미확인]",
      "게시물 본문: [게시물 본문 미제공]",
      `원하는 조치: ${outcome}`,
      `사용자가 제공한 설명: ${statement}`,
      ...assessment.reasons,
    ].join("\n"),
    urls,
    evidenceList: ["게시물 주소", "본인 작성 자료", "식별 정보가 보이는 화면", "작성 시기"],
    missingItems,
    officialUrl: assessment.officialUrl,
    notice: NOTICE,
  };
}

export interface PlatformDraftInput {
  platform?: string;
  domain?: string;
  url?: string;
  issueType?: string;
  confirmedFacts?: string;
  desiredAction?: string;
}

export function draftPlatformReport(input: PlatformDraftInput): {
  title: string;
  body: string;
  checklist: string[];
  notice: string;
} {
  const platform = placeholder(input.platform ?? input.domain, "플랫폼 또는 도메인");
  return {
    title: "게시물 검토 문의 초안",
    body: [
      "안녕하세요.",
      `${platform}에 공개된 아래 주소의 검토를 요청드립니다.`,
      `주소: ${placeholder(input.url, "게시물 주소")}`,
      `문제 유형: ${placeholder(input.issueType, "문제 유형")}`,
      `확인한 사실: ${placeholder(input.confirmedFacts, "확인한 사실")}`,
      `요청하는 조치: ${placeholder(input.desiredAction, "요청 조치")}`,
      "특정 플랫폼 정책을 확인하지 못했으므로 정책을 인용하지 않았습니다. 공식 도움말에서 신고 절차를 확인해 주세요.",
      "이 초안은 자동으로 제출되지 않습니다.",
    ].join("\n"),
    checklist: [
      "주소가 공개 페이지인지 확인",
      "본인이 확인한 사실만 남았는지 확인",
      "비밀번호, 인증코드, 주민등록번호를 넣지 않았는지 확인",
      "플랫폼 공식 도움말의 접수 방법을 확인",
    ],
    notice: NOTICE,
  };
}
