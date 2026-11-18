import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { fetchTripEditSnapshot } from "@/lib/trip-edit-client";
import { applyEdit, type ApplyEditDependencies } from "./apply-edit";
import type { EditCandidate } from "./edit-candidate";
import { rebaseEditDraft } from "./edit-rebase";
import { autoShiftDayVisits } from "./edit-workspace-checks";
import { createWorkspaceState, rebaseWorkspaceDraft } from "./edit-workspace-state";
import { getEditSnapshotResponse } from "./trip-edit-http";
import { getTripForEdit, previewEdit } from "./trip-edit-service";

const revision = new Date("2026-10-19T12:00:00.000Z");
// Trip Day 1 = 2026-10-20; 03:30 UTC = 10:30 Asia/Ho_Chi_Minh.
// visit-1 (08:00-09:00 = 480..540) is COMPLETED; visit-2 (13:00-14:00 = 780..840) is REMAINING.
const ongoingNow = new Date("2026-10-20T03:30:00.000Z");

function ongoingFixture() {
  const trip = {
    id: "trip-on-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null as Date | null,
    journeySnapshot: null,
    uncheckedChecks: null,
    days: [
      {
        id: "day-1",
        dayIndex: 1,
        visits: [
          {
            id: "visit-1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destinationId: "dest-1",
            destination: {
              id: "dest-1",
              name: "Điểm 1",
              area: "Đồng Văn",
              category: "cảnh quan",
              latitude: 23.2,
              longitude: 105.3,
              suggestedDurationMinutes: 60,
              minimumDurationMinutes: 30,
              isOutdoor: false,
              visibility: "VISIBLE" as const,
              deletedAt: null,
              media: [],
            },
            externalPlace: null,
          },
          {
            id: "visit-2",
            order: 2,
            startMinute: 780,
            plannedDurationMinutes: 60,
            destinationId: "dest-2",
            destination: {
              id: "dest-2",
              name: "Điểm 2",
              area: "Mèo Vạc",
              category: "văn hóa",
              latitude: 23.1,
              longitude: 105.4,
              suggestedDurationMinutes: 60,
              minimumDurationMinutes: 30,
              isOutdoor: false,
              visibility: "VISIBLE" as const,
              deletedAt: null,
              media: [],
            },
            externalPlace: null,
          },
        ],
      },
    ],
  };

  const catalogRows = [
    {
      id: "dest-1",
      latitude: 23.2,
      longitude: 105.3,
      minimumDurationMinutes: 30,
      openingDays: [
        { dayOfWeek: "TUESDAY" as const, status: "OPEN" as const, intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }] },
      ],
    },
    {
      id: "dest-2",
      latitude: 23.1,
      longitude: 105.4,
      minimumDurationMinutes: 30,
      openingDays: [
        { dayOfWeek: "TUESDAY" as const, status: "OPEN" as const, intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }] },
      ],
    },
  ];

  const records = new Map<string, { scope: string; key: string; requestHash: string; responseJson: string }>();
  let writes = 0;
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "owner-1" }]),
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: "TRAVELER" }) },
    trip: {
      findFirst: async () => structuredClone(trip),
      updateMany: async ({ data }: { data: { updatedAt: Date } }) => {
        writes += 1;
        trip.updatedAt = data.updatedAt;
        return { count: 1 };
      },
    },
    itineraryDay: {
      deleteMany: async () => ({ count: 1 }),
      create: async () => ({ id: "day-new" }),
    },
    tripCompanionPublication: { findUnique: async () => null },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        records.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null,
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
        records.set(`${data.scope}:${data.key}`, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const cur = records.get(`${where.scope_key.scope}:${where.scope_key.key}`);
        if (cur) cur.responseJson = data.responseJson;
        return cur;
      },
    },
  };

  const database = {
    user: tx.user,
    trip: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => (where.userId === "owner-1" && where.id === "trip-on-1" ? structuredClone(trip) : null) },
    destination: { findMany: async () => structuredClone(catalogRows) },
    idempotencyRecord: tx.idempotencyRecord,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };

  const dependencies: ApplyEditDependencies = {
    database: database as unknown as Database,
    authorization: {
      resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
      database: database as unknown as Database,
    },
    getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
  };

  return { trip, dependencies, getWrites: () => writes };
}

describe("Ticket 06 ONGOING protection & 409 Rebase", () => {
  it("classifies completed visits by Asia/Ho_Chi_Minh clock, locks them in preview/apply, and allows future edits", async () => {
    const test = ongoingFixture();

    const page = await getTripForEdit(new Headers(), "trip-on-1", {
      ...test.dependencies.authorization,
      database: test.dependencies.database,
      now: () => ongoingNow,
    });
    expect(page.tripStatus).toBe("ONGOING");
    expect(page.completedVisitIds).toEqual(["visit-1"]);

    // Mutating completed visit-1 is rejected in BOTH previewEdit and applyEdit
    const touchedCompleted: EditCandidate = {
      ...page.candidate,
      days: [{
        dayIndex: 1,
        visits: [
          { visitId: "visit-1", destinationId: "dest-1", startMinute: 500, plannedDurationMinutes: 60, order: 1 },
          page.candidate.days[0]!.visits[1]!,
        ],
      }],
    };
    await expect(
      previewEdit("trip-on-1", "owner-1", revision.toISOString(), touchedCompleted, test.dependencies, ongoingNow),
    ).rejects.toMatchObject({ code: "COMPLETED_VISIT_CHANGED", status: 422 });
    await expect(
      applyEdit(
        new Headers(),
        "trip-on-1",
        "owner-1",
        { baseRevision: revision.toISOString(), candidate: touchedCompleted, confirmed: true, kind: "MANUAL" },
        "ongoing-touch",
        test.dependencies,
        ongoingNow,
      ),
    ).rejects.toMatchObject({ code: "COMPLETED_VISIT_CHANGED", status: 422 });
    expect(test.getWrites()).toBe(0);

    // Editing remaining future visit-2 succeeds!
    const validFutureEdit: EditCandidate = {
      ...page.candidate,
      days: [{
        dayIndex: 1,
        visits: [
          page.candidate.days[0]!.visits[0]!,
          { visitId: "visit-2", destinationId: "dest-2", startMinute: 840, plannedDurationMinutes: 90, order: 2 },
        ],
      }],
    };
    const previewOk = await previewEdit(
      "trip-on-1",
      "owner-1",
      revision.toISOString(),
      validFutureEdit,
      test.dependencies,
      ongoingNow,
    );
    expect(previewOk.validation.canConfirm).toBe(true);

    const applied = await applyEdit(
      new Headers(),
      "trip-on-1",
      "owner-1",
      { baseRevision: revision.toISOString(), candidate: validFutureEdit, confirmed: true, kind: "MANUAL" },
      "ongoing-future-ok",
      test.dependencies,
      ongoingNow,
    );
    expect(applied.status).toBe("SUCCESS");
    expect(test.getWrites()).toBe(1);
  });

  it("excludes locked visits from autoShiftDayVisits", () => {
    const candidate: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 1,
      transport: "CAR",
      days: [{
        dayIndex: 1,
        visits: [
          { visitId: "visit-0", destinationId: "dest-1", startMinute: 420, plannedDurationMinutes: 90, order: 1 },
          { visitId: "visit-locked", destinationId: "dest-2", startMinute: 480, plannedDurationMinutes: 60, order: 2 },
          { visitId: "visit-future", destinationId: "dest-1", startMinute: 500, plannedDurationMinutes: 60, order: 3 },
        ],
      }],
    };
    const shifted = autoShiftDayVisits({
      candidate,
      dayIndex: 1,
      startFromIndex: 0,
      lockedVisitIds: new Set(["visit-locked"]),
    });
    expect(shifted.candidate.days[0]!.visits.find((v) => v.visitId === "visit-locked")!.startMinute).toBe(480);
    expect(shifted.candidate.days[0]!.visits.find((v) => v.visitId === "visit-future")!.startMinute).toBe(555);
  });

  it("enforces owner access & private no-store on snapshot endpoint and rebases workingDraft over 409 conflict without losing uncompleted edits", async () => {
    const test = ongoingFixture();
    const res = await getEditSnapshotResponse(
      new Request("https://example.test/api/trips/trip-on-1/edits/snapshot"),
      "trip-on-1",
      {
        ...test.dependencies.authorization,
        database: test.dependencies.database,
        now: () => ongoingNow,
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.data.completedVisitIds).toEqual(["visit-1"]);

    // Foreign user gets 404 from snapshot endpoint
    const foreignRes = await getEditSnapshotResponse(
      new Request("https://example.test/api/trips/trip-on-1/edits/snapshot"),
      "trip-on-1",
      {
        resolveSession: async () => ({ user: { id: "other-user", role: "TRAVELER" } }),
        database: test.dependencies.database,
      },
    );
    expect(foreignRes.status).toBe(404);

    // Client snapshot fetcher parses valid snapshot
    const fetched = await fetchTripEditSnapshot("trip-on-1", async () =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    expect(fetched.kind).toBe("OK");

    // Rebase keeps future workingDraft edits while restoring newly completed baseline visit-1
    const baseline: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 1,
      transport: "CAR",
      days: [{
        dayIndex: 1,
        visits: [
          { visitId: "visit-1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "visit-2", destinationId: "dest-2", startMinute: 780, plannedDurationMinutes: 60, order: 2 },
        ],
      }],
    };
    const userWorkingDraft: EditCandidate = {
      ...baseline,
      days: [{
        dayIndex: 1,
        visits: [
          { visitId: "visit-1", destinationId: "dest-1", startMinute: 510, plannedDurationMinutes: 60, order: 1 },
          { visitId: "visit-2", destinationId: "dest-2", startMinute: 900, plannedDurationMinutes: 120, order: 2 },
        ],
      }],
    };

    const rebased = rebaseEditDraft({
      workingDraft: userWorkingDraft,
      latestBaseline: baseline,
      latestTripStatus: "ONGOING",
      completedVisitIds: ["visit-1"],
    });
    expect(rebased.lockedRestoredCount).toBe(1);
    expect(rebased.rebasedCandidate.days[0]!.visits[0]!.startMinute).toBe(480); // Restored locked visit-1
    expect(rebased.rebasedCandidate.days[0]!.visits[1]!.startMinute).toBe(900); // Preserved user edit on visit-2

    const ws0 = createWorkspaceState("2026-10-19T12:00:00.000Z", baseline);
    const wsRebased = rebaseWorkspaceDraft(ws0, {
      nextRevision: "2026-10-20T04:00:00.000Z",
      nextBaseline: baseline,
      nextWorkingDraft: rebased.rebasedCandidate,
    });
    expect(wsRebased.baseRevision).toBe("2026-10-20T04:00:00.000Z");
    expect(wsRebased.workingDraft.days[0]!.visits[1]!.startMinute).toBe(900);
  });
});
