import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPrismaClient } from "@KLTN/db";

import { addFavoriteResponse, favoriteStatusResponse, removeFavoriteResponse } from "./favorites-http";
import { getMyTrip, listMyTrips } from "../trip-read/trip-read-service";
import { getFavorites, removeFavorite as removeRelation } from "../favorite/favorite-service";
import { deleteMyTrip } from "../trip-read/trip-management-service";

test("US-34 development PostgreSQL: owned Trip relation, unique constraint, no copy and relation-only removal", { skip: process.env.US34_DEV_DB !== "1" }, async () => {
  assert.equal(process.env.NODE_ENV, "development");
  assert.ok(new URL(process.env.DATABASE_URL!).hostname.startsWith("ep-purple-pond-b3xujb8o"));
  const db = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL! });
  const prefix = `us34-${randomUUID()}`;
  const ids = { a: `${prefix}-a`, b: `${prefix}-b`, admin: `${prefix}-admin`, destination: `${prefix}-d`, tripA: `${prefix}-ta`, tripB: `${prefix}-tb` };
  let actor: { id: string; role: "TRAVELER" | "ADMIN" } | null = { id: ids.a, role: "TRAVELER" };
  const authorization = { database: db, resolveSession: async () => actor ? { user: actor } : null };
  const deps = { database: db, authorization };
  const request = (id: string, method: "PUT" | "DELETE", key: string) => new Request(`http://localhost/api/favorites/trips/${id}`, { method, headers: { "Idempotency-Key": `${prefix}-${key}` } });
  const target = (id: string) => ({ targetType: "trips", targetId: id });
  const counts = async () => ({ trips: await db.trip.count(), days: await db.itineraryDay.count(), visits: await db.itineraryVisit.count() });

  try {
    await db.user.createMany({ data: [
      { id: ids.a, name: "US34 disposable A", email: `${ids.a}@example.invalid` },
      { id: ids.b, name: "US34 disposable B", email: `${ids.b}@example.invalid` },
      { id: ids.admin, name: "US34 disposable Admin", email: `${ids.admin}@example.invalid`, role: "ADMIN" },
    ] });
    await db.destination.create({ data: { id: ids.destination, name: "US34 disposable fixture", description: "Test fixture only", area: "fixture", category: "fixture", latitude: 23, longitude: 105, visibility: "HIDDEN" } });
    for (const [id, userId] of [[ids.tripA, ids.a], [ids.tripB, ids.b]]) {
      await db.trip.create({ data: { id, userId, startDate: new Date("2026-10-20"), durationDays: 1, transport: "CAR", days: { create: { dayIndex: 1, localDate: new Date("2026-10-20"), visits: { create: { destinationId: ids.destination, startMinute: 480, plannedDurationMinutes: 60, order: 1 } } } } } });
    }
    const before = await counts();
    const original = await db.trip.findUniqueOrThrow({ where: { id: ids.tripA }, include: { days: { include: { visits: true } } } });
    const readDeps = { database: db, resolveSession: authorization.resolveSession };
    assert.equal((await listMyTrips(new Headers(), readDeps, "2026-10-15")).items[0]?.isFavorite, false);

    const added = await addFavoriteResponse(request(ids.tripA, "PUT", "add"), target(ids.tripA), deps);
    assert.equal(added.status, 200);
    assert.equal((await added.json()).operationStatus, "SUCCESS");
    const relation = await db.favorite.findFirstOrThrow({ where: { userId: ids.a, tripId: ids.tripA } });
    assert.equal(relation.targetType, "TRIP");
    assert.equal(relation.tripId, original.id);
    const listed = await getFavorites(new Headers(), readDeps, new Date("2026-10-15T00:00:00Z"));
    assert.equal(listed.trips[0]?.href, `/trips/${ids.tripA}`);
    assert.equal(listed.trips[0]?.trip?.status, "UPCOMING");
    // A malformed legacy relation must not turn B's private Trip into readable content.
    const inconsistent = await db.favorite.create({ data: { userId: ids.a, targetType: "TRIP", tripId: ids.tripB } });
    assert.deepEqual((await getFavorites(new Headers(), readDeps)).trips.map(item => item.targetId), [ids.tripA]);
    await db.favorite.delete({ where: { id: inconsistent.id } });
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await db.trip.findUniqueOrThrow({ where: { id: ids.tripA }, include: { days: { include: { visits: true } } } }), original);
    assert.equal((await listMyTrips(new Headers(), readDeps, "2026-10-15")).items[0]?.isFavorite, true);
    assert.equal((await getMyTrip(new Headers(), ids.tripA, readDeps, "2026-10-15")).isFavorite, true);

    const duplicate = await addFavoriteResponse(request(ids.tripA, "PUT", "again"), target(ids.tripA), deps);
    assert.equal((await duplicate.json()).data.changed, false);
    const replay = await addFavoriteResponse(request(ids.tripA, "PUT", "add"), target(ids.tripA), deps);
    assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
    assert.equal(await db.favorite.count({ where: { userId: ids.a, tripId: ids.tripA } }), 1);
    await assert.rejects(db.favorite.create({ data: { userId: ids.a, targetType: "TRIP", tripId: ids.tripA } }), { code: "P2002" });
    await assert.rejects(db.favorite.create({ data: { userId: ids.a, targetType: "TRIP" } }));
    await assert.rejects(db.favorite.create({ data: { userId: ids.a, targetType: "TRIP", tripId: ids.tripB, destinationId: ids.destination } }));
    await assert.rejects(db.favorite.create({ data: { userId: ids.a, targetType: "TRIP", tripId: `${prefix}-missing` } }), { code: "P2003" });

    const foreign = await addFavoriteResponse(request(ids.tripB, "PUT", "foreign"), target(ids.tripB), deps);
    const missing = await addFavoriteResponse(request(`${prefix}-missing`, "PUT", "missing"), target(`${prefix}-missing`), deps);
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), await missing.json());
    assert.equal(await db.favorite.count({ where: { userId: ids.a, tripId: ids.tripB } }), 0);
    actor = { id: ids.b, role: "TRAVELER" };
    assert.deepEqual((await getFavorites(new Headers(), readDeps)).trips, []);
    const foreignRelation = await removeRelation(new Headers(), relation.id, `${prefix}-foreign-relation`, readDeps);
    assert.equal(foreignRelation.status, "FAILED");
    if (foreignRelation.status === "FAILED") assert.equal(foreignRelation.httpStatus, 404);
    assert.equal((await listMyTrips(new Headers(), readDeps, "2026-10-15")).items[0]?.isFavorite, false);
    assert.equal((await getMyTrip(new Headers(), ids.tripB, readDeps, "2026-10-15")).isFavorite, false);
    assert.equal((await favoriteStatusResponse(new Request(`http://localhost/api/favorites/status?targetType=trips&targetId=${ids.tripA}`), deps)).status, 404);
    assert.equal((await removeFavoriteResponse(request(ids.tripA, "DELETE", "foreign-remove"), target(ids.tripA), deps)).status, 404);

    actor = null;
    assert.equal((await addFavoriteResponse(request(ids.tripA, "PUT", "guest"), target(ids.tripA), deps)).status, 401);
    actor = { id: ids.admin, role: "ADMIN" };
    assert.equal((await addFavoriteResponse(request(ids.tripA, "PUT", "admin"), target(ids.tripA), deps)).status, 404);
    actor = { id: ids.a, role: "TRAVELER" };
    const removed = await removeFavoriteResponse(request(ids.tripA, "DELETE", "remove"), target(ids.tripA), deps);
    assert.equal((await removed.json()).operationStatus, "SUCCESS");
    assert.equal(await db.favorite.count({ where: { userId: ids.a, tripId: ids.tripA } }), 0);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await db.trip.findUniqueOrThrow({ where: { id: ids.tripA }, include: { days: { include: { visits: true } } } }), original);
    const races = await Promise.all(["race-1", "race-2"].map(key => addFavoriteResponse(request(ids.tripA, "PUT", key), target(ids.tripA), deps)));
    const changed = await Promise.all(races.map(async response => { assert.equal(response.status, 200); return (await response.json()).data.changed; }));
    assert.deepEqual(changed.sort(), [false, true]);
    assert.equal(await db.favorite.count({ where: { userId: ids.a, tripId: ids.tripA } }), 1);
    await removeFavoriteResponse(request(ids.tripA, "DELETE", "remove-race"), target(ids.tripA), deps);
    await addFavoriteResponse(request(ids.tripA, "PUT", "list-remove"), target(ids.tripA), deps);
    const listRelation = (await getFavorites(new Headers(), readDeps)).trips[0]!;
    assert.equal((await removeRelation(new Headers(), listRelation.favoriteId, `${prefix}-list-remove`, readDeps)).status, "SUCCESS");
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await db.trip.findUniqueOrThrow({ where: { id: ids.tripA }, include: { days: { include: { visits: true } } } }), original);
    // Existing hard-delete policy removes only the fixture Trip graph and its Favorite.
    console.log("US34_NO_COPY", JSON.stringify({ before, after: await counts(), ownerUnchanged: true }));
    await addFavoriteResponse(request(ids.tripA, "PUT", "before-delete"), target(ids.tripA), deps);
    assert.equal((await deleteMyTrip(new Headers(), ids.tripA, `${prefix}-delete`, readDeps)).status, "SUCCESS");
    assert.deepEqual((await getFavorites(new Headers(), readDeps)).trips, []);
    assert.equal(await db.favorite.count({ where: { tripId: ids.tripA } }), 0);
    assert.equal(await db.trip.count({ where: { id: ids.tripB } }), 1);
    console.log("US34_DELETED_TRIP", JSON.stringify({ favoriteRemaining: 0, privateListItems: 0, foreignTripRetained: true }));
  } finally {
    await db.favorite.deleteMany({ where: { userId: { in: [ids.a, ids.b] } } });
    await db.idempotencyRecord.deleteMany({ where: { scope: { in: [JSON.stringify([ids.a, "favorite:add"]), JSON.stringify([ids.a, "favorite:remove"]), JSON.stringify([ids.b, "favorite:remove"]), JSON.stringify([ids.a, "trip:delete"])] } } });
    await db.trip.deleteMany({ where: { id: { in: [ids.tripA, ids.tripB] } } });
    await db.destination.deleteMany({ where: { id: ids.destination } });
    await db.user.deleteMany({ where: { id: { in: [ids.a, ids.b, ids.admin] } } });
    await db.$disconnect();
  }
});
