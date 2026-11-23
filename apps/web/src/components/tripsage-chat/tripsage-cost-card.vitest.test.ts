import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";
import { TripsageCostCard } from "./tripsage-cost-card";
import type { PinControl } from "./tripsage-pin-button";

const SAMPLE_LEG: AccessLegPart = {
  id: "al-h-1",
  homeCity: "Đà Nẵng",
  hubName: "TP Hà Giang",
  travelers: 4,
  outbound: [
    { mode: "FLIGHT", from: "Đà Nẵng (DAD)", to: "Hà Nội (HAN)", durationMinutes: 90, priceVndPerPerson: 2_328_362, priceSource: "GOOGLE_FLIGHTS" },
    { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000, priceSource: "ESTIMATE" },
  ],
  return: [
    { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000, priceSource: "ESTIMATE" },
    { mode: "FLIGHT", from: "Hà Nội (HAN)", to: "Đà Nẵng (DAD)", durationMinutes: 90, priceVndPerPerson: 2_328_362, priceSource: "GOOGLE_FLIGHTS" },
  ],
  outboundMinutes: 480,
  returnMinutes: 480,
  totalVnd: 21_026_896,
};

describe("Bug H: Cost table redesign (design §3.8 & §2)", () => {
  it("renders redesigned header, warning badge, immediate savings chips, collapsible notes, and secondary sm pin button without nested scroll", () => {
    const cost = estimateTripCost({
      transport: "MOTORCYCLE",
      travelers: 4,
      days: 4,
      distanceKm: 388,
      budgetCap: 20_000_000,
      extraLines: [
        { category: "transport", label: "Chặng tiếp cận (đi và về)", amount: 21_026_896, basis: "Máy bay + Xe khách × 2 chiều × 4 người" },
      ],
      lines: [
        { category: "lodging", label: "Homestay 3 đêm", amount: 3_600_000, basis: "3 đêm × 2 phòng × 600.000đ" },
        { category: "food", label: "Ăn uống", amount: 4_800_000, basis: "4 người × 4 ngày × 300.000đ" },
        { category: "transport", label: "Thuê xe máy", amount: 2_680_000, basis: "2 xe × 4 ngày" },
      ],
    });
    const pins: PinControl = { saved: false, isPinned: () => false, toggle: () => {} };

    const html = renderToStaticMarkup(
      createElement(TripsageCostCard, {
        cost,
        pins,
        accessLeg: SAMPLE_LEG,
        onSelectSavingsOption: () => {},
      }),
    );

    // Header hierarchy: plain "Chi phí ước tính", 28px total, warning badge, group/per-person sub-line
    expect(html).toContain('<h4 class="tripsage-cost-title">Chi phí ước tính</h4>');
    expect(html).toContain("tripsage-cost-total-amount");
    expect(html).toContain('data-testid="cost-over-budget-badge"');
    expect(html).toContain("Vượt ngân sách");
    expect(html).toContain("cả nhóm 4 người");

    // No nested scroll wrapper (.tripsage-md-table removed)
    expect(html).not.toContain("tripsage-md-table");
    expect(html).toContain("tripsage-cost-table-wrap");

    // Savings chips appear right below the warning badge and BEFORE the table
    const badgeIdx = html.indexOf("cost-over-budget-badge");
    const chipsIdx = html.indexOf("tripsage-savings-chips");
    const tableIdx = html.indexOf("tripsage-cost-table");
    expect(badgeIdx).toBeGreaterThan(-1);
    expect(chipsIdx).toBeGreaterThan(badgeIdx);
    expect(tableIdx).toBeGreaterThan(chipsIdx);

    // "(hệ thống tính)" uses dedicated muted --tv-ink-3 tag
    expect(html).toContain("tripsage-cost-computed-tag");
    // Budget row highlighted as over-budget
    expect(html).toContain("tripsage-cost-budget-foot is-over-budget");

    // Notes collapsed inside <details> by default (no open attribute)
    expect(html).toContain('<details class="tripsage-cost-notes-details"><summary class="tripsage-cost-notes-summary">Ghi chú cách tính</summary>');

    // Pin button uses secondary sm traveler button inside footer wrapper
    expect(html).toContain("tripsage-cost-footer");
    expect(html).toContain("tv-btn tv-btn--secondary tv-btn--sm");
    expect(html).toContain("Ghim vào chuyến đi");
  });

  it("keeps assistant.css free of nested cost overflow/max-height and switches to 2 columns below 640px via @container", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/assistant/assistant.css"), "utf8");
    const costRule = css.match(/\.tripsage-cost\s*\{([^}]*)\}/);
    expect(costRule).not.toBeNull();
    expect(costRule![1]).toContain("overflow: visible");
    expect(costRule![1]).toContain("max-height: none");
    expect(costRule![1]).toContain("container-type: inline-size");
    expect(css).not.toMatch(/\.tripsage-cost\s*\{[^}]*overflow-x\s*:\s*auto/);
    expect(css).toMatch(/@container\s*\(max-width:\s*639px\)\s*\{[\s\S]*?\.tripsage-cost-basis-desktop/);
  });
});
