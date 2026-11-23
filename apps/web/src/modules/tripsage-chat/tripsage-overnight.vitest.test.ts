import { describe, expect, it } from "vitest";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import {
  arrangeSelectionForOvernightAreas,
  evaluateOvernightConstraints,
  extractOvernightConstraintsFromText,
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
      { toolCallId: "t1", messages: [] },
    ) as Record<string, unknown>;

    expect(res.ok).toBe(true);
    expect(res.unmetOvernightAreas).toBeUndefined();
    const plan = emittedItineraries.at(-1)!;
    expect(plan.days[1]!.stops.map(s => s.destination.id)).toEqual([NHO_QUE.id, DONG_VAN.id]);
    expect(plan.days[1]!.stops.at(-1)!.destination.name).toBe("Phố cổ Đồng Văn");
    expect(emittedTripInfos.at(-1)).toMatchObject({ overnightAreas: [{ afterDay: 2, area: "Đồng Văn" }] });

    // Lodging search near Đồng Văn attaches cleanly to d2-overnight
    await tools.searchPlaces.execute!({ query: "homestay", nearDestinationId: DONG_VAN.id }, { toolCallId: "t2", messages: [] });
    const addRes = await tools.addSuggestions.execute!(
      { items: [{ slotId: "d2-overnight", kind: "LODGING", title: "Phố núi Homestay Đồng Văn", placeId: "ChIJ-dv-1" }] },
      { toolCallId: "t3", messages: [] },
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
      { toolCallId: "t1", messages: [] },
    ) as { ok: boolean; unmetOvernightAreas?: { afterDay: number; wantedArea: string; reason: string; chips: string[] }[]; note?: string };

    expect(res.ok).toBe(true);
    expect(res.unmetOvernightAreas).toHaveLength(1);
    expect(res.unmetOvernightAreas![0]!.reason).toBe("NO_SUCH_NIGHT");
    expect(emittedReplies.at(-1)).toEqual(["Nghỉ Đồng Văn đêm 1", "Thêm 1 ngày", "Bỏ yêu cầu nghỉ Đồng Văn"]);
    expect(res.note).toContain("Đồng Văn");

    // Off-topic bus-ticket suggestReplies must be rejected when overnight constraint is unmet
    const badSuggest = await tools.suggestReplies.execute!(
      { replies: ["Tra lại giá vé xe khách", "Giữ tuyến trực tiếp", "Bỏ qua khoản vé"] },
      { toolCallId: "t2", messages: [] },
    ) as { ok: boolean; code?: string };
    expect(badSuggest.ok).toBe(false);
    expect(badSuggest.code).toBe("UNMET_OVERNIGHT_PRIORITY");
  });
});
