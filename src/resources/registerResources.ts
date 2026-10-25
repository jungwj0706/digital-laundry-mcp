import type { McpServer } from "@modelcontextprotocol/server";
import type { AppConfig } from "../config/env.js";
import { POLICY_CHECKED_AT } from "../config/constants.js";
import { ERASER_CONTACTS, ERASER_URLS } from "../policy/eraserPolicy.js";
import { SCORE_CAPS } from "../domain/scoring.js";

function textResource(server: McpServer, name: string, uri: string, title: string, body: string): void {
  server.registerResource(name, uri, { title, mimeType: "text/markdown" }, async (resourceUri) => ({
    contents: [{ uri: resourceUri.href, mimeType: "text/markdown", text: body }],
  }));
}

export function registerResources(server: McpServer, config: AppConfig): void {
  textResource(
    server,
    "eraser-service",
    "digital-laundry://guides/eraser-service",
    "지우개 서비스 안내",
    [
      `# 지우개 서비스`,
      `확인일: ${POLICY_CHECKED_AT}`,
      `소개: ${ERASER_URLS.intro}`,
      `신청 유형: ${ERASER_URLS.requestTypes}`,
      `만 14세 이상 온라인 안내: ${ERASER_URLS.onlineAge14OrOlder}`,
      `14세 미만 안내: ${ERASER_URLS.under14}`,
      `상담 전화: ${ERASER_CONTACTS.phone} (${ERASER_CONTACTS.hours})`,
      `14세 미만 이메일: ${ERASER_CONTACTS.under14Email}`,
      "만 14세 미만은 법정대리인 동의가 필요하며 성인용 온라인 신청을 기본 경로로 쓰지 않습니다.",
      "이 안내는 법률 자문이 아니고 신청을 자동 제출하지 않습니다.",
    ].join("\n"),
  );
  textResource(
    server,
    "evidence-checklist",
    "digital-laundry://guides/evidence-checklist",
    "입증자료 안내",
    [
      "# 입증자료",
      "게시물 주소, 게시자와 맥락이 보이는 화면, 본인 작성을 보여줄 자료, 식별 정보가 보이는 부분, 작성 시기를 준비합니다.",
      "화면은 사용자가 직접 저장합니다. 로그인이나 접근 제한을 우회하지 않습니다.",
      "주민등록번호, 비밀번호, 인증코드는 수집하지 않습니다.",
      "타인 게시물은 자기게시물 삭제 신청 자료로 바꾸지 않고 상담 경로를 사용합니다.",
    ].join("\n"),
  );
  textResource(
    server,
    "risk-scoring",
    "digital-laundry://policy/risk-scoring",
    "위험 점수 원칙",
    [
      "# 위험 점수",
      `연락처 또는 고유 식별 ${SCORE_CAPS.contact}점, 소속과 위치 맥락 ${SCORE_CAPS.identityContext}점, 이미지 재사용 후보 ${SCORE_CAPS.imageReuse}점, 유해 맥락 ${SCORE_CAPS.harm}점.`,
      "같은 신호는 한 번만 더하고 총점은 100을 넘지 않습니다.",
      "0-24 low, 25-49 moderate, 50-74 high, 75-100 critical_review.",
      "critical_review는 위법 확정이 아니라 사람 검토가 필요하다는 표시입니다.",
      "일치 신뢰도는 high, medium, low, unknown이며 퍼센트 확률을 만들지 않습니다.",
      "스니펫이 비어 있으면 위험이 낮다고 단정하지 않고 unknown을 반환합니다.",
    ].join("\n"),
  );
  textResource(
    server,
    "finding-schema",
    "digital-laundry://schemas/finding",
    "Finding 구조",
    [
      "# Finding",
      "id, auditId, sourceType, title, url, domain, snippet, matchConfidence, riskScore, riskLevel, signals, reasons, unknowns, authorRelation, recommendedNextSteps, verificationRequired, isDemo, urgentHumanSupport.",
      "sourceType은 web, demo, image_web_detection입니다.",
      "isDemo가 true이면 시연용 가상 데이터입니다.",
    ].join("\n"),
  );
  textResource(
    server,
    "data-handling",
    "digital-laundry://privacy/data-handling",
    "데이터 처리",
    [
      "# 데이터 처리",
      "외부 검색과 이미지 전송은 사용자가 확인한 뒤에만 실행합니다.",
      "검색어와 API 키는 로그에 남기지 않습니다.",
      "로컬 저장은 기본으로 꺼져 있고, 암호화 키가 있을 때만 SQLite에 저장합니다.",
      "별칭 원문, 검색어 원문, 이미지 바이트는 저장하지 않습니다.",
      "감사 결과는 기본 60분만 메모리에 있습니다.",
    ].join("\n"),
  );
  if (config.demoMode) {
    textResource(
      server,
      "demo-scenario",
      "digital-laundry://demo/scenario",
      "시연 시나리오",
      [
        "# 시연",
        "DL_DEMO_MODE=true이면 example.test의 시연용 가상 데이터만 반환합니다.",
        "결과의 isDemo는 true이고 제목에 시연용 가상 데이터가 들어갑니다.",
        "라이브 검색이 성공한 것처럼 보이지 않아야 합니다.",
      ].join("\n"),
    );
  }
}
