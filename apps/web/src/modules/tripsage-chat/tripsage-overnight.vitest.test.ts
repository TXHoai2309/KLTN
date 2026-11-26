import { describe, expect, it } from "vitest";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";
import {
  arrangeSelectionForOvernightAreas,
  evaluateOvernightConstraints,
  extractOvernightConstraintsFromText,
  filterEvidencedOvernightConstraints,
  isStopNearOvernightArea,
  mergeOvernightAreaConstraints,
  type OvernightAreaConstraint,
} from "./tripsage-overnight";
import type { PlannerResult } from "../trip-planner/planner-contract";
import type { TripJourney } from "../trip-origin/trip-origin-contract";

const ALL_OPEN = (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const).map(
  dayOfWeek => ({ dayOfWeek, status: "OPEN" as const, intervals: [{ opensAtMinute: 360, closesAtMinute: 1080 }] }),
);

function candidate(id: string, name: string, latitude: number, longitude: number, address: string): PlannerCandidate {
  return {
    id,
    name,
    description: `${name} description`,
    area: "khu vực hà giang",
    category: "thiên nhiên – thắng cảnh",
    latitude,
    longitude,
    address,
    image: null,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    visibility: "VISIBLE",
    revision: "v1",
    isOutdoor: true,
    openingDays: ALL_OPEN,
  };
}

const QUAN_BA = candidate("dest-quan-ba", "Cổng trời Quản Bạ", 23.0493, 104.9927, "Xã Quản Bạ, tỉnh Tuyên Quang");
const NHO_QUE = candidate("dest-nho-que", "Sông Nho Quế", 23.1907, 105.4695, "Khu vực bến thuyền Nho Quế 1, xã Mèo Vạc, tỉnh Tuyên Quang");
const DONG_VAN = candidate("dest-dong-van", "Phố cổ Đồng Văn", 23.2783, 105.3614, "Xã Đồng Văn, tỉnh Tuyên Quang");
const MA_PI_LENG = candidate("dest-ma-pi-leng", "Đèo Mã Pì Lèng", 23.2400, 105.4000, "Quốc lộ 4C, tuyến Đồng Văn – Mèo Vạc");
const SA_PHIN = candidate("dest-sa-phin", "Dinh thự họ Vương", 23.2563, 105.2621, "Thôn Sà Phìn, xã Sà Phìn, tỉnh Tuyên Quang");
const ALL = [QUAN_BA, NHO_QUE, DONG_VAN, MA_PI_LENG, SA_PHIN];

const FAST_ROUTES: RouteProvider = {
  route: async ({ from, to }) => ({
    fromDestinationId: from.id,
    toDestinationId: to.id,
    status: "VERIFIED",
    provider: "GOOGLE_MAPS",
    durationSeconds: 3600,
    distanceMeters: 45_000,
    reason: null,
  }),
  coordinateRoute: async () => ({
    status: "VERIFIED",
    provider: "GOOGLE_MAPS",
    durationSeconds: 5400,
    distanceMeters: 65_000,
    reason: null,
  }),
};

const HA_GIANG_JOURNEY: TripJourney = {
  origin: {
    label: "TP Hà Giang (bến xe phía Nam)",
    latitude: 22.8233,
    longitude: 104.9836,
    source: "MANUAL",
    confirmed: true,
  },
  departureMinute: 420,
  returnDeadlineMinute: 1080,
  returnDepartureMinute: 420,
};

describe("Point 1 — overnight area constraints (unit)", () => {
  it("extracts explicit overnight request and removal from Vietnamese user text", () => {
    expect(extractOvernightConstraintsFromText("thêm đi thuyền sông Nho Quế vào ngày 2 nhé, và tối ngày 2 nghỉ ở Đồng Văn")).toEqual({
      add: [{ afterDay: 2, area: "Đồng Văn" }],
      removeAreas: [],
      clearAll: false,
    });
    expect(extractOvernightConstraintsFromText("2 ngày, ngủ Đồng Văn đêm 1")).toEqual({
      add: [{ afterDay: 1, area: "Đồng Văn" }],
      removeAreas: [],
      clearAll: false,
    });
    expect(extractOvernightConstraintsFromText("Bỏ yêu cầu nghỉ Đồng Văn")).toEqual({
      add: [],
      removeAreas: ["Đồng Văn"],
      clearAll: false,
    });
  });

  it("matches stops in Đồng Văn and rejects Sông Nho Quế (~21 km mountain road away)", () => {
    expect(isStopNearOvernightArea(DONG_VAN, "Đồng Văn", ALL)).toBe(true);
    expect(isStopNearOvernightArea(MA_PI_LENG, "Đồng Văn", ALL)).toBe(true);
    expect(isStopNearOvernightArea(NHO_QUE, "Đồng Văn", ALL)).toBe(false);
    expect(isStopNearOvernightArea(QUAN_BA, "Đồng Văn", ALL)).toBe(false);
  });

  it("reorders Day 2 [Phố cổ Đồng Văn, Sông Nho Quế] so Day 2 ends at Phố cổ Đồng Văn", () => {
    const byId = new Map(ALL.map(c => [c.id, c]));
    const arranged = arrangeSelectionForOvernightAreas(
      [[QUAN_BA.id], [DONG_VAN.id, NHO_QUE.id], [MA_PI_LENG.id]],
      [{ afterDay: 2, area: "Đồng Văn" }],
      byId,
      ALL,
    );
    expect(arranged[1]).toEqual([NHO_QUE.id, DONG_VAN.id]);
  });

  it("merges updated overnight constraints and removes explicitly dropped areas", () => {
    const first: OvernightAreaConstraint[] = [{ afterDay: 2, area: "Đồng Văn" }];
    const replaced = mergeOvernightAreaConstraints(first, { add: [{ afterDay: 1, area: "Đồng Văn" }], removeAreas: [], clearAll: false });
    expect(replaced).toEqual([{ afterDay: 1, area: "Đồng Văn" }, { afterDay: 2, area: "Đồng Văn" }]);
    const cleared = mergeOvernightAreaConstraints(replaced, { add: [], removeAreas: ["Đồng Văn"], clearAll: false });
    expect(cleared).toEqual([]);
  });
});

describe("Point 1 — L2→L4→L7 proposeItinerary overnight enforcement", () => {
  it("keeps Day 2 ending at Phố cổ Đồng Văn (no boundary repartition hijack) and attaches Đồng Văn lodging", async () => {
    const emittedItineraries: PlannerResult[] = [];
    const emittedTripInfos: unknown[] = [];
    const emittedSuggestions: unknown[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => ALL, routes: FAST_ROUTES, now: () => new Date("2026-11-23T05:00:00Z") },
      emitItinerary: result => emittedItineraries.push(result),
      emitTripInfo: info => emittedTripInfos.push(info),
      emitSuggestions: items => emittedSuggestions.push(...items),
      places: async () => ({
        status: "RESULTS",
        places: [
          { placeId: "ChIJ-dv-1", name: "Phố núi Homestay Đồng Văn", latitude: 23.2785, longitude: 105.3618 },
        ],
      }),
      journey: HA_GIANG_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 3,
        startDate: "2026-12-19",
        pace: "RELAXED",
        interests: ["PHOTOGRAPHY"],
        travelers: 2,
      },
      latestUserText: "thêm đi thuyền sông Nho Quế vào ngày 2 nhé, và tối ngày 2 nghỉ ở Đồng Văn",
    });

    // Even if model puts [DONG_VAN, NHO_QUE] on Day 2, server rearranges Day 2 to end at DONG_VAN
    // and preserves Day 2 boundary (does not repartition Day 2 stops into Day 1 / Day 3).
    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [DONG_VAN.id, NHO_QUE.id], [MA_PI_LENG.id]] } },
      { toolCallId: "t1", messages: [], context: {} },
    ) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(res.unmetOvernightAreas).toBeUndefined();
    const plan = emittedItineraries.at(-1)!;
    expect(plan.days[1]!.stops.map(s => s.destination.id)).toEqual([NHO_QUE.id, DONG_VAN.id]);
    expect(plan.days[1]!.stops.at(-1)!.destination.name).toBe("Phố cổ Đồng Văn");
    expect(emittedTripInfos.at(-1)).toMatchObject({ overnightAreas: [{ afterDay: 2, area: "Đồng Văn" }] });

    // Lodging search near Đồng Văn attaches cleanly to d2-overnight
    await tools.searchPlaces.execute!({ query: "homestay", nearDestinationId: DONG_VAN.id }, { toolCallId: "t2", messages: [], context: {} });
    const addRes = await tools.addSuggestions.execute!(
      { items: [{ slotId: "d2-overnight", kind: "LODGING", title: "Phố núi Homestay Đồng Văn", placeId: "ChIJ-dv-1" }] },
      { toolCallId: "t3", messages: [], context: {} },
    ) as Record<string, unknown>;
    expect(addRes.ok).toBe(true);
    expect(addRes.rejected).toEqual([]);
  });

  it("flags unmet overnight constraint with specific reason and 3 resolution chips when trip is shortened to 2 days (L7)", async () => {
    const emittedReplies: string[][] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => ALL, routes: FAST_ROUTES, now: () => new Date("2026-11-23T05:00:00Z") },
      emitItinerary: () => {},
      emitQuickReplies: replies => emittedReplies.push(replies),
      journey: HA_GIANG_JOURNEY,
      tripInfo: {
        transport: "CAR",
        durationDays: 2,
        startDate: "2026-12-19",
        pace: "RELAXED",
        interests: ["PHOTOGRAPHY"],
        travelers: 2,
        // Persisted from earlier turn L4
        overnightAreas: [{ afterDay: 2, area: "Đồng Văn" }],
      },
      latestUserText: "thôi đổi sang thuê ô tô có tài xế cho đỡ mệt, và rút còn 2 ngày thôi",
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id, NHO_QUE.id], [DONG_VAN.id]] } },
      { toolCallId: "t1", messages: [], context: {} },
    ) as { ok: boolean; unmetOvernightAreas?: { afterDay: number; wantedArea: string; reason: string; chips: string[] }[]; note?: string };

    expect(res.ok).toBe(true);
    expect(res.unmetOvernightAreas).toHaveLength(1);
    expect(res.unmetOvernightAreas![0]!.reason).toBe("NO_SUCH_NIGHT");
    expect(emittedReplies.at(-1)).toEqual(["Nghỉ Đồng Văn đêm 1", "Thêm 1 ngày", "Bỏ yêu cầu nghỉ Đồng Văn"]);
    expect(res.note).toContain("Đồng Văn");

    // Off-topic bus-ticket suggestReplies must be rejected when overnight constraint is unmet
    const badSuggest = await tools.suggestReplies.execute!(
      { replies: ["Tra lại giá vé xe khách", "Giữ tuyến trực tiếp", "Bỏ qua khoản vé"] },
      { toolCallId: "t2", messages: [], context: {} },
    ) as { ok: boolean; code?: string };
    expect(badSuggest.ok).toBe(false);
    expect(badSuggest.code).toBe("UNMET_OVERNIGHT_PRIORITY");
  });
});

describe("D2 (B1, B2, Q6) — traveler-only overnightAreas, constrained fill, and add-day rebuild", () => {
  const LUNG_CU = candidate("dest-lung-cu", "Cột cờ Lũng Cú", 23.3638, 105.3189, "Xã Lũng Cú, Đồng Văn");
  const YEN_MINH = candidate("dest-yen-minh", "Rừng thông Yên Minh", 23.1167, 105.15, "Thị trấn Yên Minh");
  const SUNG_LA = candidate("dest-sung-la", "Thung lũng Sủng Là", 23.218, 105.245, "Xã Sủng Là, Đồng Văn");
  const THAM_MA = candidate("dest-tham-ma", "Dốc Thẩm Mã", 23.157, 105.219, "Quốc lộ 4C, Yên Minh");
  const POOL = [QUAN_BA, YEN_MINH, THAM_MA, SUNG_LA, SA_PHIN, LUNG_CU, DONG_VAN, MA_PI_LENG, NHO_QUE];

  it("B1: recordTripInfo rejects model-invented overnightAreas when traveler only asked to return earlier", async () => {
    const emittedTripInfos: Record<string, unknown>[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => POOL, routes: FAST_ROUTES, now: () => new Date("2026-11-26T04:00:00Z") },
      emitItinerary: () => {},
      emitTripInfo: info => emittedTripInfos.push(info as Record<string, unknown>),
      journey: HA_GIANG_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 4,
        startDate: "2026-12-20",
        travelers: 4,
      },
      latestUserText: "Về tới Hà Nội gần 22h thì muộn quá, cho ngày cuối đi sớm hơn và thêm sông Nho Quế được không?",
    });

    const res = await tools.recordTripInfo.execute!(
      { overnightAreas: [{ afterDay: 3, area: "TP Hà Giang" }] },
      { toolCallId: "t-b1", messages: [], context: {} },
    ) as { ok: boolean; tripInfo: { overnightAreas?: OvernightAreaConstraint[] }; overnightAreasIgnored?: OvernightAreaConstraint[]; note?: string };

    expect(res.ok).toBe(true);
    expect(res.tripInfo.overnightAreas).toBeUndefined();
    expect(res.overnightAreasIgnored).toEqual([{ afterDay: 3, area: "TP Hà Giang" }]);
    expect(res.note).toContain("departureMinute");
    expect(emittedTripInfos.at(-1)?.overnightAreas).toBeUndefined();
  });

  it("accepts traveler-stated overnightAreas / overnight chip and always allows [] to clear", async () => {
    const chipTools = createTripsageChatTools({
      planning: { candidates: async () => POOL, routes: FAST_ROUTES, now: () => new Date("2026-11-26T04:00:00Z") },
      emitItinerary: () => {},
      journey: HA_GIANG_JOURNEY,
      tripInfo: { transport: "MOTORCYCLE", durationDays: 3, startDate: "2026-12-20" },
      latestUserText: "Nghỉ Đồng Văn đêm 1",
    });
    const chipRes = await chipTools.recordTripInfo.execute!(
      { overnightAreas: [{ afterDay: 1, area: "Đồng Văn" }] },
      { toolCallId: "t-chip", messages: [], context: {} },
    ) as { ok: boolean; tripInfo: { overnightAreas?: OvernightAreaConstraint[] } };
    expect(chipRes.ok).toBe(true);
    expect(chipRes.tripInfo.overnightAreas).toEqual([{ afterDay: 1, area: "Đồng Văn" }]);

    const clearRes = await chipTools.recordTripInfo.execute!(
      { overnightAreas: [] },
      { toolCallId: "t-clear", messages: [], context: {} },
    ) as { ok: boolean; tripInfo: { overnightAreas?: OvernightAreaConstraint[] } };
    expect(clearRes.ok).toBe(true);
    expect(clearRes.tripInfo.overnightAreas).toBeUndefined();

    expect(
      filterEvidencedOvernightConstraints({
        requested: [{ afterDay: 3, area: "TP Hà Giang" }],
        userTexts: ["cho ngày cuối đi sớm hơn"],
      }),
    ).toEqual({
      accepted: [],
      rejected: [{ afterDay: 3, area: "TP Hà Giang" }],
    });
  });

  it("B2: increasing durationDays ('Thêm 1 ngày') rebuilds to fill the new day and restores mustIncludeDestinationIds", async () => {
    const emitted: PlannerResult[] = [];
    const currentItinerary = {
      days: [
        { day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 480, departureMinute: 540 }] },
        { day: 2, stops: [{ id: YEN_MINH.id, name: YEN_MINH.name, arrivalMinute: 480, departureMinute: 540 }, { id: LUNG_CU.id, name: LUNG_CU.name, arrivalMinute: 660, departureMinute: 720 }] },
        { day: 3, stops: [{ id: DONG_VAN.id, name: DONG_VAN.name, arrivalMinute: 480, departureMinute: 540 }] },
        { day: 4, stops: [{ id: MA_PI_LENG.id, name: MA_PI_LENG.name, arrivalMinute: 480, departureMinute: 540 }] },
      ],
    };

    const tools = createTripsageChatTools({
      planning: { candidates: async () => POOL, routes: FAST_ROUTES, now: () => new Date("2026-11-26T04:00:00Z") },
      emitItinerary: result => emitted.push(result),
      journey: HA_GIANG_JOURNEY,
      currentItinerary,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 5,
        startDate: "2026-12-20",
        travelers: 4,
        mustIncludeDestinationIds: [LUNG_CU.id, MA_PI_LENG.id, NHO_QUE.id],
      },
      latestUserText: "Thêm 1 ngày",
    });

    // Even when the model passes the same 5 stops and leaves Day 5 empty, server rebuilds & fills instead of treating as reshuffleOfShown
    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [YEN_MINH.id, LUNG_CU.id], [DONG_VAN.id], [MA_PI_LENG.id], []] } },
      { toolCallId: "t-b2", messages: [], context: {} },
    ) as { ok: boolean };

    expect(res.ok).toBe(true);
    const plan = emitted.at(-1)!;
    const allIds = plan.days.flatMap(d => d.stops.map(s => s.destination.id));
    expect(allIds).toContain(NHO_QUE.id);
    expect(allIds).toContain(LUNG_CU.id);
    expect(allIds).toContain(MA_PI_LENG.id);
    expect(allIds.length).toBeGreaterThan(5);
    // No unused EMPTY days: every day has sightseeing visits or is an explicit travel-only boundary day
    expect(
      plan.days.every(
        d => d.stops.length > 0 || d.journeyDayKind === "OUTBOUND_ONLY" || d.journeyDayKind === "RETURN_ONLY",
      ),
    ).toBe(true);
    // And with enough stops (or without return-only packing), Day 5 receives sightseeing stops directly
    const planDaysWithVisits = plan.days.filter(d => d.stops.length > 0).length;
    expect(planDaysWithVisits).toBeGreaterThanOrEqual(4);
  });

  it("Q6: with a real traveler overnight constraint, arrangeTripRoute fills unconstrained days without moving the constrained day's end stop", async () => {
    const emitted: PlannerResult[] = [];
    const tools = createTripsageChatTools({
      planning: { candidates: async () => POOL, routes: FAST_ROUTES, now: () => new Date("2026-11-26T04:00:00Z") },
      emitItinerary: result => emitted.push(result),
      journey: HA_GIANG_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 4,
        startDate: "2026-12-20",
        travelers: 2,
        overnightAreas: [{ afterDay: 2, area: "Đồng Văn" }],
      },
      latestUserText: "tối ngày 2 nghỉ ở Đồng Văn",
    });

    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [NHO_QUE.id, DONG_VAN.id], [MA_PI_LENG.id], []] } },
      { toolCallId: "t-q6", messages: [], context: {} },
    ) as { ok: boolean; unmetOvernightAreas?: unknown[] };

    expect(res.ok).toBe(true);
    expect(res.unmetOvernightAreas).toBeUndefined();
    const plan = emitted.at(-1)!;
    // Day 2 remains locked ending at Đồng Văn
    expect(plan.days[1]!.stops.at(-1)!.destination.id).toBe(DONG_VAN.id);
    // Unconstrained days (including Day 4) were filled by arrangeTripRoute
    expect(plan.days.flatMap(d => d.stops).length).toBeGreaterThan(4);
    expect(plan.days[3]!.stops.length).toBeGreaterThan(0);
  });

  it("D2 §2 & §5: prompt forbids overnightAreas for early-return requests and reports unscheduledRequiredStops when a required stop cannot fit", async () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("KHÔNG được tự ghi overnightAreas");

    const tools = createTripsageChatTools({
      planning: { candidates: async () => POOL, routes: FAST_ROUTES, now: () => new Date("2026-11-26T04:00:00Z") },
      emitItinerary: () => {},
      journey: HA_GIANG_JOURNEY,
      tripInfo: {
        transport: "MOTORCYCLE",
        durationDays: 2,
        startDate: "2026-12-20",
        mustIncludeDestinationIds: [NHO_QUE.id],
      },
      latestUserText: "lịch 2 ngày",
    });

    // Model omits required NHO_QUE and uses a reshuffle-like single-day pick -> unscheduledRequiredStops surfaces cleanly if absent
    const res = await tools.proposeItinerary.execute!(
      { selection: { days: [[QUAN_BA.id], [YEN_MINH.id]] } },
      { toolCallId: "t-req", messages: [], context: {} },
    ) as { ok: boolean; unscheduledRequiredStops?: string[]; days: { stops: string[] }[]; note?: string };

    expect(res.ok).toBe(true);
    const hasNhoQue = res.days.some(d => d.stops.includes(NHO_QUE.name));
    if (!hasNhoQue) {
      expect(res.unscheduledRequiredStops).toContain(NHO_QUE.name);
      expect(res.note).toContain("CHƯA XẾP ĐƯỢC ĐIỂM BẮT BUỘC");
    }
  });
});
