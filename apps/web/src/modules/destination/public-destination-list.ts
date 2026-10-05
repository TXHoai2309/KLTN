import { z } from "zod";
import type { Database, Prisma } from "@KLTN/db";
import { visibleDestinationWhere } from "./destination-eligibility";
import { AppError } from "@/server/http/app-error";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";

export const publicLocationSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), name: z.string().min(1), area: z.string(), category: z.string(),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
}).strict();
export type PublicLocation = z.infer<typeof publicLocationSchema>;
export const publicLocationPageSchema = z.object({ items: z.array(publicLocationSchema).max(25), page: z.number().int().positive(), hasMore: z.boolean() }).strict();
export type PublicLocationPage = z.infer<typeof publicLocationPageSchema>;
export const publicLocationSelect = { id: true, name: true, area: true, category: true, latitude: true, longitude: true } satisfies Prisma.DestinationSelect;

/** Minimum unfiltered Explore boundary. US-11 will own search/filter semantics. */
export function parsePublicListQuery(params: URLSearchParams) {
  if ([...params.keys()].some(key => key !== "page" && key !== "view") || params.getAll("page").length > 1 || params.getAll("view").length > 1) {
    throw new AppError("INVALID_EXPLORE_QUERY", "Tìm kiếm và bộ lọc chưa khả dụng trong phiên bản này.", 400);
  }
  const raw = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,4}$/.test(raw) || Number(raw) > 10000 || (params.has("view") && !["list", "map"].includes(params.get("view")!))) {
    throw new AppError("INVALID_EXPLORE_QUERY", "Tham số khám phá không hợp lệ.", 400);
  }
  return Number(raw);
}

export async function listPublicLocations(page: number, database: Pick<Database, "destination">): Promise<PublicLocationPage> {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new AppError("INVALID_EXPLORE_QUERY", "Trang không hợp lệ.", 400);
  const rows = await database.destination.findMany({ where: visibleDestinationWhere, select: publicLocationSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 26 });
  // Corrupt legacy coordinates cannot crash the whole list or reach marker projection.
  return publicLocationPageSchema.parse({ page, hasMore: rows.length > 25, items: rows.slice(0, 25).map(row => ({
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
