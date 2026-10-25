import type { ProviderSearchHit, SearchProvider, SearchQuery } from "../interfaces.js";

const DEMO_PAGES = [
  {
    path: "/posts/club",
    label: "동아리 게시글",
    snippet: "가상 별칭이 보이는 시연용 문장입니다. 실제 인물의 글이 아닙니다.",
  },
  {
    path: "/posts/club?utm_source=demo&fbclid=demo",
    label: "동아리 게시글",
    snippet: "같은 시연용 글의 추적 주소입니다.",
  },
  {
    path: "/posts/note",
    label: "학급 게시판",
    snippet: "가상 연락처 010-0000-0000 이 포함된 시연용 문장입니다.",
  },
] as const;

export class DemoSearchProvider implements SearchProvider {
  readonly name = "demo";
  readonly sourceType = "demo" as const;

  search(query: SearchQuery, count: number): Promise<ProviderSearchHit[]> {
    const alias = query.text.replace(/site:\S+/g, "").replace(/"/g, "").trim() || "가상별칭";
    const hits = DEMO_PAGES.slice(0, Math.max(1, count)).map((page) => ({
      title: `${alias} ${page.label} 시연용 가상 데이터`,
      url: `https://example.test${page.path}`,
      snippet: page.snippet,
    }));
    return Promise.resolve(hits);
  }
}
