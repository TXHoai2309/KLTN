import type { Database, Prisma } from "@KLTN/db";
import { visibleDestinationWhere } from "./destination-eligibility";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { destinationMediaWhere, isDestinationMediaUsable } from "./destination-media-eligibility";
import { cleanAreaDisplayLabel } from "@/lib/traveler-display-clean";
import { isDestinationOpenToday, resolveExploreDisplayArea } from "./explore-filter-sort";

import { parsePublicListQuery, publicLocationListSchema, type DestinationSearch, type PublicLocationList } from "./public-destination-query";
export { parsePublicListQuery, publicLocationSchema, type PublicLocation } from "./public-destination-query";
export const publicLocationSelect = { id: true, name: true, area: true, category: true, latitude: true, longitude: true,
  address: true,
  openingDays: { select: { dayOfWeek: true, status: true } },
  _count: { select: { favorites: true } },
  media: { where: destinationMediaWhere, take: 20, orderBy: [{ isCover: "desc" }, { position: "asc" }, { id: "asc" }], select: { url: true, alt: true, websiteRights: true, storageReference: true } },
} satisfies Prisma.DestinationSelect;

export async function listPublicLocations(input: DestinationSearch, database: Pick<Database, "destination">): Promise<PublicLocationList> {
  // Validate direct service callers as well as HTTP input; visibility is never caller-controlled.
  const search = parsePublicListQuery(new URLSearchParams(input));
  const keyword = search.q?.replace(/[\\%_]/g, character => `\\${character}`);
  const where: Prisma.DestinationWhereInput = {
    ...visibleDestinationWhere,
    ...(search.category ? { category: search.category } : {}),
    ...(search.region ? { area: search.region } : {}),
    ...(search.q ? { OR: [
      { name: { contains: keyword, mode: "insensitive" } },
      { description: { contains: keyword, mode: "insensitive" } },
    ] } : {}),
  };
  const [rows, options] = await Promise.all([
    database.destination.findMany({ where, select: publicLocationSelect, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    search.q || search.category || search.region
      ? database.destination.findMany({ where: visibleDestinationWhere, select: { category: true, area: true }, distinct: ["category", "area"] })
      : Promise.resolve(null),
  ]);
  // The unfiltered query returns the complete public dataset, so it already
  // contains every filter option. Filtered searches still need global options.
  const filterRows = options ?? rows;
  const unique = (values: string[]) => [...new Set(values.filter(value => value.trim()))].sort((a, b) => a.localeCompare(b, "vi"));
  const realRegions = unique(filterRows.map(row => row.area).filter(area => cleanAreaDisplayLabel(area) !== null));
  // Corrupt legacy coordinates cannot crash the whole list or reach marker projection.
  return publicLocationListSchema.parse({ filters: { categories: unique(filterRows.map(row => row.category)), regions: realRegions }, items: projectPublicLocationRows(rows) });
}
/** Explicit public allowlist shared with Home, even when its select has prose. */
export function projectPublicLocationRows(rows: readonly Prisma.DestinationGetPayload<{ select: typeof publicLocationSelect }>[]) {
  return rows.map(({ id, name, area, category, latitude, longitude, address, openingDays, _count, media }) => {
    const safeLat = validAxis(latitude, 90);
    const safeLng = validAxis(longitude, 180);
    const explicitArea = cleanAreaDisplayLabel(area);
    const inferredArea = !explicitArea && address !== undefined
      ? resolveExploreDisplayArea({ area, address, latitude: safeLat, longitude: safeLng })
      : null;
    return {
      id, name, area, category, latitude: safeLat, longitude: safeLng,
      ...(media ? { image: (() => { const image = media.find(m => isDestinationMediaUsable(m, id)); return image ? { url: image.url, alt: image.alt } : null; })() } : {}),
      ...(inferredArea ? { inferredArea } : {}),
      ...(openingDays !== undefined ? { openToday: isDestinationOpenToday(openingDays) } : {}),
      ...(_count !== undefined && typeof _count?.favorites === "number" ? { favoriteCount: _count.favorites } : {}),
    };
  });
}
function validAxis(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}
export async function publicLocationResponse(request: Request, database: Pick<Database, "destination">) {
  let response: Response;
  try { response = apiSuccess(await listPublicLocations(parsePublicListQuery(new URL(request.url).searchParams), database)); }
  catch (error) { response = handleApiError(error); }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
