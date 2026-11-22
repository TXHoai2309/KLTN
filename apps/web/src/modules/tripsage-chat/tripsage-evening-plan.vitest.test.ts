import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlannerResult } from "../trip-planner/planner-contract";
import {
  ACTIVITY_MAX_ANCHORS,
  ACTIVITY_RADIUS_KM,
  EVENING_PER_SLOT,
  activityAnchors,
  nearbyActivitySuggestions,
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
    expect(html).toContain("Tối nay · nghỉ ở Đồng Văn");
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
});
