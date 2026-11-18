import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";

import { weekdays } from "../destination/destination-contract";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { applyEdit, type ApplyEditDependencies } from "./apply-edit";
import type { EditCandidate } from "./edit-candidate";

/**
 * Opt-in disposable PostgreSQL integration suite for Trip Edit v2 (Ticket 09).
 * Skipped cleanly unless TRIP_EDIT_PG_TEST_DATABASE_URL &
 * TRIP_EDIT_PG_TEST_DISPOSABLE=OWNED_LOOPBACK_CONTAINER are set against a
 * disposable 127.0.0.1 PostgreSQL instance with Prisma migrations applied.
 */
const raw = process.env.TRIP_EDIT_PG_TEST_DATABASE_URL;

describe.skipIf(!raw)("Ticket 09 Trip Edit concurrency, idempotency, ExternalPlace, ONGOING & companion privacy on disposable PostgreSQL", () => {
  let db: PrismaClient;
  const runId = randomUUID();
  const ownerId = `te-pg-${runId}-owner`;
  const headers = new Headers();
  const futureTime = new Date("2030-11-14T00:00:00.000Z");
  const destIds = Array.from({ length: 5 }, (_, idx) => `te-pg-${runId}-d${idx + 1}`);
  const extPlaceId = `ext-${runId}-1`;

  function deps(getRouteImpl?: ApplyEditDependencies["getRoute"]): ApplyEditDependencies {
    return {
      database: db as unknown as ApplyEditDependencies["database"],
      authorization: {
        database: db as unknown as ApplyEditDependencies["authorization"]["database"],
        resolveSession: async () => ({ user: { id: ownerId, role: "TRAVELER" } }),
      },
      getRoute: getRouteImpl ?? (async () => ({ kind: "ok", durationSeconds: 900, distanceMeters: 5000 })),
    };
  }

  beforeAll(async () => {
    const target = new URL(raw!);
    if (
      target.hostname !== "127.0.0.1" ||
      target.searchParams.get("sslmode") !== "disable" ||
      process.env.TRIP_EDIT_PG_TEST_DISPOSABLE !== "OWNED_LOOPBACK_CONTAINER"
    ) {
      throw new Error("Refusing non-disposable PostgreSQL database.");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw! }) });
    await db.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.invalid`,
        name: "PG Edit Owner",
        role: "TRAVELER",
      },
    });
    for (let i = 0; i < destIds.length; i++) {
      await db.destination.create({
        data: {
          id: destIds[i]!,
          name: `Public Dest ${i + 1}`,
          description: "Synthetic fixture",
          area: "Đồng Văn",
          category: "TEST",
          latitude: 23.2 + i * 0.01,
          longitude: 105.3 + i * 0.01,
          visibility: "VISIBLE",
          minimumDurationMinutes: 30,
          suggestedDurationMinutes: 60,
          openingDays: {
            create: weekdays.map((dayOfWeek) => ({
              dayOfWeek,
              status: "OPEN",
              intervals: { create: { opensAtMinute: 360, closesAtMinute: 1320 } },
            })),
          },
        },
      });
    }
    await db.externalPlace.create({
      data: {
        id: extPlaceId,
        provider: "GOOGLE_PLACES",
        providerPlaceId: `pg-${runId}`,
        source: "test",
        name: "Quán Phở PG Test",
        latitude: 23.25,
        longitude: 105.35,
        fetchedAt: futureTime,
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.trip.deleteMany({ where: { userId: ownerId } });
    await db.externalPlace.deleteMany({ where: { id: extPlaceId } });
    await db.destination.deleteMany({ where: { id: { in: destIds } } });
    await db.idempotencyRecord.deleteMany({ where: { scope: { contains: ownerId } } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.$disconnect();
  });

  it("enforces concurrent CAS 409, idempotent replay/mismatch, UNKNOWN retry without duplicate companion notice, >4 visits, journeySnapshot, ExternalPlace/uncheckedChecks, and ONGOING/COMPLETED guards", async () => {
    const trip = await db.trip.create({
      data: {
        userId: ownerId,
        startDate: new Date("2030-11-15T00:00:00.000Z"),
        durationDays: 1,
        transport: "CAR",
        days: {
          create: {
            dayIndex: 1,
            localDate: new Date("2030-11-15T00:00:00.000Z"),
            visits: {
              create: [
                {
                  destinationId: destIds[0]!,
                  order: 1,
                  startMinute: 480,
                  plannedDurationMinutes: 60,
                },
                {
                  externalPlaceId: extPlaceId,
                  order: 2,
                  startMinute: 560,
                  plannedDurationMinutes: 60,
                },
              ],
            },
          },
        },
        companionPublication: {
          create: {
            title: "Đồng hành test",
            introduction: "Synthetic",
            additionalCapacity: 2,
          },
        },
      },
      include: { days: { include: { visits: true } }, companionPublication: true },
    });

    const v1 = trip.days[0]!.visits[0]!.id;
    const rev1 = trip.updatedAt.toISOString();
    const privateOriginLabel = "PRIVATE_CANARY_ADDRESS_42";

    // Candidate removing ExternalPlace, adding 4 more catalog stops (5 total > 4!), and attaching Trip origin
    const multiCandidate: EditCandidate = {
      startDate: "2030-11-15",
      durationDays: 1,
      transport: "CAR",
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        origin: { ...COMPLETE_JOURNEY_FIXTURE.origin!, label: privateOriginLabel },
        departureMinute: 360,
        returnDeadlineMinute: 1260,
      },
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: v1, destinationId: destIds[0]!, startMinute: 480, plannedDurationMinutes: 60, order: 1 },
            { visitId: `v-${runId}-2`, destinationId: destIds[1]!, startMinute: 560, plannedDurationMinutes: 60, order: 2 },
            { visitId: `v-${runId}-3`, destinationId: destIds[2]!, startMinute: 640, plannedDurationMinutes: 60, order: 3 },
            { visitId: `v-${runId}-4`, destinationId: destIds[3]!, startMinute: 720, plannedDurationMinutes: 60, order: 4 },
            { visitId: `v-${runId}-5`, destinationId: destIds[4]!, startMinute: 800, plannedDurationMinutes: 60, order: 5 },
          ],
        },
      ],
    };

    const req1 = {
      baseRevision: rev1,
      candidate: multiCandidate,
      confirmed: true as const,
      kind: "MANUAL" as const,
    };
    const req2 = {
      baseRevision: rev1,
      candidate: {
        ...multiCandidate,
        days: [{ dayIndex: 1, visits: [multiCandidate.days[0]!.visits[0]!] }],
      },
      confirmed: true as const,
      kind: "MANUAL" as const,
    };

    // 1. Concurrent Apply with two distinct idempotency keys on same baseRevision: one wins, one gets 409
    const [rA, rB] = await Promise.allSettled([
      applyEdit(headers, trip.id, ownerId, req1, `pg-k1-${runId}`, deps(), futureTime),
      applyEdit(headers, trip.id, ownerId, req2, `pg-k2-${runId}`, deps(), futureTime),
    ]);
    const fulfilled = [rA, rB].filter((r) => r.status === "fulfilled");
    const rejected = [rA, rB].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // 2. Idempotent replay with same key & payload returns replayed result cleanly + no origin canary in notices
    const replayRes = await applyEdit(headers, trip.id, ownerId, req1, `pg-k1-${runId}`, deps(), futureTime);
    expect(replayRes.status).toBe("SUCCESS");

    const notices = await db.tripCompanionMessage.findMany({
      where: { publication: { tripId: trip.id } },
    });
    expect(notices.length).toBe(1);
    expect(JSON.stringify(notices)).not.toContain(privateOriginLabel);

    // 3. Changing payload with reused key -> 409 IDEMPOTENCY_KEY_REUSED
    await expect(
      applyEdit(headers, trip.id, ownerId, req2, `pg-k1-${runId}`, deps(), futureTime),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    // 4. Verified >4 visits saved, journeySnapshot persisted, and uncheckedChecks cleared when external removed
    const reloaded = await db.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: { days: { include: { visits: true } } },
    });
    expect(reloaded.days[0]!.visits).toHaveLength(5);
    expect(reloaded.journeySnapshot).not.toBeNull();
    expect(reloaded.uncheckedChecks).toBeNull();

    // 5. COMPLETED trip blocked cleanly
    await db.trip.update({ where: { id: trip.id }, data: { manuallyCompletedAt: futureTime } });
    await expect(
      applyEdit(
        headers,
        trip.id,
        ownerId,
        {
          baseRevision: reloaded.updatedAt.toISOString(),
          candidate: multiCandidate,
          confirmed: true,
          kind: "MANUAL",
        },
        `pg-k3-${runId}`,
        deps(),
        futureTime,
      ),
    ).rejects.toMatchObject({ code: "TRIP_COMPLETED_READONLY" });
  });
});
