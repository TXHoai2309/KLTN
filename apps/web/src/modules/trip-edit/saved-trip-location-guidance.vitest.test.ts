import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { createAiEditProposal } from "./ai-edit-service";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";

const revision = new Date("2026-10-15T12:00:00.000Z");
const upcomingTime = new Date("2026-10-18T08:00:00.000Z");
// 11:00 Asia/Ho_Chi_Minh on 2026-10-20 (Day 1): v1 (08:00-09:00) is LOCKED; v2 & v3 remain UNLOCKED!
const ongoingAt1100Vn = new Date("2026-10-20T04:00:00.000Z");

const locationPlan = (topic: "LOCATION_GUIDANCE" | "TRAVEL_TIME" | "REST_BUFFER" = "LOCATION_GUIDANCE"): WorkspacePlanModelOutput => ({
  mode: "ADVISED",
  operations: [],
  originClocks: {
    departureTime: null,
    returnDeadlineTime: null,
    returnDepartureTime: null,
    rescheduleDayOne: false,
  },
  adviceFocus: { dayIndex: 1, topic },
  candidateVisitIds: [],
  candidateDestinationIds: [],
  affected: { visitIds: [], dayIndexes: [1] },
  clarificationReason: null,
});

function createLocationFixture() {
  const openFull = [
    {
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
    },
  ];
  const catalog = [
    {
      id: "dest-locked",
      name: "Cổng Trời Quản Bạ",
      area: "Quản Bạ",
      category: "SCENIC",
      latitude: 23.07,
      longitude: 104.99,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
    {
      id: "dest-next-1",
      name: "Dinh Vua Mèo",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.26,
      longitude: 105.23,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
    {
      id: "dest-next-2",
      name: "Phố Cổ Đồng Văn",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
    {
      id: "dest-nearby",
      name: "Chợ Đồng Văn",
      area: "Đồng Văn",
      category: "MARKET",
      latitude: 23.272,
      longitude: 105.362,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
  ];

  const tripRow = {
    id: "trip-loc-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null,
    journeySnapshot: null,
    days: [
      {
        dayIndex: 1,
        visits: [
          {
            id: "v-locked",
            order: 1,
            startMinute: 480, // 08:00 (already past at 11:00 -> locked)
            plannedDurationMinutes: 60,
            externalPlace: null,
            destination: {
              id: "dest-locked",
              name: "Cổng Trời Quản Bạ",
              area: "Quản Bạ",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
          {
            id: "v-next-1",
            order: 2,
            startMinute: 690, // 11:30 (unlocked at 11:00)
            plannedDurationMinutes: 90,
            externalPlace: null,
            destination: {
              id: "dest-next-1",
              name: "Dinh Vua Mèo",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
          {
            id: "v-next-2",
            order: 3,
            startMinute: 840, // 14:00 (unlocked)
            plannedDurationMinutes: 90,
            externalPlace: null,
            destination: {
              id: "dest-next-2",
              name: "Phố Cổ Đồng Văn",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
        ],
      },
    ],
  };

  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: { findFirst: async () => tripRow },
    destination: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        if (!ids) return catalog;
        return catalog.filter((d) => ids.includes(d.id));
      },
    },
  };

  const draft: EditCandidate = {
    startDate: "2026-10-20",
    durationDays: 1,
    transport: "CAR",
    days: [
      {
        dayIndex: 1,
        visits: [
          { visitId: "v-locked", destinationId: "dest-locked", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "v-next-1", destinationId: "dest-next-1", startMinute: 690, plannedDurationMinutes: 90, order: 2 },
          { visitId: "v-next-2", destinationId: "dest-next-2", startMinute: 840, plannedDurationMinutes: 90, order: 3 },
        ],
      },
    ],
  };

  return { database, draft };
}

describe("Saved-trip assistant Ticket 06: Conditional ONGOING GPS & manual location guidance", () => {
  it("never prompts for GPS on UPCOMING trips or non-location ONGOING questions", async () => {
    const { database, draft } = createLocationFixture();

    const upcomingRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Gần chỗ tôi đang đứng có điểm nào ghé được không?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      upcomingTime,
    );

    expect(upcomingRes.status).toBe("ADVISED");
    expect(upcomingRes.status).not.toBe("NEEDS_LOCATION");

    // Non-location ONGOING schedule question runs directly without demanding GPS
    let step = 0;
    const ongoingRestRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Đoàn mệt muốn nghỉ thêm 1 tiếng rồi đi tiếp",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => {
            step += 1;
            if (step === 1) return { rawText: JSON.stringify(locationPlan("REST_BUFFER")), model: "step-1" };
            throw new Error("Force deterministic summary");
          },
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      ongoingAt1100Vn,
    );

    expect(ongoingRestRes.status).toBe("ADVISED");
  });

  it("returns NEEDS_LOCATION on ONGOING location-dependent prompt without coords, then resumes with route ETA & preserveCompleted", async () => {
    const { database, draft } = createLocationFixture();
    const pendingMessage = "Tôi đang bị kẹt xe ở đây thì chiều nay đi tiếp những điểm nào kịp?";

    const firstTurn = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: pendingMessage,
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
      },
      ongoingAt1100Vn,
    );

    expect(firstTurn.status).toBe("NEEDS_LOCATION");
    if (firstTurn.status !== "NEEDS_LOCATION") return;
    expect(firstTurn.pendingMessage).toBe(pendingMessage);

    // Step 2 after GPS/manual coordinate arrives: uses getRoute from current position to next unlocked visit
    const routeSpy = vi.fn(
      async (_input: { origin: { latitude: number; longitude: number } }) => ({
        kind: "ok" as const,
        durationSeconds: 3000, // 50m drive -> ETA from 11:00 = 11:50 (shifts unlocked v-next-1 to >= 11:50)
        distanceMeters: 30000,
      }),
    );

    let llmCalls = 0;
    const resumedTurn = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: firstTurn.pendingMessage,
        draft,
        location: {
          source: "GPS",
          latitude: 23.18,
          longitude: 105.12,
          accuracyMeters: 18,
          capturedAt: ongoingAt1100Vn.toISOString(),
        },
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => {
            llmCalls += 1;
            if (llmCalls === 1) return { rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")), model: "step-1" };
            throw new Error("Force deterministic summary");
          },
        },
        getRoute: routeSpy,
      },
      ongoingAt1100Vn,
    );

    expect(resumedTurn.status).toBe("ADVISED");
    if (resumedTurn.status !== "ADVISED") return;
    expect(resumedTurn.advice).toContain("50 phút");
    expect(resumedTurn.advice).toContain("11:50");
    expect(resumedTurn.suggestions?.length).toBeGreaterThanOrEqual(1);
    const updatedCand = resumedTurn.suggestions![0]!.candidate;
    // Locked v-locked (08:00) MUST remain 100% immutable!
    expect(updatedCand.days[0]!.visits[0]!.startMinute).toBe(480);
    // Unlocked v-next-1 shifts >= 11:50 (710)
    expect(updatedCand.days[0]!.visits[1]!.startMinute).toBeGreaterThanOrEqual(710);
    // Verify current coordinates were passed into getRoute
    expect(routeSpy.mock.calls.some((c) => Math.abs(c[0].origin.latitude - 23.18) < 0.01)).toBe(true);
  });

  it("finds nearby VISIBLE stops from current ONGOING manual location and rejects out-of-Vietnam coordinates", async () => {
    const { database, draft } = createLocationFixture();

    const outsideVietnam = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Gần chỗ tôi đang đứng có điểm nào ghé được không?",
        draft,
        location: {
          source: "MANUAL",
          latitude: 48.8566, // Paris -> outside Vietnam coverage
          longitude: 2.3522,
          accuracyMeters: null,
          capturedAt: ongoingAt1100Vn.toISOString(),
        },
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 900, distanceMeters: 5000 }),
      },
      ongoingAt1100Vn,
    );

    expect(outsideVietnam.status).toBe("NEEDS_LOCATION");

    const nearbyOk = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Gần chỗ tôi đang đứng có điểm nào ghé được không?",
        draft,
        location: {
          source: "MANUAL",
          latitude: 23.27,
          longitude: 105.36,
          accuracyMeters: null,
          capturedAt: ongoingAt1100Vn.toISOString(),
        },
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 600, distanceMeters: 3000 }),
        createVisitId: () => "visit-nearby-1",
      },
      ongoingAt1100Vn,
    );

    expect(nearbyOk.status).toBe("ADVISED");
    if (nearbyOk.status !== "ADVISED") return;
    expect(nearbyOk.advice).toContain("Chợ Đồng Văn");
    expect(nearbyOk.suggestions?.length).toBeGreaterThanOrEqual(1);
    const card = nearbyOk.suggestions![0]!;
    expect(card.candidate.days[0]!.visits[0]!.visitId).toBe("v-locked");
    expect(card.candidate.days[0]!.visits[0]!.startMinute).toBe(480);
    expect(card.candidate.days[0]!.visits.some((v) => v.destinationId === "dest-nearby")).toBe(true);
  });
});
