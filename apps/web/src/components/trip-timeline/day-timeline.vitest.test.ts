import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDayTimelineTravelLeg, DayTimeline, formatTravelLegLine, resolveDayRouteLabel, resolveLegGapBreakdown, type DayTimelineDay } from "./day-timeline";
import { buildDayEveningPlan } from "./evening-plan";
import { buildDaySuggestionMarkers, estimateCheckinTravelMinutes, splitTripNearbyBySlot } from "./suggestion-markers";
import { resolvePreviousOvernightArea } from "@/lib/overnight-anchor";
import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { TripsageTimelineView } from "@/components/tripsage-chat/tripsage-timeline-view";
import { formatVisitDescription } from "@/modules/tripsage-chat/tripsage-timeline";
import { validateItinerary, type RouteSnapshot, type ValidationVisit } from "@/modules/trip-validation/trip-validation";
import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";

const SAMPLE_DAY: DayTimelineDay = {
  dayIndex: 1,
  localDate: "2026-12-13",
  transportLabel: "Xe máy",
  stops: [
    {
      id: "v1",
      destinationId: "dest-1",
      order: 1,
      name: "[Tạm] Cổng Trời Quản Bạ",
      area: "khu vực hà giang",
      startMinute: 492,
      durationMinutes: 60,
      href: "/destinations/dest-1",
      previewTarget: { kind: "CATALOG", name: "Cổng Trời Quản Bạ", latitude: 23.065, longitude: 104.991 },
      nearbyAfter: [
        { key: "n1", name: "Quán cà phê Cổng Trời", distanceKm: 0.4, previewTarget: { kind: "GOOGLE_PLACE", placeId: "ChIJ_cafe_1", name: "Quán cà phê Cổng Trời" } },
      ],
      lunchAfter: {
        fromMinute: 720,
        toMinute: 780,
        durationMinutes: 60,
        suggestions: [{ key: "m1", name: "Quán ăn Quản Bạ", distanceKm: 0.6 }],
      },
    },
    {
      id: "v2",
      destinationId: "dest-2",
      order: 2,
      name: "Phố cổ Đồng Văn",
      area: "đồng văn",
      startMinute: 840,
      durationMinutes: 90,
      external: true,
    },
  ],
};

describe("Ticket 06: Shared DayTimeline component (full & compact)", () => {
  it("renders full variant with photo, order, time rail, cleaned names, hidden placeholder area, and day color var", () => {
    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: SAMPLE_DAY,
        variant: "full",
        onPreview: () => {},
      }),
    );

    expect(html).toContain('data-variant="full"');
    expect(html).toContain("--tv-day-color:var(--tv-day-1)");
    expect(html).toContain("my-trips-timeline-node");
    expect(html).toContain("Ngày 1");
    expect(html).toContain("Cổng Trời Quản Bạ");
    expect(html).not.toContain("[Tạm]");
    expect(html).not.toContain("khu vực hà giang");
    expect(html).toContain("Đồng Văn");
    expect(html).toContain("08:12");
    expect(html).toContain("08:12 – 09:12 (60 phút)");
    expect(html).toContain("Điểm dừng 1");
    expect(html).toContain("Xem nhanh");
    expect(html).toContain("Gần đây:");
    expect(html).toContain("Quán cà phê Cổng Trời");
    expect(html).toContain("Nghỉ trưa");
    expect(html).toContain("Quán ăn Quản Bạ");
  });

  it("renders compact variant and hides optional chat slots when not provided", () => {
    const minimalDay: DayTimelineDay = {
      dayIndex: 2,
      localDate: "2026-12-14",
      stops: [
        {
          id: "v3",
          destinationId: "dest-3",
          order: 1,
          name: "Đèo Mã Pí Lèng",
          area: "Mèo Vạc",
          startMinute: 540,
          durationMinutes: 45,
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(DayTimeline, { day: minimalDay, variant: "compact" }));
    expect(html).toContain('data-variant="compact"');
    expect(html).toContain("--tv-day-color:var(--tv-day-2)");
    expect(html).toContain("Đèo Mã Pì Lèng");
    expect(html).not.toContain("Xem nhanh");
    expect(html).not.toContain("Gần đây:");
  });

  it("strips [Tam]/[Tạm]/[ Tạm ] prefix from stop descriptions across DayTimeline, TripsageTimelineView, formatVisitDescription, and PlacePreviewModal without marking the stop unverified", () => {
    const tempDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v-tam-1",
          destinationId: "dest-tam-1",
          order: 1,
          name: "[Tam] Núi Đôi Quản Bạ",
          area: "Quản Bạ",
          startMinute: 495,
          durationMinutes: 60,
          description: "[Tam] Điểm ngắm cảnh núi Đôi ở Quản Bạ và thung lũng Tam Sơn.",
          href: "/destinations/dest-tam-1",
        },
        {
          id: "v-tam-2",
          destinationId: "dest-tam-2",
          order: 2,
          name: "[ Tạm ] Rừng thông Yên Minh",
          area: "Yên Minh",
          startMinute: 660,
          durationMinutes: 60,
          description: "[ Tạm ] Điểm dừng ngắn ở khu vực Yên Minh để nghỉ chân.",
        },
      ],
    };

    for (const variant of ["full", "compact"] as const) {
      const html = renderToStaticMarkup(createElement(DayTimeline, { day: tempDay, variant }));
      expect(html).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
      expect(html).toContain("Núi Đôi Quản Bạ");
      expect(html).toContain("Điểm ngắm cảnh núi Đôi ở Quản Bạ và thung lũng Tam Sơn.");
      expect(html).toContain("Điểm dừng ngắn ở khu vực Yên Minh để nghỉ chân.");
      expect(html).not.toContain("ngoài danh mục (chưa kiểm)");
    }

    expect(formatVisitDescription("[Tam] Điểm ngắm cảnh núi Đôi ở Quản Bạ…")).toBe(
      "Điểm ngắm cảnh núi Đôi ở Quản Bạ…",
    );

    const viewHtml = renderToStaticMarkup(
      createElement(TripsageTimelineView, {
        timeline: {
          days: [
            {
              day: 1,
              date: "2026-12-13",
              items: [
                {
                  slotId: "d1-visit-1",
                  kind: "VISIT",
                  startMinute: 495,
                  endMinute: 555,
                  label: "[Tam] Núi Đôi Quản Bạ",
                  description: "[tạm] Điểm dừng ngắn ở khu vực Yên Minh…",
                },
              ],
            },
          ],
        },
        suggestions: [],
      }),
    );
    expect(viewHtml).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
    expect(viewHtml).toContain("Núi Đôi Quản Bạ");
    expect(viewHtml).toContain("Điểm dừng ngắn ở khu vực Yên Minh…");

    const modalHtml = renderToStaticMarkup(
      createElement(PlacePreviewModal, {
        target: { kind: "CATALOG", name: "[ Tạm ] Núi Đôi Quản Bạ", latitude: 23.065, longitude: 104.991 },
        onClose: () => {},
      }),
    );
    expect(modalHtml).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
    expect(modalHtml).toContain("Núi Đôi Quản Bạ");
  });

  it("sorts stops chronologically and drops overlapping lunch breaks (Bug C)", () => {
    const outOfOrderDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v4",
          destinationId: "s4",
          order: 4,
          name: "Rừng thông Yên Minh",
          startMinute: 884, // 14:44
          durationMinutes: 60,
        },
        {
          id: "v2",
          destinationId: "s2",
          order: 2,
          name: "Núi Đôi Quản Bạ",
          startMinute: 576, // 09:36 - 10:06
          durationMinutes: 30,
          // Bogus overlapping 12:00-13:00 lunch attached to stop 2 -> overlaps Nặm Đăm (10:14-12:14) and must be dropped
          lunchAfter: { fromMinute: 720, toMinute: 780, durationMinutes: 60 },
        },
        {
          id: "v3",
          destinationId: "s3",
          order: 3,
          name: "Làng văn hóa Nặm Đăm",
          startMinute: 614, // 10:14 - 12:14
          durationMinutes: 120,
          lunchAfter: { fromMinute: 734, toMinute: 794, durationMinutes: 60 },
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(DayTimeline, { day: outOfOrderDay, variant: "full" }));
    expect(html).toContain("12:14 – 13:14");
    expect(html).not.toContain("12:00 – 13:00");
    const i2 = html.indexOf("Núi Đôi Quản Bạ");
    const i3 = html.indexOf("Làng văn hóa Nặm Đăm");
    const iLunch = html.indexOf("Nghỉ trưa");
    const i4 = html.indexOf("Rừng thông Yên Minh");
    expect(i2).toBeGreaterThan(-1);
    expect(i3).toBeGreaterThan(i2);
    expect(iLunch).toBeGreaterThan(i3);
    expect(i4).toBeGreaterThan(iLunch);
  });

  it("clamps long stop descriptions via CSS line-clamp (3 full, 2 compact) with 'Xem thêm' while keeping full source text (Bug F)", () => {
    const longDesc =
      "Cổng trời Quản Bạ nằm ở độ cao hơn 1.500 m so với mực nước biển, là cửa ngõ mở vào Công viên địa chất toàn cầu Cao nguyên đá Đồng Văn với tầm nhìn bao quát thung lũng Tam Sơn và Núi Đôi Cô Tiên nổi tiếng khắp vùng Tây Bắc.";
    const longDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v-long-1",
          destinationId: "d-long-1",
          order: 1,
          name: "Cổng trời Quản Bạ",
          startMinute: 492,
          durationMinutes: 60,
          description: longDesc,
          previewTarget: {
            kind: "CATALOG",
            name: "Cổng trời Quản Bạ",
            latitude: 23.0493,
            longitude: 104.9927,
            description: longDesc,
          },
        },
      ],
    };

    for (const variant of ["full", "compact"] as const) {
      const html = renderToStaticMarkup(createElement(DayTimeline, { day: longDay, variant, onPreview: () => {} }));
      expect(html).toContain(longDesc); // Never truncates underlying source data
      expect(html).toContain("dt-visit-more-link");
      expect(html).toContain("Xem thêm");
    }

    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).toMatch(/\.dt-visit-desc\s*\{[^}]*-webkit-line-clamp\s*:\s*3/);
    expect(css).toMatch(/\.dt-day--compact\s+\.dt-visit-desc\s*\{[^}]*-webkit-line-clamp\s*:\s*2/);
  });

  it("keeps day-timeline.css compliant with --tv-* tokens (no hardcoded hex, no 650/700+, no card shadows)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).not.toMatch(/font-weight\s*:\s*(650|700|750|800|900)\b/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\bInter\b/);
    expect(css).toContain("@media (max-width: 480px)");
  });

  it("A3: renders suggestions on --tv-surface with info icon tooltip, 16px icon-only suggestion preview, sm Chọn button, and borderless main stop preview link", () => {
    const dayWithSuggestions: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v1",
          destinationId: "d1",
          order: 1,
          name: "Cổng Trời Quản Bạ",
          area: "Quản Bạ",
          startMinute: 480,
          durationMinutes: 60,
          previewTarget: { kind: "CATALOG", name: "Cổng Trời Quản Bạ", latitude: 23.0493, longitude: 104.9927 },
          nearbyAfter: [
            {
              key: "nb-1",
              name: "Cánh đồng tam giác mạch",
              distanceKm: 2.7,
              previewTarget: { kind: "GOOGLE_PLACE", name: "Cánh đồng tam giác mạch", placeId: "ChIJ_nb1" },
            },
          ],
        },
      ],
      eveningPlan: {
        nightIndex: 1,
        overnightArea: "Đồng Văn",
        lodgingSuggestions: [
          {
            key: "lg-1",
            name: "Ha Anh Homestay",
            distanceKm: 0.8,
            previewTarget: { kind: "GOOGLE_PLACE", name: "Ha Anh Homestay", placeId: "ChIJ_lg1" },
            onChoose: () => {},
          },
        ],
        eveningPlaces: [
          {
            key: "ev-1",
            name: "Quán Cơm nhà Pao",
            distanceKm: 0.2,
            previewTarget: { kind: "GOOGLE_PLACE", name: "Quán Cơm nhà Pao", placeId: "ChIJ_ev1" },
          },
        ],
      },
    };

    const html = renderToStaticMarkup(createElement(DayTimeline, { day: dayWithSuggestions, variant: "full", onPreview: () => {} }));
    expect(html).not.toContain("dt-sunken-box");
    expect(html).toContain("dt-info-badge");
    // Tooltip carries the disclaimer; no repeated plain text disclaimer span inside rows
    expect(html).not.toContain(">gợi ý, chưa kiểm tra<");
    expect(html).not.toContain(">Chưa kiểm tra · Không phải đặt phòng<");
    // Main stop keeps Xem nhanh text link; suggestion rows use 16px eye icon-only button
    expect(html).toContain("tv-quick-link");
    expect(html).toContain("tv-preview-icon-btn");
    expect(html).toContain('aria-label="Xem nhanh Cánh đồng tam giác mạch"');
    expect(html).toContain("tv-btn tv-btn--sm tv-btn--secondary");

    const dayCss = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    const tripsCss = readFileSync(resolve(process.cwd(), "src/app/trips/trips.css"), "utf8");
    expect(dayCss).not.toContain(".dt-sunken-box");
    expect(dayCss).toMatch(/\.dt-suggestion-marker[^{]*\{[^}]*background:\s*var\(--tv-surface\)/);
    expect(dayCss).toMatch(/\.dt-suggestion-name\s*\{[^}]*font-size:\s*14px[^}]*font-weight:\s*500/);
    expect(tripsCss).not.toMatch(/\.my-trips-chosen-lodging\s*\{[^}]*background:\s*var\(--tv-sunken\)/);
  });

  it("A4: places Gần đây under stop (+N collapsed by default) and Free Time, Check-in, Dinner as ordered timeline markers with hollow nodes and dashed rails", () => {
    const dayWithAllMarkers: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      estimatedCheckinTravelMinutes: 210, // 14:00 + 3h30 -> ~17:30 check-in
      stops: [
        {
          id: "v1",
          destinationId: "d1",
          order: 1,
          name: "Phố cổ Đồng Văn",
          area: "Đồng Văn",
          startMinute: 780, // 13:00
          durationMinutes: 60, // ends 14:00
          nearbyAfter: [
            { key: "nb-1", name: "Cánh đồng tam giác mạch", distanceKm: 2.7, previewTarget: { kind: "GOOGLE_PLACE", name: "Cánh đồng tam giác mạch", placeId: "ChIJ_1" } },
            { key: "nb-2", name: "Làng Lũng Cẩm", distanceKm: 3.4, previewTarget: { kind: "GOOGLE_PLACE", name: "Làng Lũng Cẩm", placeId: "ChIJ_2" } },
          ],
        },
      ],
      freeTimeSuggestions: [
        { key: "ft-1", name: "Dốc Thẩm Mã", distanceKm: 2.1, previewTarget: { kind: "GOOGLE_PLACE", name: "Dốc Thẩm Mã", placeId: "ChIJ_ft1" } },
        { key: "ft-2", name: "Dốc 9 Khoanh", distanceKm: 3.2, previewTarget: { kind: "GOOGLE_PLACE", name: "Dốc 9 Khoanh", placeId: "ChIJ_ft2" } },
      ],
      eveningPlan: {
        nightIndex: 1,
        overnightArea: "Đồng Văn",
        lodgingSuggestions: [
          { key: "lg-1", name: "Ha Anh Homestay", distanceKm: 0.8, previewTarget: { kind: "GOOGLE_PLACE", name: "Ha Anh Homestay", placeId: "ChIJ_lg1" }, onChoose: () => {} },
        ],
        eveningPlaces: [
          { key: "ev-1", name: "Quán Cơm nhà Pao", distanceKm: 0.2, previewTarget: { kind: "GOOGLE_PLACE", name: "Quán Cơm nhà Pao", placeId: "ChIJ_ev1" } },
        ],
      },
    };

    const html = renderToStaticMarkup(createElement(DayTimeline, { day: dayWithAllMarkers, variant: "full", onPreview: () => {} }));
    // Per-stop nearby shows first item + "+1" collapsed toggle by default
    expect(html).toContain("Gần đây:");
    expect(html).toContain("Cánh đồng tam giác mạch");
    expect(html).toContain("+1");
    expect(html).not.toContain("Làng Lũng Cẩm"); // collapsed until "+1" clicked
    // Markers appear in chronological order inside timeline list with ~ prefix, "gợi ý" label, hollow ring & dashed connector
    expect(html).toContain("dt-timeline-node--suggestion");
    expect(html).toContain("dt-rail-to-suggestion");
    expect(html).toContain("dt-marker-badge\">gợi ý<");
    expect(html).toContain("~14:00");
    expect(html).toContain("Thời gian trống · có thể ghé");
    expect(html).toContain("~17:30");
    expect(html).toContain("Nhận phòng · Đồng Văn");
    expect(html).toContain("~19:00");
    expect(html).toContain("Ăn tối gần chỗ nghỉ");
    const posStop = html.indexOf("Phố cổ Đồng Văn");
    const posNearby = html.indexOf("Cánh đồng tam giác mạch");
    const posFree = html.indexOf("Thời gian trống · có thể ghé");
    const posCheckin = html.indexOf("Nhận phòng · Đồng Văn");
    const posDinner = html.indexOf("Ăn tối gần chỗ nghỉ");
    expect(posStop).toBeLessThan(posNearby);
    expect(posNearby).toBeLessThan(posFree);
    expect(posFree).toBeLessThan(posCheckin);
    expect(posCheckin).toBeLessThan(posDinner);

    // Without estimatedCheckinTravelMinutes, check-in sits after free time WITHOUT a fabricated clock
    const withoutCheckinClock = renderToStaticMarkup(createElement(DayTimeline, {
      day: { ...dayWithAllMarkers, estimatedCheckinTravelMinutes: null },
      variant: "full",
    }));
    expect(withoutCheckinClock).toContain("Nhận phòng · Đồng Văn");
    expect(withoutCheckinClock).not.toContain("~17:30");

    // Last day (eveningPlan = null): neither check-in nor dinner renders
    const lastDayHtml = renderToStaticMarkup(createElement(DayTimeline, {
      day: { ...dayWithAllMarkers, eveningPlan: null, chosenLodging: null },
      variant: "full",
    }));
    expect(lastDayHtml).not.toContain("Nhận phòng");
    expect(lastDayHtml).not.toContain("Ăn tối gần chỗ nghỉ");
  });

  it("A4: keeps Constraint Validator decisions, stop times, and cost untouched with or without suggestion markers", () => {
    const visits: ValidationVisit[] = [
      {
        visitId: "v1",
        dayIndex: 1,
        order: 1,
        localDate: "2026-12-13",
        startMinute: 480,
        plannedDurationMinutes: 60,
        minimumDurationMinutes: 45,
        openingDays: [{ dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 420, closesAtMinute: 1080 }] }],
      },
      {
        visitId: "v2",
        dayIndex: 1,
        order: 2,
        localDate: "2026-12-13",
        startMinute: 600,
        plannedDurationMinutes: 90,
        minimumDurationMinutes: 60,
        openingDays: [{ dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 420, closesAtMinute: 1080 }] }],
      },
    ];
    const routes: RouteSnapshot[] = [
      { fromVisitId: "v1", toVisitId: "v2", route: { kind: "ok", durationSeconds: 2400 } },
    ];
    const timeRef = new Date("2026-12-01T00:00:00Z");
    const costInput = {
      travelers: 2,
      days: 2,
      transport: "CAR" as const,
      distanceKm: 120,
      lines: [{ category: "food" as const, label: "Ăn uống", amount: 800_000 }],
    };

    const baselineValidation = validateItinerary(visits, routes, timeRef);
    const baselineCost = estimateTripCost(costInput);

    // Render DayTimeline both without and with full suggestion markers (display layer only)
    const bareDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: visits.map(v => ({
        id: v.visitId,
        destinationId: v.visitId,
        order: v.order,
        name: `Điểm ${v.order}`,
        area: "Đồng Văn",
        startMinute: v.startMinute,
        durationMinutes: v.plannedDurationMinutes,
      })),
    };
    const suggestedDay: DayTimelineDay = {
      ...bareDay,
      estimatedCheckinTravelMinutes: 40,
      stops: bareDay.stops.map((s, idx) =>
        idx === 0 ? { ...s, nearbyAfter: [{ key: "nb", name: "Cánh đồng hoa", distanceKm: 1.5 }] } : s,
      ),
      freeTimeSuggestions: [{ key: "ft", name: "Dốc Thẩm Mã", distanceKm: 2.0 }],
      eveningPlan: {
        nightIndex: 1,
        overnightArea: "Đồng Văn",
        lodgingSuggestions: [{ key: "lg", name: "Ha Anh Homestay", distanceKm: 0.8 }],
        eveningPlaces: [{ key: "ev", name: "Quán Cơm nhà Pao", distanceKm: 0.2 }],
      },
    };
    renderToStaticMarkup(createElement(DayTimeline, { day: bareDay }));
    renderToStaticMarkup(createElement(DayTimeline, { day: suggestedDay }));

    const afterValidation = validateItinerary(visits, routes, timeRef);
    const afterCost = estimateTripCost(costInput);

    expect(afterValidation).toEqual(baselineValidation);
    expect(afterCost.total).toBe(baselineCost.total);
    expect(visits.map(v => [v.startMinute, v.plannedDurationMinutes])).toEqual([[480, 60], [600, 90]]);
  });

  it("A4: splits saved nearbySuggestions cleanly by slot and estimates check-in travel only when coordinates or same-area distance exist", () => {
    const items = [
      { slot: "visit-1", kind: "ACTIVITY", placeId: "p1", name: "Cánh đồng tam giác mạch", distanceKm: 2.7 },
      { slot: "visit-2", kind: "ACTIVITY", placeId: "p2", name: "Đồn Cao", distanceKm: 1.1 },
      { slot: "free", kind: "ACTIVITY", placeId: "p3", name: "Dốc Thẩm Mã", distanceKm: 2.0 },
      { slot: "visit-9", kind: "ACTIVITY", placeId: "p4", name: "Điểm rảnh", distanceKm: 3.5 },
    ];
    const split = splitTripNearbyBySlot(items, [{ order: 1 }, { order: 2 }], (i) => ({
      key: `${i.slot}|${i.placeId}`,
      name: i.name,
      distanceKm: i.distanceKm,
    }));
    expect(split.nearbyByStopOrder.get(1)?.map((i) => i.name)).toEqual(["Cánh đồng tam giác mạch"]);
    expect(split.nearbyByStopOrder.get(2)?.map((i) => i.name)).toEqual(["Đồn Cao"]);
    expect(split.freeTimeSuggestions.map((i) => i.name)).toEqual(["Dốc Thẩm Mã", "Điểm rảnh"]);

    // No coordinates -> returns null (never fabricates a clock)
    expect(estimateCheckinTravelMinutes({ lastStopLat: 23.27, lastStopLng: 105.36 })).toBeNull();
    // Coordinates ~20 km apart -> positive 5-min-rounded travel time estimate
    const travel = estimateCheckinTravelMinutes({
      lastStopLat: 23.049,
      lastStopLng: 104.992,
      targetLat: 23.278,
      targetLng: 105.362,
      transport: "CAR",
    });
    expect(travel).not.toBeNull();
    expect(travel!).toBeGreaterThanOrEqual(45);
  });

  it("stacks .dt-day-meta onto column 2 so day titles never crush vertically and displays from→to route span", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).toMatch(/\.dt-day-heading\s*\{[^}]*grid-template-columns:\s*24px minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.dt-day-meta\s*\{[^}]*grid-column:\s*2;[^}]*max-width:\s*100%;/);

    expect(
      resolveDayRouteLabel({
        dayIndex: 1,
        originLabel: "Hà Nội",
        stops: [{ destinationId: "d1", name: "[Tạm] Dốc Bắc Sum" }],
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d1" },
          },
        ],
      }),
    ).toBe("Hà Nội → Dốc Bắc Sum");

    expect(
      resolveDayRouteLabel({
        dayIndex: 3,
        originLabel: "Hà Nội",
        previousDayStops: [{ destinationId: "d2", name: "Phố cổ Đồng Văn" }],
        stops: [
          { destinationId: "d3", name: "Đèo Mã Pì Lèng" },
          { destinationId: "d4", name: "Sông Nho Quế" },
        ],
      }),
    ).toBe("Phố cổ Đồng Văn → Sông Nho Quế");

    expect(
      resolveDayRouteLabel({
        dayIndex: 5,
        originLabel: "Hà Nội",
        stops: [],
        legs: [
          {
            kind: "RETURN",
            day: 5,
            from: { kind: "ATTRACTION", destinationId: "d4" },
            to: { kind: "ORIGIN" },
          },
        ],
        stopNamesById: { d4: "Sông Nho Quế" },
      }),
    ).toBe("Sông Nho Quế → Hà Nội");

    expect(
      resolveDayRouteLabel({
        dayIndex: 1,
        originLabel: "Hà Nội",
        stops: [{ destinationId: "d1", name: "Cổng trời Quản Bạ" }],
        legs: [
          { kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "d1" } },
          { kind: "RETURN", day: 1, from: { kind: "ATTRACTION", destinationId: "d1" }, to: { kind: "ORIGIN" } },
        ],
      }),
    ).toBe("Hà Nội → Cổng trời Quản Bạ → Hà Nội");

    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: {
          ...SAMPLE_DAY,
          routeLabel: "Hà Nội → Phố cổ Đồng Văn",
          totalDistanceMeters: 64_200,
          totalTravelSeconds: 7_380,
        },
        variant: "full",
      }),
    );
    expect(html).toContain("dt-day-route");
    expect(html).toContain("Hà Nội → Phố cổ Đồng Văn");
    expect(html).toContain("64,2 km");

    // ADR-57 (D2): ngày sau xuất phát từ khu vực nghỉ đêm tối hôm trước và card nhận phòng hiển thị chặng từ điểm cuối
    expect(
      resolveDayRouteLabel({
        dayIndex: 5,
        originLabel: "Hà Nội",
        previousOvernightArea: "Mèo Vạc",
        stops: [],
        legs: [
          {
            kind: "RETURN",
            day: 5,
            from: { kind: "ATTRACTION", destinationId: "d4" },
            to: { kind: "ORIGIN" },
          },
        ],
        stopNamesById: { d4: "Sông Nho Quế" },
      }),
    ).toBe("Mèo Vạc → Hà Nội");

    expect(
      resolveDayRouteLabel({
        dayIndex: 3,
        originLabel: "Hà Nội",
        previousOvernightArea: "Quản Bạ",
        previousDayStops: [{ destinationId: "d2", name: "Hang Lùng Khúy" }],
        stops: [{ destinationId: "d3", name: "Rừng thông Yên Minh" }],
      }),
    ).toBe("Quản Bạ → Rừng thông Yên Minh");

    const withCheckinSummary = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: {
          ...SAMPLE_DAY,
          estimatedCheckinTravelMinutes: 14,
          checkinRouteSummary: "Về khu vực Mèo Vạc: 6,6 km · khoảng 14 phút",
          eveningPlan: {
            nightIndex: 1,
            overnightArea: "Mèo Vạc",
            lodgingSuggestions: [],
            eveningPlaces: [],
          },
        },
        variant: "full",
      }),
    );
    expect(withCheckinSummary).toContain("Nhận phòng · Mèo Vạc");
    expect(withCheckinSummary).toContain("Về khu vực Mèo Vạc: 6,6 km · khoảng 14 phút");
  });

  it("D5 / B10: places direct .dt-break-line rows (breakfast, night rest) into column 2 on narrow containers and mobile viewports", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    const containerBlocks = Array.from(css.matchAll(/@container dt-day \(max-width: 480px\)\s*\{([\s\S]*?)\n\}/gu)).map((m) => m[1] ?? "");
    expect(containerBlocks.some((block) => /\.dt-break-item > \.dt-break-line[\s\S]*?grid-column:\s*2;/.test(block))).toBe(true);
    expect(containerBlocks.some((block) => /\.dt-day--compact \.dt-break-item[\s\S]*?grid-template-columns:\s*20px minmax\(0, 1fr\);/.test(block))).toBe(true);

    const media768 = css.match(/@media \(max-width: 768px\)\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(media768).toMatch(/\.dt-break-item > \.dt-break-line[\s\S]*?grid-column:\s*2;/);
    expect(media768).toMatch(/\.dt-travel-leg[\s\S]*?grid-column:\s*2;/);
    expect(media768).toMatch(/\.dt-lunch-wrap[\s\S]*?grid-column:\s*2;/);
    expect(media768).toMatch(/\.dt-marker-body[\s\S]*?grid-column:\s*2;/);

    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: {
          ...SAMPLE_DAY,
          breakfast: { minute: 420, durationMinutes: 30, text: "07:00 – 07:30, khởi hành 07:30" },
          nightRest: { startMinute: 1050, text: "Yên Minh" },
        },
        variant: "full",
      }),
    );
    expect(html).toContain('<li class="dt-break-item"><span aria-hidden="true"></span><div class="dt-visit-time"><strong>07:00</strong><span>30 phút</span></div><p class="planner-break dt-break-line">');
    expect(html).toContain("<strong>Nghỉ tối</strong>");
  });

  it("D3 / B3 & B5: unifies check-in overnight area with overnightStays and fixes Day 1 outbound-only route label", () => {
    // B5: Day 1 has 0 visits and its OUTBOUND leg targets Day 2's first stop (Dốc Bắc Sum) -> Hà Nội → TP Hà Giang
    expect(
      resolveDayRouteLabel({
        dayIndex: 1,
        originLabel: "Hà Nội",
        stops: [],
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d-bac-sum" },
          },
        ],
        stopNamesById: { "d-bac-sum": "Dốc Bắc Sum" },
      }),
    ).toBe("Hà Nội → TP Hà Giang");

    // B5 with explicit overnightArea override
    expect(
      resolveDayRouteLabel({
        dayIndex: 1,
        originLabel: "Hà Nội",
        overnightArea: "TP Hà Giang",
        stops: [],
        legs: [
          {
            kind: "OUTBOUND",
            day: 1,
            from: { kind: "ORIGIN" },
            to: { kind: "ATTRACTION", destinationId: "d-bac-sum" },
          },
        ],
        stopNamesById: { "d-bac-sum": "Dốc Bắc Sum" },
      }),
    ).toBe("Hà Nội → TP Hà Giang");

    // B3: buildDayEveningPlan + buildDaySuggestionMarkers honor canonical overnightStays ("Yên Minh") over lastStopArea ("Phố Bảng")
    const eveningPlan = buildDayEveningPlan({
      dayIndex: 2,
      totalDays: 5,
      overnightAreaOverride: "Yên Minh",
      lastStopArea: "Phố Bảng",
      lastStopName: "Phố cổ Phố Bảng",
      eveningPlaces: [],
    });
    expect(eveningPlan?.overnightArea).toBe("Yên Minh");

    const markers = buildDaySuggestionMarkers({
      dayIndex: 2,
      orderedStops: SAMPLE_DAY.stops,
      overnightStayArea: "Yên Minh",
      checkinRouteSummary: "Về khu vực Yên Minh: 18 km · khoảng 31 phút",
      eveningPlan: {
        nightIndex: 2,
        overnightArea: "Phố Bảng",
        lodgingSuggestions: [],
        eveningPlaces: [],
      },
    });
    const checkinMarker = markers.find((m) => m.kind === "CHECKIN");
    expect(checkinMarker?.title).toBe("Nhận phòng · Yên Minh");
    expect(checkinMarker?.checkinRouteSummary).toBe("Về khu vực Yên Minh: 18 km · khoảng 31 phút");

    // Falls back to eveningPlan.overnightArea when overnightStayArea is absent
    const fallbackMarkers = buildDaySuggestionMarkers({
      dayIndex: 2,
      orderedStops: SAMPLE_DAY.stops,
      eveningPlan: {
        nightIndex: 2,
        overnightArea: "Đồng Văn",
        lodgingSuggestions: [],
        eveningPlaces: [],
      },
    });
    expect(fallbackMarkers.find((m) => m.kind === "CHECKIN")?.title).toBe("Nhận phòng · Đồng Văn");

    // resolvePreviousOvernightArea reads Day 1 overnightStays even if Day 1 had 0 sightseeing stops
    expect(
      resolvePreviousOvernightArea({
        dayIndex: 2,
        overnightStays: [{ day: 1, area: "TP Hà Giang" }],
        previousDays: [{ dayIndex: 1, lastStop: null }],
      }),
    ).toBe("TP Hà Giang");
  });

  it("D6 / B4: explains post-lunch scenic photo buffer (+20m) alongside rest and flags opening-hours wait minutes", () => {
    // Exact B4 case: lunch 13:00-14:00 (depart 840), 60 km / 1h49 (6540s) + 15m rest -> 16:04, next stop 16:25 (985)
    const b4Gap = resolveLegGapBreakdown({
      transport: "MOTORCYCLE",
      durationSeconds: 109 * 60,
      restMinutes: 15,
      departMinute: 14 * 60,
      arrivalMinute: 16 * 60 + 25,
    });
    expect(b4Gap).toEqual({ photoMinutes: 20, waitMinutes: 0 });
    const leg = buildDayTimelineTravelLeg({
      transport: "MOTORCYCLE",
      route: { status: "VERIFIED", distanceMeters: 60_000, durationSeconds: 109 * 60 },
      restMinutes: 15,
      photoMinutes: b4Gap.photoMinutes,
      waitMinutes: b4Gap.waitMinutes,
    });
    expect(formatTravelLegLine(leg)).toBe("🛵 60 km · khoảng 1 giờ 49 phút · nghỉ 15 phút · +20 phút chụp ảnh");

    // Opening-hours wait gap: depart 07:30 (450), drive 20m, scenic 5m -> 07:55, stop opens 08:30 (510) -> 35m wait
    const waitGap = resolveLegGapBreakdown({
      transport: "MOTORCYCLE",
      pace: "MODERATE",
      durationSeconds: 20 * 60,
      restMinutes: 0,
      departMinute: 450,
      arrivalMinute: 510,
    });
    expect(waitGap).toEqual({ photoMinutes: 5, waitMinutes: 35 });
    const waitLeg = buildDayTimelineTravelLeg({
      transport: "MOTORCYCLE",
      route: { status: "VERIFIED", distanceMeters: 12_000, durationSeconds: 20 * 60 },
      restMinutes: 0,
      photoMinutes: waitGap.photoMinutes,
      waitMinutes: waitGap.waitMinutes,
    });
    expect(formatTravelLegLine(waitLeg)).toContain("+5 phút chụp ảnh");
    expect(formatTravelLegLine(waitLeg)).toContain("chờ mở cửa 35 phút");
  });

  it("S7: starts the day immediately after an outbound-only day from its overnight area ('TP Hà Giang' fallback when overnightStays is absent)", () => {
    // Demo case: Day 1 has 0 stops (OUTBOUND leg to Dốc Bắc Sum), no overnightStays for Day 1 -> Day 2 starts from TP Hà Giang
    expect(
      resolveDayRouteLabel({
        dayIndex: 2,
        originLabel: "Hà Nội",
        previousOvernightArea: null,
        previousDayStops: [],
        stops: [
          { destinationId: "d-bac-sum", name: "Dốc Bắc Sum" },
          { destinationId: "d-chin-khoanh", name: "Dốc Chín Khoanh" },
        ],
        legs: [
          { kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "d-bac-sum" } },
          { kind: "TRANSFER", day: 2, from: { kind: "ATTRACTION", destinationId: "d-bac-sum" }, to: { kind: "ATTRACTION", destinationId: "d-chin-khoanh" } },
        ],
        stopNamesById: { "d-bac-sum": "Dốc Bắc Sum", "d-chin-khoanh": "Dốc Chín Khoanh" },
      }),
    ).toBe("TP Hà Giang → Dốc Chín Khoanh");

    // When overnightStays explicitly specifies Day 1's overnight area, honor it over the TP Hà Giang fallback
    expect(
      resolveDayRouteLabel({
        dayIndex: 2,
        originLabel: "Hà Nội",
        previousOvernightArea: "Quản Bạ",
        previousDayStops: [],
        stops: [
          { destinationId: "d-bac-sum", name: "Dốc Bắc Sum" },
          { destinationId: "d-chin-khoanh", name: "Dốc Chín Khoanh" },
        ],
        legs: [
          { kind: "OUTBOUND", day: 1, from: { kind: "ORIGIN" }, to: { kind: "ATTRACTION", destinationId: "d-bac-sum" } },
          { kind: "TRANSFER", day: 2, from: { kind: "ATTRACTION", destinationId: "d-bac-sum" }, to: { kind: "ATTRACTION", destinationId: "d-chin-khoanh" } },
        ],
      }),
    ).toBe("Quản Bạ → Dốc Chín Khoanh");

    // Also works when legs are absent (e.g. companion view with hidden origin) via previousDayOutboundOnly
    expect(
      resolveDayRouteLabel({
        dayIndex: 2,
        previousOvernightArea: null,
        previousDayOutboundOnly: true,
        previousDayStops: [],
        stops: [
          { destinationId: "d-bac-sum", name: "Dốc Bắc Sum" },
          { destinationId: "d-chin-khoanh", name: "Dốc Chín Khoanh" },
        ],
      }),
    ).toBe("TP Hà Giang → Dốc Chín Khoanh");

    // Verify all 3 timeline views pass previousDayOutboundOnly consistently
    for (const relPath of [
      "src/app/trips/trips-view.tsx",
      "src/components/tripsage-chat/tripsage-plan-panel.tsx",
      "src/components/trip-companions/companion-group-view.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), relPath), "utf8");
      expect(src, relPath).toContain("previousDayOutboundOnly");
    }
  });
});
