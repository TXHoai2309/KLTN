import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsagePlanPanel } from "@/components/tripsage-chat/tripsage-plan-panel";
import { TripsagePlanSummaryCard } from "@/components/tripsage-chat/tripsage-plan-summary-card";
import { fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import { buildConversationAutoTitle, autoTitleFromAssistantParts } from "./conversation-auto-title";
import { detectDateRangeDurationConflict } from "./tripsage-chat-origin";
import { createTripsageChatTools, type TripsagePlanningDeps } from "./tripsage-chat-tools";
import { formatTravelSplitLabel, resolveWholeTripDates, tripInfoSchema } from "./tripsage-chat-context";
import type { PlannerResult } from "../trip-planner/planner-contract";

describe("D7: whole-trip dates (tripStartDate / tripEndDate)", () => {
  it("detects '7 ngày… đi từ 20/12 – 27/12' conflict and emits 1 clarification with 2 quick-reply buttons without guessing", async () => {
    const conflict = detectDateRangeDurationConflict(
      "Đoàn mình muốn đi 7 ngày, đi từ 20/12 – 27/12 từ TP.HCM ra Hà Giang.",
      new Date("2026-11-25T00:00:00Z"),
    );
    expect(conflict).not.toBeNull();
    expect(conflict!.statedDays).toBe(7);
    expect(conflict!.rangeDays).toBe(8);
    expect(conflict!.chips).toEqual(["7 ngày: 20–26/12", "8 ngày: 20–27/12"]);

    // Selected disambiguation chip does not re-trigger conflict
    expect(detectDateRangeDurationConflict("7 ngày: 20–26/12", new Date("2026-11-25T00:00:00Z"))).toBeNull();

    // Tool layer rejects silent guessing on conflicting turn & emits the 2 chips
    const emittedReplies: string[][] = [];
    const planning: TripsagePlanningDeps = {
      candidates: async () => [planningCandidate("stop-1", 60)],
      routes: fixtureRoutes,
      now: () => planningNow,
    };
    const tools = createTripsageChatTools({
      planning,
      emitItinerary: () => {},
      latestUserText: "Chuyến đi 7 ngày, đi từ 20/12 – 27/12.",
      userHistoryTexts: [],
      emitQuickReplies: r => emittedReplies.push(r),
    });
    const res = await tools.recordTripInfo.execute!(
      { durationDays: 7, tripStartDate: "2026-12-20", tripEndDate: "2026-12-27" },
      { toolCallId: "tc-d7", messages: [] } as never,
    );
    expect(res).toMatchObject({ ok: false, code: "AMBIGUOUS_TRIP_DATES", options: ["7 ngày: 20–26/12", "8 ngày: 20–27/12"] });
    expect(emittedReplies).toEqual([["7 ngày: 20–26/12", "8 ngày: 20–27/12"]]);
  });

  it("enforces sightseeing dates inside [tripStartDate, tripEndDate] and accepts valid c6be04d7 split dates", async () => {
    const parsed = tripInfoSchema.parse({
      homeCity: "TP Hồ Chí Minh",
      travelers: 10,
      transport: "MOTORCYCLE",
      startDate: "2026-12-21",
      durationDays: 5,
      tripStartDate: "2026-12-20",
      tripEndDate: "2026-12-26",
    });
    expect(parsed.tripStartDate).toBe("2026-12-20");
    expect(parsed.tripEndDate).toBe("2026-12-26");

    const tools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
      emitItinerary: () => {},
    });
    const bad = await tools.recordTripInfo.execute!(
      { tripStartDate: "2026-12-20", tripEndDate: "2026-12-26", startDate: "2026-12-22", durationDays: 6 },
      { toolCallId: "tc-d7-bounds", messages: [] } as never,
    );
    expect(bad).toMatchObject({ ok: false, code: "DATES_OUTSIDE_WHOLE_TRIP" });
  });

  it("uses whole-trip range 20–26/12 in conversation auto-title, summary card, and plan panel with Tham quan / Di chuyển split", () => {
    const c6Info = {
      homeCity: "TP Hồ Chí Minh",
      travelers: 10,
      transport: "MOTORCYCLE" as const,
      startDate: "2026-12-21",
      durationDays: 5,
      tripStartDate: "2026-12-20",
      tripEndDate: "2026-12-26",
    };
    expect(buildConversationAutoTitle({ tripInfo: c6Info })).toBe("TP Hồ Chí Minh → HG · 10 người · 20–26/12");
    expect(
      autoTitleFromAssistantParts([{ type: "data-trip-info", data: { tripInfo: c6Info } }]),
    ).toBe("TP Hồ Chí Minh → HG · 10 người · 20–26/12");

    const wholeDates = resolveWholeTripDates({ tripInfo: c6Info, sightseeingStartDate: "2026-12-21", durationDays: 5 });
    expect(formatTravelSplitLabel(wholeDates)).toBe("Tham quan 21–25/12 · Di chuyển 20 và 26/12");

    const proposal: PlannerResult = {
      proposalId: "prop-d7",
      phase: "PRELIMINARY_PROPOSAL",
      status: "PROPOSAL_READY",
      eligibleForFinalConfirmation: true,
      timezone: "Asia/Ho_Chi_Minh",
      reasonCodes: [],
      requirement: {
        startDate: "2026-12-21",
        durationDays: 5,
        transport: "MOTORCYCLE",
        interests: ["NATURE"],
        pace: "MODERATE",
        companions: null,
        mobilityConstraints: null,
      },
      checks: [{ key: "OPENING_HOURS", status: "PASS", issues: [] }],
      warnings: [],
      days: Array.from({ length: 5 }, (_, i) => ({
        day: i + 1,
        date: `2026-12-${21 + i}`,
        distanceMeters: 60_000,
        travelSeconds: 5_400,
        stops: [
          {
            order: 1,
            destination: {
              id: `stop-${i + 1}`,
              name: `Điểm ${i + 1}`,
              description: "Mô tả",
              area: "Đồng Văn",
              address: null,
              category: "Cảnh quan",
              latitude: 23.27,
              longitude: 105.36,
              image: null,
            },
            arrivalMinute: 510,
            departureMinute: 600,
            visitDurationMinutes: 90,
            scheduleState: "PLANNED" as const,
            inbound: null,
            validationStatus: "PASS" as const,
          },
        ],
      })),
    };

    const summaryHtml = renderToStaticMarkup(
      createElement(TripsagePlanSummaryCard, {
        version: 1,
        proposal,
        tripInfo: c6Info,
        isCurrent: true,
        onOpenPanel: () => {},
      }),
    );
    expect(summaryHtml).toContain("20–26/12");
    expect(summaryHtml).toContain("Tham quan 21–25/12 · Di chuyển 20 và 26/12");

    const panelHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal,
        suggestions: [],
        tripInfo: c6Info,
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
