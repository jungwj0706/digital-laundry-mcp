import { normalizeUrl } from "../domain/url.js";
import type { SearchResult } from "../domain/types.js";

function titleKey(title: string): string {
  return title.toLowerCase().replace(/시연용 가상 데이터/g, "").replace(/\s+/g, " ").trim();
}

export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: SearchResult[] = [];
  for (const result of results) {
    let canonical: string;
    try {
      canonical = normalizeUrl(result.url);
    } catch {
      continue;
    }
    const grouped = `${result.domain}|${titleKey(result.title)}`;
    if (seenUrls.has(canonical) || seenTitles.has(grouped)) {
      continue;
    }
    seenUrls.add(canonical);
    seenTitles.add(grouped);
    unique.push({ ...result, url: canonical });
  }
  return unique;
}
