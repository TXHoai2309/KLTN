import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { createAiEditProposal } from "./ai-edit-service";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";

const revision = new Date("2026-10-15T12:00:00.000Z");
const upcomingTime = new Date("2026-10-16T08:00:00.000Z");
const ongoingDay1At0930Utc = new Date("2026-10-20T02:30:00.000Z"); // 09:30 Asia/Ho_Chi_Minh on 2026-10-20

const restAdvisedPlan = (
  topic: "REST_BUFFER" | "COMPOUND_EVALUATE_FIX" = "REST_BUFFER",
  dayIndex: number | null = 1,
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
  candidateVisitIds: [],
  candidateDestinationIds: [],
  affected: {
    visitIds: [],
    dayIndexes: dayIndex ? [dayIndex] : [1],
  },
  clarificationReason: null,
});

function openDays(opensAtMinute: number, closesAtMinute: number) {
  return [
    {
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute, closesAtMinute }],
    },
    {
      dayOfWeek: "WEDNESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute, closesAtMinute }],
    },
  ];
}

function createScenarioFixture(options?: { multiDay?: boolean; tightClosing?: boolean; travelViolationBaseline?: boolean }) {
  const catalog = [
    {
      id: "dest-1",
      name: "Cổng Trời Quản Bạ",
      area: "Quản Bạ",
      category: "SCENIC",
      latitude: 23.07,
      longitude: 104.99,
      suggestedDurationMinutes: 120,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      openingDays: openDays(360, 1200),
    },
    {
      id: "dest-2",
      name: "Núi Đôi Quản Bạ",
      area: "Quản Bạ",
      category: "SCENIC",
      latitude: 23.08,
      longitude: 105.01,
      suggestedDurationMinutes: 150,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      openingDays: openDays(360, 1200),
    },
    {
      id: "dest-3",
      name: "Bảo Tàng Đồng Văn",
      area: "Đồng Văn",
      category: "CULTURE",
      latitude: 23.27,
      longitude: 105.36,
      suggestedDurationMinutes: 120,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      openingDays: openDays(360, options?.tightClosing ? 1020 : 1200), // closes 17:00 if tightClosing
    },
  ];

  const day1Visits = options?.travelViolationBaseline
    ? [
        { visitId: "v1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 90, order: 1 },
        { visitId: "v2", destinationId: "dest-2", startMinute: 575, plannedDurationMinutes: 90, order: 2 }, // only 5m gap, route needs 30m
      ]
    : options?.tightClosing
      ? [
          { visitId: "v1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 180, order: 1 }, // 08:00-11:00
          { visitId: "v2", destinationId: "dest-2", startMinute: 690, plannedDurationMinutes: 180, order: 2 }, // 11:30-14:30
          { visitId: "v3", destinationId: "dest-3", startMinute: 890, plannedDurationMinutes: 120, order: 3 }, // 14:50-16:50 (barely makes 17:00!)
        ]
      : [
          { visitId: "v1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "v2", destinationId: "dest-2", startMinute: 560, plannedDurationMinutes: 60, order: 2 },
        ];

  const days = options?.multiDay
    ? [
        { dayIndex: 1, visits: day1Visits },
        { dayIndex: 2, visits: [] },
      ]
    : [{ dayIndex: 1, visits: day1Visits }];

  const tripRow = {
    id: "trip-rest-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: options?.multiDay ? 2 : 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null,
    journeySnapshot: null,
    days: days.map((d) => ({
      dayIndex: d.dayIndex,
      visits: d.visits.map((v) => ({
        id: v.visitId,
        order: v.order,
        startMinute: v.startMinute,
        plannedDurationMinutes: v.plannedDurationMinutes,
        externalPlace: null,
        destination: {
          id: v.destinationId,
          name: catalog.find((c) => c.id === v.destinationId)!.name,
          visibility: "VISIBLE",
          deletedAt: null,
        },
      })),
    })),
  };

  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: { findFirst: async () => tripRow },
    destination: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        if (!ids) return catalog;
        return catalog.filter((item) => ids.includes(item.id));
      },
    },
  };

  const draft: EditCandidate = {
    startDate: "2026-10-20",
    durationDays: options?.multiDay ? 2 : 1,
    transport: "CAR",
    days,
  };

  return { database, draft };
}

describe("Saved-trip assistant Ticket 03: Schedule rest buffer, delay traps, and compound turns", () => {
  it("models morning rest buffer until 09:00 + auto-shift without fake hotel/stops when day stays PASS", async () => {
    const { database, draft } = createScenarioFixture();
    const originalSnapshot = JSON.stringify(draft);

    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) return { rawText: JSON.stringify(restAdvisedPlan("REST_BUFFER", 1)), model: "step-1" };
        throw new Error("Force deterministic summary verification");
      },
    };

    const res = await createAiEditProposal(
      "trip-rest-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Sáng đến nơi muốn nghỉ ngơi ăn sáng đến 9h mới đi thì nên chỉnh sửa chuyến đi như nào cho hợp lý?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      upcomingTime,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(JSON.stringify(draft)).toBe(originalSnapshot);
    expect(res.advice).toContain("09:00");
    expect(res.advice).toContain("PASS");
    expect(res.suggestions).toBeDefined();
    expect(res.suggestions!.length).toBe(1);

    const card = res.suggestions![0]!;
    expect(card.diff.added.length).toBe(0); // Never injects fake breakfast or hotel visits
    expect(card.candidate.days[0]!.visits[0]!.startMinute).toBe(540);
    expect(card.candidate.days[0]!.visits[1]!.startMinute).toBeGreaterThanOrEqual(620);
    expect(card.validation.canConfirm).toBe(true);
  });

  it("identifies trapped closing stop when waking up 2h late and simulates 2 valid relief suggestion cards", async () => {
    const { database, draft } = createScenarioFixture({ multiDay: true, tightClosing: true });

    let call = 0;
    const llm = {
      complete: async () => {
        call += 1;
        if (call === 1) return { rawText: JSON.stringify(restAdvisedPlan("REST_BUFFER", 1)), model: "step-1" };
        return {
          rawText: JSON.stringify({
            advice:
              "Nếu xuất phát trễ 2 tiếng sang 10:00, lượt cuối Bảo Tàng Đồng Văn sẽ bị trễ khung giờ mở cửa (đóng cửa lúc 17:00). Mình đã mô phỏng 2 phương án tháo gỡ hợp lệ ngay bên dưới: rút nhẹ thời lượng hoặc chuyển sang Ngày 2.",
          }),
          model: "step-2",
        };
      },
    };

    const res = await createAiEditProposal(
      "trip-rest-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Mình dậy muộn xuất phát trễ 2 tiếng thì Ngày 1 chỉnh sao?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      upcomingTime,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.advice).toContain("Bảo Tàng Đồng Văn");
    expect(res.suggestions).toBeDefined();
    expect(res.suggestions!.length).toBe(2);

    const [opt1, opt2] = res.suggestions!;
    expect(opt1!.validation.groups.openingHours.status).toBe("SATISFIED");
    expect(opt2!.validation.groups.openingHours.status).toBe("SATISFIED");
    expect(opt1!.candidate.days[0]!.visits[0]!.startMinute).toBe(600);
    expect(opt2!.candidate.days[1]!.visits.length).toBe(1);
  });

  it("handles compound evaluate+fix directly via PROPOSED when non-destructive, and keeps cards for destructive trade-offs", async () => {
    // 1. Non-destructive compound fix -> returns PROPOSED directly with analysis + Undo support
    const { database: dbPassable, draft: draftPassable } = createScenarioFixture({ travelViolationBaseline: true });
    const llm = {
      complete: async () => ({
        rawText: JSON.stringify(restAdvisedPlan("COMPOUND_EVALUATE_FIX", 1)),
        model: "step-1",
      }),
    };

    const directRes = await createAiEditProposal(
      "trip-rest-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Ngày 1 đi thế này có kịp không, nếu gấp quá thì chỉnh lại giúp tôi luôn",
        draft: draftPassable,
      },
      {
        database: dbPassable as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
      },
      upcomingTime,
    );

    expect(directRes.status).toBe("PROPOSED");
    if (directRes.status !== "PROPOSED") return;
    expect(directRes.validation.canConfirm).toBe(true);
    expect(directRes.candidate.days[0]!.visits[1]!.startMinute).toBe(600);
    expect(directRes.aiSummary).toContain("Hoàn tác bước AI này");

    // 2. Single-day trapped delay with major trade-off (dropping destination) -> returns ADVISED + relief card instead of silently deleting stop
    const { database: dbTightSingle, draft: draftTightSingle } = createScenarioFixture({
      multiDay: false,
      tightClosing: true,
    });
    // Force minimum durations = current durations on tight stops so ONLY dropping a stop solves 11:00 rest!
    const origFind = dbTightSingle.destination.findMany;
    dbTightSingle.destination.findMany = async (args?: { where?: { id?: { in?: string[] } } }) =>
      (await origFind(args)).map((d) => ({
        ...d,
        minimumDurationMinutes: d.id === "dest-3" ? 120 : 180,
      }));

    let step = 0;
    const llmTradeoff = {
      complete: async () => {
        step += 1;
        if (step === 1) return { rawText: JSON.stringify(restAdvisedPlan("REST_BUFFER", 1)), model: "step-1" };
        throw new Error("Force deterministic fallback");
      },
    };
    const tradeoffRes = await createAiEditProposal(
      "trip-rest-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Sáng nghỉ đến 11h rồi sửa giúp tôi luôn",
        draft: draftTightSingle,
      },
      {
        database: dbTightSingle as unknown as Database,
        llm: llmTradeoff,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      upcomingTime,
    );

    expect(tradeoffRes.status).toBe("ADVISED");
    if (tradeoffRes.status !== "ADVISED") return;
    expect(tradeoffRes.suggestions?.length).toBeGreaterThanOrEqual(1);
    expect(tradeoffRes.suggestions![0]!.diff.removed.length).toBe(1);
  });

  it("never shifts ONGOING completed visits during midday rest buffer simulation and obeys 50-visit cap", async () => {
    const { database, draft } = createScenarioFixture();
    // Day 1 at 09:30 Vietnam time: visit-1 (08:00-09:00) is COMPLETED/LOCKED; visit-2 (09:20 -> adjusted to 10:00) is UNLOCKED
    draft.days[0]!.visits[1]!.startMinute = 600;
    const trip = await database.trip.findFirst();
    trip.days[0]!.visits[1]!.startMinute = 600;

    let step = 0;
    const llm = {
      complete: async () => {
        step += 1;
        if (step === 1) return { rawText: JSON.stringify(restAdvisedPlan("REST_BUFFER", 1)), model: "step-1" };
        throw new Error("Force deterministic fallback");
      },
    };

    const res = await createAiEditProposal(
      "trip-rest-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Đoàn mệt muốn nghỉ trưa thêm 1 tiếng rồi đi tiếp",
        draft,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1200, distanceMeters: 10000 }),
      },
      ongoingDay1At0930Utc,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    const totalVisitsAfter = res.suggestions?.[0]?.candidate.days.reduce((s, d) => s + d.visits.length, 0) ?? 2;
    expect(totalVisitsAfter).toBeLessThanOrEqual(50);
    // Locked visit-1 (08:00) remains strictly untouched!
    expect(res.suggestions![0]!.candidate.days[0]!.visits[0]!.startMinute).toBe(480);
    expect(res.suggestions![0]!.candidate.days[0]!.visits[1]!.startMinute).toBe(660);
  });
});
