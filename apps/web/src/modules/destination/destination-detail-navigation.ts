import { parsePublicListQuery } from "./public-destination-query";

const exploreOrigin = "http://kltn.invalid";
const returnKeys = new Set(["q", "category", "region", "view", "culturePage"]);

/** Only relative Explore URLs with query parameters understood by the public Explore page. */
export type ExploreReturnHref = `/explore${string}`;

export function resolveExploreReturnTo(value: unknown): ExploreReturnHref {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/explore") || value.startsWith("//")) return "/explore";

  try {
    const target = new URL(value, exploreOrigin);
    if (target.origin !== exploreOrigin || target.pathname !== "/explore" || target.hash || target.username || target.password) return "/explore";

    const params = target.searchParams;
    if ([...params.keys()].some(key => !returnKeys.has(key))) return "/explore";

    const exploreParams = new URLSearchParams();
    for (const key of ["q", "category", "region", "view"] as const) {
      for (const item of params.getAll(key)) exploreParams.append(key, item);
    }
    parsePublicListQuery(exploreParams);

    const culturePages = params.getAll("culturePage");
    if (culturePages.length > 1 || culturePages.some(page => !/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10000)) return "/explore";

    // Retain the original safe query encoding/order so users return to the same URL they left.
    return `/explore${target.search}` as ExploreReturnHref;
  } catch {
    return "/explore";
  }
}

export function buildExploreReturnTo(params: URLSearchParams): ExploreReturnHref {
  const query = params.toString();
  return resolveExploreReturnTo(query ? `/explore?${query}` : "/explore");
}
