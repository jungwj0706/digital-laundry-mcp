import { ERASER_URLS } from "../policy/eraserPolicy.js";
import { readAudit } from "./auditCache.js";
import type { AuditResult, Finding } from "../domain/types.js";
import { AppError } from "../domain/errors.js";
import { redactSensitive } from "../security/redact.js";

export interface ReportRequest {
  auditId?: string;
  findings?: Finding[];
  format: "markdown" | "json" | "html";
  redactSensitive?: boolean;
}

export interface CleanupReport {
  format: "markdown" | "json" | "html";
  content: string;
  demo: boolean;
}

interface ReportModel {
  scope: string;
  searchedAt: string;
  provider: string;
  mode: string;
  demo: boolean;
  findings: Finding[];
  officialLinks: { label: string; url: string }[];
  notice: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function redactText(value: string, enabled: boolean): string {
  if (!enabled) {
    return value;
  }
  return redactSensitive(value).replace(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[phone]");
}

function redactFinding(finding: Finding, enabled: boolean): Finding {
  return {
    ...finding,
    title: redactText(finding.title, enabled),
    ...(finding.snippet !== undefined ? { snippet: redactText(finding.snippet, enabled) } : {}),
    reasons: finding.reasons.map((reason) => redactText(reason, enabled)),
    unknowns: finding.unknowns.map((item) => redactText(item, enabled)),
    signals: finding.signals.map((signal) => ({
      ...signal,
      description: redactText(signal.description, enabled),
    })),
  };
}

function modelFrom(request: ReportRequest): ReportModel {
  const enabled = request.redactSensitive !== false;
  if (request.auditId) {
    const audit = readAudit(request.auditId);
    if (!audit) {
      throw new AppError(
        "not_found",
        "메모리에 해당 점검이 없습니다. 점검 후 60분이 지났거나 다른 프로세스에서 만든 결과일 수 있습니다.",
        false,
        "run_digital_laundry_audit를 다시 실행하거나 finding 목록을 직접 전달하세요.",
      );
    }
    return toModel(audit, enabled);
  }
  if (!request.findings || request.findings.length === 0) {
    throw new AppError(
      "invalid_input",
      "auditId 또는 finding 목록이 필요합니다.",
      false,
      "점검 식별자나 분석된 finding을 전달하세요.",
    );
  }
  return {
    scope: "사용자가 직접 전달한 finding입니다. 검색 범위는 확인되지 않았습니다.",
    searchedAt: "확인되지 않음",
    provider: "사용자 입력",
    mode: request.findings.some((item) => item.isDemo) ? "demo" : "user_supplied",
    demo: request.findings.some((item) => item.isDemo),
    findings: request.findings.map((item) => redactFinding(item, enabled)),
    officialLinks: officialLinks(),
    notice: "삭제와 신고는 자동으로 제출되지 않습니다.",
  };
}

function toModel(audit: AuditResult, redact: boolean): ReportModel {
  return {
    scope: audit.coverageNotice,
    searchedAt: audit.searchedAt,
    provider: audit.provider,
    mode: audit.mode,
    demo: audit.mode === "demo" || audit.findings.some((item) => item.isDemo),
    findings: audit.findings.map((item) => redactFinding(item, redact)),
    officialLinks: officialLinks(),
    notice: "삭제와 신고는 자동으로 제출되지 않습니다.",
  };
}

function officialLinks(): { label: string; url: string }[] {
  return [
    { label: "지우개 서비스 소개", url: ERASER_URLS.intro },
    { label: "신청 유형", url: ERASER_URLS.requestTypes },
    { label: "14세 미만 안내", url: ERASER_URLS.under14 },
  ];
}

export function createCleanupReport(request: ReportRequest): CleanupReport {
  const model = modelFrom(request);
  const content = request.format === "html"
    ? renderHtml(model)
    : request.format === "json"
      ? JSON.stringify(model, null, 2)
      : renderMarkdown(model);
  return { format: request.format, content, demo: model.demo };
}

function renderMarkdown(model: ReportModel): string {
  const findings = model.findings.map((finding) => [
    `### ${finding.title}`,
    `- 주소: ${finding.url}`,
    `- 스니펫: ${finding.snippet ?? "없음"}`,
    `- 일치 신뢰도: ${finding.matchConfidence}`,
    `- 위험 점수: ${finding.riskScore === null ? "없음" : finding.riskScore} (${finding.riskLevel})`,
    `- 이유: ${finding.reasons.join(" / ") || "없음"}`,
    `- 불확실성: ${finding.unknowns.join(" / ") || "없음"}`,
    `- 권장 경로: ${finding.recommendedNextSteps.join(" / ") || "사용자 검토"}`,
    finding.isDemo ? "- 표시: 시연용 가상 데이터" : "- 표시: 검색 결과",
  ].join("\n")).join("\n\n");
  return [
    "# 디지털 세탁 보고서",
    model.demo ? "시연용 가상 데이터" : "공개 웹 검색 결과",
    "## 조사 범위",
    model.scope,
    "## 검색 시각",
    model.searchedAt,
    "## 제공자",
    model.provider,
    "## 발견 결과",
    findings || "결과 없음",
    "## 공식 링크",
    model.officialLinks.map((link) => `- ${link.label}: ${link.url}`).join("\n"),
    "## 안내",
    model.notice,
  ].join("\n\n");
}

function renderHtml(model: ReportModel): string {
  const findings = model.findings.map((finding) => `<article>
<h3>${escapeHtml(finding.title)}</h3>
<p>주소: ${escapeHtml(finding.url)}</p>
<p>스니펫: ${escapeHtml(finding.snippet ?? "없음")}</p>
<p>일치 신뢰도: ${escapeHtml(finding.matchConfidence)}</p>
<p>위험 점수: ${escapeHtml(finding.riskScore === null ? "없음" : String(finding.riskScore))} (${escapeHtml(finding.riskLevel)})</p>
<p>이유: ${escapeHtml(finding.reasons.join(" / ") || "없음")}</p>
<p>불확실성: ${escapeHtml(finding.unknowns.join(" / ") || "없음")}</p>
<p>권장 경로: ${escapeHtml(finding.recommendedNextSteps.join(" / ") || "사용자 검토")}</p>
<p>${finding.isDemo ? "시연용 가상 데이터" : "검색 결과"}</p>
</article>`).join("\n");
  const links = model.officialLinks.map((link) =>
    `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></li>`).join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>디지털 세탁 보고서</title></head>
<body>
<h1>디지털 세탁 보고서</h1>
<p>${model.demo ? "시연용 가상 데이터" : "공개 웹 검색 결과"}</p>
<h2>조사 범위</h2><p>${escapeHtml(model.scope)}</p>
<h2>검색 시각</h2><p>${escapeHtml(model.searchedAt)}</p>
<h2>제공자</h2><p>${escapeHtml(model.provider)}</p>
<h2>발견 결과</h2>
${findings}
<h2>공식 링크</h2><ul>${links}</ul>
<h2>안내</h2><p>${escapeHtml(model.notice)}</p>
</body></html>`;
}
