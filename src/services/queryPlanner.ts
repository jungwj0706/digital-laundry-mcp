import { AppError } from "../domain/errors.js";
import { assertHostname } from "../domain/url.js";

export interface QueryPlanInput {
  aliases: string[];
  keywords?: string[];
  domains?: string[];
  includeEmailSearch?: boolean;
  emailAddresses?: string[];
  maxQueries: number;
}

export interface QueryPlan {
  queries: string[];
  truncated: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function aliasVariants(alias: string): string[] {
  const trimmed = alias.trim().replace(/\s+/g, " ");
  const variants = [trimmed];
  if (trimmed.includes(" ")) {
    variants.push(trimmed.replace(/ /g, ""));
  }
  if (trimmed.includes("-")) {
    variants.push(trimmed.replace(/-/g, " ").replace(/\s+/g, " "));
  }
  return [...new Set(variants.filter((value) => value.length > 0))].slice(0, 3);
}

export function planQueries(input: QueryPlanInput): QueryPlan {
  if (input.aliases.length === 0) {
    throw new AppError(
      "invalid_input",
      "검색할 별칭을 하나 이상 입력하세요.",
      false,
      "과거 닉네임이나 계정명을 1개에서 10개까지 입력하세요.",
    );
  }
  const domains = (input.domains ?? []).map((domain) => assertHostname(domain));
  const keywords = (input.keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
  const emails =
    input.includeEmailSearch === true
      ? (input.emailAddresses ?? []).map((email) => email.trim()).filter((email) => EMAIL_PATTERN.test(email)).slice(0, 3)
      : [];

  const queries: string[] = [];
  const push = (query: string): void => {
    if (queries.length >= input.maxQueries || queries.includes(query)) {
      return;
    }
    queries.push(query);
  };

  for (const alias of input.aliases) {
    for (const variant of aliasVariants(alias)) {
      push(variant);
      for (const keyword of keywords) {
        push(`${variant} ${keyword}`);
      }
      for (const domain of domains) {
        push(`${variant} site:${domain}`);
      }
    }
  }
  for (const email of emails) {
    push(email);
  }

  const possible =
    input.aliases.reduce((count, alias) => count + aliasVariants(alias).length, 0) *
      (1 + keywords.length + domains.length) +
    emails.length;
  return { queries, truncated: possible > queries.length };
}

export function applyDomains(
  queries: string[],
  domains: string[] | undefined,
  maxQueries: number,
): string[] {
  const hosts = (domains ?? []).map((domain) => assertHostname(domain));
  if (hosts.length === 0) {
    return queries.slice(0, maxQueries);
  }
  const combined: string[] = [];
  for (const query of queries) {
    for (const host of hosts) {
      if (combined.length >= maxQueries) {
        return combined;
      }
      combined.push(`${query} site:${host}`);
    }
  }
  return combined;
}
