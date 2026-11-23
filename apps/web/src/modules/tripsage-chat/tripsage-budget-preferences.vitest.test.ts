import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { computeBudgetSavingsChips, costPartSchema, estimateTripCost, resolveBudgetSavingsChips, type CostPart } from "./tripsage-cost";
import { createTripsageChatTools, type TripsagePlanningDeps } from "./tripsage-chat-tools";
import { buildGroundedPreferenceLabels, preferenceLabelsToSuggestions } from "./tripsage-preference-labels";
import type { AccessLegPart } from "./tripsage-access-leg";
import { TripsageCostCard } from "@/components/tripsage-chat/tripsage-cost-card";
import { fixtureRoutes, planningNow } from "@/test/planning-fixtures";

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
    expect(html).toContain("ước tính");

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

  it("emits savingsOptions on data-cost for the 4-person 20M Đà Nẵng flight+bus scenario, guards off-topic meal replies, and only claims chips were shown when emitted (Bug B)", async () => {
    const emittedCosts: CostPart[] = [];
    const emittedReplies: string[][] = [];
    const planning: TripsagePlanningDeps = {
      candidates: async () => [],
      routes: fixtureRoutes,
      now: () => planningNow,
    };
    const options = { toolCallId: "tc-b", messages: [] } as never;
    const tools = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      tripInfo: { transport: "MOTORCYCLE", durationDays: 4, startDate: "2026-12-12", travelers: 4, homeCity: "Đà Nẵng" },
      accessLeg: sampleAccessLeg,
      emitCost: cost => emittedCosts.push(cost),
      emitQuickReplies: replies => emittedReplies.push(replies),
    });

    const estimateRes = (await tools.estimateCosts.execute!(
      {
        budgetCap: 20_000_000,
        lines: [
          { category: "lodging", label: "Homestay 3 đêm", amount: 6_000_000, basis: "3 đêm × 2 phòng × 1.000.000đ" },
          { category: "food", label: "Ăn uống", amount: 4_800_000, basis: "4 người × 4 ngày × 300.000đ" },
          { category: "transport", label: "Thuê xe máy", amount: 2_400_000, basis: "2 xe × 4 ngày × 300.000đ" },
          { category: "activities", label: "Vé tham quan", amount: 2_074_332, basis: "Vé & thuyền Nho Quế" },
        ],
      },
      options,
    )) as {
      ok: boolean;
      withinCap?: boolean | null;
      overBy?: number | null;
      savingsOptions?: { label: string; estimatedSavingsVnd: number }[];
      note?: string;
    };

    expect(estimateRes.ok).toBe(true);
    expect(estimateRes.withinCap).toBe(false);
    expect(estimateRes.overBy).toBeGreaterThan(10_000_000);
    expect(estimateRes.savingsOptions?.length).toBeGreaterThanOrEqual(2);
    expect(estimateRes.note).toContain("đã hiện cho người dùng");
    expect(estimateRes.note).toContain("KHÔNG hỏi sang chuyện tìm quán ăn");

    // Server attached schema-valid savingsOptions directly to data-cost
    expect(emittedCosts).toHaveLength(1);
    const parsedCost = costPartSchema.parse(emittedCosts[0]);
    expect(parsedCost.savingsOptions?.length).toBeGreaterThanOrEqual(2);
    expect(parsedCost.savingsOptions!.some(c => c.id === "switch-bus")).toBe(true);
    expect(parsedCost.savingsOptions!.every(c => c.label.includes("ước tính"))).toBe(true);

    // Works client-side even when accessLeg prop is omitted, via cost.savingsOptions
    const resolved = resolveBudgetSavingsChips(parsedCost, null);
    expect(resolved.length).toBeGreaterThanOrEqual(2);

    // Off-topic meal suggestReplies are blocked when cost is over budget
    const mealReply = await tools.suggestReplies.execute!(
      { replies: ["Có, tìm quán ăn giúp mình", "Không cần đâu"] },
      options,
    );
    expect(mealReply).toMatchObject({ ok: false, code: "BUDGET_EXCEEDED_PRIORITY" });
    expect(emittedReplies).toHaveLength(0);

    // When emitCost is NOT wired, note must NOT falsely claim chips were shown
    const silentTools = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      tripInfo: { transport: "MOTORCYCLE", durationDays: 4, startDate: "2026-12-12", travelers: 4, homeCity: "Đà Nẵng" },
      accessLeg: sampleAccessLeg,
    });
    const silentRes = (await silentTools.estimateCosts.execute!(
      {
        budgetCap: 20_000_000,
        lines: [{ category: "lodging", label: "Homestay", amount: 6_000_000 }],
      },
      options,
    )) as { ok: boolean; note?: string };
    expect(silentRes.ok).toBe(true);
    expect(silentRes.note).not.toContain("đã hiện cho người dùng");
    expect(silentRes.note).toContain("KHÔNG nói các nút giảm chi phí đã hiện");
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
