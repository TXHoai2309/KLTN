import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlannerResult } from "../trip-planner/planner-contract";
import {
  ACTIVITY_MAX_ANCHORS,
  ACTIVITY_RADIUS_KM,
  EVENING_PER_SLOT,
  OVERNIGHT_TOWN_CENTERS,
  activityAnchors,
  isLodgingPlace,
  nearbyActivitySuggestions,
  type EveningAnchorDiagnostic,
} from "./tripsage-activities";
import type { PlacesSearch } from "./tripsage-places";
import { buildDayEveningPlan } from "@/components/trip-timeline/evening-plan";
import { DayTimeline } from "@/components/trip-timeline/day-timeline";
import { changedOvernightDays, refreshTripEveningSuggestions } from "../trip-edit/refresh-evening-suggestions";
import { buildTripsageContext } from "./tripsage-chat-service";
import { estimateTripCost } from "./tripsage-cost";

const stop = (name: string, latitude: number, longitude: number, departureMinute = 960) => ({
  departureMinute,
  destination: { id: name, name, latitude, longitude },
});

describe("Ticket 08: Khối Tối nay (PARITY AC-6, AC-8, AC-9, AC-10)", () => {
  it("gives a 5-day trip 4 EVENING anchors within 3 km, <= 3 places each, excluding lodging (PARITY AC-6)", async () => {
    expect(ACTIVITY_RADIUS_KM.EVENING).toBe(3);
    expect(EVENING_PER_SLOT).toBe(3);

    // 5 days with 3 stops each (15 visits total) -> nights must STILL all be preserved within ACTIVITY_MAX_ANCHORS = 16
    const fiveDayPlan = {
      days: [1, 2, 3, 4, 5].map((day) => ({
        day,
        stops: [
          stop(`Điểm ${day}A`, 22.8 + day * 0.1, 105.0),
          stop(`Điểm ${day}B`, 22.82 + day * 0.1, 105.02),
          stop(`Điểm ${day}C`, 22.85 + day * 0.1, 105.05),
        ],
      })),
    } as unknown as PlannerResult;

    const { anchors, stopNames } = activityAnchors(fiveDayPlan);
    expect(anchors.length).toBeLessThanOrEqual(ACTIVITY_MAX_ANCHORS);
    const eveningAnchors = anchors.filter((a) => a.kind === "EVENING");
    expect(eveningAnchors.map((a) => a.slotId)).toEqual([
      "d1-overnight",
      "d2-overnight",
      "d3-overnight",
      "d4-overnight",
    ]);

    const seenRadii: number[] = [];
    const places: PlacesSearch = vi.fn(async (_q, _s, near) => {
      if (near) seenRadii.push(near.radiusKm);
      return {
        status: "RESULTS" as const,
        places: [
          { placeId: `hotel-${near!.latitude}`, name: "Khách sạn Hoa Hồng", latitude: near!.latitude + 0.001, longitude: near!.longitude, types: ["lodging", "hotel"] },
          { placeId: `far-${near!.latitude}`, name: "Quán xa 4km", latitude: near!.latitude + 0.04, longitude: near!.longitude, types: ["cafe"] },
          { placeId: `ok1-${near!.latitude}`, name: "Chợ đêm 1", latitude: near!.latitude + 0.002, longitude: near!.longitude, types: ["market"] },
          { placeId: `ok2-${near!.latitude}`, name: "Cà phê tối 2", latitude: near!.latitude + 0.004, longitude: near!.longitude, types: ["cafe"] },
          { placeId: `ok3-${near!.latitude}`, name: "Lẩu gà đen 3", latitude: near!.latitude + 0.006, longitude: near!.longitude, types: ["restaurant"] },
          { placeId: `ok4-${near!.latitude}`, name: "Quán thứ tư 4", latitude: near!.latitude + 0.008, longitude: near!.longitude, types: ["restaurant"] },
        ],
      };
    });

    const out = await nearbyActivitySuggestions({ places, anchors: eveningAnchors, stopNames, now: () => 2e10 });
    expect(seenRadii.every((r) => r === 3)).toBe(true);
    for (const night of [1, 2, 3, 4]) {
      const items = out.filter((s) => s.slotId === `d${night}-overnight`);
      expect(items).toHaveLength(3);
      expect(items.every((s) => (s.place?.distanceKm ?? 99) <= 3)).toBe(true);
      expect(items.every((s) => !/Khách sạn|Quán xa/u.test(s.title))).toBe(true);
    }
  });

  it("renders Tối nay block for Days 1..N-1 with fallback text when Places returns empty, and omits Day N", () => {
    const night1 = buildDayEveningPlan({
      dayIndex: 1,
      totalDays: 5,
      lastStopArea: "đồng văn",
      chosenLodging: { name: "Homestay Phố Cổ" },
      eveningPlaces: [],
    });
    expect(night1).not.toBeNull();
    expect(night1?.overnightArea).toBe("Đồng Văn");

    const day5 = buildDayEveningPlan({
      dayIndex: 5,
      totalDays: 5,
      lastStopArea: "TP Hà Giang",
      eveningPlaces: [],
    });
    expect(day5).toBeNull();

    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: {
          dayIndex: 1,
          localDate: "2026-12-13",
          stops: [],
          eveningPlan: night1,
        },
      }),
    );
    expect(html).toContain("Nhận phòng · Đồng Văn");
    expect(html).toContain("Ăn tối gần chỗ nghỉ");
    expect(html).toContain("Homestay Phố Cổ");
    expect(html).toContain("Chưa tìm được gợi ý buổi tối");
  });

  it("refreshes EVENING suggestions only for days whose last stop changed during trip-edit (PARITY AC-8)", async () => {
    const before = [
      { dayIndex: 1, visits: [{ destinationId: "quan-ba", order: 1 }] },
      { dayIndex: 2, visits: [{ destinationId: "dong-van", order: 1 }] },
      { dayIndex: 3, visits: [{ destinationId: "meo-vac", order: 1 }] },
    ];
    const after = [
      { dayIndex: 1, visits: [{ destinationId: "quan-ba", order: 1 }, { destinationId: "yen-minh", order: 2 }] },
      { dayIndex: 2, visits: [{ destinationId: "dong-van", order: 1 }] },
      { dayIndex: 3, visits: [{ destinationId: "tp-ha-giang", order: 1 }] },
    ];
    // Day 3 is the last day -> not an overnight night; Day 2 unchanged; only Day 1 changed!
    expect(changedOvernightDays(before, after)).toEqual([1]);

    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const createMany = vi.fn(async () => ({ count: 1 }));
    const findManyDest = vi.fn(async () => [
      { id: "yen-minh", name: "Thị trấn Yên Minh", latitude: 23.12, longitude: 105.14 },
    ]);
    const places: PlacesSearch = vi.fn(async (_q, _s, near) => ({
      status: "RESULTS" as const,
      places: [
        { placeId: "ym-cafe", name: "Cà phê Rừng Thông", latitude: near!.latitude + 0.003, longitude: near!.longitude, types: ["cafe"] },
      ],
    }));

    const res = await refreshTripEveningSuggestions({
      database: {
        tripNearbySuggestion: { deleteMany, createMany },
        destination: { findMany: findManyDest },
        externalPlace: { findMany: vi.fn(async () => []) },
      } as never,
      tripId: "trip-1",
      beforeDays: before,
      afterDays: after,
      places,
      now: () => 3e10,
    });

    expect(res).toEqual({ refreshedDays: [1], insertedCount: 1 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", kind: "EVENING", dayIndex: { in: [1] } },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tripId: "trip-1",
          dayIndex: 1,
          slot: "overnight",
          kind: "EVENING",
          placeId: "ym-cafe",
          name: "Cà phê Rừng Thông",
        }),
      ],
    });
  });

  it("injects Tối nay data into buildTripsageContext for assistant evening Q&A (PARITY AC-9)", () => {
    const context = buildTripsageContext({
      now: new Date("2026-11-23T02:00:00Z"),
      itinerary: {
        days: [
          { day: 1, stops: [{ id: "d1", name: "Phố cổ Đồng Văn", arrivalMinute: 900, departureMinute: 1020 }] },
          { day: 2, stops: [{ id: "d2", name: "Đèo Mã Pì Lèng", arrivalMinute: 480, departureMinute: 600 }] },
        ],
      },
      suggestions: [
        {
          slotId: "d1-overnight",
          kind: "EVENING",
          title: "Chợ đêm Đồng Văn",
          place: { placeId: "p-night-1", name: "Chợ đêm Đồng Văn", distanceKm: 0.4 },
        },
        {
          slotId: "d1-overnight",
          kind: "LODGING",
          title: "Homestay Phố Cổ",
          place: { placeId: "p-stay-1", name: "Homestay Phố Cổ", distanceKm: 0.2 },
        },
      ],
    });

    expect(context).toContain("Tối nay");
    expect(context).toContain("Phố cổ Đồng Văn");
    expect(context).toContain("Chợ đêm Đồng Văn");
    expect(context).toContain("Homestay Phố Cổ");
  });

  it("resolves overnight area to town/district instead of generic 'Hà Giang', keeps venue names matching stop towns, and retries EVENING with simple food query within cap (Bug D)", async () => {
    // When DB area is generic "khu vực hà giang" and last stop is "[Tam] Rừng thông Yên Minh" -> "Yên Minh"
    const ymNight = buildDayEveningPlan({
      dayIndex: 1,
      totalDays: 4,
      lastStopArea: "khu vực hà giang",
      lastStopName: "[Tam] Rừng thông Yên Minh",
      eveningPlaces: [],
    });
    expect(ymNight?.overnightArea).toBe("Yên Minh");

    // Venues like "Chợ đêm Phố cổ Đồng Văn" and "Cà phê Phố Cổ Đồng Văn" must NOT be excluded by stop name "Phố cổ Đồng Văn",
    // and when the first EVENING query only yields lodging, the fallback "quán ăn" query runs within ACTIVITY_MAX_ANCHORS.
    const plan = {
      days: [
        { day: 1, stops: [stop("[Tam] Rừng thông Yên Minh", 23.1208, 105.1445)] },
        { day: 2, stops: [stop("Phố cổ Đồng Văn", 23.2783, 105.3614)] },
        { day: 3, stops: [stop("[Tam] Thị trấn Mèo Vạc", 23.1638, 105.4091)] },
        { day: 4, stops: [stop("[Tam] Du Già", 22.9303, 105.2232)] },
      ],
    } as unknown as PlannerResult;

    const { anchors, stopNames } = activityAnchors(plan);
    const seenQueries: string[] = [];
    const places: PlacesSearch = vi.fn(async (query, _s, near) => {
      seenQueries.push(query);
      if (near && Math.abs(near.latitude - 23.1208) < 0.01) {
        if (query === "quán ăn") {
          return {
            status: "RESULTS" as const,
            places: [
              { placeId: "ym-food-1", name: "Quán lẩu gà Yên Minh", latitude: near.latitude + 0.004, longitude: near.longitude, types: ["restaurant"] },
            ],
          };
        }
        // Primary query returned only a homestay -> should trigger fallback "quán ăn"
        return {
          status: "RESULTS" as const,
          places: [
            { placeId: "ym-home-1", name: "Homestay Rừng Thông", latitude: near.latitude + 0.002, longitude: near.longitude, types: ["lodging"] },
          ],
        };
      }
      if (near && Math.abs(near.latitude - 23.2783) < 0.01) {
        return {
          status: "RESULTS" as const,
          places: [
            { placeId: "dv-night-1", name: "Chợ đêm Phố cổ Đồng Văn", latitude: near.latitude + 0.002, longitude: near.longitude, types: ["market"] },
            { placeId: "dv-cafe-1", name: "Cà phê Phố Cổ Đồng Văn", latitude: near.latitude + 0.003, longitude: near.longitude, types: ["cafe"] },
          ],
        };
      }
      if (near && Math.abs(near.latitude - 23.1638) < 0.01) {
        return {
          status: "RESULTS" as const,
          places: [
            { placeId: "mv-food-1", name: "Quán ăn Thị trấn Mèo Vạc", latitude: near.latitude + 0.002, longitude: near.longitude, types: ["restaurant"] },
          ],
        };
      }
      return { status: "NO_RESULTS" as const };
    });

    const out = await nearbyActivitySuggestions({ places, anchors, stopNames, now: () => 5e10 });
    expect(places).toHaveBeenCalled();
    expect((places as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(ACTIVITY_MAX_ANCHORS);
    expect(seenQueries.some(q => q.includes("quán ăn"))).toBe(true);

    const d1Evening = out.filter(s => s.slotId === "d1-overnight" && s.kind === "EVENING");
    const d2Evening = out.filter(s => s.slotId === "d2-overnight" && s.kind === "EVENING");
    const d3Evening = out.filter(s => s.slotId === "d3-overnight" && s.kind === "EVENING");
    expect(d1Evening.map(s => s.title)).toEqual(["Quán lẩu gà Yên Minh"]);
    expect(d2Evening.map(s => s.title)).toEqual(["Chợ đêm Phố cổ Đồng Văn", "Cà phê Phố Cổ Đồng Văn"]);
    expect(d3Evening.map(s => s.title)).toEqual(["Quán ăn Thị trấn Mèo Vạc"]);
  });

  it("keeps cost totals completely unchanged regardless of Tối nay suggestions (PARITY AC-10)", () => {
    const baseInput = {
      travelers: 4,
      days: 3,
      transport: "MOTORCYCLE" as const,
      distanceKm: 240,
      lines: [
        { category: "lodging" as const, label: "Homestay 2 đêm", amount: 1600000 },
        { category: "food" as const, label: "Ăn uống 3 ngày", amount: 2400000 },
      ],
    };
    const costA = estimateTripCost(baseInput);
    const costB = estimateTripCost(baseInput);
    expect(costA.total).toBe(costB.total);
    expect(costA.lines).toEqual(costB.lines);
  });

  it("Bug 2: prioritizes EVENING anchor as chosen lodging -> nearest lodging suggestion -> town center -> last stop", () => {
    const plan = {
      days: [
        { day: 1, stops: [stop("[Tam] Rừng thông Yên Minh", 23.120806, 105.144534)] },
        { day: 2, stops: [stop("Phố cổ Đồng Văn", 23.2782612, 105.361378)] },
        { day: 3, stops: [stop("Đèo Mã Pì Lèng", 23.24, 105.4)] },
        { day: 4, stops: [stop("Điểm cuối không thuộc thị trấn", 22.91, 105.11)] },
        { day: 5, stops: [stop("[Tam] Du Già", 22.930301, 105.223187)] },
      ],
    } as unknown as PlannerResult;

    const { anchors } = activityAnchors(plan, {
      overnightLodgings: {
        2: { latitude: 23.281, longitude: 105.365, source: "chosen_lodging" },
        3: { latitude: 23.21, longitude: 105.41, source: "lodging_suggestion" },
      },
    });
    const bySlot = new Map(anchors.filter(a => a.kind === "EVENING").map(a => [a.slotId, a]));

    // Night 1: no lodging yet -> Yên Minh town center (not out-of-town Rừng thông Yên Minh)
    expect(bySlot.get("d1-overnight")?.anchorSource).toBe("town_center");
    expect(bySlot.get("d1-overnight")?.latitude).toBeCloseTo(OVERNIGHT_TOWN_CENTERS["Yên Minh"].latitude, 4);
    expect(bySlot.get("d1-overnight")?.longitude).toBeCloseTo(OVERNIGHT_TOWN_CENTERS["Yên Minh"].longitude, 4);

    // Night 2: chosen lodging overrides town center & last stop
    expect(bySlot.get("d2-overnight")?.anchorSource).toBe("chosen_lodging");
    expect(bySlot.get("d2-overnight")?.latitude).toBe(23.281);

    // Night 3: nearest lodging suggestion overrides last stop
    expect(bySlot.get("d3-overnight")?.anchorSource).toBe("lodging_suggestion");
    expect(bySlot.get("d3-overnight")?.latitude).toBe(23.21);

    // Night 4: unknown area & no lodging -> falls back to last stop
    expect(bySlot.get("d4-overnight")?.anchorSource).toBe("last_stop");
    expect(bySlot.get("d4-overnight")?.latitude).toBe(22.91);
  });

  it("Bug 2: runs EVENING fallback query even when 16 anchors are queued, respects ACTIVITY_MAX_ANCHORS=16, filters camping, and reports diagnostics", async () => {
    const plan = {
      days: [
        { day: 1, stops: [stop("S1", 23.04, 104.99), stop("S2", 23.05, 105.0), stop("S3", 23.06, 105.01), stop("[Tam] Rừng thông Yên Minh", 23.1208, 105.1445)] },
        { day: 2, stops: [stop("S4", 23.36, 105.31), stop("S5", 23.35, 105.32), stop("Phố cổ Đồng Văn", 23.2783, 105.3614)] },
        { day: 3, stops: [stop("S6", 23.25, 105.26), stop("S7", 23.22, 105.2), stop("[Tam] Thị trấn Mèo Vạc", 23.1638, 105.4091)] },
        { day: 4, stops: [stop("S8", 23.19, 105.46), stop("S9", 23.02, 105.28), stop("[Tam] Du Già", 22.9303, 105.2232)] },
      ],
    } as unknown as PlannerResult;

    const { anchors, stopNames } = activityAnchors(plan);
    expect(anchors.length).toBe(ACTIVITY_MAX_ANCHORS);
    expect(isLodgingPlace({ name: "Dn xê dịch camping" })).toBe(true);

    const places: PlacesSearch = vi.fn(async (query, _s, near) => {
      if (near && Math.abs(near.latitude - OVERNIGHT_TOWN_CENTERS["Yên Minh"].latitude) < 0.005) {
        if (query === "quán ăn") {
          return {
            status: "RESULTS" as const,
            places: [{ placeId: "ym-eatery", name: "Quán Cơm Phố Yên Minh", latitude: near.latitude + 0.002, longitude: near.longitude, types: ["restaurant"] }],
          };
        }
        return { status: "NO_RESULTS" as const };
      }
      if (near && Math.abs(near.latitude - OVERNIGHT_TOWN_CENTERS["Đồng Văn"].latitude) < 0.005) {
        return {
          status: "RESULTS" as const,
          places: [{ placeId: "dv-cafe", name: "Cà Phê Tam Giác Mạch", latitude: near.latitude + 0.001, longitude: near.longitude, types: ["cafe"] }],
        };
      }
      if (near && Math.abs(near.latitude - OVERNIGHT_TOWN_CENTERS["Mèo Vạc"].latitude) < 0.005) {
        return {
          status: "RESULTS" as const,
          places: [
            { placeId: "mv-camp", name: "Dn xê dịch camping", latitude: near.latitude + 0.001, longitude: near.longitude },
            { placeId: "mv-eatery", name: "Quán Ăn Mèo Vạc", latitude: near.latitude + 0.002, longitude: near.longitude, types: ["restaurant"] },
          ],
        };
      }
      return { status: "NO_RESULTS" as const };
    });

    const diagnostics: EveningAnchorDiagnostic[] = [];
    const out = await nearbyActivitySuggestions({
      places,
      anchors,
      stopNames,
      now: () => 9e10,
      onEveningDiagnostics: list => diagnostics.push(...list),
    });

    expect((places as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(ACTIVITY_MAX_ANCHORS);
    expect(out.filter(s => s.slotId === "d1-overnight" && s.kind === "EVENING").map(s => s.title)).toEqual(["Quán Cơm Phố Yên Minh"]);
    expect(out.filter(s => s.slotId === "d2-overnight" && s.kind === "EVENING").map(s => s.title)).toEqual(["Cà Phê Tam Giác Mạch"]);
    expect(out.filter(s => s.slotId === "d3-overnight" && s.kind === "EVENING").map(s => s.title)).toEqual(["Quán Ăn Mèo Vạc"]);
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.find(d => d.slotId === "d1-overnight")).toMatchObject({ anchorSource: "town_center", count: 1, reason: "ok" });
  });
});
