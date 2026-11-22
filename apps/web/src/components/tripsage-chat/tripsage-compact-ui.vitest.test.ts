import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItineraryValidationPanel } from "@/components/trip-planner/planner-presentation";
import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";
import type { TimelinePart, TimelineSuggestion } from "@/modules/tripsage-chat/tripsage-timeline";
import { TripsageCostCard } from "./tripsage-cost-card";
import { TripsageTimelineView } from "./tripsage-timeline-view";

const TWO_DAY_TIMELINE: TimelinePart = {
  days: [
    {
      day: 1,
      date: "2026-12-01",
      items: [
        { slotId: "d1-drive-0", kind: "DRIVE", startMinute: 420, endMinute: 960, label: "Ngày di chuyển · 446 km · ~9 giờ" },
        { slotId: "d1-overnight", kind: "OVERNIGHT", startMinute: 960, endMinute: null, label: "Nghỉ đêm khu vực Hà Giang" },
      ],
    },
    {
      day: 2,
      date: "2026-12-02",
      items: [
        { slotId: "d2-visit-1", kind: "VISIT", startMinute: 480, endMinute: 600, label: "Cổng Trời Quản Bạ" },
        { slotId: "d2-overnight", kind: "OVERNIGHT", startMinute: 1020, endMinute: null, label: "Nghỉ đêm khu vực Đồng Văn" },
      ],
    },
  ],
};

const LODGING_DUPE: TimelineSuggestion = {
  slotId: "d1-overnight",
  kind: "LODGING",
  title: "HomeStay Minh Đức",
  place: { name: "HomeStay Minh Đức", distanceKm: 0.3 },
};

describe("Ticket 07: compact UI, day tabs, deduplicated lodging, budget row, validation spacing", () => {
  it("renders accessible day tabs and switches active day panel content cleanly", () => {
    const day1Html = renderToStaticMarkup(createElement(TripsageTimelineView, {
      timeline: TWO_DAY_TIMELINE,
      suggestions: [LODGING_DUPE],
      initialDay: 1,
    }));
    expect(day1Html).toContain('role="tablist"');
    expect(day1Html).toContain('role="tab"');
    expect(day1Html).toContain('role="tabpanel"');
    expect(day1Html).toContain('id="tripsage-day-tab-1"');
    expect(day1Html).toContain('aria-selected="true"');
    expect(day1Html).toContain("Ngày di chuyển · 446 km · ~9 giờ");
    expect(day1Html).not.toContain("Cổng Trời Quản Bạ");

    const day2Html = renderToStaticMarkup(createElement(TripsageTimelineView, {
      timeline: TWO_DAY_TIMELINE,
      suggestions: [LODGING_DUPE],
      initialDay: 2,
    }));
    expect(day2Html).toContain('id="tripsage-day-panel-2"');
    expect(day2Html).toContain("Cổng Trời Quản Bạ");
    expect(day2Html).not.toContain("Ngày di chuyển · 446 km");
  });

  it("shows a lodging suggestion name only once with its distance", () => {
    const html = renderToStaticMarkup(createElement(TripsageTimelineView, {
      timeline: TWO_DAY_TIMELINE,
      suggestions: [LODGING_DUPE],
      initialDay: 1,
    }));
    const matches = html.match(/HomeStay Minh Đức/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(html).toContain("cách khoảng 0.3 km");
  });

  it("hides the budget comparison row when budgetCap is 0 or absent, and shows it when > 0", () => {
    const baseLines = [{ category: "food" as const, label: "Ăn uống", amount: 600_000, basis: "2 người" }];
    const zeroBudget = estimateTripCost({ transport: "MOTORCYCLE", travelers: 2, days: 2, distanceKm: 100, budgetCap: 0, lines: baseLines });
    expect(zeroBudget.budgetCap).toBeNull();

    const zeroHtml = renderToStaticMarkup(createElement(TripsageCostCard, { cost: zeroBudget }));
    expect(zeroHtml).not.toContain("So với ngân sách");
    expect(zeroHtml).toContain("tripsage-cost-amount");

    // Also guard component against a raw legacy payload carrying budgetCap: 0
    const rawZeroHtml = renderToStaticMarkup(createElement(TripsageCostCard, {
      cost: { ...zeroBudget, budgetCap: 0, withinCap: false, overBy: zeroBudget.total },
    }));
    expect(rawZeroHtml).not.toContain("So với ngân sách");

    const withBudget = estimateTripCost({ transport: "MOTORCYCLE", travelers: 2, days: 2, distanceKm: 100, budgetCap: 2_000_000, lines: baseLines });
    const withBudgetHtml = renderToStaticMarkup(createElement(TripsageCostCard, { cost: withBudget }));
    expect(withBudgetHtml).toContain("So với ngân sách");
  });

  it("separates the validation heading from the pass count pill cleanly", () => {
    const html = renderToStaticMarkup(createElement(ItineraryValidationPanel, {
      checks: [
        { key: "OPENING_HOURS", status: "PASS", issues: [] },
        { key: "MINIMUM_DURATION", status: "PASS", issues: [] },
        { key: "TRAVEL_TIME", status: "PASS", issues: [] },
        { key: "SCHEDULE_CONFLICTS", status: "PASS", issues: [] },
        { key: "MOBILITY", status: "VIOLATION", issues: [] },
      ],
    }));
    const plainText = html.replace(/<[^>]+>/g, "");
    expect(plainText).not.toContain("Kiểm tra lịch trình4");
    expect(plainText).toContain("Kiểm tra lịch trình 4 đạt");
    expect(plainText).toContain("Xem chi tiết");
  });
  it("shows the way to the meeting hub as 'Ngày đi' and 'Ngày về' tabs around the Hà Giang days", () => {
    const accessLeg = { hubName: "Hà Nội (bến xe Mỹ Đình)", homeCity: "Đà Nẵng", travelers: 10, outboundMinutes: 80, returnMinutes: 80, totalVnd: 46_567_240,
      outbound: [{ mode: "FLIGHT" as const, from: "Đà Nẵng (DAD)", to: "Hà Nội (HAN)", durationMinutes: 80, priceVndPerPerson: 2_328_362 }],
      return: [{ mode: "FLIGHT" as const, from: "Hà Nội (HAN)", to: "Đà Nẵng (DAD)", durationMinutes: 80, priceVndPerPerson: 2_328_362 }] };
    const tabs = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: TWO_DAY_TIMELINE, suggestions: [], accessLeg })).replaceAll(" ", " ");
    expect(tabs).toMatch(/Ngày đi<\/span><small>30\/11/u);
    expect(tabs).toMatch(/Ngày về<\/span><small>03\/12/u);
    const outbound = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: TWO_DAY_TIMELINE, suggestions: [], accessLeg, initialDay: 0 }));
    expect(outbound).toContain("Ngày đi · Đà Nẵng → Hà Nội (bến xe Mỹ Đình) · 30/11/2026");
    expect(outbound).toContain("Máy bay");
    expect(renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: TWO_DAY_TIMELINE, suggestions: [] }))).not.toContain("Ngày đi");
  });
  it("shows travel-day tabs from the home city before the way to the hub is planned", () => {
    const travel = { homeCity: "TP Hồ Chí Minh", hubName: "Hà Nội (bến xe Mỹ Đình)" };
    expect(renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: TWO_DAY_TIMELINE, suggestions: [], travel }))).toContain("Ngày về");
    const panel = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: TWO_DAY_TIMELINE, suggestions: [], travel, initialDay: 0, onAskAccess: () => undefined }));
    expect(panel).toContain("Chưa chọn cách đi giữa TP Hồ Chí Minh và Hà Nội (bến xe Mỹ Đình)");
    expect(panel).toContain("So sánh cách đi");
  });
});
