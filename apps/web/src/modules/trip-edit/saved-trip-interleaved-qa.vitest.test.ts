import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { clearForecastCache } from "../trip-weather/forecast";
import { createAiEditProposal } from "./ai-edit-service";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";

const revision = new Date("2026-10-15T12:00:00.000Z");
const upcomingTime = new Date("2026-10-19T08:00:00.000Z"); // Trip starts 2026-10-20 ("ngày mai" = Day 1!)
const ongoingAt0930 = new Date("2026-10-20T02:30:00.000Z"); // 09:30 Asia/Ho_Chi_Minh on 2026-10-20

const qaPlan = (
  topic: "KNOWLEDGE_QA" | "WEATHER_QA" | "PROGRESS_QA",
  dayIndex: number | null = null,
): WorkspacePlanModelOutput => ({
  mode: "ADVISED",
  operations: [],
  originClocks: {
    departureTime: null,
    returnDeadlineTime: null,
    returnDepartureTime: null,
    rescheduleDayOne: false,
  },
  adviceFocus: { dayIndex, topic },
  candidateVisitIds: [],
  candidateDestinationIds: [],
  affected: { visitIds: [], dayIndexes: dayIndex ? [dayIndex] : [1] },
  clarificationReason: null,
});

function createInterleavedFixture(options?: {
  startDateIso?: string;
  v2StartMinute?: number;
  v2DurationMinutes?: number;
}) {
  const startIso = options?.startDateIso ?? "2026-10-20";
  const openFull = [
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
  const catalog = [
    {
      id: "dest-vua-meo",
      name: "Dinh Vua Mèo",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.26,
      longitude: 105.23,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
    {
      id: "dest-ma-pi-leng",
      name: "Đèo Mã Pì Lèng",
      area: "Mèo Vạc",
      category: "SCENIC",
      latitude: 23.24,
      longitude: 105.41,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
    {
      id: "dest-bao-tang",
      name: "Không Gian Văn Hóa Mèo Vạc",
      area: "Mèo Vạc",
      category: "MUSEUM",
      latitude: 23.16,
      longitude: 105.41,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openFull,
    },
  ];

  const v2Start = options?.v2StartMinute ?? 600;
  const v2Dur = options?.v2DurationMinutes ?? 60;

  const tripRow = {
    id: "trip-qa-1",
    userId: "owner-1",
    startDate: new Date(`${startIso}T00:00:00.000Z`),
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
            id: "v1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            externalPlace: null,
            destination: {
              id: "dest-vua-meo",
              name: "Dinh Vua Mèo",
              area: "Đồng Văn",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
          {
            id: "v2",
            order: 2,
            startMinute: v2Start,
            plannedDurationMinutes: v2Dur,
            externalPlace: null,
            destination: {
              id: "dest-ma-pi-leng",
              name: "Đèo Mã Pì Lèng",
              area: "Mèo Vạc",
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
    startDate: startIso,
    durationDays: 1,
    transport: "CAR",
    days: [
      {
        dayIndex: 1,
        visits: [
          { visitId: "v1", destinationId: "dest-vua-meo", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "v2", destinationId: "dest-ma-pi-leng", startMinute: v2Start, plannedDurationMinutes: v2Dur, order: 2 },
        ],
      },
    ],
  };

  return { database, draft };
}

describe("Saved-trip assistant Ticket 05: Interleaved RAG knowledge, weather/sun, and progress", () => {
  it("answers local culture/history via RAG with real SOURCE citations + labeled Kiến thức mở rộng without mutating Edit draft", async () => {
    const { database, draft } = createInterleavedFixture();
    const originalSnapshot = JSON.stringify(draft);

    const res = await createAiEditProposal(
      "trip-qa-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Dinh Vua Mèo có câu chuyện gì đặc biệt?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(qaPlan("KNOWLEDGE_QA", 1)),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
        qaLookup: async () => ({
          status: "PARTIAL",
          answerParts: [
            {
              text: "Dinh Vua Mèo (dinh thự họ Vương tại thung lũng Sà Phìn) được xây dựng theo kiến trúc kết hợp Mông, Hoa và Pháp vào đầu thế kỷ 20.",
              mode: "SOURCE",
              citationIds: ["cit-1"],
            },
            {
              text: "Nên ghé buổi sáng để ánh sáng chụp ảnh đẹp nhất; vé tham quan hiện khoảng 20k.",
              mode: "EXPANDED",
              citationIds: [],
            },
          ],
          citations: [
            {
              id: "cit-1",
              sourceId: "src-ha-giang-guide",
              title: "Cẩm nang di sản cao nguyên đá Đồng Văn",
              sourceUrl: "https://example.test/cam-nang-dong-van",
              locators: [{ pageNumber: 14, section: "Thung lũng Sà Phìn" }],
            },
          ],
          unansweredAspects: ["Lịch thuyết minh theo đoàn"],
          knowledgeMode: "EXPANDED",
        }),
      },
      upcomingTime,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(JSON.stringify(draft)).toBe(originalSnapshot);
    expect(res.knowledgeParts).toHaveLength(2);
    expect(res.knowledgeParts![0]!.mode).toBe("SOURCE");
    expect(res.knowledgeParts![0]!.citationIds).toEqual(["cit-1"]);
    expect(res.knowledgeParts![1]!.mode).toBe("EXPANDED");
    expect(res.knowledgeParts![1]!.citationIds).toEqual([]);
    // Never leaks unverified ticket prices inside EXPANDED prose
    expect(res.knowledgeParts![1]!.text).not.toContain("20k");
    expect(res.knowledgeParts![1]!.text).toContain("Kiểm tra thực tế".toLowerCase());
    expect(res.citations).toHaveLength(1);
    expect(res.citations![0]!.title).toContain("Đồng Văn");
  });

  it("answers visit-time weather & sun times (Open-Meteo + suncalc), provides indoor/earlier remedies, and honors ADR-36 safety boundaries", async () => {
    clearForecastCache();
    // Place Đèo Mã Pì Lèng (outdoor) at 16:45-17:45 on 2026-10-20 (hits rain, fog, and after-sunset ~17:17!)
    const { database, draft } = createInterleavedFixture({ v2StartMinute: 1005, v2DurationMinutes: 60 });

    const res = await createAiEditProposal(
      "trip-qa-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Ngày mai đi Đèo Mã Pì Lèng có mưa hay sương mù không, mấy giờ mặt trời lặn?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(qaPlan("WEATHER_QA", 1)),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 20000 }),
        forecast: {
          fetcher: async (url) => {
            const count = new URL(url.toString()).searchParams.get("latitude")?.split(",").length ?? 1;
            const onePoint = {
              hourly: {
                time: ["2026-10-20T16:00", "2026-10-20T17:00", "2026-10-20T18:00"],
                temperature_2m: [18, 17, 16],
                precipitation_probability: [85, 90, 80],
                precipitation: [6, 7, 4],
                wind_gusts_10m: [22, 24, 20],
                visibility: [800, 750, 900],
                weather_code: [63, 63, 61],
              },
            };
            const body = count > 1 ? Array.from({ length: count }, () => onePoint) : onePoint;
            return new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
      },
      upcomingTime,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.validation.canConfirm).toBe(true); // Weather NEVER turns Constraint Validator into VIOLATION
    expect(res.advice).toContain("Đèo Mã Pì Lèng");
    expect(res.advice).toContain("90%");
    expect(res.advice).toContain("hoàng hôn");
    expect(res.advice).toContain("ADR-36");
    expect(res.suggestions).toBeDefined();
    expect(res.suggestions!.length).toBeGreaterThanOrEqual(1);
    expect(res.suggestions!.length).toBeLessThanOrEqual(2);
  });

  it("clearly reports out-of-range weather horizon ('Chưa có dự báo, sẽ có từ ngày ...') while still computing sun times >16 days ahead", async () => {
    const { database, draft } = createInterleavedFixture({ startDateIso: "2026-12-20" });

    const res = await createAiEditProposal(
      "trip-qa-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Dự báo thời tiết và giờ mặt trời Ngày 1 chuyến này?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(qaPlan("WEATHER_QA", 1)),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
      },
      upcomingTime,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.advice).toContain("Chưa có dự báo, sẽ có từ ngày 05/12/2026");
    expect(res.advice).toContain("Giờ mặt trời Ngày 1");
  });

  it("answers next-visit progress accurately for ONGOING trips using uncompleted draft visits and keeps subsequent edits working", async () => {
    const { database, draft } = createInterleavedFixture({ v2StartMinute: 660, v2DurationMinutes: 60 });

    const progressRes = await createAiEditProposal(
      "trip-qa-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Tiếp theo mình đi đâu, mấy giờ xuất phát?",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify(qaPlan("PROGRESS_QA", 1)),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
      },
      ongoingAt0930,
    );

    expect(progressRes.status).toBe("ADVISED");
    if (progressRes.status !== "ADVISED") return;
    // At 09:30, v1 (08:00) is completed/locked, so next visit MUST be v2 (Đèo Mã Pì Lèng at 11:00)
    expect(progressRes.advice).toContain("Đèo Mã Pì Lèng");
    expect(progressRes.advice).toContain("11:00");
    expect(progressRes.advice).not.toContain("Dinh Vua Mèo");

    // Next interleaved edit turn continues working seamlessly on untouched draft
    const nextEdit = await createAiEditProposal(
      "trip-qa-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Đổi Đèo Mã Pì Lèng sang 13:00",
        draft,
      },
      {
        database: database as unknown as Database,
        llm: {
          complete: async () => ({
            rawText: JSON.stringify({
              mode: "APPLY_BATCH",
              operations: [
                {
                  intentType: "CHANGE_TIME",
                  targetVisitIds: ["v2"],
                  destinationId: null,
                  dayIndex: 1,
                  position: null,
                  startTime: "13:00",
                  durationMinutes: null,
                  shiftFollowing: false,
                },
              ],
              originClocks: {
                departureTime: null,
                returnDeadlineTime: null,
                returnDepartureTime: null,
                rescheduleDayOne: false,
              },
              adviceFocus: { dayIndex: null, topic: null },
              candidateVisitIds: [],
              candidateDestinationIds: [],
              affected: { visitIds: ["v2"], dayIndexes: [1] },
              clarificationReason: null,
            }),
            model: "step-1",
          }),
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 15000 }),
      },
      ongoingAt0930,
    );

    expect(nextEdit.status).toBe("PROPOSED");
    if (nextEdit.status === "PROPOSED") {
      expect(nextEdit.candidate.days[0]!.visits[1]!.startMinute).toBe(780);
    }
  });
});
