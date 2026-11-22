import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { computeBudgetSavingsChips, estimateTripCost } from "./tripsage-cost";
import { buildGroundedPreferenceLabels, preferenceLabelsToSuggestions } from "./tripsage-preference-labels";
import type { AccessLegPart } from "./tripsage-access-leg";
import { TripsageCostCard } from "@/components/tripsage-chat/tripsage-cost-card";

const sampleAccessLeg: AccessLegPart = {
  id: "al-dn-1",
  homeCity: "Đà Nẵng",
  hubName: "TP Hà Giang",
  travelers: 4,
  outbound: [
    { mode: "FLIGHT", from: "Đà Nẵng (DAD)", to: "Hà Nội (HAN)", durationMinutes: 85, priceVndPerPerson: 1850000, priceSource: "GOOGLE_FLIGHTS" },
    { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 360, priceVndPerPerson: 300000, priceSource: "ESTIMATE" },
  ],
  return: [
    { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 360, priceVndPerPerson: 300000, priceSource: "ESTIMATE" },
    { mode: "FLIGHT", from: "Hà Nội (HAN)", to: "Đà Nẵng (DAD)", durationMinutes: 85, priceVndPerPerson: 1850000, priceSource: "GOOGLE_FLIGHTS" },
  ],
  outboundMinutes: 445,
  returnMinutes: 445,
  totalVnd: 17200000,
};

describe("Ticket 16: Budget savings chips & grounded preference labels (slim AC-7, AC-8, BR-5, BR-6)", () => {
  it("generates >= 2 savings chips with 'ước tính' amounts from reference prices when over budget, and none when within budget (slim AC-7, BR-5)", () => {
    const overCost = estimateTripCost({
      travelers: 4,
      days: 4,
      transport: "MOTORCYCLE",
      distanceKm: 350,
      budgetCap: 15_000_000,
      extraLines: [{ category: "transport", label: "Chặng tiếp cận", amount: 17_200_000 }],
      lines: [
        { category: "lodging", label: "Khách sạn 3 sao", amount: 6_000_000 },
        { category: "food", label: "Ăn uống 4 ngày", amount: 4_800_000 },
      ],
    });
    expect(overCost.withinCap).toBe(false);

    const chips = computeBudgetSavingsChips(overCost, sampleAccessLeg);
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(chips.length).toBeLessThanOrEqual(3);
    for (const chip of chips) {
      expect(chip.label).toContain("ước tính");
      expect(chip.estimatedSavingsVnd).toBeGreaterThan(0);
    }
    expect(chips.some((c) => c.id === "switch-bus")).toBe(true);
    expect(chips.some((c) => c.id === "lower-lodging")).toBe(true);

    // Renders clickable chips on TripsageCostCard when callback is supplied
    const html = renderToStaticMarkup(
      createElement(TripsageCostCard, {
        cost: overCost,
        accessLeg: sampleAccessLeg,
        onSelectSavingsOption: () => {},
      }),
    );
    expect(html).toContain("tripsage-savings-chips");
    expect(html).toContain("ước tính tiết kiệm");

    // Within budget -> zero savings chips
    const withinCost = estimateTripCost({
      travelers: 4,
      days: 4,
      transport: "MOTORCYCLE",
      distanceKm: 350,
      budgetCap: 40_000_000,
      lines: [{ category: "lodging", label: "Homestay", amount: 2_400_000 }],
    });
    expect(computeBudgetSavingsChips(withinCost, sampleAccessLeg)).toEqual([]);
  });

  it("attaches 'Săn mây' and 'Ăn đặc sản' labels ONLY when reviewed local knowledge has evidence, without changing clock times (slim AC-8, BR-6)", () => {
    const stops = [
      { day: 1, order: 1, id: "dest-qb", name: "Cổng trời Quản Bạ", area: "Quản Bạ" },
      { day: 2, order: 1, id: "dest-lc", name: "Cột cờ Lũng Cú", area: "Đồng Văn" },
    ];

    // No knowledge docs -> zero labels attached!
    expect(
      buildGroundedPreferenceLabels({
        userTexts: ["Mình thích săn mây và ăn đặc sản Hà Giang"],
        stops,
        knowledgeChunks: [],
      }),
    ).toEqual([]);

    // Knowledge doc has evidence -> labels attached with early-morning hint & dish names
    const labels = buildGroundedPreferenceLabels({
      userTexts: ["Mình thích săn mây và ăn đặc sản Hà Giang"],
      stops,
      knowledgeChunks: [
        {
          title: "Kinh nghiệm săn mây Hà Giang",
          content: "Cổng trời Quản Bạ là điểm săn mây đẹp nhất vào sáng sớm 05:30-07:00.",
        },
        {
          title: "Ẩm thực cao nguyên đá",
          content: "Đặc sản nổi bật gồm thắng cố, lẩu gà đen và bánh cuốn trứng Đồng Văn.",
        },
      ],
    });

    const cloud = labels.find((l) => l.kind === "CLOUD_HUNTING");
    expect(cloud).toBeDefined();
    expect(cloud?.stopId).toBe("dest-qb");
    expect(cloud?.badge).toBe("Săn mây");
    expect(cloud?.detail).toContain("05:30-07:00");

    const food = labels.filter((l) => l.kind === "LOCAL_FOOD");
    expect(food.length).toBeGreaterThanOrEqual(1);
    expect(food[0]?.detail).toMatch(/Thắng cố|Lẩu gà đen|Bánh cuốn/u);

    const suggestions = preferenceLabelsToSuggestions(labels);
    expect(suggestions.every((s) => s.kind === "TIP" || s.kind === "MEAL")).toBe(true);
  });
});
