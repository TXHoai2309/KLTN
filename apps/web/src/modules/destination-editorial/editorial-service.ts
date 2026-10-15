import { createHash } from "node:crypto";
import type { Database, Prisma } from "@KLTN/db";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { destinationSelect, toDestinationDto, validateDestinationId, type DestinationDependencies } from "../destination/destination-service";
import { editorialActionSchema, editorialLayoutSchema, editorialStateSchema, type EditorialContext, type EditorialState } from "./editorial-contract";
import { resolveEditorial, validateLayoutReferences } from "./editorial-engine";
export function editorialMigrationMissing(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2021"); }
export function editorialAiConfigured() { return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_EDITORIAL_MODEL?.trim()); }
export async function readEditorialContext(id: string, database: Pick<Database, "destination">): Promise<EditorialContext> {
  const row = await database.destination.findUnique({ where: { id: validateDestinationId(id) }, select: destinationSelect });
  if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
  const dto = toDestinationDto(row);
  return { id, name: row.name, description: row.description, category: row.category, area: row.area, latitude: row.latitude, longitude: row.longitude,
    suggestedDurationMinutes: row.suggestedDurationMinutes, openingDays: dto.openingDays,
    media: row.media.map(({ id, url, alt, caption, author, sourceUrl, isCover, websiteRights, storageReference }) => ({ id, url, alt, caption, author, sourceUrl, isCover, websiteRights, storageReference })),
    sources: row.sources.map(({ id, title, url, websiteRights }) => ({ id, title, url, websiteRights })),
  };
}
const fingerprint = (context: EditorialContext) => createHash("sha256").update(JSON.stringify(context)).digest("hex");
function state(context: EditorialContext, row: Prisma.DestinationEditorialGetPayload<object> | null, available = true): EditorialState {
  const layout = (data: unknown) => editorialLayoutSchema.safeParse(data).success ? editorialLayoutSchema.parse(data) : null;
  return editorialStateSchema.parse({ available, reason: available ? null : "Cần owner áp dụng migration Destination Editorial trên môi trường đã duyệt.", context,
    draft: layout(row?.draft), published: layout(row?.published), previousPublished: layout(row?.previousPublished), draftRevision: row?.draftRevision ?? 0,
    publishedRevision: row?.publishedRevision ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null, publishedAt: row?.publishedAt?.toISOString() ?? null,
    contentChanged: Boolean(row?.contentFingerprint && row.contentFingerprint !== fingerprint(context)), aiConfigured: editorialAiConfigured(),
  });
}
export async function getEditorial(headers: Headers, id: string, deps: DestinationDependencies) {
  await requireActor(headers, deps, "admin");
  const context = await readEditorialContext(id, deps.database);
  try { return state(context, await deps.database.destinationEditorial.findUnique({ where: { destinationId: id } })); }
  catch (error) { if (editorialMigrationMissing(error)) return state(context, null, false); throw new AppError("EDITORIAL_UNAVAILABLE", "Không thể đọc bản biên tập. Thử lại sau.", 503); }
}
export async function writeEditorial(headers: Headers, body: unknown, key: string, id: string, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin"); validateDestinationId(id);
  const parsed = editorialActionSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_EDITORIAL", "Kiểm tra bố cục và xác nhận kiểm duyệt.", 400, parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })));
  const input = parsed.data;
  return executeIdempotentWrite({ database: deps.database, actorId: actor.id, operation: `destination:editorial:${input.action.toLowerCase()}`, key, input: { id, ...input }, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`destination-editorial:${id}`}, 0))`;
    const context = await readEditorialContext(id, tx as unknown as Database);
    let previous;
    try { previous = await tx.destinationEditorial.findUnique({ where: { destinationId: id } }); }
    catch (error) { if (editorialMigrationMissing(error)) throw new AppError("EDITORIAL_MIGRATION_REQUIRED", "Cần owner áp dụng migration Editorial; Destination hiện tại không thay đổi.", 503); throw error; }
    if ((previous?.draftRevision ?? 0) !== input.expectedRevision) throw new AppError("EDITORIAL_CHANGED", "Bản biên tập đã thay đổi ở nơi khác. Đọc lại và đối chiếu trước khi lưu.", 409);
    const data: Prisma.DestinationEditorialUncheckedCreateInput = { destinationId: id, updatedBy: actor.id, draftRevision: input.expectedRevision + 1, contentFingerprint: fingerprint(context) };
    if (input.action === "SAVE") {
      try { validateLayoutReferences(input.layout, context, false); } catch (e) { throw new AppError("INVALID_EDITORIAL_REFERENCES", (e as Error).message, 400); }
      data.draft = input.layout as unknown as Prisma.InputJsonValue;
    } else if (input.action === "RESTORE_DRAFT") {
      if (!previous?.published) throw new AppError("EDITORIAL_NOT_PUBLISHED", "Chưa có bố cục đã xuất bản để khôi phục.", 409);
      data.draft = previous.published;
    } else {
      const candidate = input.action === "ROLLBACK" ? previous?.previousPublished : previous?.draft;
      const layout = editorialLayoutSchema.safeParse(candidate);
      if (!layout.success) throw new AppError("EDITORIAL_NO_VERSION", "Chưa có phiên bản hợp lệ để xuất bản/khôi phục.", 409);
      try { validateLayoutReferences(layout.data, context, true); } catch (e) { throw new AppError("EDITORIAL_NOT_REVIEWED", (e as Error).message, 400); }
      if (!resolveEditorial(layout.data, context)) throw new AppError("EDITORIAL_EMPTY", "Bố cục không có nội dung hợp lệ.", 400);
      data.published = layout.data as unknown as Prisma.InputJsonValue;
      if (previous?.published) data.previousPublished = previous.published;
      data.publishedRevision = (previous?.publishedRevision ?? 0) + 1;
      data.publishedAt = new Date(); data.publishedBy = actor.id;
    }
    const { destinationId: _id, ...changes } = data;
    const saved = previous ? await tx.destinationEditorial.update({ where: { destinationId: id, draftRevision: input.expectedRevision }, data: changes }) : await tx.destinationEditorial.create({ data });
    return state(context, saved);
  }});
}
/** Called only after the canonical public Destination read. No draft/provenance/AI query. */
export async function readPublicEditorial(id: string, database: Database) {
  try {
    const visible = await database.destination.findUnique({ where: { id, visibility: "VISIBLE" }, select: { id: true } });
    if (!visible) return null;
    const row = await database.destinationEditorial.findUnique({ where: { destinationId: id }, select: { published: true } });
    const parsed = editorialLayoutSchema.safeParse(row?.published);
    if (!parsed.success) return null;
    // Recheck visibility/rights with the materialized context to close a hide/revoke race.
    const context = await readEditorialContext(id, database);
    const stillVisible = await database.destination.findUnique({ where: { id, visibility: "VISIBLE" }, select: { id: true } });
    return stillVisible ? resolveEditorial(parsed.data, context) : null;
  } catch { return null; } // Missing table/invalid legacy JSON cannot break standard detail.
}
