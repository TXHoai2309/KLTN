import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { companionItineraryChanges } from "../trip-companions/companion-itinerary-notice";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { savedJourneySchema } from "../trip-origin/journey-saved-contract";
import { applyEdit, type ApplyEditDependencies } from "./apply-edit";
import type { EditCandidate } from "./edit-candidate";
import { rescheduleDraftFromOrigin, type PreviewJourneySummary } from "./edit-journey-helper";
import { countWorkspaceChanges } from "./edit-workspace-state";
import { previewEdit } from "./trip-edit-service";

const revision = new Date("2026-10-15T12:00:00.000Z");
const nowBeforeTrip = new Date("2026-10-16T00:00:00.000Z");

function fixture() {
  const trip = {
    id: "trip-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null as Date | null,
    journeySnapshot: null as unknown,
    days: [
      {
        id: "day-1",
        dayIndex: 1,
        visits: [
          {
            id: "visit-1",
            order: 1,
            startMinute: 600, // 10:00
            plannedDurationMinutes: 60,
            destinationId: "destination-1",
            destination: {
              id: "destination-1",
              name: "Quản Bạ",
              area: "Hà Giang",
              visibility: "VISIBLE" as const,
            },
          },
        ],
      },
    ],
  };

  const companionMessages: { text: string; notice: unknown }[] = [];
  const writtenSnapshots: unknown[] = [];
  const records = new Map<string, { scope: string; key: string; requestHash: string; responseJson: string }>();

  const destinations = [
    {
      id: "destination-1",
      latitude: 23.06,
      longitude: 105.0,
      minimumDurationMinutes: 30,
      openingDays: [
        {
          dayOfWeek: "TUESDAY" as const,
          status: "OPEN" as const,
          intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
        },
      ],
    },
  ];

  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "owner-1" }]),
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async () => structuredClone(trip),
      updateMany: async ({ data }: { data: { updatedAt: Date; journeySnapshot?: unknown } }) => {
        trip.updatedAt = data.updatedAt;
        if ("journeySnapshot" in data) {
          trip.journeySnapshot = data.journeySnapshot;
          writtenSnapshots.push(data.journeySnapshot);
        }
        return { count: 1 };
      },
    },
    itineraryDay: {
      deleteMany: async () => ({ count: 1 }),
      create: async () => ({ id: "day-new" }),
    },
    tripCompanionPublication: {
      findUnique: async () => ({ id: "pub-1" }),
      update: async () => ({ messageSequence: 1, itineraryRevision: 2 }),
    },
    tripCompanionMessage: {
      create: async ({ data }: { data: { text: string; notice: unknown } }) => {
        companionMessages.push(data);
        return data;
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => {
        return records.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null;
      },
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
        records.set(`${data.scope}:${data.key}`, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const k = `${where.scope_key.scope}:${where.scope_key.key}`;
        const cur = records.get(k);
        if (cur) cur.responseJson = data.responseJson;
        return cur;
      },
    },
  };

  const database = {
    user: tx.user,
    trip: { findFirst: tx.trip.findFirst },
    destination: {
      findMany: async () => structuredClone(destinations),
    },
    idempotencyRecord: tx.idempotencyRecord,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };

  let routeSeconds = 3600; // 60 mins
  const dependencies: ApplyEditDependencies = {
    database: database as unknown as Database,
    authorization: {
      resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
      database: database as unknown as Database,
    },
    getRoute: async () => ({
      kind: "ok",
      durationSeconds: routeSeconds,
      distanceMeters: 42000,
    }),
  };

  return {
    trip,
    dependencies,
    companionMessages,
    writtenSnapshots,
    setRouteSeconds: (sec: number) => {
      routeSeconds = sec;
    },
  };
}

describe("Ticket 04 integrated Trip origin & journeySnapshot", () => {
  it("validates outbound/return legs + roadside rest in preview without mutating visit clocks", async () => {
    const test = fixture();
    test.setRouteSeconds(7500); // 125 mins (> 120 threshold => 15 min roadside rest, arrival 06:00 + 125 + 15 = 08:20)
    const candidate: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "visit-1", destinationId: "destination-1", startMinute: 600, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        origin: {
          ...COMPLETE_JOURNEY_FIXTURE.origin!,
          label: "Nhà riêng Bí mật số 99",
        },
        departureMinute: 360, // 06:00
        returnDeadlineMinute: 1200, // 20:00
      },
    };

    const preview = await previewEdit(
      "trip-1",
      "owner-1",
      revision.toISOString(),
      candidate,
      test.dependencies,
      nowBeforeTrip,
    );

    expect(preview.validation.canConfirm).toBe(true);
    expect(preview.candidate.days[0]!.visits[0]!.startMinute).toBe(600);
    expect(preview.journeySummary).toMatchObject({
      outboundRestMinutes: 15,
      estimatedArrivalAtFirstMinute: 500, // 360 + 125 + 15 = 500 (08:20)
      returnDeadlineMinute: 1200,
    });
  });

  it("flags early arrival and return deadline miss in preview and atomically updates journeySnapshot without leaking private origin in companion notices", async () => {
    const test = fixture();
    test.setRouteSeconds(10_800); // 3 hours + 15m rest = 195 mins -> from 08:00 arrives 11:15 (> 10:00 start!)
    const candidateEarly: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "visit-1", destinationId: "destination-1", startMinute: 600, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
      journey: {
        ...COMPLETE_JOURNEY_FIXTURE,
        origin: {
          label: "Tọa độ bí mật 123 Hoàng Diệu",
          latitude: 21.0333,
          longitude: 105.8499,
          source: "MANUAL",
          confirmed: true,
        },
        departureMinute: 480, // 08:00
        returnDeadlineMinute: 720, // 12:00 deadline (impossible!)
      },
    };

    const failedPreview = await previewEdit(
      "trip-1",
      "owner-1",
      revision.toISOString(),
      candidateEarly,
      test.dependencies,
      nowBeforeTrip,
    );
    // ADR-57 (D1): RETURN_DEADLINE_MISSED là advisory không chặn lưu; JOURNEY_ARRIVAL_TOO_EARLY vẫn là blocker cứng.
    expect(failedPreview.validation.canConfirm).toBe(false);
    expect(failedPreview.validation.groups.travelTime.findings.map((f) => f.reasonCode)).toEqual(
      expect.arrayContaining(["JOURNEY_ARRIVAL_TOO_EARLY"]),
    );
    const lateArrival = failedPreview.validation.groups.travelTime.findings.find((f) => f.reasonCode === "JOURNEY_ARRIVAL_TOO_EARLY");
    expect(lateArrival?.message).toContain("muộn hơn giờ bắt đầu lượt đầu tiên");
    expect(failedPreview.validation.advisories?.map((f) => f.reasonCode)).toEqual(
      expect.arrayContaining(["RETURN_DEADLINE_MISSED"]),
    );

    const lateReturnOnlyPreview = await previewEdit(
      "trip-1",
      "owner-1",
      revision.toISOString(),
      {
        ...candidateEarly,
        journey: {
          ...candidateEarly.journey!,
          departureMinute: 360, // 06:00 -> arrives 09:15 (before 10:00 visit start)
          returnDeadlineMinute: 800, // 13:20 < 14:15 return arrival -> advisory only
        },
      },
      test.dependencies,
      nowBeforeTrip,
    );
    expect(lateReturnOnlyPreview.validation.canConfirm).toBe(true);
    expect(lateReturnOnlyPreview.validation.advisories?.map((f) => f.reasonCode)).toEqual(
      expect.arrayContaining(["RETURN_DEADLINE_MISSED"]),
    );

    // Fix route to 60 mins + late deadline, then apply!
    test.setRouteSeconds(3600);
    const validCandidate: EditCandidate = {
      ...candidateEarly,
      journey: {
        ...candidateEarly.journey!,
        departureMinute: 420, // 07:00 -> arrives 08:00 (before 10:00 visit start)
        returnDeadlineMinute: 1200, // 20:00 -> visit ends 11:00 -> returns 12:00
      },
    };

    const outcome = await applyEdit(
      new Headers(),
      "trip-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        candidate: validCandidate,
        confirmed: true,
        kind: "MANUAL",
      },
      "journey-apply-key",
      test.dependencies,
      nowBeforeTrip,
    );

    expect(outcome.status).toBe("SUCCESS");
    expect(test.writtenSnapshots).toHaveLength(1);
    const saved = savedJourneySchema.parse(test.writtenSnapshots[0]);
    expect(saved.visitFingerprint).toBeTruthy();
    expect(saved.plan?.legs.map((l) => l.kind)).toEqual(["OUTBOUND", "RETURN"]);

    // Companion notification must NOT leak origin label, coordinates, address, or distance
    expect(test.companionMessages).toHaveLength(1);
    const serializedNotice = JSON.stringify(test.companionMessages[0]);
    expect(serializedNotice).not.toContain("Hoàng Diệu");
    expect(serializedNotice).not.toContain("21.0333");
    expect(serializedNotice).not.toContain("105.8499");
  });

  it("blocks changing journey after departure cutoff while detecting dirty journey changes and explicit opt-in reschedule", async () => {
    const test = fixture();
    const afterDeparture = new Date("2026-10-20T05:00:00.000Z"); // 12:00 Vietnam on Day 1
    const withJourney: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 1,
      transport: "CAR",
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "visit-1", destinationId: "destination-1", startMinute: 600, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
    };

    await expect(
      previewEdit(
        "trip-1",
        "owner-1",
        revision.toISOString(),
        withJourney,
        test.dependencies,
        afterDeparture,
      ),
    ).rejects.toMatchObject({ code: "JOURNEY_CHANGE_CLOSED" });

    // Reschedule helper updates Day 1 clocks explicitly when invoked
    const summary: PreviewJourneySummary = {
      outboundDurationSeconds: 3600,
      outboundDistanceMeters: 42000,
      outboundRestMinutes: 0,
      estimatedArrivalAtFirstMinute: 540, // 09:00
      firstVisitStartMinute: 600,
      returnDurationSeconds: 3600,
      returnDistanceMeters: 42000,
      returnRestMinutes: 0,
      estimatedReturnArrivalMinute: 660,
      returnDeadlineMinute: 1200,
    };
    const rescheduled = rescheduleDraftFromOrigin(withJourney, summary);
    expect(rescheduled.overflowMessage).toBeNull();
    expect(rescheduled.candidate.days[0]!.visits[0]!.startMinute).toBe(540);

    // Workspace change counter and companion notice treat journey edit as a trackable change
    const baseline: EditCandidate = { ...withJourney, journey: undefined };
    expect(countWorkspaceChanges(baseline, withJourney)).toBe(1);
    expect(companionItineraryChanges(baseline, withJourney).times).toBe(true);
  });
});
