import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import type { PlannerResult } from "../trip-planner/planner-contract";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { TripsageItineraryView } from "../../components/tripsage-chat/tripsage-itinerary-view";
import { TripsageTimelineView } from "../../components/tripsage-chat/tripsage-timeline-view";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { isHaNoiOriginOrHome, shouldSuggestHub } from "./tripsage-access-leg";
import { reconcileQuickRepliesWithQuestion } from "./tripsage-chat-service";
import { buildDayTimeline } from "./tripsage-timeline";

const THANH_HOA_JOURNEY = {
  origin: { label: "TP Thanh Hóa, Thanh Hóa", latitude: 19.8067, longitude: 105.7852, source: "GOOGLE_PLACES" as const, confirmed: true },
  departureMinute: 420,
  returnDeadlineMinute: 1080,
  returnDepartureMinute: null,
};

function makeProposal(over: Partial<PlannerResult> = {}): PlannerResult {
  const requirement = tripRequirementInputSchema.parse({
    startDate: "2026-12-01",
    durationDays: 2,
    transport: "MOTORCYCLE",
    interests: ["NATURE"],
    journey: THANH_HOA_JOURNEY,
  });
  return {
    proposalId: "p-tl-fix",
    phase: "PRELIMINARY_PROPOSAL",
    status: "PROPOSAL_READY",
    requirement,
    timezone: "Asia/Ho_Chi_Minh",
    days: [
      {
        day: 1,
        date: "2026-12-01",
        stops: [
          {
            order: 1,
            destination: {
              id: "d1",
              name: "Điểm sáng sớm",
              description: "Mô tả điểm sáng sớm",
              area: "khu vực Hà Giang",
              address: null,
              category: "SCENIC",
              latitude: 22.82,
              longitude: 104.98,
              image: null,
            },
            arrivalMinute: 570, // 09:30
            departureMinute: 650, // 10:50
            visitDurationMinutes: 80,
            scheduleState: "PLANNED",
            inbound: null,
            validationStatus: "PASS",
          },
        ],
        distanceMeters: 50_000,
        travelSeconds: 3600,
      },
      {
        day: 2,
        date: "2026-12-02",
        stops: [],
        journeyDayKind: "RETURN_ONLY",
        distanceMeters: 446_000,
        travelSeconds: 30_600, // 8h30
      },
    ],
    journeyPlan: {
      policy: "roadside-rest-v1",
      legs: [
        {
          kind: "OUTBOUND",
          day: 1,
          from: { kind: "ORIGIN" },
          to: { kind: "ATTRACTION", destinationId: "d1" },
          startMinute: 420,
          endMinute: 570,
          restMinutes: 0,
          route: { status: "VERIFIED", reason: null, durationSeconds: 9_000, distanceMeters: 50_000, provider: "STADIA_MAPS" },
        },
        {
          kind: "RETURN",
          day: 2,
          from: { kind: "ATTRACTION", destinationId: "d1" },
          to: { kind: "ORIGIN" },
          startMinute: 480,
          endMinute: 990,
          restMinutes: 60,
          route: { status: "VERIFIED", reason: null, durationSeconds: 30_600, distanceMeters: 446_000, provider: "STADIA_MAPS" },
        },
      ],
      totals: { distanceMeters: 496_000, drivingSeconds: 39_600, restMinutes: 60 },
    },
    checks: [
      { key: "OPENING_HOURS", status: "PASS", issues: [] },
      { key: "MINIMUM_DURATION", status: "PASS", issues: [] },
      { key: "TRAVEL_TIME", status: "PASS", issues: [] },
      { key: "SCHEDULE_CONFLICTS", status: "PASS", issues: [] },
      { key: "MOBILITY", status: "PASS", issues: [] },
    ],
    warnings: [],
    reasonCodes: [],
    eligibleForFinalConfirmation: true,
    ...over,
  };
}

describe("Ticket 06: timeline and long day-1 hubHint fixes", () => {
  it("never places overnight at 10:50 when the day ends early; shows afternoon free time and deduplicates 'khu vực'", () => {
    const proposal = makeProposal();
    const timeline = buildDayTimeline(proposal);
    const day1 = timeline.days[0]!;
    const overnight = day1.items.find(item => item.kind === "OVERNIGHT")!;
    expect(overnight.startMinute).not.toBe(650);
    // Bug 9: generic province placeholder "khu vực Hà Giang" resolves to the nearest commune/town (TP Hà Giang at 22.82, 104.98), never the stop name or province placeholder.
    expect(overnight.label).toBe("Nghỉ đêm khu vực TP Hà Giang");
    expect(overnight.label).not.toBe("Nghỉ đêm khu vực Điểm sáng sớm");
    expect(overnight.label).not.toBe("Nghỉ đêm khu vực Hà Giang");
    expect(overnight.label.toLowerCase()).not.toContain("khu vực khu vực");
    expect(day1.items.some(item => item.label.toLowerCase().includes("tự do buổi chiều"))).toBe(true);

    const html = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline, suggestions: [] }));
    expect(html).toContain("Tự do buổi chiều");
    expect(html).not.toContain("khu vực khu vực");
  });

  it("shows 'Ngày di chuyển' with distance and duration for a travel-only day instead of 'Chưa có điểm phù hợp'", () => {
    const base = makeProposal();
    const proposal = makeProposal({
      days: [
        {
          day: 1,
          date: "2026-12-01",
          stops: [],
          journeyDayKind: "OUTBOUND_ONLY",
          distanceMeters: 446_000,
          travelSeconds: 30_600,
        },
        { ...base.days[0]!, day: 2, date: "2026-12-02" },
      ],
      journeyPlan: {
        policy: "roadside-rest-v1",
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d1" },
            startMinute: 420,
            endMinute: 990,
            restMinutes: 60,
            route: { status: "VERIFIED", reason: null, durationSeconds: 30_600, distanceMeters: 446_000, provider: "STADIA_MAPS" },
          },
        ],
        totals: { distanceMeters: 446_000, drivingSeconds: 30_600, restMinutes: 60 },
      },
    });
    const timeline = buildDayTimeline(proposal);
    expect(timeline.days[0]!.items.some(item => item.label.includes("Ngày di chuyển") && item.label.includes("446 km"))).toBe(true);

    const itineraryHtml = renderToStaticMarkup(createElement(TripsageItineraryView, { proposal }));
    // The day detail now lives only in the timeline above; the itinerary card must not show the empty-day fallback.
    expect(itineraryHtml).not.toContain("Chưa có điểm phù hợp");
  });

  it("returns hubHint for a short 3-day motorcycle trip from Thanh Hóa (~446 km day 1)", async () => {
    let call = 0;
    const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const chunks = call++ === 0
          ? [{ type: "tool-call", toolCallId: "c1", toolName: "proposeItinerary", input: JSON.stringify({ selection: { days: [[], ["a"], ["b"]] } }) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
          : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Gợi ý tập kết TP Hà Giang." }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
      },
    });
    const auth = {
      database: { user: { findUnique: async () => ({ id: "tl-th", role: "TRAVELER", status: "ACTIVE" }) } },
      resolveSession: async () => ({ user: { id: "tl-th" } }),
    } as unknown as AuthorizationDependencies;
    const planning: () => TripsagePlanningDeps = () => ({
      candidates: async () => [planningCandidate("a"), planningCandidate("b")],
      routes: {
        route: fixtureRoutes.route,
        coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 30_600, distanceMeters: 446_000, provider: "STADIA_MAPS" }),
      },
      now: () => planningNow,
    });
    const response = await tripsageChatResponse(
      new Request("https://app.test/api/ai/chat", {
        method: "POST",
        headers: { origin: "https://app.test", "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Đi từ Thanh Hóa 3 ngày xe máy" }] }],
          tripInfo: { transport: "MOTORCYCLE", durationDays: 3, startDate: "2026-12-01" },
          journey: THANH_HOA_JOURNEY,
        }),
      }),
      { authorization: auth, model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(), planning },
    );
    expect(response.status).toBe(200);
    await response.text();
    const fedToModel = JSON.stringify(model.doStreamCalls[1]!.prompt);
    expect(fedToModel).toContain("hubHint");
    expect(fedToModel).toContain("hub:HA_GIANG_CITY");

    // Also verify centralized shouldSuggestHub triggers for a 7h / 446km outbound on a 3-day trip (under old 10h cap)
    const shortTripLongLeg = makeProposal({
      requirement: tripRequirementInputSchema.parse({
        startDate: "2026-12-01",
        durationDays: 3,
        transport: "MOTORCYCLE",
        interests: ["NATURE"],
        journey: THANH_HOA_JOURNEY,
      }),
      journeyPlan: {
        policy: "roadside-rest-v1",
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d1" },
            startMinute: 420,
            endMinute: 840,
            restMinutes: 30,
            route: { status: "VERIFIED", reason: null, durationSeconds: 25_200, distanceMeters: 446_000, provider: "STADIA_MAPS" },
          },
        ],
        totals: { distanceMeters: 446_000, drivingSeconds: 25_200, restMinutes: 30 },
      },
    });
    expect(shouldSuggestHub(shortTripLongLeg)).toBe(true);
  });

  it("S5: never suggests hub-access chips ('Đi tàu hỏa/máy bay ra Hà Nội') for Hanoi self-drive travelers and reconciles adjustment questions", () => {
    const cauGiayJourney = {
      origin: { label: "Quận Cầu Giấy, Hà Nội", latitude: 21.0362, longitude: 105.7906, source: "GOOGLE_PLACES" as const, confirmed: true as const },
      departureMinute: 420,
      returnDeadlineMinute: 1080,
    };
    const hanoi4DayCar = makeProposal({
      requirement: tripRequirementInputSchema.parse({
        startDate: "2026-12-11",
        durationDays: 4,
        transport: "CAR",
        interests: ["NATURE"],
        journey: cauGiayJourney,
      }),
      journeyPlan: {
        policy: "roadside-rest-v1",
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d1" },
            startMinute: 420,
            endMinute: 850,
            restMinutes: 45,
            route: { status: "VERIFIED", reason: null, durationSeconds: 25_200, distanceMeters: 348_700, provider: "STADIA_MAPS" },
          },
        ],
        totals: { distanceMeters: 348_700, drivingSeconds: 25_200, restMinutes: 45 },
      },
    });

    // Cầu Giấy, Hà Nội is already inside Hà Nội -> shouldSuggestHub MUST return false
    expect(isHaNoiOriginOrHome("Quận Cầu Giấy, Hà Nội", "Hà Nội")).toBe(true);
    expect(shouldSuggestHub(hanoi4DayCar)).toBe(false);

    // Reconcile safety net: if stale hub chips ever pair with "Bạn muốn ưu tiên điều chỉnh nào?", replace with matching schedule-adjustment chips
    const reconciled = reconcileQuickRepliesWithQuestion({
      text: "Lịch 4 ngày từ Cầu Giấy đã xong nhưng ngày 1 chạy khá dài.\nBạn muốn ưu tiên điều chỉnh nào?",
      latestUserText: "Thêm 1 ngày",
      emittedReplies: ["Đi xe khách lên TP Hà Giang", "Đi tàu hỏa ra Hà Nội", "Đi máy bay ra Hà Nội"],
      hasOriginCandidates: false,
      itinerary: hanoi4DayCar,
      cost: null,
      accessLeg: null,
      tripInfo: { transport: "CAR", durationDays: 4, startDate: "2026-12-11", travelers: 3, homeCity: "Hà Nội" },
    });
    expect(reconciled).toBeTruthy();
    expect(reconciled!.some(r => /ra\s+h[aà]\s+n[oộ]i/iu.test(r))).toBe(false);
    expect(reconciled!.some(r => /t[aà]u\s+h[oỏ]a|m[aá]y\s+bay/iu.test(r))).toBe(false);
    expect(reconciled).toContain("Nghỉ TP Hà Giang đêm 1");
  });
});
