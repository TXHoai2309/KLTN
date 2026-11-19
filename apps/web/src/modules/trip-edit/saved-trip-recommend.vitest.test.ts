import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { createAiEditProposal } from "./ai-edit-service";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";
import { clearForecastCache } from "../trip-weather/forecast";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T09:00:00.000Z");

const recommendPlan = (
  topic: "RECOMMEND_DESTINATION" | "HIDDEN_UNAVAILABLE" = "RECOMMEND_DESTINATION",
  dayIndex: number | null = 1,
  candidateVisitIds: string[] = [],
): WorkspacePlanModelOutput => ({
  mode: "ADVISED",
  operations: [],
  originClocks: {
    departureTime: null,
    returnDeadlineTime: null,
    returnDepartureTime: null,
    rescheduleDayOne: false,
  },
  adviceFocus: {
    dayIndex,
    topic,
  },
  candidateVisitIds,
  candidateDestinationIds: [],
  affected: {
    visitIds: candidateVisitIds,
    dayIndexes: dayIndex ? [dayIndex] : [1],
  },
  clarificationReason: null,
});

function openFull() {
  return [
    {
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
    },
    {
      dayOfWeek: "WEDNESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
    },
  ];
}

function createRecommendFixture(options?: { withHiddenStop?: boolean; withExternal?: boolean }) {
  const catalogRows = [
    {
      id: "dest-in-draft",
      name: "Phố Cổ Đồng Văn",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-dv-1",
      name: "Dinh Thự Vua Mèo",
      area: "Đồng Văn",
      category: "CULTURE",
      latitude: 23.26,
      longitude: 105.23,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-dv-2",
      name: "Làng Lô Lô Chải",
      area: "Đồng Văn",
      category: "VILLAGE",
      latitude: 23.36,
      longitude: 105.31,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-dv-3",
      name: "Cột Cờ Lũng Cú",
      area: "Đồng Văn",
      category: "LANDMARK",
      latitude: 23.36,
      longitude: 105.32,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-far",
      name: "Suối Khoáng Nà Mạ",
      area: "Yên Minh",
      category: "RELAX",
      latitude: 23.12,
      longitude: 105.15,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-closed-tue",
      name: "Chợ Phiên Thứ Tư",
      area: "Đồng Văn",
      category: "MARKET",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: [
        { dayOfWeek: "TUESDAY" as const, status: "CLOSED" as const, intervals: [] },
        {
          dayOfWeek: "WEDNESDAY" as const,
          status: "OPEN" as const,
          intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
        },
      ],
    },
    {
      id: "dest-hidden",
      name: "Điểm Riêng Tư Đã Ẩn",
      area: "Đồng Văn",
      category: "CULTURE",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "HIDDEN",
      deletedAt: null,
      openingDays: openFull(),
    },
    {
      id: "dest-deleted",
      name: "Điểm Đã Xóa Mềm",
      area: "Đồng Văn",
      category: "CULTURE",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: new Date("2026-10-01T00:00:00Z"),
      openingDays: openFull(),
    },
  ];

  const externalCacheRow = options?.withExternal
    ? {
        id: "ext-row-1",
        tripId: "trip-rec-1",
        providerPlaceId: "local-cafe",
        name: "Quán Cà Phê Cực Bắc",
        area: "Đồng Văn",
        category: "FOOD",
        latitude: 23.271,
        longitude: 105.359,
        fetchedAt: new Date("2026-10-15T00:00:00Z"),
        rawSummaryJson: {},
      }
    : null;

  const day1DbVisits: Record<string, unknown>[] = [
    {
      id: "v1",
      order: 1,
      startMinute: 480,
      plannedDurationMinutes: 60,
      externalPlace: null,
      destination: {
        id: "dest-in-draft",
        name: "Phố Cổ Đồng Văn",
        area: "Đồng Văn",
        visibility: "VISIBLE",
        deletedAt: null,
      },
    },
  ];

  if (options?.withHiddenStop) {
    day1DbVisits.push({
      id: "v-hidden",
      order: 2,
      startMinute: 600,
      plannedDurationMinutes: 60,
      externalPlace: null,
      destination: {
        id: "dest-hidden",
        name: "Điểm Riêng Tư Đã Ẩn",
        area: "Đồng Văn",
        visibility: "HIDDEN",
        deletedAt: null,
      },
    });
  } else if (options?.withExternal) {
    day1DbVisits.push({
      id: "v-ext",
      order: 2,
      startMinute: 600,
      plannedDurationMinutes: 45,
      externalPlace: externalCacheRow,
      destination: null,
    });
  }

  const tripRow = {
    id: "trip-rec-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 2,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null,
    journeySnapshot: null,
    days: [
      { dayIndex: 1, visits: day1DbVisits },
      { dayIndex: 2, visits: [] },
    ],
  };

  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: { findFirst: async () => tripRow },
    destination: {
      findMany: async (args?: { where?: { id?: { in?: string[] }; visibility?: string; deletedAt?: unknown } }) => {
        return catalogRows.filter((row) => {
          if (args?.where?.visibility === "VISIBLE" && row.visibility !== "VISIBLE") return false;
          if (args?.where && "deletedAt" in args.where && args.where.deletedAt === null && row.deletedAt !== null) {
            return false;
          }
          if (args?.where?.id?.in && !args.where.id.in.includes(row.id)) return false;
          return true;
        });
      },
    },
  };

  const draft: EditCandidate = {
    startDate: "2026-10-20",
    durationDays: 2,
    transport: "CAR",
    days: [
      {
        dayIndex: 1,
        visits: day1DbVisits.map((v) => ({
          visitId: v.id as string,
          destinationId: (v.destination as { id?: string } | null)?.id ?? "ext:google:local-cafe",
          startMinute: v.startMinute as number,
          plannedDurationMinutes: v.plannedDurationMinutes as number,
          order: v.order as number,
        })),
      },
      { dayIndex: 2, visits: [] },
    ],
  };

  return { database, draft };
}

describe("Saved-trip assistant Ticket 04: Smart Destination option ranking & HIDDEN stop recovery", () => {
  it("ranks up to 3 VISIBLE public destinations matching area/opening/weather, excludes draft/HIDDEN/deleted/forged IDs, and builds 1-tap swap cards", async () => {
    const { database, draft } = createRecommendFixture();
    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            rawText: JSON.stringify(recommendPlan("RECOMMEND_DESTINATION", 1, ["v1"])),
            model: "step-1",
          };
        }
        throw new Error("Force deterministic explanation verification");
      },
    };

    const res = await createAiEditProposal(
      "trip-rec-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Tôi muốn đổi địa điểm này sang chỗ khác hợp hơn",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 12000 }),
        createVisitId: () => "visit-rec-1",
      },
      timeReference,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.suggestions).toBeDefined();
    expect(res.suggestions!.length).toBe(3);

    const chosenDestIds = res.suggestions!.map((s) => s.candidate.days[0]!.visits[0]!.destinationId);
    expect(chosenDestIds).not.toContain("dest-in-draft");
    expect(chosenDestIds).not.toContain("dest-hidden");
    expect(chosenDestIds).not.toContain("dest-deleted");
    expect(chosenDestIds).not.toContain("dest-closed-tue");
    // Same-area Đồng Văn public options rank ahead of Yên Minh ("dest-far")
    expect(new Set(chosenDestIds)).toEqual(new Set(["dest-dv-1", "dest-dv-2", "dest-dv-3"]));
    expect(res.suggestions![0]!.addedPlaceDetails).toBeDefined();
    expect(res.advice).toContain("Dinh Thự Vua Mèo");
  });

  it("recommends up to 3 afternoon options for empty Day 2 slot with indoor boost under bad weather", async () => {
    const { database, draft } = createRecommendFixture();
    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            rawText: JSON.stringify(recommendPlan("RECOMMEND_DESTINATION", 2, [])),
            model: "step-1",
          };
        }
        throw new Error("Force deterministic summary");
      },
    };

    clearForecastCache();
    const res = await createAiEditProposal(
      "trip-rec-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Chiều Ngày 2 còn trống nên đi đâu ở Đồng Văn?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 900, distanceMeters: 8000 }),
        forecast: {
          fetcher: async () =>
            new Response(
              JSON.stringify({
                hourly: {
                  time: ["2026-10-21T14:00", "2026-10-21T15:00", "2026-10-21T16:00"],
                  temperature_2m: [22, 22, 21],
                  precipitation_probability: [90, 85, 80],
                  precipitation: [8, 7, 6],
                  wind_gusts_10m: [25, 25, 25],
                  visibility: [8000, 8000, 8000],
                  weather_code: [63, 63, 63],
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
        },
        createVisitId: () => "visit-add-day2",
      },
      timeReference,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.suggestions?.length).toBe(3);
    // Indoor venue ("Dinh Thự Vua Mèo", isOutdoor: false) ranks #1 during afternoon rain advisory!
    expect(res.suggestions![0]!.title).toContain("Dinh Thự Vua Mèo");
    const insertedVisit = res.suggestions![0]!.candidate.days[1]!.visits[0]!;
    expect(insertedVisit.startMinute).toBe(810); // 13:30 afternoon start
    expect(insertedVisit.plannedDurationMinutes).toBe(90);
  });

  it("handles HIDDEN unavailable stops gracefully with 3 same-area public replacements + quick remove option", async () => {
    const { database, draft } = createRecommendFixture({ withHiddenStop: true });
    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            rawText: JSON.stringify(recommendPlan("HIDDEN_UNAVAILABLE", 1, [])),
            model: "step-1",
          };
        }
        throw new Error("Force deterministic summary");
      },
    };

    const res = await createAiEditProposal(
      "trip-rec-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Điểm bị ẩn trong lịch nên đổi sang điểm nào?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 12000 }),
        createVisitId: () => "visit-new",
      },
      timeReference,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.advice).toContain("Điểm đến không còn khả dụng");
    expect(res.advice).toContain("Đồng Văn");
    expect(res.advice).not.toContain("Điểm Riêng Tư Đã Ẩn"); // Never leaks HIDDEN title
    expect(res.suggestions).toBeDefined();
    expect(res.suggestions!.length).toBe(4); // 3 replacements + 1 quick remove
    const removeCard = res.suggestions!.find((s) => s.diff.removed.length === 1);
    expect(removeCard).toBeDefined();
    expect(removeCard!.validation.canConfirm).toBe(true);
    expect(res.suggestions![0]!.validation.canConfirm).toBe(true);
  });

  it("preserves existing ExternalPlace visits while advising and proposing catalog additions (retaining NEEDS_UNCHECKED_ACK)", async () => {
    const { database, draft } = createRecommendFixture({ withExternal: true });
    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            rawText: JSON.stringify(recommendPlan("RECOMMEND_DESTINATION", 2, [])),
            model: "step-1",
          };
        }
        throw new Error("Force deterministic summary");
      },
    };

    const res = await createAiEditProposal(
      "trip-rec-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Chiều Ngày 2 nên thêm điểm nào hợp với lịch?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
        createVisitId: () => "visit-ext-coexist",
      },
      timeReference,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.suggestions?.length).toBe(3);
    const optCard = res.suggestions![0]!;
    // Existing ExternalPlace remains preserved in Day 1
    expect(optCard.candidate.days[0]!.visits.some((v) => v.destinationId === "ext:google:local-cafe")).toBe(true);
    expect(optCard.saveEligibility).toBe("NEEDS_UNCHECKED_ACK");
  });
});
