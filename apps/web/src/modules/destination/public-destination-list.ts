import type { Database, Prisma } from "@KLTN/db";
import { visibleDestinationWhere } from "./destination-eligibility";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";

import { parsePublicListQuery, publicLocationListSchema, type DestinationSearch, type PublicLocationList } from "./public-destination-query";
export { parsePublicListQuery, publicLocationSchema, type PublicLocation } from "./public-destination-query";
export const publicLocationSelect = { id: true, name: true, area: true, category: true, latitude: true, longitude: true } satisfies Prisma.DestinationSelect;

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
    database.destination.findMany({ where: visibleDestinationWhere, select: { category: true, area: true }, distinct: ["category", "area"] }),
  ]);
  const unique = (values: string[]) => [...new Set(values.filter(value => value.trim()))].sort((a, b) => a.localeCompare(b, "vi"));
  // Corrupt legacy coordinates cannot crash the whole list or reach marker projection.
  return publicLocationListSchema.parse({ filters: { categories: unique(options.map(row => row.category)), regions: unique(options.map(row => row.area)) }, items: rows.map(row => ({
    ...row, latitude: validAxis(row.latitude, 90), longitude: validAxis(row.longitude, 180),
  })) });
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
