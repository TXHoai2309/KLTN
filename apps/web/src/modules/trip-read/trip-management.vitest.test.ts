import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { deleteMyTrip, setMyTripCompletion } from "./trip-management-service";
import { tripManagementResponse } from "./trip-management-http";
import { effectiveTripStatus } from "./trip-status";

const time = new Date("2026-10-20T04:00:00Z");
const headers = new Headers();
function fixture() {
 let trips = ["a", "b"].map(userId => ({ id: userId, userId, startDate: new Date("2026-10-20T00:00:00Z"), durationDays: 3, manuallyCompletedAt: null as Date | null }));
 let favorites = [{ tripId: "a" }, { tripId: "b" }];
 let records: any[] = [];
 let actor: string | null = "a";
 let fail = false;
 const database = {
  user: { findUnique: async () => ({ id: actor, role: "TRAVELER", status: "ACTIVE" }) },
  idempotencyRecord: { findUnique: async ({ where }: any) => records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null },
  $transaction: async (run: any) => {
   const pendingTrips = structuredClone(trips), pendingFavorites = structuredClone(favorites), pendingRecords = structuredClone(records);
   const matches = (r: any, where: any) => r.id === where.id && r.userId === where.userId;
   const tx = {
    user: database.user,
    idempotencyRecord: { create: async ({ data }: any) => pendingRecords.push(data), update: async ({ where, data }: any) => Object.assign(pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key), data) },
    trip: {
     findFirst: vi.fn(async ({ where }: any) => pendingTrips.find(r => matches(r, where)) ?? null),
     deleteMany: async ({ where }: any) => { if (fail) throw new Error("fixture rollback"); const index = pendingTrips.findIndex(r => matches(r, where)); if (index < 0) return { count: 0 }; pendingTrips.splice(index, 1); return { count: 1 }; },
     updateMany: async ({ where, data }: any) => { const row = pendingTrips.find(r => matches(r, where)); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    },
    favorite: { deleteMany: async ({ where }: any) => { for (let i = pendingFavorites.length - 1; i >= 0; i--) if (pendingFavorites[i].tripId === where.tripId) pendingFavorites.splice(i, 1); } },
   };
   const result = await run(tx); trips = pendingTrips; favorites = pendingFavorites; records = pendingRecords; return result;
  },
 };
 return { deps: { database: database as unknown as Database, resolveSession: async () => actor ? { user: { id: actor } } : null }, get trips() { return trips; }, get favorites() { return favorites; }, get records() { return records; }, guest: () => { actor = null; }, fail: () => { fail = true; } };
}
describe("approved US-30/31 trip management extension", () => {
 it("deletes only owned Trip and related favorites, replays before another delete", async () => {
  const f = fixture();
  expect(await deleteMyTrip(headers, "a", "delete-a", f.deps)).toMatchObject({ status: "SUCCESS", data: { tripId: "a", deleted: true } });
  expect(f.trips.map(t => t.id)).toEqual(["b"]); expect(f.favorites).toEqual([{ tripId: "b" }]);
  expect(await deleteMyTrip(headers, "a", "delete-a", f.deps)).toMatchObject({ status: "SUCCESS", replayed: true });
  expect(f.records).toHaveLength(1);
 });
 it.each(["b", "missing"])("uniform 404 for foreign or missing %s and no favorite deletion", async id => {
  const f = fixture();
  expect(await deleteMyTrip(headers, id, "delete", f.deps)).toMatchObject({ status: "FAILED", httpStatus: 404 });
  expect(f.trips).toHaveLength(2); expect(f.favorites).toHaveLength(2); expect(f.records).toHaveLength(0);
 });
 it("rolls back favorites and idempotency on database failure", async () => {
  const f = fixture(); f.fail(); const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { expect(await deleteMyTrip(headers, "a", "rollback", f.deps)).toMatchObject({ status: "UNKNOWN" }); } finally { log.mockRestore(); }
  expect(f.trips).toHaveLength(2); expect(f.favorites).toHaveLength(2); expect(f.records).toHaveLength(0);
 });
 it("blocks guest delete and completion", async () => {
  const f = fixture(); f.guest();
  await expect(deleteMyTrip(headers, "a", "key", f.deps)).rejects.toMatchObject({ status: 401 });
  await expect(setMyTripCompletion(headers, "a", true, "key", f.deps, time)).rejects.toMatchObject({ status: 401 });
 });
 it("mark/unmark persists only completion timestamp and replays without changing timestamp", async () => {
  const f = fixture(), before = structuredClone(f.trips[0]);
  expect(await setMyTripCompletion(headers, "a", true, "mark", f.deps, time)).toMatchObject({ status: "SUCCESS", data: { tripId: "a", status: "COMPLETED", manuallyCompletedAt: time.toISOString() } });
  expect(await setMyTripCompletion(headers, "a", true, "mark", f.deps, new Date("2026-10-21T00:00:00Z"))).toMatchObject({ status: "SUCCESS", replayed: true });
  expect(f.trips[0]).toEqual({ ...before, manuallyCompletedAt: time });
  expect(await setMyTripCompletion(headers, "a", false, "unmark", f.deps, time)).toMatchObject({ status: "SUCCESS", data: { status: "ONGOING", manuallyCompletedAt: null } });
  expect(f.trips[0]).toEqual(before);
 });
 it.each([true, false])("foreign owner cannot set completion %s", async completed => {
  const f = fixture(); expect(await setMyTripCompletion(headers, "b", completed, "foreign", f.deps, time)).toMatchObject({ status: "FAILED", httpStatus: 404 }); expect(f.records).toHaveLength(0);
 });
 it("same key changed action is rejected", async () => {
  const f = fixture(); await setMyTripCompletion(headers, "a", true, "key", f.deps, time);
  expect(await setMyTripCompletion(headers, "a", false, "key", f.deps, time)).toMatchObject({ status: "FAILED", httpStatus: 409 });
 });
 it.each(["2026-10-19", "2026-10-20", "2026-10-24"])("manual override and calendar fallback on %s", reference => {
  expect(effectiveTripStatus("2026-10-20", 3, reference, time).status).toBe("COMPLETED");
  expect(effectiveTripStatus("2026-10-20", 3, reference, null).status).toBe(reference < "2026-10-20" ? "UPCOMING" : reference > "2026-10-22" ? "COMPLETED" : "ONGOING");
 });
 it("HTTP validates origin, identity payload and key; confirmed envelope is private", async () => {
  const f = fixture();
  const request = (body: unknown, origin = "http://localhost:3010", key = "http") => new Request("http://localhost:3010/api/trips/a/completion", { method: "PATCH", headers: { origin, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
  for (const body of [{ completed: "true" }, { completed: true, ownerId: "a" }, {}]) expect((await tripManagementResponse(request(body), "a", f.deps, time)).status).toBe(400);
  expect((await tripManagementResponse(request({ completed: true }, "http://evil.test"), "a", f.deps, time)).status).toBe(403);
  expect((await tripManagementResponse(request({ completed: true }, undefined, ""), "a", f.deps, time)).status).toBe(400);
  const response = await tripManagementResponse(request({ completed: true }), "a", f.deps, time);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(await response.json()).toMatchObject({ operationStatus: "SUCCESS", data: { status: "COMPLETED" } });
 });
});
