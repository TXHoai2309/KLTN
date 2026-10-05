import type { Database, Prisma } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { cultureInputSchema, cultureIdSchema, cultureDtoSchema, cultureListSchema, cultureVisibilityInputSchema, destinationLookupSchema } from "./culture-contract";

export type CultureDependencies = AuthorizationDependencies & { database: Database };
export const cultureSelect = {
  id: true, title: true, content: true, sourceTitle: true, sourceUrl: true, visibility: true, createdAt: true, updatedAt: true,
  destinations: { select: { destination: { select: { id: true, name: true } } }, orderBy: { destinationId: "asc" } },
} satisfies Prisma.CultureContentSelect;
type Row = Prisma.CultureContentGetPayload<{ select: typeof cultureSelect }>;
export function toCultureDto(row: Row) {
  const destinations = row.destinations.map(link => link.destination);
  return cultureDtoSchema.parse({ id: row.id, title: row.title, content: row.content, sourceTitle: row.sourceTitle, sourceUrl: row.sourceUrl, visibility: row.visibility, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), destinationIds: destinations.map(d => d.id), destinations });
}
export function validateCultureId(id: string) {
  if (!cultureIdSchema.safeParse(id).success) throw new AppError("CULTURE_NOT_FOUND", "Không tìm thấy nội dung văn hóa.", 404);
  return id;
}
export function parseCultureInput(body: unknown) {
  const parsed = cultureInputSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_CULTURE_INPUT", "Dữ liệu văn hóa không hợp lệ.", 400, parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })));
  return parsed.data;
}
export async function listCulture(headers: Headers, page: number, deps: CultureDependencies) {
  await requireActor(headers, deps, "admin");
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError("INVALID_CULTURE_QUERY", "Trang không hợp lệ.", 400);
  const rows = await deps.database.cultureContent.findMany({ skip: (page - 1) * 25, take: 26, orderBy: [{ title: "asc" }, { id: "asc" }], select: { id: true, title: true, sourceTitle: true, sourceUrl: true, visibility: true, updatedAt: true, destinations: cultureSelect.destinations } });
  return cultureListSchema.parse({ items: rows.slice(0, 25).map(row => ({ id: row.id, title: row.title, sourceTitle: row.sourceTitle, sourceUrl: row.sourceUrl, visibility: row.visibility, updatedAt: row.updatedAt.toISOString(), destinations: row.destinations.map(link => link.destination) })), page, hasMore: rows.length > 25 });
}
export async function readCulture(id: string, database: Pick<Database, "cultureContent">) {
  const row = await database.cultureContent.findUnique({ where: { id: validateCultureId(id) }, select: cultureSelect });
  if (!row) throw new AppError("CULTURE_NOT_FOUND", "Không tìm thấy nội dung văn hóa.", 404);
  return toCultureDto(row);
}
export async function getCulture(headers: Headers, id: string, deps: CultureDependencies) { await requireActor(headers, deps, "admin"); return readCulture(id, deps.database); }
export async function lookupCultureDestinations(headers: Headers, query: string, page: number, deps: CultureDependencies) {
  await requireActor(headers, deps, "admin");
  if (query.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError("INVALID_CULTURE_QUERY", "Tham số không hợp lệ.", 400);
  const rows = await deps.database.destination.findMany({ where: { name: { contains: query.normalize("NFC").trim(), mode: "insensitive" } }, skip: (page - 1) * 25, take: 26, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
  return destinationLookupSchema.parse({ items: rows.slice(0, 25), hasMore: rows.length > 25 });
}
export async function writeCulture(headers: Headers, body: unknown, key: string, id: string | null, deps: CultureDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  if (id !== null) validateCultureId(id);
  const input = parseCultureInput(body);
  return executeIdempotentWrite({ database: deps.database, actorId: actor.id, operation: id === null ? "culture:create" : "culture:update", key, input: { id, ...input }, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    if (id !== null && !await tx.cultureContent.findUnique({ where: { id }, select: { id: true } })) throw new AppError("CULTURE_NOT_FOUND", "Không tìm thấy nội dung văn hóa.", 404);
    const { destinationIds, ...fields } = input;
    const existing = await tx.destination.findMany({ where: { id: { in: destinationIds } }, select: { id: true } });
    if (existing.length !== destinationIds.length) throw new AppError("INVALID_CULTURE_DESTINATIONS", "Có điểm đến không còn tồn tại. Hãy kiểm tra lại liên kết.", 400);
    const links = destinationIds.map(destinationId => ({ destinationId }));
    if (id === null) return toCultureDto(await tx.cultureContent.create({ data: { ...fields, visibility: "HIDDEN", destinations: { create: links } }, select: cultureSelect }));
    return toCultureDto(await tx.cultureContent.update({ where: { id }, data: { ...fields, destinations: { deleteMany: {}, create: links } }, select: cultureSelect }));
  } });
}
export async function setCultureVisibility(headers: Headers, id: string, body: unknown, key: string, deps: CultureDependencies) {
  const actor = await requireActor(headers, deps, "admin"); validateCultureId(id);
  const parsed = cultureVisibilityInputSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_CULTURE_VISIBILITY", "Trạng thái hiển thị không hợp lệ.", 400);
  return executeIdempotentWrite({ database: deps.database, actorId: actor.id, operation: "culture:set-visibility", key, input: { id, ...parsed.data }, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    const row = await tx.cultureContent.findUnique({ where: { id }, select: cultureSelect });
    if (!row) throw new AppError("CULTURE_NOT_FOUND", "Không tìm thấy nội dung văn hóa.", 404);
    if (row.visibility === parsed.data.visibility) return toCultureDto(row);
    return toCultureDto(await tx.cultureContent.update({ where: { id }, data: { visibility: parsed.data.visibility }, select: cultureSelect }));
  } });
}
