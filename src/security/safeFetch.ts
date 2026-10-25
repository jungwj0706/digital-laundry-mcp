import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { AppError } from "../domain/errors.js";

const USER_AGENT = "DigitalLaundry/1.0";
const ALLOWED_PAGE_TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain"]);
const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
]);

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  lookup?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export interface SafePage {
  url: string;
  contentType: string;
  title: string;
  excerpt: string;
  untrusted: true;
}

interface RobotsRule {
  allow: boolean;
  path: string;
}

function ipv4Parts(ip: string): number[] | undefined {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return numbers;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip);
  if (!parts) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().split("%")[0] ?? ip;
  if (lower.includes("%")) {
    return true;
  }
  if (lower === "::" || lower === "::1") {
    return true;
  }
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    return isBlockedIpv4(mapped[1]);
  }
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  if (lower.startsWith("ff") || lower === "fd00:ec2::254") {
    return true;
  }
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    return isBlockedIpv4(ip);
  }
  if (kind === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host.endsWith(".internal") || host.includes("%")) {
    return true;
  }
  return false;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function unsafe(message = "허용되지 않는 주소입니다."): AppError {
  return new AppError(
    "unsafe_url",
    message,
    false,
    "공개 인터넷의 http 또는 https 주소만 사용할 수 있습니다.",
  );
}

async function assertPublicUrl(
  target: URL,
  lookup: (hostname: string) => Promise<string[]>,
): Promise<void> {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw unsafe("http와 https 주소만 가져올 수 있습니다.");
  }
  if (target.username || target.password) {
    throw unsafe("사용자 정보가 포함된 URL은 허용하지 않습니다.");
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isBlockedHostname(hostname)) {
    throw unsafe();
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw unsafe();
    }
    return;
  }
  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw unsafe("주소의 목적지를 확인하지 못했습니다.");
  }
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
    throw unsafe();
  }
}

function mediaType(header: string | null): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
  sizeCode: "content_type_not_supported" | "image_too_large" = "content_type_not_supported",
): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError(sizeCode, "응답이 허용된 크기를 초과했습니다.", false, "더 작은 파일만 처리할 수 있습니다.");
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError(sizeCode, "응답이 허용된 크기를 초과했습니다.", false, "더 작은 파일만 처리할 수 있습니다.");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const bytes = await readLimitedBytes(response, maxBytes);
  return bytes.toString("utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern === "") {
    return false;
  }
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const expression = `^${core.split("*").map(escapeRegExp).join(".*")}${anchored ? "$" : ""}`;
  return new RegExp(expression).test(pathname);
}

function parseRobots(text: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let startedRules = false;
  const flush = (): void => {
    if (agents.length > 0 || rules.length > 0) {
      groups.push({ agents, rules });
    }
    agents = [];
    rules = [];
    startedRules = false;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      flush();
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (startedRules) {
        flush();
      }
      agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      startedRules = true;
      rules.push({ allow: field === "allow", path: value });
    }
  }
  flush();
  const specific = groups.filter((group) => group.agents.includes(USER_AGENT.toLowerCase()));
  const chosen = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));
  return chosen.flatMap((group) => group.rules);
}

function robotsAllow(rules: RobotsRule[], pathname: string): boolean {
  let winner: { length: number; allow: boolean } | undefined;
  for (const rule of rules) {
    if (!pathMatches(rule.path, pathname)) {
      continue;
    }
    const length = rule.path.length;
    if (!winner || length > winner.length || (length === winner.length && rule.allow)) {
      winner = { length, allow: rule.allow };
    }
  }
  return winner?.allow ?? true;
}

async function fetchOnce(
  target: URL,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  accept: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept,
        "user-agent": USER_AGENT,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(
        "provider_timeout",
        "페이지 요청 시간이 초과되었습니다.",
        true,
        "잠시 후 다시 시도하세요.",
      );
    }
    throw new AppError(
      "provider_error",
      "페이지를 가져오지 못했습니다.",
      true,
      "주소가 공개되어 있는지 확인한 뒤 다시 시도하세요.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchChecked(
  start: URL,
  options: Required<Pick<SafeFetchOptions, "timeoutMs" | "maxBytes">> & {
    lookup: (hostname: string) => Promise<string[]>;
    fetchImpl: typeof fetch;
  },
  accept: string,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = start;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(current, options.lookup);
    const response = await fetchOnce(current, options.timeoutMs, options.fetchImpl, accept);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) {
        throw unsafe("리다이렉트 한도를 초과했습니다.");
      }
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw unsafe("리다이렉트 한도를 초과했습니다.");
}

async function robotsPermits(
  pageUrl: URL,
  options: SafeFetchOptions & {
    lookup: (hostname: string) => Promise<string[]>;
    fetchImpl: typeof fetch;
  },
): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", pageUrl.origin);
  try {
    const { response } = await fetchChecked(
      robotsUrl,
      {
        timeoutMs: options.timeoutMs,
        maxBytes: Math.min(options.maxBytes, 512_000),
        lookup: options.lookup,
        fetchImpl: options.fetchImpl,
      },
      "text/plain",
    );
    if (response.status === 404) {
      return true;
    }
    if (!response.ok) {
      return true;
    }
    const body = await readLimited(response, Math.min(options.maxBytes, 512_000));
    return robotsAllow(parseRobots(body), pageUrl.pathname);
  } catch (error) {
    if (error instanceof AppError && error.errorCode === "unsafe_url") {
      throw error;
    }
    return true;
  }
}

function extractPage(html: string, contentType: string): { title: string; excerpt: string } {
  if (contentType === "text/plain") {
    return { title: "", excerpt: html.replace(/\s+/g, " ").trim().slice(0, 1500) };
  }
  const document = cheerio.load(html);
  document("script, style, noscript, iframe, object, embed").remove();
  const title = document("title").first().text().replace(/\s+/g, " ").trim().slice(0, 200);
  const excerpt = document("body").text().replace(/\s+/g, " ").trim().slice(0, 1500);
  return { title, excerpt };
}

export async function safeFetch(input: string, options: SafeFetchOptions): Promise<SafePage> {
  let current: URL;
  try {
    current = new URL(input);
  } catch {
    throw unsafe("URL 형식이 올바르지 않습니다.");
  }
  const lookup = options.lookup ?? defaultLookup;
  const fetchImpl = options.fetchImpl ?? fetch;

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(current, lookup);
    if (!(await robotsPermits(current, { ...options, lookup, fetchImpl }))) {
      throw unsafe("robots.txt가 이 경로의 수집을 허용하지 않습니다.");
    }
    const response = await fetchOnce(
      current,
      options.timeoutMs,
      fetchImpl,
      "text/html,application/xhtml+xml,text/plain",
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) {
        throw unsafe("리다이렉트 한도를 초과했습니다.");
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new AppError(
        "provider_error",
        "페이지를 가져오지 못했습니다.",
        response.status >= 500,
        "주소가 공개되어 있는지 확인한 뒤 다시 시도하세요.",
      );
    }
    const contentType = mediaType(response.headers.get("content-type"));
    if (!ALLOWED_PAGE_TYPES.has(contentType)) {
      throw new AppError(
        "content_type_not_supported",
        "지원하지 않는 콘텐츠 형식입니다.",
        false,
        "html 또는 텍스트 페이지만 분석할 수 있습니다.",
      );
    }
    const body = await readLimited(response, options.maxBytes);
    const extracted = extractPage(body, contentType);
    return {
      url: current.toString(),
      contentType,
      title: extracted.title,
      excerpt: extracted.excerpt,
      untrusted: true,
    };
  }
  throw unsafe("리다이렉트 한도를 초과했습니다.");
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function safeReadBytes(
  input: string,
  options: SafeFetchOptions,
): Promise<{ bytes: Buffer; contentType: string; url: string }> {
  let current: URL;
  try {
    current = new URL(input);
  } catch {
    throw unsafe("URL 형식이 올바르지 않습니다.");
  }
  const lookup = options.lookup ?? defaultLookup;
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(current, lookup);
    const response = await fetchOnce(current, options.timeoutMs, fetchImpl, "image/jpeg,image/png,image/webp");
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) {
        throw unsafe("리다이렉트 한도를 초과했습니다.");
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new AppError(
        "provider_error",
        "이미지를 가져오지 못했습니다.",
        response.status >= 500,
        "공개 이미지 주소인지 확인하세요.",
      );
    }
    const contentType = mediaType(response.headers.get("content-type"));
    if (!IMAGE_TYPES.has(contentType)) {
      throw new AppError(
        "invalid_image",
        "JPEG, PNG, WebP 이미지만 사용할 수 있습니다.",
        false,
        "이미지 파일 형식을 확인하세요.",
      );
    }
    const bytes = await readLimitedBytes(response, options.maxBytes, "image_too_large");
    return { bytes, contentType, url: current.toString() };
  }
  throw unsafe("리다이렉트 한도를 초과했습니다.");
}
