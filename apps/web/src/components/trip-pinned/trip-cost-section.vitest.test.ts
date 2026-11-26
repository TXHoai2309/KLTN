import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripCostEstimateSection, TripPinnedSection } from "./trip-pinned-section";
import { shareablePins, type PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import type { CostPart } from "@/modules/tripsage-chat/tripsage-cost";

const SAMPLE_COST: CostPart = {
  currency: "VND",
  travelers: 4,
  days: 5,
  sightseeingDays: 5,
  lines: [
    { category: "transport", label: "Xăng", amount: 444_000, basis: "938 km", computed: true },
    { category: "lodging", label: "Homestay phòng riêng", amount: 3_600_000, basis: "4 đêm × 2 phòng", computed: true },
    { category: "food", label: "Ăn uống phổ thông", amount: 5_400_000, basis: "5 ngày × 4 người", computed: true },
  ],
  total: 9_444_000,
  perPersonPerDay: 472_200,
  budgetCap: null,
  withinCap: null,
  overBy: null,
  assumptions: ["Ước tính từ bảng giá tham khảo."],
  priceReferenceDate: "2026-11-21",
};

describe("TripCostEstimateSection (D4 / B9 / ADR-58)", () => {
  it("renders dedicated estimated cost section with dated disclaimer and lines", () => {
    const html = renderToStaticMarkup(
      createElement(TripCostEstimateSection, {
        costPin: { kind: "COST", cost: SAMPLE_COST },
        needsRecompute: false,
      }),
    );

    expect(html).toContain('data-testid="trip-cost-section"');
    expect(html).toContain("Chi phí ước tính");
    expect(html).toContain("Theo bảng giá tham khảo cập nhật 21/11/2026, chưa phải báo giá. Ứng dụng không đặt chỗ.");
    expect(html).not.toContain("Ước tính tại ngày 21/11/2026");
    expect(html).toContain("9.444.000đ");
    expect(html).toContain("Homestay phòng riêng");
    expect(html).not.toContain('data-testid="trip-cost-stale-badge"');
  });

  it("Q2: displays 'Cần tính lại' badge when saved itinerary changed after cost estimation", () => {
    const html = renderToStaticMarkup(
      createElement(TripCostEstimateSection, {
        costPin: { kind: "COST", cost: SAMPLE_COST, visitFingerprint: "old-fp" },
        needsRecompute: true,
      }),
    );

    expect(html).toContain('data-testid="trip-cost-stale-badge"');
    expect(html).toContain("Cần tính lại");
    expect(html).toContain('href="/assistant"');
  });

  it("Q3: renders empty state with 'Chưa có ước tính chi phí' and 'Hỏi trợ lý' link when trip has no cost estimate", () => {
    const html = renderToStaticMarkup(
      createElement(TripCostEstimateSection, {
        costPin: null,
      }),
    );

    expect(html).toContain('data-testid="trip-cost-section"');
    expect(html).toContain("Chi phí ước tính");
    expect(html).toContain("Chưa có ước tính chi phí");
    expect(html).toContain('href="/assistant"');
    expect(html).toContain("Hỏi trợ lý");
  });

  it("preserves ADR-47 companion sharing invariant (only lodging + food shared, never transport/total)", () => {
    const pins: PinnedItem[] = [
      { kind: "COST", cost: SAMPLE_COST, visitFingerprint: "fp-1" },
    ];
    const shared = shareablePins(pins);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({
      kind: "COST",
      travelers: 4,
      days: 5,
      subtotal: 9_000_000,
    });
    if (shared[0]?.kind === "COST") {
      expect(shared[0].lines.map((l) => l.category)).toEqual(["lodging", "food"]);
    }

    // Companion shared view still renders its shared COST subtotal cleanly via TripPinnedSection
    const sharedHtml = renderToStaticMarkup(
      createElement(TripPinnedSection, { items: shared, shared: true }),
    );
    expect(sharedHtml).toContain("Chi phí ước tính (lưu trú và ăn uống)");
    expect(sharedHtml).toContain("9.000.000đ");
    expect(sharedHtml).not.toContain("Xăng");
  });
});
