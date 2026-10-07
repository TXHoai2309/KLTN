import { z } from "zod";
import type { Database, Prisma } from "@KLTN/db";
import { visibleCultureWhere, publicCultureSelect } from "./culture-eligibility";
import { publicCultureSummarySchema, cultureDestinationSchema, sourceUrlSchema } from "./culture-contract";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { AppError } from "@/server/http/app-error";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";

export const publicCultureListSelect = {
  ...publicCultureSelect,
  destinations: { where: { destination: visibleDestinationWhere }, take: 20,
    orderBy: { destinationId: "asc" }, select: { destination: { select: { id: true, name: true } } } },
} satisfies Prisma.CultureContentSelect;
export const publicCultureCardSchema = publicCultureSummarySchema.extend({ relatedDestinations: z.array(cultureDestinationSchema).max(20) }).strict();
export const publicCulturePageSchema = z.object({ items: z.array(publicCultureCardSchema).max(25), page: z.number().int().min(1).max(10000), hasMore: z.boolean() }).strict();
export type PublicCulturePage = z.infer<typeof publicCulturePageSchema>;

/** NFC and complete graphemes, bounded to the existing 280 UTF-16 contract. */
export function cultureExcerpt(content: string) {
  const text = content.normalize("NFC").replace(/\s+/gu, " ").trim();
  let excerpt = "";
  for (const { segment } of new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(text)) {
    if (excerpt.length + segment.length > 280) break;
    excerpt += segment;
  }
  return excerpt;
}
export function parsePublicCultureQuery(params: URLSearchParams) {
  const raw = params.get("page") ?? "1";
  if ([...params.keys()].some(key => key !== "page") || params.getAll("page").length > 1 || !/^[1-9]\d{0,4}$/.test(raw) || Number(raw) > 10000) {
    throw new AppError("INVALID_CULTURE_QUERY", "Tham số nội dung văn hóa không hợp lệ.", 400);
  }
  return Number(raw);
}
export async function listPublicCulture(page: number, database: Pick<Database, "cultureContent">): Promise<PublicCulturePage> {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new AppError("INVALID_CULTURE_QUERY", "Trang không hợp lệ.", 400);
  const rows = await database.cultureContent.findMany({ where: visibleCultureWhere, select: publicCultureListSelect,
    orderBy: [{ title: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 26 });
  return publicCulturePageSchema.parse({ page, hasMore: rows.length > 25, items: rows.slice(0, 25).map(row => ({
    id: row.id, title: row.title, excerpt: cultureExcerpt(row.content), sourceTitle: row.sourceTitle,
    // Legacy malformed URLs cannot become executable public links.
    sourceUrl: sourceUrlSchema.safeParse(row.sourceUrl).success ? row.sourceUrl : null,
    relatedDestinations: row.destinations.map(link => link.destination),
  })) });
}
export async function publicCultureResponse(request: Request, database: Pick<Database, "cultureContent">) {
  let response: Response;
  try { response = apiSuccess(await listPublicCulture(parsePublicCultureQuery(new URL(request.url).searchParams), database)); }
  catch (error) { response = handleApiError(error); }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
