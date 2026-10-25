export interface SearchQuery {
  text: string;
}

export interface ProviderSearchHit {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export interface SearchProvider {
  readonly name: string;
  readonly sourceType: "web" | "demo";
  search(query: SearchQuery, count: number): Promise<ProviderSearchHit[]>;
}
