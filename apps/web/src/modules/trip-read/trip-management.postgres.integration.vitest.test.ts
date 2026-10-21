import { createPrismaClient } from "@KLTN/db";
import { describe, expect, it } from "vitest";
import { saveTrip } from "../trip-save/trip-save-service";
import { getMyTrip, listMyTrips } from "./trip-read-service";
import { deleteMyTrip, setMyTripCompletion } from "./trip-management-service";

describe.skipIf(process.env.RUN_TRIP_MANAGEMENT_DB_TESTS !== "1")("development PostgreSQL disposable Trip fixture", () => {
 it("real save, read/reload, two-owner isolation, manual completion, favorite cleanup and descendant cascades", async () => {
  const connection = new URL(process.env.DATABASE_URL ?? "");
  if (!/^ep-purple-pond-b3xujb8o(-pooler)?\./.test(connection.hostname) || connection.pathname !== "/neondb") throw new Error("Unverified development DB");
  const db = createPrismaClient({ DATABASE_URL: connection.toString() });
  const prefix = `trip-management-test-${crypto.randomUUID()}`;
  const owners = [`${prefix}-a`, `${prefix}-b`], destinationId = `${prefix}-destination`;
  const time = new Date("2026-10-20T04:00:00Z"), headers = new Headers();
  const dependencies = (owner: string) => ({ database: db, resolveSession: async () => ({ user: { id: owner } }), getRoute: async () => ({ kind: "ok" as const, durationSeconds: 0 }) });
  let savedId: string | undefined;
  try {
   await db.user.createMany({ data: owners.map(id => ({ id, name: "Disposable Trip integration fixture", email: `${id}@example.invalid`, updatedAt: time })) });
   await db.destination.create({ data: { id: destinationId, name: "[TEST disposable] Trip management fixture", description: "Integration fixture, not production content", area: "test", category: "test", visibility: "VISIBLE", latitude: 23, longitude: 105, minimumDurationMinutes: 30, openingDays: { create: { dayOfWeek: "TUESDAY", status: "OPEN", intervals: { create: { opensAtMinute: 0, closesAtMinute: 1440 } } } } } });
   const request = { confirm: true as const, proposal: { startDate: "2026-10-20", durationDays: 1, transport: "CAR" as const, days: [{ dayIndex: 1, visits: [{ destinationId, order: 1, startMinute: 480, plannedDurationMinutes: 60 }] }] } };
   const saved = await saveTrip(headers, request, "save", dependencies(owners[0]), time);
   expect(saved.status).toBe("SUCCESS"); if (saved.status !== "SUCCESS") throw new Error("fixture save failed");
   savedId = saved.data.tripId;
   const replay = await saveTrip(headers, request, "save", dependencies(owners[0]), time);
   expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: { tripId: savedId } });
   expect(await db.trip.count({ where: { userId: owners[0] } })).toBe(1);
   const before = await getMyTrip(headers, savedId, dependencies(owners[0]), "2026-10-20");
   expect((await listMyTrips(headers, dependencies(owners[0]), "2026-10-20")).items.map(t => t.id)).toEqual([savedId]);
   expect((await listMyTrips(headers, dependencies(owners[1]), "2026-10-20")).items).toEqual([]);
   for (const completed of [true, false]) expect(await setMyTripCompletion(headers, savedId, completed, `foreign-${completed}`, dependencies(owners[1]), time)).toMatchObject({ status: "FAILED", httpStatus: 404 });
   expect(await deleteMyTrip(headers, savedId, "foreign-delete", dependencies(owners[1]))).toMatchObject({ status: "FAILED", httpStatus: 404 });
   expect(await setMyTripCompletion(headers, savedId, true, "mark", dependencies(owners[0]), time)).toMatchObject({ status: "SUCCESS", data: { status: "COMPLETED" } });
   const after = await getMyTrip(headers, savedId, dependencies(owners[0]), "2026-10-20");
   expect(after.days).toEqual(before.days); expect(after.startDate).toBe(before.startDate); expect(after.durationDays).toBe(before.durationDays);
   expect((await listMyTrips(headers, dependencies(owners[0]), "2026-10-20")).items[0].status).toBe(after.status);
   expect(after.manuallyCompletedAt).toBe(time.toISOString());
   expect(await setMyTripCompletion(headers, savedId, false, "unmark", dependencies(owners[0]), time)).toMatchObject({ status: "SUCCESS", data: { status: "ONGOING", manuallyCompletedAt: null } });
   await db.favorite.createMany({ data: owners.map(userId => ({ userId, targetType: "TRIP" as const, tripId: savedId! })) });
   const dayIds = before.days.map(d => d.id);
   expect(await deleteMyTrip(headers, savedId, "delete", dependencies(owners[0]))).toMatchObject({ status: "SUCCESS" });
   expect(await deleteMyTrip(headers, savedId, "delete", dependencies(owners[0]))).toMatchObject({ status: "SUCCESS", replayed: true });
   expect(await db.itineraryDay.count({ where: { tripId: savedId } })).toBe(0);
   expect(await db.itineraryVisit.count({ where: { dayId: { in: dayIds } } })).toBe(0);
   expect(await db.favorite.count({ where: { tripId: savedId } })).toBe(0);
   expect(await db.destination.count({ where: { id: destinationId } })).toBe(1);
   await expect(getMyTrip(headers, savedId, dependencies(owners[0]), "2026-10-20")).rejects.toMatchObject({ status: 404 });
  } finally {
   // Exact fixture IDs only. Never delete pre-existing user trips or destinations.
   if (savedId) await db.$transaction(async tx => { await tx.favorite.deleteMany({ where: { tripId: savedId } }); await tx.trip.deleteMany({ where: { id: savedId, userId: owners[0] } }); });
   await db.idempotencyRecord.deleteMany({ where: { scope: { in: owners.flatMap(owner => ["trip:create", "trip:delete", "trip:completion"].map(operation => JSON.stringify([owner, operation]))) } } });
   await db.user.deleteMany({ where: { id: { in: owners } } });
   await db.destination.deleteMany({ where: { id: destinationId } });
   await db.$disconnect();
  }
 }, 60_000);
});
