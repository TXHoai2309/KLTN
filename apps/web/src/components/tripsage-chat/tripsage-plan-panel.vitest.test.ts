import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHECK_KEYS, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";
import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";
import { TripsagePlanSummaryCard } from "./tripsage-plan-summary-card";
import { TripsagePlanPanel } from "./tripsage-plan-panel";

function makeProposal(id = "prop-v2"): PlannerResult {
  return {
    proposalId: id,
    phase: "PRELIMINARY_PROPOSAL",
    status: "PROPOSAL_READY",
    requirement: tripRequirementInputSchema.parse({
      startDate: "2026-12-13",
      durationDays: 2,
      transport: "MOTORCYCLE",
      interests: ["NATURE"],
    }),
    timezone: "Asia/Ho_Chi_Minh",
    days: [
      {
        day: 1,
        date: "2026-12-13",
        distanceMeters: 120_000,
        travelSeconds: 9000,
        stops: [
          {
            order: 1,
            destination: {
              id: "d1",
              name: "Cổng trời Quản Bạ",
              description: "Điểm ngắm núi đôi",
              area: "Quản Bạ",
              address: null,
              category: "Cảnh quan",
              latitude: 23.07,
              longitude: 104.98,
              image: { url: "https://cdn.example.com/qb.jpg", alt: "Quản Bạ", author: null, sourceUrl: null },
            },
            arrivalMinute: 540,
            departureMinute: 600,
            visitDurationMinutes: 60,
            scheduleState: "PLANNED",
            inbound: null,
            validationStatus: "PASS",
          },
        ],
      },
      {
        day: 2,
        date: "2026-12-14",
        distanceMeters: 95_000,
        travelSeconds: 7200,
        stops: [
          {
            order: 1,
            destination: {
              id: "d2",
              name: "Cột cờ Lũng Cú",
              description: "Điểm cực Bắc",
              area: "Đồng Văn",
              address: null,
              category: "Lịch sử",
              latitude: 23.36,
              longitude: 105.31,
              image: null,
            },
            arrivalMinute: 540,
            departureMinute: 630,
            visitDurationMinutes: 90,
            scheduleState: "PLANNED",
            inbound: null,
            validationStatus: "PASS",
          },
        ],
      },
    ],
    checks: CHECK_KEYS.map((key) => ({ key, status: "PASS" as const, issues: [] })),
    warnings: [],
    reasonCodes: [],
    eligibleForFinalConfirmation: true,
  };
}

describe("Ticket 10: Plan summary card & desktop split panel / tablet drawer (slim B6, B7, BR-3, AC-3)", () => {
  it("renders current summary card with version, days, stops, cost, budget warning, check count and CTA, and dims stale versions", () => {
    const proposal = makeProposal("prop-v2");
    const overCost = estimateTripCost({
      travelers: 4,
      days: 2,
      transport: "MOTORCYCLE",
      distanceKm: 215,
      budgetCap: 2_000_000,
      lines: [{ category: "lodging", label: "Homestay", amount: 3_000_000 }],
    });

    const currentHtml = renderToStaticMarkup(
      createElement(TripsagePlanSummaryCard, {
        version: 2,
        proposal,
        cost: overCost,
        isCurrent: true,
        isPanelOpen: false,
        onOpenPanel: () => {},
      }),
    );
    expect(currentHtml).toContain("Bản lịch v2");
    expect(currentHtml).toContain("2 ngày · 2 điểm");
    expect(currentHtml).toContain("vượt");
    expect(currentHtml).toContain("kiểm tra đạt");
    expect(currentHtml).toContain("Xem lịch trình");
    expect(currentHtml).not.toContain("Đã có bản mới");

    const staleHtml = renderToStaticMarkup(
      createElement(TripsagePlanSummaryCard, {
        version: 1,
        proposal: makeProposal("prop-v1"),
        isCurrent: false,
        onOpenPanel: () => {},
      }),
    );
    expect(staleHtml).toContain('data-stale="true"');
    expect(staleHtml).toContain("Đã có bản mới");
    expect(staleHtml).not.toContain("Xem lịch trình");
  });

  it("renders TripsagePlanPanel with data-driven title, single primary 'Lưu chuyến' CTA, sub-tabs, DayTimeline full, and Tối nay", () => {
    const proposal = makeProposal("prop-v2");
    const html = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal,
        suggestions: [
          {
            slotId: "d1-overnight",
            kind: "EVENING",
            title: "Chợ đêm Quản Bạ",
            place: { placeId: "ChIJ_ev1", name: "Chợ đêm Quản Bạ", distanceKm: 1.1 },
          },
        ],
        tripInfo: { homeCity: "Đà Nẵng", travelers: 4, startDate: "2026-12-13", durationDays: 2 },
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

    expect(html).toContain('data-testid="tripsage-plan-panel"');
    expect(html).toContain('data-proposal-id="prop-v2"');
    expect(html).toContain("Đà Nẵng → Hà Giang, 13–14/12");
    expect(html).toContain("Lưu chuyến");
    expect(html).toContain("Lịch trình");
    expect(html).toContain("Chi phí");
    expect(html).toContain("Kiểm tra");
    expect(html).toContain('data-variant="full"');
    expect(html).toContain("Cổng trời Quản Bạ");
    expect(html).toContain("Chợ đêm Quản Bạ");
  });
});
