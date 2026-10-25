import { AppError } from "./errors.js";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "msclkid",
  "twclid",
  "yclid",
  "_ga",
  "si",
]);

const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

export function assertHostname(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    host.length === 0 ||
    host.includes("://") ||
    host.includes("/") ||
    host.includes(":") ||
    host.includes("@") ||
    host.includes(" ")
  ) {
    throw new AppError(
      "invalid_input",
      "도메인은 호스트 이름만 입력할 수 있습니다.",
      false,
      "예: example.test 처럼 경로와 포트를 뺀 호스트만 입력하세요.",
    );
  }
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) {
    throw new AppError(
      "invalid_input",
      "도메인 형식이 올바르지 않습니다.",
      false,
      "영문, 숫자, 하이픈으로 된 호스트 이름을 입력하세요.",
    );
  }
  return host;
}

export function normalizeUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new AppError(
      "unsafe_url",
      "URL 형식이 올바르지 않습니다.",
      false,
      "http 또는 https로 시작하는 공개 주소만 사용할 수 있습니다.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      "unsafe_url",
      "http와 https 주소만 사용할 수 있습니다.",
      false,
      "다른 프로토콜 주소는 제거하고 공개 웹 주소만 남기세요.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new AppError(
      "unsafe_url",
      "사용자 정보가 포함된 URL은 허용하지 않습니다.",
      false,
      "아이디와 비밀번호가 없는 주소로 다시 입력하세요.",
    );
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  const kept = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([left], [right]) => left.localeCompare(right));
  parsed.search = "";
  for (const [name, value] of kept) {
    parsed.searchParams.append(name, value);
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}
