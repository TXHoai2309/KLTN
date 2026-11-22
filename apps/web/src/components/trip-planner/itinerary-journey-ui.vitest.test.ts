import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PlannerDay, PlannerResult } from "@/modules/trip-planner/planner-contract";
import type { JourneyPlan } from "@/modules/trip-origin/journey-route-contract";
import {
  ItineraryOriginDepartureCard,
  ItineraryOriginReturnCard,
  ItineraryTravelOnlyDayCard,
  ItineraryBreakfast,
  ItineraryNightRest,
  JourneyMissingNotice,
  TripOverviewCard,
  lunchBreakAfter,
} from "./planner-presentation";

describe("Itinerary Journey UI (Tickets 03, 04, 05)", () => {
  const sampleJourneyPlan: JourneyPlan = {
    policy: "roadside-rest-v1",
    legs: [
      {
        kind: "OUTBOUND",
        day: 1,
        from: { kind: "ORIGIN" },
        to: { kind: "ATTRACTION", destinationId: "dest-1" },
        route: {
          status: "VERIFIED",
          reason: null,
          durationSeconds: 10800, // 3h = 180m
          distanceMeters: 150000, // 150 km
          provider: "STADIA_MAPS",
        },
        startMinute: 360, // 06:00
        endMinute: 555, // 09:15 (including 15m roadside rest)
        restMinutes: 15,
      },
      {
        kind: "RETURN",
        day: 1,
        from: { kind: "ATTRACTION", destinationId: "dest-1" },
        to: { kind: "ORIGIN" },
        route: {
          status: "VERIFIED",
          reason: null,
          durationSeconds: 10800,
          distanceMeters: 150000,
          provider: "STADIA_MAPS",
        },
        startMinute: 1020, // 17:00
        endMinute: 1215, // 20:15
        restMinutes: 15,
      },
    ],
    totals: {
      drivingSeconds: 21600, // 6h
      restMinutes: 30,
      distanceMeters: 300000, // 300 km
    },
  };

  const sampleDay: PlannerDay = {
    day: 1,
    date: "2026-11-10",
    stops: [],
    distanceMeters: 300000,
    travelSeconds: 21600,
  };

  describe("lunch and night pauses", () => {
    const route = { status: "VERIFIED" as const, reason: null, durationSeconds: 1800, distanceMeters: 1000, provider: "STADIA_MAPS" as const };
    const plan = (endMinute: number): JourneyPlan => ({ policy: "roadside-rest-v1", totals: { drivingSeconds: 1800, restMinutes: 0, distanceMeters: 1000 }, legs: [
      { kind: "TRANSFER", day: 1, from: { kind: "ATTRACTION", destinationId: "a" }, to: { kind: "ATTRACTION", destinationId: "b" }, route, startMinute: 720, endMinute, restMinutes: 0 },
    ] });
    it("reports the slot the route does not explain", () => {
      expect(lunchBreakAfter(plan(750), "b", 720, 810)).toEqual({ from: 720, to: 780 });
    });
    it("stays silent for a plain transfer, a morning gap, an unknown leg or a saved trip without a plan", () => {
      expect(lunchBreakAfter(plan(750), "b", 720, 750)).toBeNull();
      expect(lunchBreakAfter(plan(630), "b", 600, 700)).toBeNull();
      expect(lunchBreakAfter(plan(750), "other", 720, 810)).toBeNull();
      expect(lunchBreakAfter(null, "b", 720, 810)).toBeNull();
    });
    it("names the night rest by time without claiming a place to stay", () => {
      const html = renderToStaticMarkup(createElement(ItineraryNightRest, { fromMinute: 1003 }));
      expect(html).toContain("Nghỉ tối");
      expect(html).toContain("16:43");
      expect(html).toContain("đến sáng hôm sau");
      expect(renderToStaticMarkup(createElement(ItineraryBreakfast))).toContain("05:30 – 06:00, khởi hành 06:00");
      expect(html).toContain("chưa chọn nơi nghỉ");
    });
  });

  describe("incomplete journey notice", () => {
    const origin = { label: "Hà Nội", latitude: 21, longitude: 105.8, source: "MANUAL" as const, confirmed: true };
    const render = (departureMinute: number | null) => renderToStaticMarkup(createElement(JourneyMissingNotice, {
      journey: { origin, departureMinute, returnDeadlineMinute: 1320, returnDepartureMinute: null }, returnOnly: false, onBack() {},
    }));
    it("names the missing time and offers a way back", () => {
      expect(render(null)).toContain("Chưa chọn giờ khởi hành ngày đầu.");
      expect(render(null)).toContain("Bổ sung thông tin");
    });
    it("stays away once the journey is complete", () => {
      expect(render(300)).toBe("");
    });
  });

  describe("Ticket 03 — One-day round trip", () => {
    it("renders outbound origin departure card with times, distance, and roadside rest", () => {
      const outboundLeg = sampleJourneyPlan.legs[0]!;
      const html = renderToStaticMarkup(
        createElement(ItineraryOriginDepartureCard, {
          originLabel: "Bến xe Mỹ Đình, Hà Nội",
          startMinute: outboundLeg.startMinute,
          outboundLeg,
        }),
      );

      expect(html).toContain("Bến xe Mỹ Đình, Hà Nội");
      expect(html).toContain("Nơi xuất phát hành trình");
      expect(html).toContain("Xuất phát: 06:00");
      expect(html).toContain("150 km");
      expect(html).toContain("nghỉ ven đường: +15 phút");
      expect(html).toContain("Khởi hành");
    });

    it("renders return origin arrival card with end times and deadline", () => {
      const returnLeg = sampleJourneyPlan.legs[1]!;
      const html = renderToStaticMarkup(
        createElement(ItineraryOriginReturnCard, {
          originLabel: "Bến xe Mỹ Đình, Hà Nội",
          endMinute: returnLeg.endMinute,
          returnDeadlineMinute: 1260, // 21:00
          returnLeg,
        }),
      );

      expect(html).toContain("Bến xe Mỹ Đình, Hà Nội");
      expect(html).toContain("Điểm kết thúc hành trình");
      expect(html).toContain("Về đến nơi: 20:15");
      expect(html).toContain("Hạn về: 21:00");
      expect(html).toContain("Hoàn thành");
    });

    it("renders overview with separate driving, rest, distance, and lodging disclaimer", () => {
      const html = renderToStaticMarkup(
        createElement(TripOverviewCard, {
          day: sampleDay,
          journeyPlan: sampleJourneyPlan,
        }),
      );

      expect(html).toContain("Chạy xe:");
      expect(html).toContain("6 giờ");
      expect(html).toContain("Nghỉ ven đường:");
      expect(html).toContain("30 phút");
      expect(html).toContain("Tổng chặng:");
      expect(html).toContain("300 km");
      expect(html).toContain("chưa bao gồm thời gian nhận/trả phòng lưu trú");
    });
  });

  describe("Ticket 05 — Travel-only boundary days", () => {
    it("renders outbound-only travel day card without fake attraction visits", () => {
      const outboundLeg = sampleJourneyPlan.legs[0]!;
      const html = renderToStaticMarkup(
        createElement(ItineraryTravelOnlyDayCard, {
          kind: "OUTBOUND_ONLY",
          originLabel: "Hà Nội",
          leg: outboundLeg,
        }),
      );

      expect(html).toContain("Chặng di chuyển đi");
      expect(html).toContain("Hà Nội → Hà Giang");
      expect(html).toContain("Khởi hành:");
      expect(html).toContain("06:00");
      expect(html).toContain("Dự kiến đến:");
      expect(html).toContain("09:15");
      expect(html).toContain("Nghỉ ven đường tự động: +15 phút");
      expect(html).toContain("Toàn bộ ngày dành cho hành trình đường dài");
    });

    it("renders return-only travel day card", () => {
      const returnLeg = sampleJourneyPlan.legs[1]!;
      const html = renderToStaticMarkup(
        createElement(ItineraryTravelOnlyDayCard, {
          kind: "RETURN_ONLY",
          originLabel: "Hà Nội",
          leg: returnLeg,
        }),
      );

      expect(html).toContain("Chặng di chuyển về");
      expect(html).toContain("Hà Giang → Hà Nội");
      expect(html).toContain("Khởi hành:");
      expect(html).toContain("17:00");
      expect(html).toContain("Dự kiến đến:");
      expect(html).toContain("20:15");
    });
  });
});
