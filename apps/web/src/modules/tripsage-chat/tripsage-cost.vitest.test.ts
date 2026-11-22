import { describe, expect, it } from "vitest";
import { costPartSchema, estimateTripCost, PRICE_REFERENCE } from "./tripsage-cost";

const lines = [
  { category: "lodging", label: "Homestay", amount: 1_200_000, basis: "3 đêm × 1 phòng × 400.000đ" },
  { category: "food", label: "Ăn uống", amount: 1_500_000 },
] as const;

describe("estimateTripCost", () => {
  it("computes fuel from the distance and sums every line; result passes the part schema", () => {
    const cost = estimateTripCost({ transport: "MOTORCYCLE", travelers: 2, days: 4, distanceKm: 800, lines });
    // 800 km × 2.5 L/100 km × PRICE_REFERENCE.fuelVndPerLiter đ/L × 1 bike for 2 people.
    expect(cost.lines[0]).toMatchObject({ category: "transport", label: "Xăng", amount: Math.round(800 * 2.5 / 100 * PRICE_REFERENCE.fuelVndPerLiter), computed: true });
    expect(cost.total).toBe(Math.round(800 * 2.5 / 100 * PRICE_REFERENCE.fuelVndPerLiter) + 1_200_000 + 1_500_000);
    expect(cost.perPersonPerDay).toBe(Math.round(cost.total / 8));
    expect(cost.withinCap).toBeNull();
    expect(cost.priceReferenceDate).toBe(PRICE_REFERENCE.updatedAt);
    expect(costPartSchema.safeParse(cost).success).toBe(true);
  });

  it("uses one bike per two travelers, one car per group, and a user fuel price", () => {
    expect(estimateTripCost({ transport: "MOTORCYCLE", travelers: 3, days: 2, distanceKm: 100, lines }).lines[0]!.amount).toBe(Math.round(2.5 * PRICE_REFERENCE.fuelVndPerLiter * 2));
    expect(estimateTripCost({ transport: "CAR", travelers: 5, days: 2, distanceKm: 100, fuelVndPerLiter: 25_000, lines }).lines[0]!.amount).toBe(8 * 25_000);
  });

  it("drops a model-written fuel line so fuel is never counted twice", () => {
    const cost = estimateTripCost({ transport: "CAR", travelers: 2, days: 2, distanceKm: 100, lines: [...lines, { category: "transport", label: "Tiền xăng", amount: 9_999_999 }] });
    expect(cost.lines.filter(line => /x[aă]ng/i.test(line.label))).toHaveLength(1);
    expect(cost.total).toBe(8 * PRICE_REFERENCE.fuelVndPerLiter + 1_200_000 + 1_500_000);
  });

  it("without a verified distance it adds no fuel and says so", () => {
    const cost = estimateTripCost({ transport: "CAR", travelers: 2, days: 2, distanceKm: null, lines });
    expect(cost.lines.some(line => line.label === "Xăng")).toBe(false);
    expect(cost.assumptions[0]).toContain("chưa tính tiền xăng");
  });

  it("compares with a stated budget, never claiming a pass without one", () => {
    expect(estimateTripCost({ transport: "CAR", travelers: 2, days: 2, distanceKm: null, budgetCap: 2_000_000, lines })).toMatchObject({ withinCap: false, overBy: 700_000 });
    expect(estimateTripCost({ transport: "CAR", travelers: 2, days: 2, distanceKm: null, budgetCap: 5_000_000, lines })).toMatchObject({ withinCap: true, overBy: 0 });
  });
});
