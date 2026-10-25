export interface EvidenceChecklistInput {
  url?: string;
  author: "self" | "other" | "unknown";
  includesIdentifyingInformation: "yes" | "no" | "unknown";
  postAgeAtCreation: "under_19" | "19_or_older" | "unknown";
  availableEvidence?: string[];
  requestedOutcome: "delete" | "search_restriction" | "consultation" | "unknown";
}

export interface EvidenceItem {
  code: string;
  required: boolean;
  purpose: string;
  status: "present" | "missing";
  manualStep: string;
}

const ALLOWED = new Set(["url", "screenshot", "authorship", "identifying_info", "timing", "redaction_review"]);

export function createEvidenceChecklist(input: EvidenceChecklistInput): {
  items: EvidenceItem[];
  unconfirmed: string[];
  redactionGuidance: string[];
  rejectedEvidence: string[];
} {
  const available = new Set((input.availableEvidence ?? []).filter((item) => ALLOWED.has(item)));
  const rejectedEvidence = (input.availableEvidence ?? []).filter((item) => !ALLOWED.has(item));
  const items: EvidenceItem[] = [
    {
      code: "url",
      required: true,
      purpose: "어느 게시물인지 지정합니다.",
      status: input.url || available.has("url") ? "present" : "missing",
      manualStep: "공개 주소만 적고, 로그인 뒤의 주소는 접근 가능한 화면으로 확인하세요.",
    },
    {
      code: "screenshot",
      required: true,
      purpose: "게시물 맥락과 게시자가 보이는 화면을 사용자가 직접 기록합니다.",
      status: available.has("screenshot") ? "present" : "missing",
      manualStep: "본인 계정으로 보이는 화면을 직접 저장하세요. 로그인이나 접근 제한을 우회하지 마세요.",
    },
    {
      code: "authorship",
      required: input.author !== "other",
      purpose: "본인 작성 또는 동일 계정을 보여줄 수 있는 자료입니다.",
      status: available.has("authorship") ? "present" : "missing",
      manualStep: "아이디, 닉네임, 같은 계정의 다른 공개 글처럼 본인이 이미 가진 자료만 사용하세요.",
    },
    {
      code: "identifying_info",
      required: input.includesIdentifyingInformation !== "no",
      purpose: "개인을 알아볼 수 있는 정보가 글에 있다는 점을 보여 줍니다.",
      status: available.has("identifying_info") ? "present" : "missing",
      manualStep: "필요한 부분만 표시하고 주민등록번호 전체는 제출 자료에 넣지 마세요.",
    },
    {
      code: "timing",
      required: input.postAgeAtCreation !== "19_or_older",
      purpose: "작성 시기를 확인할 수 있으면 첨부합니다.",
      status: available.has("timing") ? "present" : "missing",
      manualStep: "화면에 날짜가 보이면 그 부분을 캡처하세요. 날짜를 만들어 넣지 마세요.",
    },
    {
      code: "redaction_review",
      required: true,
      purpose: "제출 전에 과도한 개인정보를 가립니다.",
      status: available.has("redaction_review") ? "present" : "missing",
      manualStep: "비밀번호, 인증코드, 주민등록번호, 불필요한 연락처를 가렸는지 다시 보세요.",
    },
  ];
  const unconfirmed: string[] = [];
  if (input.author === "unknown") {
    unconfirmed.push("작성자가 본인인지 아직 모릅니다.");
  }
  if (input.postAgeAtCreation === "unknown") {
    unconfirmed.push("작성 당시 나이를 아직 모릅니다.");
  }
  if (input.includesIdentifyingInformation === "unknown") {
    unconfirmed.push("식별 정보 포함 여부를 아직 모릅니다.");
  }
  if (input.requestedOutcome === "unknown") {
    unconfirmed.push("원하는 조치가 삭제인지 검색 제한인지 상담인지 정하지 않았습니다.");
  }
  return {
    items,
    unconfirmed,
    redactionGuidance: [
      "주민등록번호, 계정 비밀번호, 인증코드는 수집하지 않습니다.",
      "화면 캡처에서 불필요한 개인정보는 제출 전에 가리세요.",
    ],
    rejectedEvidence,
  };
}
