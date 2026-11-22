import type { Database } from "@KLTN/db";
import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { MAX_PINNED_ITEMS, type PinnedItem } from "../trip-save/trip-pin-contract";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import type { TripReadDependencies } from "./trip-read-service";
import { effectiveTripStatus } from "./trip-status";

const notFound = () => new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

export async function deleteMyTrip(headers: Headers, id: string, key: string, deps: TripReadDependencies) {
 const actor = await requireTraveler(headers, deps);
 return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip:delete", key, input: { tripId: id }, execute: async tx => {
  await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${actor.userId} FOR SHARE`;
  await requireTraveler(headers, { ...deps, database: tx as unknown as Database });
  await tx.$queryRaw`SELECT "id" FROM "trip" WHERE "id" = ${id} AND "userId" = ${actor.userId} FOR UPDATE`;
  const where = { id, userId: actor.userId };
  const trip = await tx.trip.findFirst({ where, select: { id: true, companionPublication: { select: { everHadMembers: true, messageSequence: true } } } });
  if (!trip) throw notFound();
  if (trip.companionPublication && (trip.companionPublication.everHadMembers || trip.companionPublication.messageSequence > BigInt(0))) throw new AppError("TRIP_HAS_COMPANION_HISTORY", "Chuyến đã có lịch sử nhóm. Hãy gỡ công khai hoặc hủy thay vì xóa.", 409);
  // Favorite uses RESTRICT; owned Day/Visit descendants already use CASCADE.
  await tx.favorite.deleteMany({ where: { tripId: id } });
  if ((await tx.trip.deleteMany({ where })).count !== 1) throw notFound();
  return { tripId: id, deleted: true as const };
 } });
}

export async function setMyTripCompletion(headers: Headers, id: string, completed: boolean, key: string, deps: TripReadDependencies, timeReference: Date) {
 const actor = await requireTraveler(headers, deps);
 return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip:completion", key, input: { tripId: id, completed }, execute: async tx => {
  await requireTraveler(headers, { ...deps, database: tx as unknown as Database });
  const where = { id, userId: actor.userId };
  const trip = await tx.trip.findFirst({ where, select: { startDate: true, durationDays: true } });
  if (!trip) throw notFound();
  const manuallyCompletedAt = completed ? timeReference : null;
  if ((await tx.trip.updateMany({ where, data: { manuallyCompletedAt } })).count !== 1) throw notFound();
  return { tripId: id, manuallyCompletedAt: manuallyCompletedAt?.toISOString() ?? null,
   ...effectiveTripStatus(trip.startDate.toISOString().slice(0, 10), trip.durationDays, vietnamDateOf(timeReference), manuallyCompletedAt) };
 } });
}

/** ADR-47: add pinned items to one of the caller's own trips. A new cost estimate replaces the old one; an identical item is not stored twice. */
export async function pinItemsToMyTrip(headers: Headers, id: string, items: readonly PinnedItem[], key: string, deps: TripReadDependencies) {
 const actor = await requireTraveler(headers, deps);
 return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip:pin", key, input: { tripId: id, items }, execute: async tx => {
  await requireTraveler(headers, { ...deps, database: tx as unknown as Database });
  await tx.$queryRaw`SELECT "id" FROM "trip" WHERE "id" = ${id} AND "userId" = ${actor.userId} FOR UPDATE`;
  if (!await tx.trip.findFirst({ where: { id, userId: actor.userId }, select: { id: true } })) throw notFound();
  const existing = await tx.tripPinnedItem.findMany({ where: { tripId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, payload: true, sortOrder: true } });
  const known = new Set(existing.map(row => JSON.stringify(row.payload)));
  const fresh = items.filter(item => { const text = JSON.stringify(item); if (known.has(text)) return false; known.add(text); return true; });
  if (fresh.some(item => item.kind === "COST")) await tx.tripPinnedItem.deleteMany({ where: { tripId: id, kind: "COST" } });
  const kept = existing.filter(row => !(row.kind === "COST" && fresh.some(item => item.kind === "COST")));
  if (kept.length + fresh.length > MAX_PINNED_ITEMS) throw new AppError("TRIP_PIN_LIMIT", `Một chuyến đi chỉ ghim được tối đa ${MAX_PINNED_ITEMS} mục.`, 409);
  let sortOrder = kept.reduce((max, row) => Math.max(max, row.sortOrder), 0);
  for (const item of fresh) await tx.tripPinnedItem.create({ data: { tripId: id, kind: item.kind, payload: JSON.parse(JSON.stringify(item)), sortOrder: ++sortOrder } });
  return { tripId: id, pinned: fresh.length, total: kept.length + fresh.length };
 } });
}
