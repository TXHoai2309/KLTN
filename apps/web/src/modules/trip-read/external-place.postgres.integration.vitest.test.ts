import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";

// Opt-in: runs only against a disposable loopback database that already has migration
// 20261114120000_external_place applied. Skipped by default (no URL set).
const raw = process.env.EXTERNAL_PLACE_TEST_DATABASE_URL;
describe.skipIf(!raw)("ItineraryVisit exactly-one-place CHECK on disposable PostgreSQL", () => {
  let db: PrismaClient;
  const id = randomUUID();
  const ids = { user: `ep-${id}-u`, trip: `ep-${id}-t`, day: `ep-${id}-d`, dest: `ep-${id}-dest`, ext: `ep-${id}-ext` };
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.searchParams.get("sslmode") !== "disable" || process.env.EXTERNAL_PLACE_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function visit(order: number, destinationId: string | null, externalPlaceId: string | null) {
    return db.$executeRaw`INSERT INTO "itinerary_visit" ("id","dayId","destinationId","externalPlaceId","startMinute","plannedDurationMinutes","order") VALUES (${`${id}-v${order}`}, ${ids.day}, ${destinationId}, ${externalPlaceId}, 480, 60, ${order})`;
  }
  it("accepts one reference and rejects both or neither", async () => {
    await db.$executeRaw`INSERT INTO "external_place" ("id","provider","providerPlaceId","source","fetchedAt","updatedAt") VALUES (${ids.ext}, 'GOOGLE_PLACES', ${`pid-${id}`}, 'test', now(), now())`;
    await expect(db.$executeRaw`INSERT INTO "external_place" ("id","provider","providerPlaceId","source","fetchedAt","updatedAt") VALUES (${`${ids.ext}-dup`}, 'GOOGLE_PLACES', ${`pid-${id}`}, 'test', now(), now())`).rejects.toThrow();
    // A day/trip/destination fixture is environment-specific; the CHECK is evaluated before FK checks fail,
    // so "neither" and "both" must be rejected by the CHECK regardless of fixtures.
    await expect(visit(1, null, null)).rejects.toThrow(/exactly_one_place|check constraint/i);
    await expect(visit(2, ids.dest, ids.ext)).rejects.toThrow(/exactly_one_place|check constraint/i);
    await db.$executeRaw`DELETE FROM "external_place" WHERE "id" = ${ids.ext}`;
  });
});
