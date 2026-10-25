import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const message = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "full_digital_footprint_audit",
    {
      title: "공개 흔적 점검",
      description: "외부 검색 동의를 먼저 확인하고 공개 웹 점검을 진행합니다.",
      argsSchema: z.object({ aliases: z.string().optional() }),
    },
    ({ aliases }) => message([
      "사용자가 공개 웹 점검을 요청했습니다.",
      "검색 제공자에게 별칭이 전송될 수 있으므로, 호출 전에 동의를 받으세요.",
      "동의가 없으면 confirmExternalSearch를 true로 두지 마세요.",
      "get_service_status로 데모 모드인지 먼저 말하고, preview_search_queries로 검색어를 보여 준 뒤 run_digital_laundry_audit를 사용하세요.",
      aliases ? `사용자가 말한 별칭: ${aliases}` : "별칭은 사용자에게 직접 받으세요.",
      "전화번호, 주소, 주민등록번호는 검색어로 만들지 마세요.",
      "삭제나 신고는 제출하지 마세요.",
    ].join("\n")),
  );

  server.registerPrompt(
    "review_findings",
    {
      title: "결과 검토",
      description: "일치 신뢰도와 위험 수준을 나눠 설명합니다.",
      argsSchema: z.object({ auditId: z.string().optional() }),
    },
    ({ auditId }) => message([
      "점검 결과를 설명할 때 일치 신뢰도와 위험 점수를 하나의 확률로 합치지 마세요.",
      "확인되지 않은 작성자, 날짜, 본문은 불확실성으로 남기세요.",
      "critical_review는 위법 확정이 아닙니다.",
      auditId ? `대상 auditId: ${auditId}` : "사용자가 고른 결과를 검토하세요.",
    ].join("\n")),
  );

  server.registerPrompt(
    "prepare_erasure_case",
    {
      title: "지우개 경로 준비",
      description: "작성자, 작성 시기, 식별 정보를 확인한 뒤 정책 도구를 사용합니다.",
      argsSchema: z.object({ url: z.string().optional() }),
    },
    ({ url }) => message([
      "지우개 경로를 말하기 전에 작성자, 작성 당시 나이, 식별 정보 포함, 직접 삭제 가능 여부를 사용자에게 확인하세요.",
      "모르는 값은 unknown으로 두고 지원 가능성을 확정하지 마세요.",
      "check_eraser_eligibility와 create_evidence_checklist를 사용하세요.",
      "만 14세 미만이면 성인용 온라인 신청을 기본 경로로 제시하지 마세요.",
      url ? `대상 주소: ${url}` : "대상 주소는 사용자가 확인한 것만 사용하세요.",
    ].join("\n")),
  );

  server.registerPrompt(
    "draft_platform_report",
    {
      title: "플랫폼 문의 초안",
      description: "자동 제출 없이 검토용 초안을 만듭니다.",
      argsSchema: z.object({ domain: z.string().optional() }),
    },
    ({ domain }) => message([
      "draft_platform_report로 검토용 문안만 만드세요.",
      "확인하지 않은 플랫폼 정책을 인용하지 마세요.",
      "이 초안을 대신 제출하지 마세요.",
      domain ? `도메인: ${domain}` : "도메인은 사용자가 지정한 것만 쓰세요.",
    ].join("\n")),
  );

  server.registerPrompt(
    "summarize_cleanup_progress",
    {
      title: "진행 요약",
      description: "저장된 사건의 다음 단계를 요약합니다.",
      argsSchema: z.object({ caseId: z.string().optional() }),
    },
    ({ caseId }) => message([
      "list_cases 또는 get_case_details로 사용자가 기록한 상태만 완료로 말하세요.",
      "user_submitted는 사용자가 제출했다고 표시한 기록이지 서버 검증이 아닙니다.",
      "저장, 내보내기, 삭제는 각 확인 값이 true일 때만 호출하세요.",
      caseId ? `대상 사건: ${caseId}` : "사건 목록에서 대상을 고르세요.",
    ].join("\n")),
  );
}
