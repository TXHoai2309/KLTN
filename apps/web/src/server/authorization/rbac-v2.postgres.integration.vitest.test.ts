import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "./guard";
import { saveTrip, type TripSaveDependencies } from "@/modules/trip-save/trip-save-service";
import { tripSaveRequestSchema } from "@/modules/trip-save/trip-save-contract";
import { getMyTrip, listMyTrips } from "@/modules/trip-read/trip-read-service";
import { getFavorites, removeFavorite as removeById } from "@/modules/favorite/favorite-service";
import { addFavoriteResponse, removeFavoriteResponse, favoriteStatusResponse } from "@/modules/favorites/favorites-http";

const development = process.env.RBAC_TEST_DEVELOPMENT === "APPROVED_OWNED_FIXTURES";
const enabled = process.env.RBAC_TEST_DISPOSABLE === "OWNED_LOOPBACK_CONTAINER" || development;
describe.skipIf(!enabled)("RBAC V2 real PostgreSQL ownership and writes", { timeout: 30_000 }, () => {
  let db: PrismaClient;
  const ids = { admin: randomUUID(), traveler: randomUUID(), destination: randomUUID(), second: randomUUID() };
  const headers = new Headers({ "x-user-id": "victim", "x-role": "ADMIN" });
  const now = new Date("2027-01-01T00:00:00Z");
  const payload = (destinationId = ids.destination) => tripSaveRequestSchema.parse({ confirm: true, proposal: {
    startDate: "2027-01-01", durationDays: 1, transport: "CAR",
    days: [{ dayIndex: 1, visits: [{ destinationId, startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }],
  } });
  const deps = (id: string, sessionRole = "TRAVELER"): TripSaveDependencies => ({
    database: db as unknown as Database,
    resolveSession: async () => ({ user: { id, role: sessionRole } }),
    getRoute: async () => ({ kind: "unavailable" as const }),
  });
  const favoriteDeps = (id: string) => ({ database: db as unknown as Database, authorization: deps(id) });
  const target = (id: string, targetType = "destinations") => ({ targetType, targetId: id });
  const request = (id: string, method: "PUT" | "DELETE", key: string, type = "destinations") => new Request(`http://localhost/api/favorites/${type}/${id}`, { method, headers: { "Idempotency-Key": key } });
  let adminTrip: string, travelerTrip: string;

  beforeAll(async () => {
    const url = new URL(process.env.RBAC_TEST_DATABASE_URL!);
    if (development) {
      if (url.hostname !== "ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") throw new Error("Approved Development target required");
    } else if (url.hostname !== "127.0.0.1" || url.pathname !== "/rbac_v2_test") throw new Error("Disposable target required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    await db.user.createMany({ data: [
      { id: ids.admin, name: "Synthetic Admin", email: `${ids.admin}@example.invalid`, role: "ADMIN" },
      { id: ids.traveler, name: "Synthetic Traveler", email: `${ids.traveler}@example.invalid`, role: "TRAVELER" },
    ] });
    for (const id of [ids.destination, ids.second]) await db.destination.create({ data: {
      id, name: "Synthetic fixture", description: "Synthetic fixture", area: "Test", category: "Test", latitude: 23, longitude: 105,
      visibility: "VISIBLE", minimumDurationMinutes: 30,
      openingDays: { create: { dayOfWeek: "FRIDAY", status: "OPEN", intervals: { create: { opensAtMinute: 0, closesAtMinute: 1440 } } } },
    } });
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.$transaction(async tx => {
        await tx.favorite.deleteMany({ where: { userId: { in: [ids.admin, ids.traveler] } } });
        await tx.trip.deleteMany({ where: { userId: { in: [ids.admin, ids.traveler] } } });
        await tx.idempotencyRecord.deleteMany({ where: { scope: { in: [ids.admin, ids.traveler].flatMap(id => ["trip:create", "favorite:add", "favorite:remove"].map(op => JSON.stringify([id, op]))) } } });
        await tx.destination.deleteMany({ where: { id: { in: [ids.destination, ids.second] } } });
        await tx.user.deleteMany({ where: { id: { in: [ids.admin, ids.traveler] } } });
      });
      console.log("RBAC_POSTGRES_OWNED_FIXTURE_CLEANUP=PASS");
    } finally { await db.$disconnect(); }
  });

  it("uses persisted roles; Admin retains admin access and Traveler/Guest cannot administer", async () => {
    expect(await requireActor(headers, deps(ids.admin), "admin")).toEqual({ id: ids.admin, role: "ADMIN" });
    expect(await requireActor(headers, deps(ids.admin), "traveler")).toHaveProperty("role", "ADMIN");
    await expect(requireActor(headers, deps(ids.traveler, "ADMIN"), "admin")).rejects.toMatchObject({ status: 403 });
    await expect(requireActor(headers, { ...deps(ids.admin), resolveSession: async () => null }, "admin")).rejects.toMatchObject({ status: 401 });
    await db.user.update({ where: { id: ids.admin }, data: { role: "TRAVELER" } });
    await expect(requireActor(headers, deps(ids.admin, "ADMIN"), "admin")).rejects.toMatchObject({ status: 403 });
    expect(await requireActor(headers, deps(ids.admin, "ADMIN"), "traveler")).toHaveProperty("role", "TRAVELER");
    await db.user.update({ where: { id: ids.admin }, data: { role: "ADMIN" } });
  });

  it.each(["admin", "traveler"] as const)("%s saves once under its own persisted ID and reads only owned Trips", async kind => {
    const input = payload(), key = randomUUID(), auth = deps(ids[kind]);
    const result = await saveTrip(headers, input, key, auth, now);
    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") throw new Error("Fixture save failed");
    const id = result.data.tripId;
    if (kind === "admin") adminTrip = id; else travelerTrip = id;
    expect(await db.trip.findUnique({ where: { id } })).toHaveProperty("userId", ids[kind]);
    expect(await saveTrip(headers, input, key, auth, now)).toMatchObject({ status: "SUCCESS", replayed: true, data: { tripId: id } });
    expect(await db.trip.count({ where: { userId: ids[kind] } })).toBe(1);
    expect((await listMyTrips(headers, auth, "2027-01-01")).items.map(trip => trip.id)).toEqual([id]);
    expect(await getMyTrip(headers, id, auth, "2027-01-01")).toHaveProperty("id", id);
    expect(await db.user.findUnique({ where: { id: ids[kind] } })).toHaveProperty("role", kind === "admin" ? "ADMIN" : "TRAVELER");
  });

  it("foreign and missing Trips return the same 404 for both users, including Favorite access", async () => {
    for (const [id, foreign] of [[ids.admin, travelerTrip], [ids.traveler, adminTrip]]) {
      for (const tripId of [foreign, "missing"]) {
        await expect(getMyTrip(headers, tripId, deps(id), "2027-01-01")).rejects.toMatchObject({ status: 404, code: "TRIP_NOT_FOUND" });
        expect((await addFavoriteResponse(request(tripId, "PUT", randomUUID(), "trips"), target(tripId, "trips"), favoriteDeps(id))).status).toBe(404);
        expect((await removeFavoriteResponse(request(tripId, "DELETE", randomUUID(), "trips"), target(tripId, "trips"), favoriteDeps(id))).status).toBe(404);
      }
    }
  });

  it.each(["admin", "traveler"] as const)("%s adds/lists/removes own Favorites, preserves the other owner's row and replays writes", async kind => {
    const id = ids[kind], otherId = kind === "admin" ? ids.traveler : ids.admin, auth = favoriteDeps(id);
    const other = await db.favorite.create({ data: { userId: otherId, targetType: "DESTINATION", destinationId: ids.destination } });
    const key = randomUUID();
    const added = await addFavoriteResponse(request(ids.destination, "PUT", key), target(ids.destination), auth);
    expect(await added.json()).toMatchObject({ operationStatus: "SUCCESS", data: { isFavorite: true } });
    const replay = await addFavoriteResponse(request(ids.destination, "PUT", key), target(ids.destination), auth);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    const own = await db.favorite.findFirstOrThrow({ where: { userId: id, destinationId: ids.destination } });
    expect((await getFavorites(headers, deps(id))).destinations.map(row => row.favoriteId)).toEqual([own.id]);
    expect(await removeById(headers, other.id, randomUUID(), deps(id))).toMatchObject({ status: "FAILED", httpStatus: 404 });
    expect(await db.favorite.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect((await favoriteStatusResponse(new Request(`http://localhost/api/favorites/status?targetType=destinations&targetId=${ids.destination}`), auth)).status).toBe(200);
    const removed = await removeFavoriteResponse(request(ids.destination, "DELETE", randomUUID()), target(ids.destination), auth);
    expect(await removed.json()).toMatchObject({ operationStatus: "SUCCESS", data: { isFavorite: false } });
    await db.favorite.delete({ where: { id: other.id } });
  });

  it("Admin still fails missing date, missing route and minimum-duration constraints", async () => {
    const auth = deps(ids.admin), input = payload();
    await expect(saveTrip(headers, { ...input, proposal: { ...input.proposal, startDate: null } }, randomUUID(), auth, now)).rejects.toMatchObject({ code: "TRIP_START_DATE_REQUIRED" });
    input.proposal.days[0].visits.push({ destinationId: ids.second, startMinute: 600, plannedDurationMinutes: 60, order: 2 });
    await expect(saveTrip(headers, input, randomUUID(), auth, now)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    await db.destination.update({ where: { id: ids.destination }, data: { minimumDurationMinutes: 90 } });
    await expect(saveTrip(headers, payload(), randomUUID(), auth, now)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    await db.destination.update({ where: { id: ids.destination }, data: { minimumDurationMinutes: 30 } });
    expect(await db.trip.count({ where: { userId: ids.admin } })).toBe(1);
  });

  it("rechecks authentication inside the Favorite transaction and rolls back the idempotency claim", async () => {
    let reads = 0;
    const auth = favoriteDeps(ids.admin);
    auth.authorization.resolveSession = async () => ++reads === 1 ? { user: { id: ids.admin, role: "ADMIN" } } : null;
    const response = await addFavoriteResponse(request(ids.second, "PUT", "revoked-session"), target(ids.second), auth);
    expect(response.status).toBe(401);
    expect(await db.favorite.count({ where: { userId: ids.admin, destinationId: ids.second } })).toBe(0);
    expect(await db.idempotencyRecord.count({ where: { key: "revoked-session", scope: JSON.stringify([ids.admin, "favorite:add"]) } })).toBe(0);
  });
});
