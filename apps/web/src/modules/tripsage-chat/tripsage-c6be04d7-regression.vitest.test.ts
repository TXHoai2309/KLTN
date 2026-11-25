import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsageAccessLegCard } from "@/components/tripsage-chat/tripsage-access-leg-card";
import { TripsageCostCard } from "@/components/tripsage-chat/tripsage-cost-card";
import { TripsagePlanPanel } from "@/components/tripsage-chat/tripsage-plan-panel";
import { TripsagePlanSummaryCard } from "@/components/tripsage-chat/tripsage-plan-summary-card";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { PlannerResult } from "../trip-planner/planner-contract";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { createTripsageChatTools, type TripsagePlanningDeps } from "./tripsage-chat-tools";
import { buildConversationAutoTitle } from "./conversation-auto-title";
import type { AccessLegPart } from "./tripsage-access-leg";
import type { CostPart } from "./tripsage-cost";

const openAllWeek = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({
  dayOfWeek,
  status: "OPEN",
  intervals: [{ opensAtMinute: 360, closesAtMinute: 1110 }],
}));

function makeHaGiangStop(id: string, name: string, area: string, lat: number, lng: number, suggested = 90, minimum = 60, category = "thiên nhiên"): PlannerCandidate {
  return {
    id,
    name,
    description: name,
    area,
    category,
    address: area,
    latitude: lat,
    longitude: lng,
    image: null,
    visibility: "VISIBLE",
    revision: "1",
    suggestedDurationMinutes: suggested,
    minimumDurationMinutes: minimum,
    isOutdoor: true,
    ticketPrice: id === "nha-vuong" ? "30.000đ" : id === "nho-que" ? "150.000đ" : null,
    openingDays: openAllWeek,
  };
}

// Coords & realistic Stadia/DB road timings across the Ha Giang catalog loop (c6be04d7 regression)
const HG_STOPS: PlannerCandidate[] = [
  makeHaGiangStop("nui-cam", "Núi Cấm", "TP Hà Giang", 22.824, 104.9782, 45, 30, "thiên nhiên – điểm ngắm cảnh"),
  makeHaGiangStop("bac-sum", "Dốc Bắc Sum", "Quản Bạ", 22.9882, 104.9359, 20, 10, "thiên nhiên – điểm ngắm cảnh"),
  makeHaGiangStop("quan-ba", "Cổng trời Quản Bạ", "Quản Bạ", 23.0645, 104.9928, 45, 30),
  makeHaGiangStop("nui-doi", "Núi Đôi Quản Bạ", "Quản Bạ", 23.071, 104.996, 45, 25),
  makeHaGiangStop("nam-dam", "Làng văn hóa Nặm Đăm", "Quản Bạ", 23.045, 104.98, 60, 30, "làng du lịch – bản làng"),
  makeHaGiangStop("lung-khuy", "Hang Lùng Khúy", "Quản Bạ", 23.0788, 105.0199, 120, 75, "thiên nhiên – hang động"),
  makeHaGiangStop("lung-tam", "Làng dệt lanh Lùng Tám", "Quản Bạ", 23.05, 105.03, 60, 45, "văn hóa"),
  makeHaGiangStop("yen-minh", "Rừng thông Yên Minh", "Yên Minh", 23.1167, 105.15, 60, 30),
  makeHaGiangStop("tham-ma", "Dốc Thẩm Mã", "Phố Bảng", 23.169, 105.1942, 20, 10, "thiên nhiên – điểm ngắm cảnh"),
  makeHaGiangStop("pho-cao", "Làng Phố Cáo", "Phố Bảng", 23.2008, 105.1759, 45, 20, "làng du lịch – bản làng"),
  makeHaGiangStop("chin-khoanh", "Dốc Chín Khoanh", "Phố Bảng", 23.2099, 105.1952, 15, 10, "thiên nhiên – điểm ngắm cảnh"),
  makeHaGiangStop("nha-vuong", "Dinh họ Vương", "Đồng Văn", 23.2612, 105.2536, 75, 45, "văn hóa"),
  makeHaGiangStop("lung-cu", "Cột cờ Lũng Cú", "Đồng Văn", 23.3615, 105.3195, 90, 60, "văn hóa"),
  makeHaGiangStop("lo-lo-chai", "Làng Lô Lô Chải", "Đồng Văn", 23.36, 105.315, 60, 30, "làng du lịch – bản làng"),
  makeHaGiangStop("dong-van", "Phố cổ Đồng Văn", "Đồng Văn", 23.2785, 105.3621, 90, 60, "văn hóa"),
  makeHaGiangStop("ma-pi-leng", "Đèo Mã Pì Lèng", "Mèo Vạc", 23.2389, 105.4194, 45, 30, "thiên nhiên – điểm ngắm cảnh"),
  makeHaGiangStop("nho-que", "Sông Nho Quế", "Mèo Vạc", 23.2195, 105.429, 180, 120),
  makeHaGiangStop("pa-vi", "Làng Pả Vi Hạ", "Mèo Vạc", 23.17, 105.42, 60, 30, "làng du lịch – bản làng"),
  makeHaGiangStop("du-gia", "Thác Du Già", "Du Già", 22.9255, 105.1977, 90, 45),
];

const realisticRoutes: RouteProvider = {
  route: async ({ from, to }) => {
    const dx = (from.latitude - to.latitude) * 111;
    const dy = (from.longitude - to.longitude) * 102;
    const straightKm = Math.hypot(dx, dy);
    const roadKm = Math.max(2, straightKm * 2.0);
    const durationSeconds = Math.max(300, Math.round((roadKm / 35) * 3600));
    return {
      fromDestinationId: from.id,
      toDestinationId: to.id,
      status: "VERIFIED",
      reason: null,
      distanceMeters: Math.round(roadKm * 1000),
      durationSeconds,
      provider: "STADIA_MAPS",
    };
  },
  coordinateRoute: async ({ from, to }) => {
    const dx = (from.latitude - to.latitude) * 111;
    const dy = (from.longitude - to.longitude) * 102;
    const straightKm = Math.hypot(dx, dy);
    const roadKm = Math.max(5, straightKm * 1.6);
    const durationSeconds = Math.max(900, Math.round((roadKm / 40) * 3600));
    return {
      status: "VERIFIED",
      reason: null,
      distanceMeters: Math.round(roadKm * 1000),
      durationSeconds,
      provider: "STADIA_MAPS",
    };
  },
};

describe("E2E Regression c6be04d7: D1–D13 integrated verification", () => {
  it("reproduces the 10-traveler TP.HCM -> Ha Giang 5-day loop (20–26/12) with D1–D13 invariants intact", async () => {
    const emittedItineraries: PlannerResult[] = [];
    const emittedCosts: CostPart[] = [];
    const emittedAccessLegs: AccessLegPart[] = [];

    const planning: TripsagePlanningDeps = {
      candidates: async () => HG_STOPS,
      routes: realisticRoutes,
      travelLookup: async () => ({
        windingFactor: 2.0,
        lookup: (fromId, toId) => {
          const from = HG_STOPS.find(s => s.id === fromId);
          const to = HG_STOPS.find(s => s.id === toId);
          if (!from || !to) return null;
          const roadKm = Math.max(2, Math.hypot((from.latitude - to.latitude) * 111, (from.longitude - to.longitude) * 102) * 2.0);
          return {
            distanceMeters: Math.round(roadKm * 1000),
            durationSeconds: Math.max(300, Math.round((roadKm / 35) * 3600)),
            provider: "STADIA_MAPS" as const,
          };
        },
      }),
      now: () => new Date("2026-11-25T00:00:00Z"),
    };

    const tripInfo = {
      homeCity: "TP Hồ Chí Minh",
      travelers: 10,
      transport: "MOTORCYCLE" as const,
      startDate: "2026-12-21",
      durationDays: 5,
      tripStartDate: "2026-12-20",
      tripEndDate: "2026-12-26",
    };
    const journey = {
      origin: { label: "TP Hà Giang", latitude: 22.8233, longitude: 104.9839, source: "MANUAL" as const, confirmed: true },
      departureMinute: 420,
      returnDeadlineMinute: 1080,
      returnDepartureMinute: null,
    };

    const tools = createTripsageChatTools({
      planning,
      journey,
      tripInfo,
      emitItinerary: r => emittedItineraries.push(r),
      emitCost: c => emittedCosts.push(c),
      emitAccessLeg: leg => emittedAccessLegs.push(leg),
    });
    const opts = { toolCallId: "tc-c6", messages: [] } as never;

    // 1. Outbound 05:40->07:50, layover, 10:00->16:30; Return 00:00->06:30, layover, 10:00->12:10 (D12)
    await tools.planAccessLeg.execute!(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [
          { mode: "FLIGHT", from: "TP Hồ Chí Minh", to: "Hà Nội", departTime: "05:40", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
          { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "10:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
        ],
        return: [
          { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "00:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
          { mode: "FLIGHT", from: "Hà Nội", to: "TP Hồ Chí Minh", departTime: "10:00", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
        ],
      },
      opts,
    );

    expect(emittedAccessLegs).toHaveLength(1);
    const leg1 = emittedAccessLegs[0]!;
    const accessHtml = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: leg1 }));
    expect(accessHtml).toContain("05:40 → 07:50");
    expect(accessHtml).toContain("07:50 → 10:00");
    expect(accessHtml).toContain("10:00 → 16:30");
    expect(accessHtml).toContain("10 giờ 50 phút");
    expect(accessHtml).toContain("8 giờ 40 phút di chuyển");
    expect(accessHtml).toContain("00:00 → 06:30");
    expect(accessHtml).toContain("10:00 → 12:10");
    expect(accessHtml).toContain("Có mặt sân bay trước 2 giờ");

    // 2. Propose 5-day loop itinerary for 10 travelers (+15% duration scale in D10, real route repair in D3/D4)
    const propRes = (await tools.proposeItinerary.execute!(
      {
        selection: {
          days: [
            ["quan-ba", "lung-khuy"],
            ["yen-minh", "tham-ma", "nha-vuong"],
            ["lung-cu", "dong-van"],
            ["ma-pi-leng", "nho-que"],
            ["du-gia"],
          ],
        },
      },
      opts,
    )) as { ok: boolean; status: string };
    expect(propRes.ok).toBe(true);
    const plan = emittedItineraries.at(-1)!;
    // Regression: zero FLEX_SCHEDULE under realistic Ha Giang travel times
    expect(plan.warnings.some(w => w.code === "FLEX_SCHEDULE")).toBe(false);
    // D10: stays at 10-person suggested durations are >= canonical minimum
    for (const day of plan.days) {
      for (const stop of day.stops) {
        const ref = HG_STOPS.find(c => c.id === stop.destination.id);
        if (ref?.minimumDurationMinutes != null) {
          expect(stop.visitDurationMinutes).toBeGreaterThanOrEqual(ref.minimumDurationMinutes);
        }
      }
    }
    // Check day end-time balance across sightseeing days 1..4 (<= 120m per Testing Decision!)
    const nonReturnEnds = plan.days.slice(0, 4).map(d => d.stops.at(-1)?.departureMinute).filter((v): v is number => v != null);
    expect(nonReturnEnds).toHaveLength(4);
    expect(Math.max(...nonReturnEnds) - Math.min(...nonReturnEnds)).toBeLessThanOrEqual(120);

    // 3. Server-computed cost table (D5): 5 nights, 5 motorbikes, 7 food days, /7 divisor
    await tools.estimateCosts.execute!(
      { lodgingTier: "HOMESTAY", mealTier: "STANDARD", rentalTier: "SEMI_AUTO" },
      opts,
    );
    const cost1 = emittedCosts.at(-1)!;
    expect(cost1.days).toBe(7);
    expect(cost1.sightseeingDays).toBe(5);
    expect(cost1.lines.find(l => l.category === "lodging")?.basis).toContain("5 đêm");
    expect(cost1.lines.find(l => l.label === "Thuê xe máy số")?.basis).toContain("5 xe");
    expect(cost1.lines.find(l => l.category === "food")?.basis).toContain("7 ngày");
    expect(cost1.perPersonPerDay).toBe(Math.round(cost1.total / (10 * 7)));
    expect(cost1.accessLegId).toBe(leg1.id);

    // 4. D6: Switching access leg auto-recomputes cost table without manual estimateCosts call, updating accessLegId
    await tools.planAccessLeg.execute!(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [
          { mode: "FLIGHT", from: "TP Hồ Chí Minh", to: "Hà Nội", departTime: "05:40", durationMinutes: 130, priceVndPerPerson: 2_100_000 },
          { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "10:00", durationMinutes: 390, priceVndPerPerson: 350_000 },
        ],
        return: [
          { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "00:00", durationMinutes: 390, priceVndPerPerson: 350_000 },
          { mode: "FLIGHT", from: "Hà Nội", to: "TP Hồ Chí Minh", departTime: "10:00", durationMinutes: 130, priceVndPerPerson: 2_100_000 },
        ],
      },
      opts,
    );
    const leg2 = emittedAccessLegs.at(-1)!;
    const cost2 = emittedCosts.at(-1)!;
    expect(leg2.id).not.toBe(leg1.id);
    expect(cost2.accessLegId).toBe(leg2.id);
    expect(cost2.total).toBeGreaterThan(cost1.total);
    expect(renderToStaticMarkup(createElement(TripsageCostCard, { cost: cost2, accessLeg: leg2 }))).not.toContain('data-testid="cost-stale-badge"');

    // 5. D7 + D11 titles, date splits & validation scope
    expect(buildConversationAutoTitle({ tripInfo })).toBe("TP Hồ Chí Minh → HG · 10 người · 20–26/12");
    const summaryHtml = renderToStaticMarkup(
      createElement(TripsagePlanSummaryCard, { version: 1, proposal: plan, cost: cost2, tripInfo, accessLeg: leg2, isCurrent: true }),
    );
    expect(summaryHtml).toContain("20–26/12");
    expect(summaryHtml).toContain("Tham quan 21–25/12 · Di chuyển 20 và 26/12");

    const panelHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: plan,
        cost: cost2,
        accessLeg: leg2,
        tripInfo,
        suggestions: [],
        chosenLodgings: {},
        pinnedItems: [],
        drawerOpen: false,
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );
    expect(panelHtml).toContain("TP Hồ Chí Minh → Hà Giang, 20–26/12");
    expect(panelHtml).toContain("Tham quan 21–25/12 · Di chuyển 20 và 26/12");
  });
});
