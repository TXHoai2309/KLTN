import type { Database } from "@KLTN/db";
import { requireTraveler } from "@/server/auth/require-traveler";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import type { TripReadDependencies } from "./trip-read-service";
import { effectiveTripStatus } from "./trip-status";

const notFound = () => new AppError("TRIP_NOT_FOUND", "Không tìm thấy chuyến đi.", 404);

export async function deleteMyTrip(headers: Headers, id: string, key: string, deps: TripReadDependencies) {
 const actor = await requireTraveler(headers, deps);
 return executeIdempotentWrite({ database: deps.database, actorId: actor.userId, operation: "trip:delete", key, input: { tripId: id }, execute: async tx => {
  await requireTraveler(headers, { ...deps, database: tx as unknown as Database });
  const where = { id, userId: actor.userId };
  if (!await tx.trip.findFirst({ where, select: { id: true } })) throw notFound();
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
