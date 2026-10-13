import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "./planner-candidates";
import { createPlannerService } from "./planner-service";
import { fakeRoutes, referenceTime, requirement } from "./__fixtures__/planner-fixtures";
const raw = process.env.US28_TEST_DATABASE_URL;
const suite = raw ? describe : describe.skip;
suite("planner repository against actual disposable PostgreSQL migrations", () => {
  let db: PrismaClient;
  const ids = ["visible", "hidden"].map(label => `us28-test-${label}-${randomUUID()}`);
  beforeAll(async () => {
    const target = new URL(raw!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/us28_test" || target.username !== "us28_test" || target.searchParams.get("sslmode") !== "disable" || process.env.US28_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER") throw new Error("Refusing non-disposable US28 database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (identity[0]?.name !== "us28_test") throw new Error("Unexpected disposable identity");
    for (const [index, id] of ids.entries()) await db.destination.create({ data: { id, name: "TEST only", description: "Synthetic integration data", area: "TEST", category: "thiên nhiên", latitude: 23, longitude: 105,
      visibility: index === 0 ? "VISIBLE" : "HIDDEN", minimumDurationMinutes: 30, suggestedDurationMinutes: 60,
      openingDays: { create: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek: dayOfWeek as "MONDAY", status: "OPEN", intervals: { create: { opensAtMinute: 480, closesAtMinute: 1080 } } })) },
      media: { create: { url: "https://example.com/test.jpg", alt: "TEST", websiteRights: "UNKNOWN" } } } });
  });
  afterAll(async () => { if (!db) return; await db.contentMedia.deleteMany({ where: { destinationId: { in: ids } } }); await db.destination.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
  it("retrieves visible sources, nested hours and excludes unapproved media", async () => {
    const rows = await retrievePlannerCandidates(db); expect(rows.map(row => row.id)).toEqual([ids[0]]); expect(rows[0]!.image).toBeNull(); expect(rows[0]!.openingDays).toHaveLength(7); expect(rows[0]!.openingDays[0]!.intervals).toHaveLength(1);
    expect(await recheckPlannerCandidates(db, rows)).toBe(true);
  });
  it("detects child opening-hour changes even without updating parent revision", async () => {
    const rows = await retrievePlannerCandidates(db); const opening = await db.openingDay.findFirstOrThrow({ where: { destinationId: ids[0] } });
    await db.openingInterval.updateMany({ where: { openingDayId: opening.id }, data: { closesAtMinute: 1000 } });
    expect(await recheckPlannerCandidates(db, rows)).toBe(false);
  });
  it("cached replay rechecks revoked visibility and cannot return a stale proposal", async () => {
    const service = createPlannerService({ repository: { candidates: () => retrievePlannerCandidates(db), recheck: rows => recheckPlannerCandidates(db, rows) }, routes: fakeRoutes, now: () => referenceTime });
    const result = await service.propose("test", "postgres-replay", { ...requirement, durationDays: 1 }); expect(result.days[0]!.stops).toHaveLength(1);
    await db.destination.update({ where: { id: ids[0] }, data: { visibility: "HIDDEN" } });
    await expect(service.propose("test", "postgres-replay", { ...requirement, durationDays: 1 })).rejects.toMatchObject({ code: "PLANNER_DATA_CHANGED" });
  });
});
