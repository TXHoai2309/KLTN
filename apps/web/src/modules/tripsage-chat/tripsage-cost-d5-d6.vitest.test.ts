import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsageCostCard } from "@/components/tripsage-chat/tripsage-cost-card";
import { fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import { buildAccessLeg, formatAccessLegCostBasis } from "./tripsage-access-leg";
import { createTripsageChatTools, userExplicitlyRequestedVehicleRental, type TripsagePlanningDeps } from "./tripsage-chat-tools";
import { computeTieredTripCost, parseTicketPriceVnd, type CostPart } from "./tripsage-cost";

describe("D5 & D6: server-computed tiered cost & automatic cross-turn recomputation", () => {
  it("computes c6be04d7 trip costs (5 nights, 5 bikes, 7 whole-trip meal days, /7 divisor)", () => {
    const leg = buildAccessLeg(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [
          { mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", departTime: "05:40", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
          { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "10:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
        ],
        return: [
          { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "21:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
          { mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", departTime: "08:00", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
        ],
      },
      "TP Hồ Chí Minh",
      10,
    );

    const cost = computeTieredTripCost({
      transport: "MOTORCYCLE",
      travelers: 10,
      startDate: "2026-12-21",
      durationDays: 5,
      tripStartDate: "2026-12-20",
      tripEndDate: "2026-12-26",
      distanceKm: 320,
      usesLocalRental: true,
      lodgingTier: "HOMESTAY",
      mealTier: "STANDARD",
      rentalTier: "SEMI_AUTO",
      stopTickets: [{ name: "Dinh họ Vương", perPersonVnd: 30_000 }],
      accessLeg: leg,
      accessLegBasis: formatAccessLegCostBasis(leg),
      budgetCap: 60_000_000,
    });

    // 4 sightseeing nights (21–24/12) + 1 daytime outbound arrival night (20/12) + 0 overnight bus night (25/12) = 5 đêm, 5 phòng
    const lodgingLine = cost.lines.find(l => l.category === "lodging");
    expect(lodgingLine).toBeDefined();
    expect(lodgingLine!.basis).toContain("5 đêm");
    expect(lodgingLine!.basis).toContain("5 phòng");
    expect(lodgingLine!.amount).toBe(5 * 5 * 450_000);

    // Food includes both travel days (20/12 & 26/12) => 7 days
    const foodLine = cost.lines.find(l => l.category === "food");
    expect(foodLine).toBeDefined();
    expect(foodLine!.basis).toContain("7 ngày");
    expect(foodLine!.basis).toContain("cả ngày đi/về");
    expect(foodLine!.amount).toBe(7 * 10 * 270_000);

    // 10 travelers / 2 = 5 motorbikes for 5 sightseeing days + 5 nights parking
    const rentalLine = cost.lines.find(l => l.label === "Thuê xe máy số");
    expect(rentalLine).toBeDefined();
    expect(rentalLine!.basis).toContain("5 xe");
    expect(rentalLine!.basis).toContain("5 ngày");
    expect(rentalLine!.amount).toBe(5 * 5 * 175_000);

    const parkingLine = cost.lines.find(l => l.label === "Gửi xe máy qua đêm");
    expect(parkingLine?.amount).toBe(5 * 5 * 15_000);

    // Stop ticket computed from DB price
    const ticketLine = cost.lines.find(l => l.label === "Vé tham quan trong lịch");
    expect(ticketLine?.amount).toBe(10 * 30_000);

    // Whole trip divisor = 10 travelers * 7 days
    expect(cost.days).toBe(7);
    expect(cost.sightseeingDays).toBe(5);
    expect(cost.perPersonPerDay).toBe(Math.round(cost.total / (10 * 7)));
    expect(cost.accessLegId).toBe(leg.id);
    expect(cost.selections).toMatchObject({ lodgingTier: "HOMESTAY", mealTier: "STANDARD", rentalTier: "SEMI_AUTO" });
  });

  it("parses ticket prices cleanly from DB strings", () => {
    expect(parseTicketPriceVnd("Miễn phí")).toBe(0);
    expect(parseTicketPriceVnd("30.000đ/người")).toBe(30_000);
    expect(parseTicketPriceVnd("100.000 - 150.000đ")).toBe(125_000);
    expect(parseTicketPriceVnd("50k")).toBe(50_000);
    expect(parseTicketPriceVnd(null)).toBeNull();
  });

  it("auto-recomputes cost on later turn when access leg, itinerary stops, or transport change (D6)", async () => {
    const legV1 = buildAccessLeg(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [{ mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "21:00", durationMinutes: 390, priceVndPerPerson: 300_000 }],
        return: [{ mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "21:00", durationMinutes: 390, priceVndPerPerson: 300_000 }],
      },
      "Hà Nội",
      4,
    );

    const planning: TripsagePlanningDeps = {
      candidates: async () => [
        { ...planningCandidate("stop-a", 60), name: "Dinh họ Vương", ticketPrice: "30.000đ", latitude: 23.257, longitude: 105.193 },
        { ...planningCandidate("stop-b", 60), name: "Phố cổ Đồng Văn", ticketPrice: "Miễn phí", latitude: 23.278, longitude: 105.363 },
      ],
      routes: fixtureRoutes,
      now: () => planningNow,
    };

    const emittedTurn1: CostPart[] = [];
    const options = { toolCallId: "tc-d6", messages: [] } as never;
    const tools1 = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      tripInfo: { transport: "MOTORCYCLE", durationDays: 2, startDate: "2026-12-10", travelers: 4, homeCity: "Hà Nội" },
      accessLeg: legV1,
      currentItinerary: { days: [{ day: 1, stops: [{ id: "stop-a", name: "Dinh họ Vương", arrivalMinute: 480, departureMinute: 540 }] }], distanceKm: 120 },
      emitCost: c => emittedTurn1.push(c),
    });

    await tools1.estimateCosts.execute!({ lodgingTier: "HOMESTAY", mealTier: "STANDARD", rentalTier: "SEMI_AUTO", budgetCap: 15_000_000 }, options);
    const priorCost = emittedTurn1.at(-1)!;
    expect(priorCost.accessLegId).toBe(legV1.id);
    expect(priorCost.lines.find(l => l.label === "Vé tham quan trong lịch")?.amount).toBe(4 * 30_000);

    // Turn 2: traveler switches access leg without AI re-calling estimateCosts -> server auto-recomputes with new accessLegId
    const emittedTurn2: CostPart[] = [];
    const emittedLegsTurn2: ReturnType<typeof buildAccessLeg>[] = [];
    const tools2 = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      tripInfo: { transport: "MOTORCYCLE", durationDays: 2, startDate: "2026-12-10", travelers: 4, homeCity: "TP Hồ Chí Minh" },
      accessLeg: legV1,
      priorCost,
      currentItinerary: { days: [{ day: 1, stops: [{ id: "stop-a", name: "Dinh họ Vương", arrivalMinute: 480, departureMinute: 540 }] }], distanceKm: 120 },
      emitAccessLeg: leg => emittedLegsTurn2.push(leg),
      emitCost: c => emittedTurn2.push(c),
    });

    await tools2.planAccessLeg.execute!(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [
          { mode: "FLIGHT", from: "TP.HCM", to: "Hà Nội", departTime: "06:00", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
          { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", departTime: "10:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
        ],
        return: [
          { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", departTime: "21:00", durationMinutes: 390, priceVndPerPerson: 325_000 },
          { mode: "FLIGHT", from: "Hà Nội", to: "TP.HCM", departTime: "08:00", durationMinutes: 130, priceVndPerPerson: 1_500_000 },
        ],
      },
      options,
    );

    expect(emittedTurn2).toHaveLength(1);
    expect(emittedLegsTurn2).toHaveLength(1);
    const legV2 = emittedLegsTurn2[0]!;
    const updatedCost = emittedTurn2[0]!;
    expect(updatedCost.accessLegId).toBe(legV2.id);
    expect(updatedCost.accessLegId).not.toBe(legV1.id);
    expect(updatedCost.total).toBeGreaterThan(priorCost.total);

    // UI guard: stale cost shows "Cần tính lại" against new leg; synced cost hides it
    expect(renderToStaticMarkup(createElement(TripsageCostCard, { cost: priorCost, accessLeg: legV2 }))).toContain("data-testid=\"cost-stale-badge\"");
    expect(renderToStaticMarkup(createElement(TripsageCostCard, { cost: updatedCost, accessLeg: legV2 }))).not.toContain("data-testid=\"cost-stale-badge\"");

    // Switching transport from MOTORCYCLE to CAR automatically updates rental tier & fuel line
    await tools2.recordTripInfo.execute!({ transport: "CAR" }, options);
    const carCost = emittedTurn2.at(-1)!;
    expect(carCost.lines.some(l => l.label === "Thuê ô tô tự lái")).toBe(true);
    expect(carCost.lines.some(l => l.label === "Thuê xe máy số")).toBe(false);
  });

  it("S3a: forces OWN_VEHICLE for self-driving from home even if model passes CAR_SELF_DRIVE, unless traveler asked to rent", async () => {
    expect(userExplicitlyRequestedVehicleRental(["Nhà mình tự lái ô tô từ Hà Nội (nhà ở Cầu Giấy)"])).toBe(false);
    expect(userExplicitlyRequestedVehicleRental(["Không thuê xe, đi xe nhà"])).toBe(false);
    expect(userExplicitlyRequestedVehicleRental(["Mình muốn thuê ô tô tự lái từ Cầu Giấy"])).toBe(true);
    expect(userExplicitlyRequestedVehicleRental(["Đi từ Hà Nội", "Cho mình thuê xe máy 3 ngày"])).toBe(true);

    const planning: TripsagePlanningDeps = {
      candidates: async () => [],
      routes: fixtureRoutes,
      now: () => planningNow,
    };
    const options = { toolCallId: "tc-s3a", messages: [] } as never;
    const cauGiayJourney = {
      origin: { label: "Quận Cầu Giấy, Hà Nội", latitude: 21.0362, longitude: 105.7906, source: "GOOGLE_PLACES" as const, confirmed: true as const },
      departureMinute: 420,
      returnDeadlineMinute: 1080,
      returnDepartureMinute: null,
    };

    // Case 1: Self-driving own car from Cầu Giấy — model mistakenly selects CAR_SELF_DRIVE
    const ownCarCosts: CostPart[] = [];
    const ownCarTools = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      journey: cauGiayJourney,
      tripInfo: { transport: "CAR", durationDays: 4, startDate: "2026-12-11", travelers: 3, homeCity: "Hà Nội" },
      currentItinerary: { days: [{ day: 1, stops: [] }], distanceKm: 850 },
      latestUserText: "Thêm 1 ngày",
      userHistoryTexts: ["Nhà mình 2 vợ chồng với 1 bé 7 tuổi, tự lái ô tô từ Hà Nội (nhà ở Cầu Giấy), muốn đi Hà Giang 3 ngày 2 đêm từ 11/12."],
      emitCost: c => ownCarCosts.push(c),
    });
    await ownCarTools.estimateCosts.execute!(
      { lodgingTier: "HOMESTAY", mealTier: "STANDARD", rentalTier: "CAR_SELF_DRIVE" },
      options,
    );
    const ownCarCost = ownCarCosts.at(-1)!;
    expect(ownCarCost.lines.some(l => l.label.includes("Thuê ô tô"))).toBe(false);
    expect(ownCarCost.selections?.rentalTier).toBe("OWN_VEHICLE");

    // Case 2: Traveler from Cầu Giấy explicitly says "thuê ô tô tự lái" -> rental line IS kept
    const rentalCarCosts: CostPart[] = [];
    const rentalCarTools = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      journey: cauGiayJourney,
      tripInfo: { transport: "CAR", durationDays: 4, startDate: "2026-12-11", travelers: 3, homeCity: "Hà Nội" },
      currentItinerary: { days: [{ day: 1, stops: [] }], distanceKm: 850 },
      latestUserText: "Nhà mình muốn thuê ô tô tự lái từ Cầu Giấy đi Hà Giang 4 ngày",
      emitCost: c => rentalCarCosts.push(c),
    });
    await rentalCarTools.estimateCosts.execute!(
      { lodgingTier: "HOMESTAY", mealTier: "STANDARD", rentalTier: "CAR_SELF_DRIVE" },
      options,
    );
    const rentalCarCost = rentalCarCosts.at(-1)!;
    expect(rentalCarCost.lines.some(l => l.label === "Thuê ô tô tự lái")).toBe(true);
    expect(rentalCarCost.selections?.rentalTier).toBe("CAR_SELF_DRIVE");
  });
});
