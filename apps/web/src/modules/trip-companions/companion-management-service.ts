import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { requireTraveler } from "@/server/auth/require-traveler";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { activeMembers, companionId, ensureCompanionUpcoming, groupInclude, groupUnavailable, lockCompanion } from "./companion-group-service";
import { companionManageInputSchema, companionManageResultSchema, companionManageSchema } from "./companion-management-contract";
import { companionTripSelect, projectCompanionContext, projectCompanionIntroduction, type CompanionDependencies } from "./companion-service";

export async function getCompanionManagement(headers: Headers, rawId: string, deps: CompanionDependencies) {
  const id = companionId(rawId);
  return deps.database.$transaction(async tx => {
    const actor = await requireTraveler(headers, { ...deps, database: tx as Database });
    const row = await tx.tripCompanionPublication.findFirst({ where: { id, trip: { userId: actor.userId } }, include: groupInclude });
    if (!row) throw groupUnavailable();
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: row.tripId }, select: companionTripSelect });
    let canReopen = true;
    try { ensureCompanionUpcoming(row, deps); } catch (error) { if (!(error instanceof AppError)) throw error; canReopen = false; }
    return companionManageSchema.parse({ publicationId: id, tripId: row.tripId,
      draft: { title: row.title, introduction: row.introduction, additionalCapacity: row.additionalCapacity, imageMediaId: row.imageMediaId },
      visibility: row.visibility, recruitmentOpen: row.recruitmentOpen, managementRevision: row.managementRevision,
      activeMemberCount: await activeMembers(tx, id), canReopen, ...projectCompanionContext(trip),
      canceledAt: row.canceledAt?.toISOString() ?? null,
    });
  }, { isolationLevel: "RepeatableRead" });
}

export async function updateCompanionManagement(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), actor = await requireTraveler(headers, deps), parsed = companionManageInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Thông tin quản lý không hợp lệ.", 400);
  await getCompanionManagement(headers, id, deps); // Current owner boundary precedes replay.
  const payload = parsed.data;
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:manage", key, input: { publicationId: id, ...payload }, execute: async tx => {
    const row = await lockCompanion(tx, id, actor.userId, headers, deps);
    if (row.trip.userId !== actor.userId) throw groupUnavailable();
    if (payload.baseRevision !== row.managementRevision) throw new AppError("COMPANION_REVISION_CONFLICT", "Bài đăng đã thay đổi. Hãy tải lại trước khi sửa.", 409);
    if ((payload.visibility === "PUBLIC" && row.visibility !== "PUBLIC") || (payload.recruitmentOpen && !row.recruitmentOpen)) ensureCompanionUpcoming(row, deps);
    const count = await activeMembers(tx, id);
    if (payload.additionalCapacity < count) throw new AppError("COMPANION_CAPACITY_TOO_SMALL", "Số chỗ không được thấp hơn số tài khoản đang tham gia.", 409);
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: row.tripId }, select: companionTripSelect });
    // An already revoked image safely renders null. It must not block close/withdraw.
    projectCompanionIntroduction(trip, payload, payload.imageMediaId !== row.imageMediaId, count);
    const { confirm: _confirm, baseRevision: _revision, ...data } = payload;
    await tx.tripCompanionPublication.update({ where: { id }, data: { ...data, managementRevision: { increment: 1 } } });
    return companionManageResultSchema.parse({ publicationId: id, managementRevision: row.managementRevision + 1 });
  } });
}
