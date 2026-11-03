import type { Database, Prisma } from "@KLTN/db";
import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { isDestinationPublic } from "../destination/destination-eligibility";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { companionIdSchema } from "./companion-contract";
import { companionConfirmSchema, companionGroupMutationSchema, companionGroupSchema } from "./companion-group-contract";
import { getPublicCompanion, companionTripSelect, projectCompanionIntroduction, type CompanionDependencies } from "./companion-service";

export const groupUnavailable = () => new AppError("COMPANION_GROUP_FORBIDDEN", "Bạn không có quyền truy cập nhóm này.", 403);
export const groupMissing = () => new AppError("COMPANION_NOT_FOUND", "Không tìm thấy chuyến đồng hành.", 404);
export function companionId(id: string) {
  const parsed = companionIdSchema.safeParse(id);
  if (!parsed.success) throw new AppError("INVALID_COMPANION_INPUT", "Mã chuyến không hợp lệ.", 400);
  return parsed.data;
}
export function confirmed(input: unknown) {
  if (!companionConfirmSchema.safeParse(input).success) throw new AppError("INVALID_COMPANION_INPUT", "Cần xác nhận thao tác.", 400);
  return { confirm: true as const };
}
export const groupInclude = { trip: { select: { userId: true, startDate: true, manuallyCompletedAt: true } } } satisfies Prisma.TripCompanionPublicationInclude;
export type GroupRow = Prisma.TripCompanionPublicationGetPayload<{ include: typeof groupInclude }>;

/** All group writes use user SHARE -> Trip UPDATE -> publication UPDATE, in that order. */
export async function lockCompanion(tx: Prisma.TransactionClient, id: string, actorId: string, headers: Headers, deps: CompanionDependencies) {
  await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${actorId} FOR SHARE`;
  const checkedActor = await requireTraveler(headers, { ...deps, database: tx as Database });
  if (checkedActor.userId !== actorId) throw new AppError("UNAUTHENTICATED", "Phiên đăng nhập đã thay đổi.", 401);
  const target = await tx.tripCompanionPublication.findUnique({ where: { id }, select: { tripId: true } });
  if (!target) throw groupMissing();
  await tx.$queryRaw`SELECT "id" FROM "trip" WHERE "id" = ${target.tripId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "trip_companion_publication" WHERE "id" = ${id} FOR UPDATE`;
  const row = await tx.tripCompanionPublication.findUnique({ where: { id }, include: groupInclude });
  if (!row) throw groupMissing();
  return row;
}
export async function groupRelationship(reader: Pick<Prisma.TransactionClient, "tripCompanionMembership">, row: GroupRow, actorId: string) {
  if (row.trip.userId === actorId) return "HOST" as const;
  const membership = await reader.tripCompanionMembership.findUnique({ where: { publicationId_userId: { publicationId: row.id, userId: actorId } }, select: { state: true } });
  if (membership?.state !== "ACTIVE") throw groupUnavailable();
  return "MEMBER" as const;
}
export async function requireGroup(headers: Headers, id: string, deps: CompanionDependencies) {
  const actor = await requireTraveler(headers, deps);
  const row = await deps.database.tripCompanionPublication.findUnique({ where: { id: companionId(id) }, include: groupInclude });
  if (!row) throw groupUnavailable();
  const relationship = await groupRelationship(deps.database, row, actor.userId);
  return { actor, row, relationship };
}
export function ensureCompanionUpcoming(row: GroupRow, deps: CompanionDependencies) {
  if (row.canceledAt || row.trip.manuallyCompletedAt || row.trip.startDate.toISOString().slice(0, 10) <= vietnamDateOf((deps.now ?? (() => new Date()))())) {
    throw new AppError("COMPANION_RECRUITMENT_CLOSED", "Chuyến không còn nhận người mới.", 409);
  }
}
export function assertCompanionCanSend(row: Pick<GroupRow, "canceledAt">) {
  if (row.canceledAt) throw new AppError("COMPANION_CANCELED", "Chuyến đồng hành đã hủy. Bạn vẫn có thể đọc lịch sử nhóm.", 409);
}
export function ensureRecruitable(row: GroupRow, deps: CompanionDependencies) {
  ensureCompanionUpcoming(row, deps);
  if (row.visibility !== "PUBLIC" || !row.recruitmentOpen) throw new AppError("COMPANION_RECRUITMENT_CLOSED", "Chuyến không còn nhận người mới.", 409);
}
export const activeMembers = (tx: Pick<Prisma.TransactionClient, "tripCompanionMembership">, publicationId: string) =>
  tx.tripCompanionMembership.count({ where: { publicationId, state: "ACTIVE" } });
const banned = () => new AppError("COMPANION_BANNED", "Bạn không thể tham gia lại nhóm này.", 403);

export async function joinCompanion(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), payload = confirmed(input), actor = await requireTraveler(headers, deps);
  // Public existence/visibility is established before replay, independently of knowing an ID.
  await getPublicCompanion(id, deps.database);
  const prior = await deps.database.tripCompanionMembership.findUnique({ where: { publicationId_userId: { publicationId: id, userId: actor.userId } }, select: { state: true } });
  if (prior?.state === "BANNED") throw banned();
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:join", key,
    input: { publicationId: id, ...payload }, execute: async tx => {
      const row = await lockCompanion(tx, id, actor.userId, headers, deps);
      if (row.trip.userId === actor.userId) return companionGroupMutationSchema.parse({ publicationId: id });
      const membership = await tx.tripCompanionMembership.findUnique({ where: { publicationId_userId: { publicationId: id, userId: actor.userId } } });
      if (membership?.state === "BANNED") throw banned();
      if (membership?.state === "ACTIVE") return companionGroupMutationSchema.parse({ publicationId: id });
      ensureRecruitable(row, deps);
      if (await activeMembers(tx, id) >= row.additionalCapacity) throw new AppError("COMPANION_FULL", "Chỗ tìm thêm vừa hết.", 409);
      await tx.tripCompanionMembership.upsert({
        where: { publicationId_userId: { publicationId: id, userId: actor.userId } },
        create: { publicationId: id, userId: actor.userId }, update: { state: "ACTIVE" },
      });
      await tx.tripCompanionPublication.update({ where: { id }, data: { everHadMembers: true } });
      return companionGroupMutationSchema.parse({ publicationId: id });
    } });
}

export async function leaveCompanion(headers: Headers, rawId: string, input: unknown, key: string, deps: CompanionDependencies) {
  const id = companionId(rawId), payload = confirmed(input), actor = await requireTraveler(headers, deps);
  return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip-companions:leave", key,
    input: { publicationId: id, ...payload }, execute: async tx => {
      const row = await lockCompanion(tx, id, actor.userId, headers, deps);
      if (row.trip.userId === actor.userId) throw new AppError("COMPANION_HOST_CANNOT_LEAVE", "Chủ chuyến không thể tự rời nhóm.", 409);
      const membership = await tx.tripCompanionMembership.findUnique({ where: { publicationId_userId: { publicationId: id, userId: actor.userId } } });
      if (!membership || (membership.state !== "ACTIVE" && membership.state !== "LEFT")) throw groupUnavailable();
      if (membership.state === "ACTIVE") await tx.tripCompanionMembership.update({
        where: { publicationId_userId: { publicationId: id, userId: actor.userId } }, data: { state: "LEFT" },
      });
      return companionGroupMutationSchema.parse({ publicationId: id });
    } });
}

export async function getCompanionGroup(headers: Headers, rawId: string, deps: CompanionDependencies) {
  const id = companionId(rawId);
  return deps.database.$transaction(async tx => {
    const scoped = { ...deps, database: tx as Database };
    const { row, relationship } = await requireGroup(headers, id, scoped);
    const projected = await tx.trip.findUniqueOrThrow({ where: { id: row.tripId }, select: {
      ...companionTripSelect, days: { orderBy: { dayIndex: "asc" }, select: {
        dayIndex: true, localDate: true,
        visits: { orderBy: { order: "asc" }, select: { id: true, order: true, startMinute: true, plannedDurationMinutes: true,
          destination: { select: { id: true, name: true, visibility: true, deletedAt: true, latitude: true, longitude: true, media: { select: { id: true, url: true, alt: true, websiteRights: true, storageReference: true } } } },
        } },
      } },
    } });
    const count = await activeMembers(tx, id);
    return companionGroupSchema.parse({ publicationId: id, relationship, memberCount: count + 1, itineraryRevision: row.itineraryRevision.toString(), canSend: !row.canceledAt, canceledAt: row.canceledAt?.toISOString() ?? null,
      introduction: projectCompanionIntroduction(projected, row, false, count),
      itinerary: { days: projected.days.map(day => ({ dayIndex: day.dayIndex, localDate: day.localDate.toISOString().slice(0, 10),
        visits: day.visits.map(visit => { const visible = isDestinationPublic(visit.destination); return {
          visitId: visit.id, order: visit.order, startMinute: visit.startMinute, plannedDurationMinutes: visit.plannedDurationMinutes,
          destination: { destinationId: visible ? visit.destination.id : null, name: visible ? visit.destination.name : "Điểm đến không còn khả dụng",
            availability: visible ? "AVAILABLE" : "UNAVAILABLE", latitude: visible ? visit.destination.latitude : null, longitude: visible ? visit.destination.longitude : null },
        }; }),
      })) },
    });
  }, { isolationLevel: "RepeatableRead" });
}
