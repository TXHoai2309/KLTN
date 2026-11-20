import { describe, expect, it } from "vitest";
import { checkBudgetPlan, type BudgetInput } from "./tripsage-budget";

const input: BudgetInput = {
  currency: "USD",
  travelers: 2,
  durationDays: 2,
  allocations: [{ category: "food", amount: 1 }],
};

describe("estimated budget", () => {
  it("rejects excess precision in an allocation before comparing against the cap", () => {
    expect(checkBudgetPlan({ ...input, budgetCap: 1, allocations: [{ category: "food", amount: 1.004 }] }))
      .toMatchObject({ ok: false, code: "INVALID_BUDGET" });
  });

  it.each([
    { currency: "USD", budgetCap: 1.004, amount: 1 },
    { currency: "VND", budgetCap: 1000.01, amount: 1000 },
    { currency: "VND", budgetCap: 1000, amount: 999.25 },
  ] as const)("rejects invalid minor units for $currency with cap $budgetCap and amount $amount", ({ currency, budgetCap, amount }) => {
    expect(checkBudgetPlan({ ...input, currency, budgetCap, allocations: [{ category: "food", amount }] }))
      .toMatchObject({ ok: false, code: "INVALID_BUDGET" });
  });

  it("sums valid USD cents and computes the excess using the same amounts", () => {
    const result = checkBudgetPlan({
      ...input,
      budgetCap: 0.29,
      allocations: [{ category: "food", amount: 0.29 }, { category: "lodging", amount: 0.01 }],
    });
    expect(result).toMatchObject({
      ok: true, total: 0.3, perPersonPerDay: 0.08, withinCap: false, overBy: 0.01, note: expect.stringContaining("ước tính"),
      allocations: [{ amount: 0.29 }, { amount: 0.01 }],
    });
  });

  it("accepts equality as within the stated cap", () => {
    expect(checkBudgetPlan({ ...input, budgetCap: 1 })).toMatchObject({ ok: true, total: 1, withinCap: true, overBy: 0 });
  });

  it("keeps shares at or below 100 percent and leaves an unstated cap unknown", () => {
    const result = checkBudgetPlan({
      ...input,
      currency: "VND",
      allocations: [{ category: "food", amount: 1000 }, { category: "activities", amount: 1000 }, { category: "transport", amount: 4000 }],
    });
    expect(result).toMatchObject({ ok: true, total: 6000, perPersonPerDay: 1500, withinCap: null, overBy: null, note: expect.stringContaining("ước tính") });
    if (!result.ok) throw new Error("Expected a budget estimate");
    expect(result.allocations.map(allocation => allocation.sharePercent)).toEqual([16, 16, 66]);
    expect(result.allocations.reduce((sum, allocation) => sum + allocation.sharePercent, 0)).toBeLessThanOrEqual(100);
  });
});
