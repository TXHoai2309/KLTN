import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { weekdays } from "../destination/destination-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { getMyTrip } from "../trip-read/trip-read-service";
import type { ExternalPlaceResolver } from "../trip-save/external-place-resolver";
import { tripSaveRequestSchema } from "./trip-save-contract";
import { saveTrip, type TripSaveDependencies } from "./trip-save-service";

const raw = process.env.ORIGIN_SAVE_TEST_DATABASE_URL;
describe.skipIf(!raw)("Ticket 11: chosen lodging Save/read/idempotency/ownership on disposable PostgreSQL", () => {
  let db: PrismaClient;
  const prefix = `lodging11-${randomUUID()}`;
  const owner = `${prefix}-owner`;
  const stranger = `${prefix}-stranger`;
  const destA = `${prefix}-dest-a`;
  const destB = `${prefix}-dest-b`;
  const now = new Date("2030-11-14T00:00:00Z");
  const headers = new Headers();

  const okResolver: ExternalPlaceResolver = async placeIds => ({
    status: "OK",
    places: new Map(
      placeIds.map(placeId => [placeId, { placeId, name: "HomeStay Minh Đức", latitude: 23.0468, longitude: 104.9885 }]),
    ),
  });

  const deps = (userId: string | null = owner, resolveExternalPlaces: ExternalPlaceResolver = okResolver): TripSaveDependencies => ({
    database: db,
    resolveSession: async () => (userId ? { user: { id: userId } } : null),
    getRoute: async () => ({ kind: "ok", provider: "STADIA_MAPS", durationSeconds: 3600, distanceMeters: 50_000 }),
    resolveExternalPlaces,
  });

  const payload = () =>
    tripSaveRequestSchema.parse({
      confirm: true,
      proposal: {
        startDate: "2030-11-15",
        durationDays: 2,
        transport: "CAR",
        journey: COMPLETE_JOURNEY_FIXTURE,
        days: [
          { dayIndex: 1, visits: [{ destinationId: destA, startMinute: 600, plannedDurationMinutes: 60, order: 1 }] },
          { dayIndex: 2, visits: [{ destinationId: destB, startMinute: 600, plannedDurationMinutes: 60, order: 1 }] },
        ],
      },
      chosenLodgings: [{ nightIndex: 1, placeId: "ChIJ_lodging_pg_1", name: "HomeStay Minh Đức" }],
    });

  beforeAll(async () => {
    const target = new URL(raw!);
    if (
      target.hostname !== "127.0.0.1" ||
      target.pathname !== "/origin06_test" ||
      target.username !== "origin06_test" ||
      target.searchParams.get("sslmode") !== "disable" ||
      process.env.ORIGIN_SAVE_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER"
    ) {
      throw new Error("Refusing non-owned disposable database");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    for (const id of [owner, stranger]) {
      await db.user.create({ data: { id, email: `${id}@example.invalid`, name: "Synthetic traveler", role: "TRAVELER" } });
    }
    for (const [id, name] of [[destA, "Synthetic Stop A"], [destB, "Synthetic Stop B"]] as const) {
      await db.destination.create({
        data: {
          id,
          name,
          description: "Synthetic fixture",
          area: "Hà Giang",
          category: "TEST",
          latitude: 22.8233,
          longitude: 104.9836,
          visibility: "VISIBLE",
          minimumDurationMinutes: 30,
          suggestedDurationMinutes: 60,
          openingDays: { create: weekdays.map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: { create: { opensAtMinute: 480, closesAtMinute: 1080 } } })) },
        },
      });
    }
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("saves chosen lodging through ExternalPlace, replays idempotently without duplicates, and enforces owner isolation", async () => {
    const key = `lodging-pg-${randomUUID()}`;
    const body = payload();
    const first = await saveTrip(headers, body, key, deps(owner), now);
    expect(first.status).toBe("SUCCESS");
    if (first.status !== "SUCCESS") throw new Error("Save failed");

    const replay = await saveTrip(headers, body, key, deps(owner, async () => ({ status: "UNAVAILABLE" })), now);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: { tripId: first.data.tripId } });

    const rows = await db.tripChosenLodging.findMany({ where: { tripId: first.data.tripId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nightIndex).toBe(1);

    const own = await getMyTrip(headers, first.data.tripId, deps(owner), "2030-11-14", now);
    expect(own.chosenLodgings).toMatchObject([{ nightIndex: 1, placeId: "ChIJ_lodging_pg_1", name: "HomeStay Minh Đức" }]);

    await expect(getMyTrip(headers, first.data.tripId, deps(stranger), "2030-11-14", now)).rejects.toMatchObject({
      code: "TRIP_NOT_FOUND",
    });
  });

  it("fails clearly without writing rows when a chosen lodging cannot be resolved", async () => {
    const key = `lodging-unresolvable-${randomUUID()}`;
    await expect(saveTrip(headers, payload(), key, deps(owner, async () => ({ status: "UNAVAILABLE" })), now)).rejects.toMatchObject({
      code: "EXTERNAL_PLACE_UNAVAILABLE",
      status: 503,
    });
    expect(await db.idempotencyRecord.count({ where: { scope: JSON.stringify([owner, "trip:create"]), key } })).toBe(0);
  });
});
