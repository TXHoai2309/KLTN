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

  it("Point 1: at 23:42 Day 1 with location, answers Day 2 first stop with distance, travel time, recommended departure, and zero edits", async () => {
    const openFull = [
      {
        dayOfWeek: "MONDAY" as const,
        status: "OPEN" as const,
        intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }],
      },
      {
        dayOfWeek: "TUESDAY" as const,
        status: "OPEN" as const,
        intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }],
      },
    ];
    const catalog = [
      {
        id: "dest-d1-end",
        name: "Phố cổ Đồng Văn",
        area: "Đồng Văn",
        category: "HERITAGE",
        latitude: 23.2782612,
        longitude: 105.361378,
        suggestedDurationMinutes: 120,
        minimumDurationMinutes: 30,
        isOutdoor: false,
        visibility: "VISIBLE",
        deletedAt: null,
        openingDays: openFull,
      },
      {
        id: "dest-d2-1",
        name: "Thị trấn Mèo Vạc",
        area: "Mèo Vạc",
        category: "SCENIC",
        latitude: 23.163832,
        longitude: 105.409104,
        suggestedDurationMinutes: 60,
        minimumDurationMinutes: 30,
        isOutdoor: false,
        visibility: "VISIBLE",
        deletedAt: null,
        openingDays: openFull,
      },
      {
        id: "dest-d2-2",
        name: "Sông Nho Quế",
        area: "Mèo Vạc",
        category: "SCENIC",
        latitude: 23.1907068,
        longitude: 105.4694776,
        suggestedDurationMinutes: 180,
        minimumDurationMinutes: 60,
        isOutdoor: true,
        visibility: "VISIBLE",
        deletedAt: null,
        openingDays: openFull,
      },
    ];
    const twoDayTrip = {
      id: "trip-p1",
      userId: "owner-1",
      startDate: new Date("2026-11-23T00:00:00.000Z"),
      durationDays: 2,
      transport: "MOTORCYCLE" as const,
      updatedAt: revision,
      manuallyCompletedAt: null,
      journeySnapshot: null,
      days: [
        {
          dayIndex: 1,
          visits: [
            {
              id: "v-d1-last",
              order: 1,
              startMinute: 935,
              plannedDurationMinutes: 90,
              externalPlace: null,
              destination: {
                id: "dest-d1-end",
                name: "Phố cổ Đồng Văn",
                area: "Đồng Văn",
                visibility: "VISIBLE",
                deletedAt: null,
              },
            },
          ],
        },
        {
          dayIndex: 2,
          visits: [
            {
              id: "v-d2-1",
              order: 1,
              startMinute: 480, // 08:00 next morning
              plannedDurationMinutes: 60,
              externalPlace: null,
              destination: {
                id: "dest-d2-1",
                name: "Thị trấn Mèo Vạc",
                area: "Mèo Vạc",
                visibility: "VISIBLE",
                deletedAt: null,
              },
            },
            {
              id: "v-d2-2",
              order: 2,
              startMinute: 571,
              plannedDurationMinutes: 180,
              externalPlace: null,
              destination: {
                id: "dest-d2-2",
                name: "Sông Nho Quế",
                area: "Mèo Vạc",
                visibility: "VISIBLE",
                deletedAt: null,
              },
            },
          ],
        },
      ],
    };
    const draft: EditCandidate = {
      startDate: "2026-11-23",
      durationDays: 2,
      transport: "MOTORCYCLE",
      days: twoDayTrip.days.map((d) => ({
        dayIndex: d.dayIndex,
        visits: d.visits.map((v) => ({
          visitId: v.id,
          destinationId: v.destination.id,
          startMinute: v.startMinute,
          plannedDurationMinutes: v.plannedDurationMinutes,
          order: v.order,
        })),
      })),
    };
    const database = {
      user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
      trip: { findFirst: async () => twoDayTrip },
      destination: {
        findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
          const ids = args?.where?.id?.in;
          return ids ? catalog.filter((d) => ids.includes(d.id)) : catalog;
        },
      },
    } as unknown as Database;

    // 23:42 Asia/Ho_Chi_Minh on 2026-11-23 (Day 1) = 16:42 UTC
    const day1At2342Vn = new Date("2026-11-23T16:42:00.000Z");

    // Step 1: Ask without location -> asks for location without entering edit flow or calling LLM
    const llmSpy = vi.fn(async () => ({
      rawText: JSON.stringify({
        mode: "APPLY_BATCH",
        operations: [{ intentType: "REMOVE_VISIT", targetVisitIds: ["v-d2-1"], destinationId: null, dayIndex: 2, position: null, startTime: null, durationMinutes: null, shiftFollowing: false }],
        originClocks: { departureTime: null, returnDeadlineTime: null, returnDepartureTime: null, rescheduleDayOne: false },
        adviceFocus: { dayIndex: null, topic: "GENERAL" },
        candidateVisitIds: [],
        candidateDestinationIds: [],
        affected: { visitIds: [], dayIndexes: [] },
        clarificationReason: null,
      }),
      model: "step-1",
    }));

    const needsLoc = await createAiEditProposal(
      "trip-p1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Từ chỗ mình đang đứng đi tới điểm tiếp theo mất bao lâu?", draft },
      { database, llm: { complete: llmSpy }, getRoute: async () => ({ kind: "unavailable" }) },
      day1At2342Vn,
    );
    expect(needsLoc.status).toBe("NEEDS_LOCATION");

    // Step 2: Provide GPS at Đồng Văn -> answers Day 2 stop 1 with routing km, minutes, departure time, and zero edits
    const routeSpy = vi.fn(async () => ({
      kind: "ok" as const,
      durationSeconds: 3000, // 50m -> 08:00 - 50m = 07:10
      distanceMeters: 22_000, // 22 km
    }));
    const etaRes = await createAiEditProposal(
      "trip-p1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Từ chỗ mình đang đứng đi tới điểm tiếp theo mất bao lâu?",
        draft,
        location: {
          source: "GPS",
          latitude: 23.2785,
          longitude: 105.3625,
          accuracyMeters: 15,
          capturedAt: day1At2342Vn.toISOString(),
        },
      },
      { database, llm: { complete: llmSpy }, getRoute: routeSpy },
      day1At2342Vn,
    );
    expect(etaRes.status).toBe("ADVISED");
    if (etaRes.status !== "ADVISED") return;
    expect(etaRes.suggestions ?? []).toHaveLength(0);
    expect(etaRes.advice).toContain("Thị trấn Mèo Vạc");
    expect(etaRes.advice).toContain("08:00");
    expect(etaRes.advice).toContain("22 km");
    expect(etaRes.advice).toContain("50 phút");
    expect(etaRes.advice).toContain("xe máy");
    expect(etaRes.advice).toContain("07:10");
    expect(etaRes.advice).toContain("theo vị trí bạn vừa chia sẻ");
    expect(etaRes.advice).not.toContain("Toàn bộ các lượt tham quan trong Ngày 1 đã qua giờ");
    expect(routeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { latitude: 23.2785, longitude: 105.3625 },
        destination: { latitude: 23.163832, longitude: 105.409104 },
        vehicle: "MOTORCYCLE",
      }),
    );

    // Step 3: Manual location at Mèo Vạc + "…bao xa?"
    const manualRes = await createAiEditProposal(
      "trip-p1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Từ chỗ mình đang đứng đi tới điểm tiếp theo bao xa?",
        draft,
        location: {
          source: "MANUAL",
          latitude: 23.157,
          longitude: 105.405,
          accuracyMeters: null,
          capturedAt: day1At2342Vn.toISOString(),
        },
      },
      {
        database,
        llm: { complete: llmSpy },
        getRoute: async () => ({ kind: "ok", durationSeconds: 600, distanceMeters: 2100 }),
      },
      day1At2342Vn,
    );
    expect(manualRes.status).toBe("ADVISED");
    if (manualRes.status !== "ADVISED") return;
    expect(manualRes.suggestions ?? []).toHaveLength(0);
    expect(manualRes.advice).toContain("Thị trấn Mèo Vạc");
    expect(manualRes.advice).toContain("2.1 km");
    expect(manualRes.advice).toContain("10 phút");
    expect(manualRes.advice).toContain("07:50");
    expect(manualRes.advice).toContain("theo vị trí bạn vừa chia sẻ");

    // Step 4: Routing unavailable -> honest explanation, zero fabricated numbers
    const unavailRes = await createAiEditProposal(
      "trip-p1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Từ chỗ mình đang đứng đi tới điểm tiếp theo mất bao lâu?",
        draft,
        location: {
          source: "GPS",
          latitude: 23.2785,
          longitude: 105.3625,
          accuracyMeters: 15,
          capturedAt: day1At2342Vn.toISOString(),
        },
      },
      { database, llm: { complete: llmSpy }, getRoute: async () => ({ kind: "unavailable" }) },
      day1At2342Vn,
    );
    expect(unavailRes.status).toBe("ADVISED");
    if (unavailRes.status !== "ADVISED") return;
    expect(unavailRes.suggestions ?? []).toHaveLength(0);
    expect(unavailRes.advice).toContain("Thị trấn Mèo Vạc");
    expect(unavailRes.advice).toContain("08:00");
    expect(unavailRes.advice).toContain("theo vị trí bạn vừa chia sẻ");
    expect(unavailRes.advice).toMatch(/chưa.*định tuyến|không.*định tuyến/iu);
    expect(unavailRes.advice).not.toMatch(/\b20 phút\b|\b07:10\b|\b\d+\s*km\b/iu);
  });

  it("Point 1: mid-Day-1 at 11:00 with location answers the next upcoming visit in Day 1", async () => {
    const { database, draft } = createLocationFixture();
    const midDayRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Từ chỗ mình đang đứng đi tới điểm tiếp theo mất bao lâu?",
        draft,
        location: {
          source: "GPS",
          latitude: 23.18,
          longitude: 105.12,
          accuracyMeters: 12,
          capturedAt: ongoingAt1100Vn.toISOString(),
        },
      },
      {
        database: database as unknown as Database,
        llm: { complete: async () => { throw new Error("Must not enter LLM edit flow"); } },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 14_500 }), // 20m -> leave before 11:10
      },
      ongoingAt1100Vn,
    );

    expect(midDayRes.status).toBe("ADVISED");
    if (midDayRes.status !== "ADVISED") return;
    expect(midDayRes.suggestions ?? []).toHaveLength(0);
    expect(midDayRes.advice).toContain("Dinh Vua Mèo");
    expect(midDayRes.advice).toContain("11:30");
    expect(midDayRes.advice).toContain("14.5 km");
    expect(midDayRes.advice).toContain("20 phút");
    expect(midDayRes.advice).toContain("ô tô");
    expect(midDayRes.advice).toContain("11:10");
    expect(midDayRes.advice).toContain("theo vị trí bạn vừa chia sẻ");
  });

  it("Point 2: searches Google Places around current location for food/services (with radius expansion, honest hours, no edits) and keeps catalog for sightseeing", async () => {
    const { database, draft } = createLocationFixture();
    // 23:44 Asia/Ho_Chi_Minh on 2026-10-20 = 16:44 UTC
    const lateAt2344Vn = new Date("2026-10-20T16:44:00.000Z");
    const userLoc = {
      source: "GPS" as const,
      latitude: 23.2785,
      longitude: 105.3625,
      accuracyMeters: 15,
      capturedAt: lateAt2344Vn.toISOString(),
    };

    // 1. Without location yet: nearby service query ("cây xăng" / "quán ăn") prompts NEEDS_LOCATION
    const needsLoc = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Quanh đây có cây xăng nào không?", draft },
      {
        database: database as unknown as Database,
        llm: { complete: async () => { throw new Error("Must not enter edit LLM"); } },
        getRoute: async () => ({ kind: "unavailable" }),
      },
      lateAt2344Vn,
    );
    expect(needsLoc.status).toBe("NEEDS_LOCATION");

    // 2. Late-night food query with mock Places returning NO_RESULTS at 3km, RESULTS at 5km (no openingHours field -> no fabricated "mở muộn")
    const placesSpy = vi.fn(async (_query: string, _signal?: AbortSignal, near?: { latitude: number; longitude: number; radiusKm: number }) => {
      if ((near?.radiusKm ?? 0) <= 3) return { status: "NO_RESULTS" as const };
      return {
        status: "RESULTS" as const,
        places: [
          { placeId: "ChIJ-late-2", name: "Quán Phở Đêm Phố Cổ", latitude: 23.285, longitude: 105.37, types: ["restaurant"] },
          { placeId: "ChIJ-late-1", name: "Cơm Lam Đồng Văn", latitude: 23.2795, longitude: 105.363, types: ["restaurant"] },
          { placeId: "ChIJ-hotel-skip", name: "Khách sạn Cao Nguyên", latitude: 23.2787, longitude: 105.3626, types: ["lodging", "hotel"] },
        ],
      };
    });

    const foodRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Quanh chỗ mình đang đứng có quán ăn nào mở muộn không?", draft, location: userLoc },
      {
        database: database as unknown as Database,
        llm: { complete: async () => { throw new Error("Must not enter edit LLM"); } },
        getRoute: async () => ({ kind: "ok", durationSeconds: 300, distanceMeters: 1000 }),
        places: placesSpy,
      },
      lateAt2344Vn,
    );
    expect(foodRes.status).toBe("ADVISED");
    if (foodRes.status !== "ADVISED") return;
    expect(foodRes.suggestions ?? []).toHaveLength(0);
    expect(placesSpy).toHaveBeenCalledTimes(2);
    expect(placesSpy.mock.calls[0]?.[2]?.radiusKm).toBe(3);
    expect(placesSpy.mock.calls[1]?.[2]?.radiusKm).toBeGreaterThan(3);
    expect(foodRes.advice).toContain("Cơm Lam Đồng Văn");
    expect(foodRes.advice).toContain("Quán Phở Đêm Phố Cổ");
    expect(foodRes.advice).not.toContain("Khách sạn Cao Nguyên");
    expect(foodRes.advice).toContain("từ Google Maps, chưa kiểm tra; giờ mở cửa thực tế có thể khác");
    expect(foodRes.advice).toMatch(/chưa có.*giờ mở cửa|không có.*giờ mở cửa/iu);
    expect(foodRes.advice).not.toContain("mở muộn");
    expect(foodRes.advice).not.toContain("chưa có điểm công khai mới nào phù hợp trước cuối ngày");

    // 3. When Places includes openingHours/openNow, it uses that verified field
    const cafeRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Gần đây có quán cà phê nào không?", draft, location: userLoc },
      {
        database: database as unknown as Database,
        llm: { complete: async () => { throw new Error("Must not enter edit LLM"); } },
        getRoute: async () => ({ kind: "unavailable" }),
        places: async () => ({
          status: "RESULTS" as const,
          places: [
            {
              placeId: "ChIJ-cafe-1",
              name: "Cà Phê Phố Cổ",
              latitude: 23.279,
              longitude: 105.363,
              types: ["cafe"],
              openNow: true,
              openingHours: ["Thứ Hai: 07:00–22:30"],
            },
          ],
        }),
      },
      ongoingAt1100Vn,
    );
    expect(cafeRes.status).toBe("ADVISED");
    if (cafeRes.status !== "ADVISED") return;
    expect(cafeRes.advice).toContain("Cà Phê Phố Cổ");
    expect(cafeRes.advice).toContain("07:00–22:30");

    // 4. Places UNAVAILABLE -> honest notice, no fabricated businesses
    const errRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Quanh chỗ mình đang đứng có nhà thuốc nào không?", draft, location: userLoc },
      {
        database: database as unknown as Database,
        llm: { complete: async () => { throw new Error("Must not enter edit LLM"); } },
        getRoute: async () => ({ kind: "unavailable" }),
        places: async () => ({ status: "UNAVAILABLE" as const }),
      },
      ongoingAt1100Vn,
    );
    expect(errRes.status).toBe("ADVISED");
    if (errRes.status !== "ADVISED") return;
    expect(errRes.suggestions ?? []).toHaveLength(0);
    expect(errRes.advice).toMatch(/chưa.*tra cứu|tạm thời.*không.*tra cứu|chưa sẵn sàng/iu);
    expect(errRes.advice).not.toContain("Cơm Lam Đồng Văn");

    // 5. Sightseeing nearby query still queries DB catalog, not Places
    const sightPlacesSpy = vi.fn(async () => ({ status: "NO_RESULTS" as const }));
    const sightRes = await createAiEditProposal(
      "trip-loc-1",
      "owner-1",
      { baseRevision: revision.toISOString(), message: "Gần chỗ tôi đang đứng có điểm tham quan nào ghé được không?", draft, location: { ...userLoc, capturedAt: ongoingAt1100Vn.toISOString() } },
      {
        database: database as unknown as Database,
        llm: { complete: async () => ({ rawText: JSON.stringify(locationPlan("LOCATION_GUIDANCE")), model: "step-1" }) },
        getRoute: async () => ({ kind: "ok", durationSeconds: 600, distanceMeters: 3000 }),
        places: sightPlacesSpy,
        createVisitId: () => "visit-sight-1",
      },
      ongoingAt1100Vn,
    );
    expect(sightRes.status).toBe("ADVISED");
    if (sightRes.status !== "ADVISED") return;
    expect(sightPlacesSpy).not.toHaveBeenCalled();
    expect(sightRes.advice).toContain("Chợ Đồng Văn");
  });
});
