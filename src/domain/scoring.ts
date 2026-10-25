import type { Signal } from "../domain/types.js";

export const SCORE_CAPS = {
  contact: 35,
  identityContext: 25,
  imageReuse: 20,
  harm: 20,
} as const;

export const AUDIT_CACHE_TTL_MS = 60 * 60 * 1000;

export const OFFICIAL_SUPPORT_CONTACTS = [
  "긴급 신고 112",
  "사이버범죄 신고 182",
  "개인정보 포털 지우개 상담 02-2135-8362",
] as const;

const PHONE_PATTERN = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const IDENTIFIER_PATTERN = /\d{6}-\d{7}/;
const SCHOOL_PATTERN = /학교|학급|학년|동아리|대학교|고등학교|중학교|초등학교/;
const LOCATION_PATTERN = /주소|거주지|아파트|번지|사는 곳|[가-힣]{2,}(?:시|도)\s*[가-힣]{1,10}(?:구|군)/;
const THREAT_PATTERN = /죽여|죽인다|협박|찾아가|때려/;
const HARASSMENT_PATTERN = /왕따|괴롭|따돌|모욕/;
const PRIVACY_HARM_PATTERN = /불법촬영|딥페이크|성착취|몰카/;

export interface AnalysisSource {
  source: Signal["evidenceSource"];
  text: string;
}

export interface AnalysisRequest {
  title: string;
  snippet?: string;
  pageText?: string;
  aliases?: string[];
  keywords?: string[];
  imageMatchType?: "full" | "partial" | "visually_similar" | "matching_page";
  userConfirmedUrl?: boolean;
}

export interface FootprintAnalysis {
  matchConfidence: "high" | "medium" | "low" | "unknown";
  riskScore: number | null;
  riskLevel: "low" | "moderate" | "high" | "critical_review" | "unknown";
  signals: Signal[];
  reasons: string[];
  unknowns: string[];
  verificationQuestions: string[];
  recommendedNextSteps: string[];
  urgentHumanSupport: boolean;
  officialContacts: string[];
  sourceNotes: { source: Signal["evidenceSource"]; note: string }[];
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
  const needle = normalize(term);
  return needle.length >= 2 && normalize(text).includes(needle);
}

function riskLevelFor(score: number): FootprintAnalysis["riskLevel"] {
  if (score >= 75) return "critical_review";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

function pushSignal(
  signals: Signal[],
  signal: Signal,
): void {
  if (!signals.some((item) => item.code === signal.code)) {
    signals.push(signal);
  }
}

export function analyzeFootprint(input: AnalysisRequest): FootprintAnalysis {
  const sources: AnalysisSource[] = [{ source: "title", text: input.title }];
  if (input.snippet !== undefined) {
    sources.push({ source: "snippet", text: input.snippet });
  }
  if (input.pageText !== undefined) {
    sources.push({ source: "page_text", text: input.pageText });
  }

  const signals: Signal[] = [];
  const find = (pattern: RegExp): Signal["evidenceSource"] | undefined => {
    for (const source of sources) {
      if (pattern.test(source.text)) {
        return source.source;
      }
    }
    return undefined;
  };

  const phoneSource = find(PHONE_PATTERN);
  const emailSource = find(EMAIL_PATTERN);
  const identifierSource = find(IDENTIFIER_PATTERN);
  const schoolSource = find(SCHOOL_PATTERN);
  const locationSource = find(LOCATION_PATTERN);
  const threatSource = find(THREAT_PATTERN);
  const harassmentSource = find(HARASSMENT_PATTERN);
  const privacyHarmSource = find(PRIVACY_HARM_PATTERN);

  if (phoneSource) {
    pushSignal(signals, {
      code: "contact_phone",
      category: "contact",
      description: "전화번호 형태의 값이 보입니다. 번호 자체는 옮기지 않았습니다.",
      evidenceSource: phoneSource,
      confidence: "high",
    });
  }
  if (emailSource) {
    pushSignal(signals, {
      code: "contact_email",
      category: "contact",
      description: "이메일 형태의 값이 보입니다. 주소 자체는 옮기지 않았습니다.",
      evidenceSource: emailSource,
      confidence: "high",
    });
  }
  if (identifierSource) {
    pushSignal(signals, {
      code: "contact_identifier",
      category: "contact",
      description: "고유 식별번호 형태의 숫자가 보입니다. 값은 옮기지 않았습니다.",
      evidenceSource: identifierSource,
      confidence: "medium",
    });
  }
  if (schoolSource) {
    pushSignal(signals, {
      code: "identity_school",
      category: "identity_context",
      description: "학교, 학급, 동아리처럼 소속을 드러내는 표현이 있습니다.",
      evidenceSource: schoolSource,
      confidence: "medium",
    });
  }
  if (locationSource) {
    pushSignal(signals, {
      code: "identity_location",
      category: "identity_context",
      description: "주소나 생활 위치를 드러내는 표현이 있습니다.",
      evidenceSource: locationSource,
      confidence: "medium",
    });
  }
  if (input.imageMatchType) {
    pushSignal(signals, {
      code: "image_reuse",
      category: "image_reuse",
      description: "이미지 검색 제공자가 유사 이미지 후보를 반환했습니다. 같은 사람이라는 뜻은 아닙니다.",
      evidenceSource: "image_provider",
      confidence: input.imageMatchType === "full" ? "high" : "medium",
    });
  }
  if (threatSource) {
    pushSignal(signals, {
      code: "harm_threat",
      category: "harm",
      description: "위협으로 볼 수 있는 표현이 있습니다. 원문은 옮기지 않았습니다.",
      evidenceSource: threatSource,
      confidence: "medium",
    });
  }
  if (harassmentSource) {
    pushSignal(signals, {
      code: "harm_harassment",
      category: "harm",
      description: "괴롭힘이나 모욕으로 볼 수 있는 표현이 있습니다. 원문은 옮기지 않았습니다.",
      evidenceSource: harassmentSource,
      confidence: "low",
    });
  }
  if (privacyHarmSource) {
    pushSignal(signals, {
      code: "harm_privacy",
      category: "harm",
      description: "불법 촬영이나 성적 착취로 의심되는 표현이 있습니다. 원문은 옮기지 않았습니다.",
      evidenceSource: privacyHarmSource,
      confidence: "medium",
    });
  }

  const searchable = sources.map((source) => source.text).join("\n");
  const aliasHit = (input.aliases ?? []).some((alias) => containsTerm(searchable, alias));
  const keywordHit = (input.keywords ?? []).some((keyword) => containsTerm(searchable, keyword));
  const imageHit = Boolean(input.imageMatchType);
  const independentMatches = [aliasHit, keywordHit, imageHit, input.userConfirmedUrl === true].filter(Boolean).length;

  let matchConfidence: FootprintAnalysis["matchConfidence"] = "unknown";
  if (input.userConfirmedUrl === true || independentMatches >= 2) {
    matchConfidence = "high";
  } else if (imageHit) {
    matchConfidence = "medium";
  } else if (aliasHit || keywordHit) {
    matchConfidence = "low";
  }

  const contactPoints = phoneSource || identifierSource ? SCORE_CAPS.contact : emailSource ? 20 : 0;
  const identityPoints = schoolSource || locationSource
    ? aliasHit ? SCORE_CAPS.identityContext : 10
    : 0;
  const imagePoints = imageHit ? SCORE_CAPS.imageReuse : 0;
  const harmPoints = threatSource || privacyHarmSource
    ? SCORE_CAPS.harm
    : harassmentSource ? 12 : 0;
  const looked = [input.snippet, input.pageText].some((value) => (value ?? "").trim().length > 0);
  const scoredPoints = contactPoints + identityPoints + imagePoints + harmPoints;
  const hasRiskSignal = contactPoints + identityPoints + imagePoints + harmPoints > 0;
  const riskScore = hasRiskSignal ? Math.min(100, scoredPoints) : looked ? 0 : null;
  const riskLevel = riskScore === null ? "unknown" : riskLevelFor(riskScore);

  const urgentHumanSupport = Boolean(
    threatSource || privacyHarmSource || identifierSource || (phoneSource && identityPoints > 0),
  );

  const reasons: string[] = [];
  if (contactPoints > 0) {
    reasons.push(`연락처 또는 고유 식별 신호 ${contactPoints}점. 같은 종류의 값은 한 번만 반영했습니다.`);
  }
  if (identityPoints > 0) {
    reasons.push(`소속이나 위치와 관련된 식별 맥락 ${identityPoints}점.`);
  }
  if (imagePoints > 0) {
    reasons.push(`의도하지 않은 이미지 재사용 후보 ${imagePoints}점. 동일 인물 확정이 아닙니다.`);
  }
  if (harmPoints > 0) {
    reasons.push(`유해 맥락 ${harmPoints}점. 전문은 복사하지 않았습니다.`);
  }
  if (riskLevel === "unknown") {
    reasons.push("스니펫이나 본문이 없어 위험이 낮다고 판단하지 않았습니다.");
  }
  if (riskLevel === "critical_review") {
    reasons.push("critical_review는 위법 확정이 아니라 사람이 먼저 검토해야 한다는 표시입니다.");
  }
  if (riskScore === 0) {
    reasons.push("제공된 본문에서 위험 신호를 찾지 못했습니다. 점수가 낮아도 우려가 있으면 직접 확인이 필요합니다.");
  }

  const unknowns = [
    "이 텍스트가 해당 URL에 실제로 있는지는 보장하지 않습니다.",
    "작성자와 작성 당시 나이는 확인되지 않았습니다.",
  ];
  if (!looked) {
    unknowns.push("검색 스니펫과 페이지 본문이 비어 있습니다.");
  }

  const recommendedNextSteps = [
    "게시물을 직접 열어 본인 또는 본인 별칭의 글인지 확인하세요.",
    "삭제와 신고는 자동으로 제출되지 않습니다.",
  ];
  if (urgentHumanSupport) {
    recommendedNextSteps.unshift("긴급하거나 피해가 우려되면 공식 상담 및 신고 창구에 연락하세요.");
  }

  const sourceNotes: FootprintAnalysis["sourceNotes"] = [
    { source: "title", note: "제목만 검색 결과의 제목으로 분석했습니다." },
  ];
  if (input.snippet !== undefined) {
    sourceNotes.push({ source: "snippet", note: "검색 제공자가 준 스니펫을 분석했습니다." });
  }
  if (input.pageText !== undefined) {
    sourceNotes.push({
      source: "page_text",
      note: "사용자가 넣은 페이지 텍스트입니다. 그 URL의 실제 내용이라고 보장하지 않습니다.",
    });
  }
  if (input.imageMatchType) {
    sourceNotes.push({
      source: "image_provider",
      note: "이미지 제공자의 유사 결과 메타데이터입니다. 이미지 바이트는 보관하지 않습니다.",
    });
  }

  return {
    matchConfidence,
    riskScore,
    riskLevel,
    signals,
    reasons,
    unknowns,
    verificationQuestions: [
      "이 주소의 글이 본인 또는 본인이 쓰던 별칭의 글인지 확인해 주세요.",
      "작성자와 작성 당시 나이를 알고 있는지 확인해 주세요.",
    ],
    recommendedNextSteps,
    urgentHumanSupport,
    officialContacts: urgentHumanSupport ? [...OFFICIAL_SUPPORT_CONTACTS] : [],
    sourceNotes,
  };
}
