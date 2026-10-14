import type { Database, Prisma } from "@KLTN/db";
import { createHash, randomUUID } from "node:crypto";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite, preflightIdempotentReplay } from "@/server/http/idempotency";
import { referenceId } from "../content-profile/content-profile-contract";
import { imageIntentInput, imageIntentSchema, mediaReviewSchema, MAX_IMAGE_BYTES, type ImageIntent } from "./destination-media-contract";
import { destinationSelect, toDestinationDto, validateDestinationId, type DestinationDependencies } from "./destination-service";
import type { DestinationDto } from "./destination-contract";
import type { DestinationImageProvider, ImageAsset } from "./cloudinary-provider";

const operation = (kind: string, id: string) => `destination:media-${kind}:${id}`;
const scope = (actor: string, kind: string, id: string) => JSON.stringify([actor, operation(kind, id)]);
const invalid = () => new AppError("INVALID_IMAGE_INTENT", "Yêu cầu tải ảnh không hợp lệ hoặc đã hết hạn.", 400);
const changed = () => new AppError("DESTINATION_CHANGED", "Điểm đến đã thay đổi. Đọc lại trước khi lưu ảnh.", 409);
async function lock(tx: Prisma.TransactionClient, value: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${value}, 0))`;
}
async function destination(tx: Pick<Database, "destination">, id: string) {
  const row = await tx.destination.findUnique({ where: { id: validateDestinationId(id) }, select: destinationSelect });
  if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
  return row;
}
export async function createImageIntent(headers: Headers, body: unknown, key: string, id: string, deps: DestinationDependencies, provider: DestinationImageProvider, now = Date.now()) {
  const actor = await requireActor(headers, deps, "admin");
  if (!referenceId.safeParse(key).success) throw invalid();
  const parsed = imageIntentInput.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_IMAGE", "Chọn ảnh JPEG, PNG, WebP hoặc AVIF tối đa 10 MB.", 400);
  await destination(deps.database, id);
  const identity = { database: deps.database, actorId: actor.id, operation: operation("intent", id), key, input: { id, ...parsed.data } };
  const replay = await preflightIdempotentReplay<ImageIntent>(identity);
  if (replay.status !== "ABSENT") return replay;
  const mode = await provider.folderMode();
  return executeIdempotentWrite({ ...identity, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    await lock(tx, `image-budget:${actor.id}`);
    await lock(tx, `destination-media:${id}`);
    const row = await destination(tx as unknown as Database, id);
    const recent = await tx.idempotencyRecord.count({ where: { scope: { startsWith: `["${actor.id}","destination:media-intent:` }, createdAt: { gte: new Date(now - 60_000) } } });
    const hourly = await tx.idempotencyRecord.count({ where: { scope: { startsWith: `["${actor.id}","destination:media-intent:` }, createdAt: { gte: new Date(now - 3_600_000) } } });
    // The current placeholder record is counted too; budgets are durable across instances.
    if (recent > 30 || hourly > 100) throw new AppError("IMAGE_RATE_LIMIT", "Đã đạt giới hạn tải ảnh. Thử lại sau.", 429);
    const pending = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM idempotency_record i
      WHERE i.scope::jsonb->>1 = ${operation("intent", id)}
        AND i."responseJson" <> 'null'
        AND (i."responseJson"::jsonb->>'expiresAt')::bigint > ${now}
        AND NOT EXISTS (SELECT 1 FROM idempotency_record done
          WHERE done.scope::jsonb->>0 = i.scope::jsonb->>0
            AND done.scope::jsonb->>1 = ${operation("upload", id)} AND done.key = i.key)`;
    if (row.media.length + Number(pending[0]?.count ?? 0) >= 20) throw new AppError("IMAGE_LIMIT", "Tối đa 20 ảnh, bao gồm ảnh đang chờ tải.", 409);
    const folder = `KLTN/destinations/${id}`;
    const name = `kltn-${randomUUID()}`;
    return imageIntentSchema.parse({ ...parsed.data, actorId: actor.id, destinationId: id, intentKey: key, cloud: provider.cloud, mode, folder,
      publicId: mode === "fixed" ? `${folder}/${name}` : name, expiresAt: now + 30 * 60_000 });
  }});
}
export function verifyImageAsset(asset: ImageAsset, intent: ImageIntent, format: string) {
  let url: URL;
  try { url = new URL(asset.secure_url); } catch { throw invalid(); }
  const context = asset.context?.custom;
  if (asset.public_id !== intent.publicId || asset.resource_type !== "image" || asset.type !== "upload" ||
      !asset.asset_id || asset.format !== format || asset.bytes !== intent.size || asset.bytes > MAX_IMAGE_BYTES ||
      !Number.isSafeInteger(asset.version) || asset.version < 1 || asset.width < 1 || asset.height < 1 || asset.width * asset.height > 25_000_000 ||
      context?.kltn_intent !== intent.intentKey || context?.kltn_sha256 !== intent.sha256 ||
      (intent.mode === "dynamic" ? asset.asset_folder !== intent.folder : asset.public_id !== `${intent.folder}/${asset.public_id.split("/").pop()}`) ||
      url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password ||
      !url.pathname.startsWith(`/${intent.cloud}/image/upload/`)) throw invalid();
  const storageReference = JSON.stringify({ provider: "cloudinary", cloud: intent.cloud, assetId: asset.asset_id,
    publicId: asset.public_id, version: asset.version, format: asset.format, bytes: asset.bytes, width: asset.width, height: asset.height });
  if (storageReference.length > 500 || asset.secure_url.length > 2000) throw invalid();
  return { url: asset.secure_url, storageReference };
}
export async function uploadDestinationImage(headers: Headers, bytes: Buffer, key: string, id: string, deps: DestinationDependencies, provider: DestinationImageProvider, now = Date.now()) {
  const actor = await requireActor(headers, deps, "admin");
  if (!referenceId.safeParse(key).success) throw invalid();
  await destination(deps.database, id);
  const record = await deps.database.idempotencyRecord.findUnique({ where: { scope_key: { scope: scope(actor.id, "intent", id), key } }, select: { responseJson: true } });
  let intent: ImageIntent;
  try { intent = imageIntentSchema.parse(JSON.parse(record?.responseJson ?? "null")); } catch { throw invalid(); }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (intent.actorId !== actor.id || intent.destinationId !== id || intent.intentKey !== key || intent.sha256 !== sha256 || intent.size !== bytes.length || intent.cloud !== provider.cloud || intent.folder !== `KLTN/destinations/${id}`) throw invalid();
  const identity = { database: deps.database, actorId: actor.id, operation: operation("upload", id), key, input: { id, intentKey: key, sha256 } };
  const replay = await preflightIdempotentReplay<DestinationDto>(identity);
  if (replay.status !== "ABSENT") return replay;
  if (intent.expiresAt <= now) throw invalid();
  const admission = await executeIdempotentWrite({ database: deps.database, actorId: actor.id,
    operation: operation("attempt", id), key: randomUUID(), input: { id, intentKey: key, now }, execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      await lock(tx, `image-attempt-budget:${actor.id}`);
      const prefix = JSON.stringify([actor.id]).slice(0, -1) + ',"destination:media-attempt:';
      const recent = await tx.idempotencyRecord.count({ where: { scope: { startsWith: prefix }, createdAt: { gte: new Date(now - 60_000) } } });
      const hourly = await tx.idempotencyRecord.count({ where: { scope: { startsWith: prefix }, createdAt: { gte: new Date(now - 3_600_000) } } });
      if (recent > 30 || hourly > 100) throw new AppError("IMAGE_RATE_LIMIT", "Đã đạt giới hạn thử tải ảnh. Thử lại sau.", 429);
      return { admitted: true };
    } });
  if (admission.status !== "SUCCESS") return admission;
  const format = await provider.inspect(bytes);
  const expectedMime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  if (intent.mime !== expectedMime) throw new AppError("INVALID_IMAGE", "Loại ảnh thực tế không khớp file đã chọn.", 400);
  let asset = await provider.find(intent);
  if (!asset) {
    try { await provider.upload(intent, bytes); }
    catch { // A timed-out upload may have succeeded; reconcile only this exact server-owned identity.
      asset = await provider.find(intent);
      if (!asset) throw new AppError("IMAGE_UPLOAD_RETRY", "Chưa hoàn tất tải ảnh. Giữ nguyên file và thử lại.", 503);
    }
    asset ??= await provider.find(intent);
  }
  if (!asset) throw new AppError("IMAGE_UPLOAD_RETRY", "Chưa xác minh được ảnh đã tải. Thử lại với cùng file.", 503);
  const verified = verifyImageAsset(asset, intent, format);
  return executeIdempotentWrite({ ...identity, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    await lock(tx, `destination-media:${id}`);
    const row = await destination(tx as unknown as Database, id);
    if (row.media.length >= 20) throw new AppError("IMAGE_LIMIT", "Điểm đến đã có 20 ảnh. Gỡ ảnh trước khi thêm.", 409);
    return toDestinationDto(await tx.destination.update({ where: { id, updatedAt: row.updatedAt },
      data: { contentRevision: { increment: 1 }, media: { create: [{ ...verified, alt: intent.name, websiteRights: "UNKNOWN", isCover: row.media.length === 0,
        position: row.media.length ? Math.max(...row.media.map(m => m.position)) + 1 : 0 }] } }, select: destinationSelect }));
  }});
}
export async function reviewDestinationImage(headers: Headers, body: unknown, key: string, id: string, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  const parsed = mediaReviewSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_IMAGE_REVIEW", "Cần bằng chứng quyền sử dụng và dữ liệu ảnh hợp lệ.", 400);
  const input = parsed.data;
  return executeIdempotentWrite({ database: deps.database, actorId: actor.id, operation: operation("review", id), key, input: { destinationId: id, ...input }, execute: async tx => {
    await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
    await lock(tx, `destination-media:${id}`);
    const row = await destination(tx as unknown as Database, id);
    if (row.updatedAt.toISOString() !== input.expectedUpdatedAt) throw changed();
    const media = row.media.find(m => m.id === input.id);
    if (!media) throw new AppError("IMAGE_NOT_FOUND", "Không tìm thấy ảnh thuộc điểm đến.", 404);
    if (media.websiteRights === input.decision && media.rightsEvidence === input.evidence) return toDestinationDto(row);
    return toDestinationDto(await tx.destination.update({ where: { id, updatedAt: row.updatedAt }, data: {
      contentRevision: { increment: 1 }, media: { update: [{ where: { id: input.id }, data: {
        websiteRights: input.decision, rightsEvidence: input.evidence,
        reviewedBy: input.decision === "UNKNOWN" ? null : actor.id, reviewedAt: input.decision === "UNKNOWN" ? null : new Date(),
      } }] },
    }, select: destinationSelect }));
  }});
}
