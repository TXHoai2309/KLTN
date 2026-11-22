import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";

// Opt-in: runs only against a disposable loopback database that already has migrations 20261114120000_external_place and
// 20261114130000_trip_unchecked_checks applied. Skipped by default (no URL set). Never point it at Development or Production.
const raw = process.env.UNCHECKED_TRIP_TEST_DATABASE_URL;
describe.skipIf(!raw)("trip.uncheckedChecks columns on disposable PostgreSQL", () => {
  let db: PrismaClient;
  const id = randomUUID();
  const ids = { user: `uc-${id}-u`, trip: `uc-${id}-t`, trip2: `uc-${id}-t2` };
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.searchParams.get("sslmode") !== "disable" || process.env.UNCHECKED_TRIP_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable database.");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    await db.$executeRaw`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES (${ids.user}, 'uc', ${`${ids.user}@example.test`}, true, now(), now())`;
  });
  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "trip" WHERE "userId" = ${ids.user}`;
    await db.$executeRaw`DELETE FROM "user" WHERE "id" = ${ids.user}`;
    await db.$disconnect();
  });
  it("adds two nullable columns: legacy trips read NULL, unchecked items round-trip, nothing else changes", async () => {
    const columns = await db.$queryRaw<{ column_name: string; is_nullable: string }[]>`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'trip' AND column_name IN ('uncheckedChecks','uncheckedConfirmedAt')`;
    expect(columns.map(c => c.column_name).sort()).toEqual(["uncheckedChecks", "uncheckedConfirmedAt"]);
    expect(columns.every(c => c.is_nullable === "YES")).toBe(true);
    await db.trip.create({ data: { id: ids.trip, userId: ids.user, startDate: new Date("2026-12-01"), durationDays: 1, transport: "CAR", updatedAt: new Date() } as never });
    const legacy = await db.trip.findUniqueOrThrow({ where: { id: ids.trip } });
    expect(legacy.uncheckedChecks).toBeNull();
    expect(legacy.uncheckedConfirmedAt).toBeNull();
    const items = [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" }];
    await db.trip.create({ data: { id: ids.trip2, userId: ids.user, startDate: new Date("2026-12-01"), durationDays: 1, transport: "CAR", uncheckedChecks: { revision: "unchecked-save-v1", items }, uncheckedConfirmedAt: new Date() } as never });
    expect((await db.trip.findUniqueOrThrow({ where: { id: ids.trip2 } })).uncheckedChecks).toEqual({ revision: "unchecked-save-v1", items });
  });
});
