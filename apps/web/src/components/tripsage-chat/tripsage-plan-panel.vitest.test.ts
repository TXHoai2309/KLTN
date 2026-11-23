import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHECK_KEYS, type PlannerResult } from "@/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";
import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";
import { TripsagePlanSummaryCard } from "./tripsage-plan-summary-card";
import {
  readPlanPanelMode,
  resolvePanelModeAfterCardOpen,
  TripsagePlanPanel,
  writePlanPanelMode,
} from "./tripsage-plan-panel";

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
    // Single-stop morning day has no validated lunch break -> never fabricates 12:00-13:00
    expect(html).not.toContain("Nghỉ trưa");
  });

  it("places validated lunch break strictly after Nặm Đăm (10:14–12:14) at 12:14–13:14 before Stop 4 (14:44) with zero overlap (Bug C)", () => {
    const day1Proposal: PlannerResult = {
      ...makeProposal("prop-day1-lunch"),
      days: [
        {
          day: 1,
          date: "2026-12-13",
          distanceMeters: 140_000,
          travelSeconds: 12_000,
          stops: [
            {
              order: 1,
              destination: { id: "s1", name: "Cổng trời Quản Bạ", description: "", area: "Quản Bạ", address: null, category: "Cảnh quan", latitude: 23.07, longitude: 104.98, image: null },
              arrivalMinute: 510, // 08:30
              departureMinute: 570, // 09:30
              visitDurationMinutes: 60,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
            {
              order: 2,
              destination: { id: "s2", name: "Núi Đôi Quản Bạ", description: "", area: "Quản Bạ", address: null, category: "Cảnh quan", latitude: 23.075, longitude: 104.99, image: null },
              arrivalMinute: 576, // 09:36
              departureMinute: 606, // 10:06
              visitDurationMinutes: 30,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
            {
              order: 3,
              destination: { id: "s3", name: "Làng văn hóa Nặm Đăm", description: "", area: "Quản Bạ", address: null, category: "Văn hóa", latitude: 23.08, longitude: 105.0, image: null },
              arrivalMinute: 614, // 10:14
              departureMinute: 734, // 12:14
              visitDurationMinutes: 120,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
            {
              order: 4,
              destination: { id: "s4", name: "Rừng thông Yên Minh", description: "", area: "Yên Minh", address: null, category: "Cảnh quan", latitude: 23.11, longitude: 105.14, image: null },
              arrivalMinute: 884, // 14:44
              departureMinute: 944, // 15:44
              visitDurationMinutes: 60,
              scheduleState: "PLANNED",
              inbound: null,
              validationStatus: "PASS",
            },
          ],
        },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: day1Proposal,
        suggestions: [],
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

    expect(html).toContain("Nghỉ trưa");
    expect(html).toContain("12:14 – 13:14");
    expect(html).not.toContain("12:00 – 13:00");

    // Verify chronological DOM order: Núi Đôi (09:36-10:06) -> Nặm Đăm (10:14-12:14) -> Nghỉ trưa (12:14-13:14) -> Rừng thông Yên Minh (14:44)
    const idxStop2 = html.indexOf("Núi Đôi Quản Bạ");
    const idxStop3 = html.indexOf("Làng văn hóa Nặm Đăm");
    const idxLunch = html.indexOf("Nghỉ trưa");
    const idxStop4 = html.indexOf("Rừng thông Yên Minh");
    expect(idxStop2).toBeGreaterThan(-1);
    expect(idxStop3).toBeGreaterThan(idxStop2);
    expect(idxLunch).toBeGreaterThan(idxStop3);
    expect(idxStop4).toBeGreaterThan(idxLunch);
  });

  it("Bug 4: highlights Ngày đi / Ngày 1..N / Ngày về tabs with aria-selected and is-active matching rendered content", () => {
    const proposal = makeProposal("prop-travel-tabs");
    const travel = { homeCity: "Đà Nẵng", hubName: "TP Hà Giang (bến xe phía Nam)" };

    for (const activeKey of ["travel-outbound", "day-1", "travel-return"] as const) {
      const html = renderToStaticMarkup(
        createElement(TripsagePlanPanel, {
          proposal,
          suggestions: [],
          travel,
          tripInfo: { homeCity: "Đà Nẵng", travelers: 4, startDate: "2026-12-13", durationDays: 2 },
          chosenLodgings: {},
          pinnedItems: [],
          drawerOpen: false,
          initialDayKey: activeKey,
          onCloseDrawer: () => {},
          onToggleChosenLodging: () => {},
          onRequestMeals: () => {},
          onAskAccess: () => {},
          onSelectSavingsOption: () => {},
          onSaved: () => {},
          onSaveStateChange: () => {},
        }),
      );
      const dayButtons = [...html.matchAll(/<button\b[^>]*class="tv-day-tab[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
      expect(dayButtons.length).toBeGreaterThanOrEqual(3);
      const outboundBtn = dayButtons[0]!;
      const day1Btn = dayButtons[1]!;
      const returnBtn = dayButtons.at(-1)!;

      expect(outboundBtn.includes('aria-selected="true"'), `${activeKey}: outbound`).toBe(activeKey === "travel-outbound");
      expect(outboundBtn.includes("tv-day-tab is-active"), `${activeKey}: outbound class`).toBe(activeKey === "travel-outbound");
      expect(day1Btn.includes('aria-selected="true"'), `${activeKey}: day-1`).toBe(activeKey === "day-1");
      expect(day1Btn.includes("tv-day-tab is-active"), `${activeKey}: day-1 class`).toBe(activeKey === "day-1");
      expect(returnBtn.includes('aria-selected="true"'), `${activeKey}: return`).toBe(activeKey === "travel-return");
      expect(returnBtn.includes("tv-day-tab is-active"), `${activeKey}: return class`).toBe(activeKey === "travel-return");

      if (activeKey === "travel-outbound") expect(html).toContain("Ngày đi · Đà Nẵng → TP Hà Giang");
      if (activeKey === "travel-return") expect(html).toContain("Ngày về · TP Hà Giang (bến xe phía Nam) → Đà Nẵng");
    }
  });

  it("Bug 7: shows stale warning banner and locks 'Lưu chuyến' when recorded tripInfo diverges from current proposal", () => {
    const proposal = makeProposal("prop-stale-7");
    const changedTripInfo = {
      homeCity: "Hà Nội",
      startDate: "2026-12-26",
      durationDays: 3,
      transport: "CAR" as const,
      travelers: 5,
    };
    const panelHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal,
        suggestions: [],
        tripInfo: changedTripInfo,
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
    expect(panelHtml).toContain("Thông tin chuyến đã đổi — bản lịch này chưa cập nhật");
    expect(panelHtml).toContain('data-testid="plan-panel-outdated"');
    expect(panelHtml).toMatch(/<button[^>]*disabled=""[^>]*>Lưu chuyến<\/button>/);

    const summaryHtml = renderToStaticMarkup(
      createElement(TripsagePlanSummaryCard, {
        version: 1,
        proposal,
        isCurrent: true,
        isOutdated: true,
        onOpenPanel: () => {},
      }),
    );
    expect(summaryHtml).toContain("Thông tin chuyến đã đổi — bản lịch này chưa cập nhật");
    expect(summaryHtml).toContain('data-testid="plan-summary-outdated"');
  });

  it("Bug 10: keeps status notices outside .tripsage-panel-header-actions and links disabled 'Lưu chuyến' via aria-describedby", () => {
    const assumedProposal: PlannerResult = {
      ...makeProposal("prop-assumed-10"),
      assumedFields: ["origin", "startDate"],
      eligibleForFinalConfirmation: false,
    };
    const html = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: assumedProposal,
        suggestions: [],
        tripInfo: {
          startDate: "2026-12-13",
          durationDays: 2,
          transport: "MOTORCYCLE",
          assumedFields: ["origin", "startDate"],
        },
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

    const actionsMatch = html.match(/<div class="tripsage-panel-header-actions">([\s\S]*?)<\/header>/);
    expect(actionsMatch).not.toBeNull();
    const actionsHtml = actionsMatch![1]!;
    const actionsVisibleText = actionsHtml.replace(/<[^>]+>/g, "").trim();
    // Long status message MUST NOT appear as visible content inside .tripsage-panel-header-actions (only the compact CTA)
    expect(actionsVisibleText).toBe("Lưu chuyến");
    expect(actionsHtml).not.toMatch(/<p[\s>]/);
    expect(actionsHtml).toContain('aria-describedby="tripsage-panel-status-prop-assumed-10"');
    expect(actionsHtml).toContain('title="Bản nháp đang dùng giả định');

    // Status strip sits OUTSIDE </header> with matching id and warn tone
    const afterHeader = html.slice(html.indexOf("</header>"));
    expect(afterHeader).toContain('id="tripsage-panel-status-prop-assumed-10"');
    expect(afterHeader).toContain("tripsage-panel-status-strip--warn");
    expect(afterHeader).toContain("Bản nháp đang dùng giả định — cần xác nhận nơi xuất phát và ngày khởi hành trước khi lưu hành trình.");
  });

  it("Point 6: renders 'Đã lưu' + 'Mở chuyến đi' link in BOTH desktop header and mobile sheet footer when savedTripId is restored", () => {
    const proposal = makeProposal("prop-saved-v2");
    const savedHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal,
        suggestions: [],
        chosenLodgings: {},
        pinnedItems: [],
        savedTripId: "cmwt3nfzl000107lbf8uetc0l",
        drawerOpen: true,
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );

    const openLinks = savedHtml.match(/href="\/trips\/cmwt3nfzl000107lbf8uetc0l"/g) ?? [];
    expect(openLinks.length).toBe(2); // Desktop header + Mobile sheet footer
    expect(savedHtml).toContain("Đã lưu");
    expect(savedHtml).toContain("Mở chuyến đi");
    expect(savedHtml).not.toContain(">Lưu chuyến<");

    // When a newer proposal v3 has no matching savedTripId (null), 'Lưu chuyến' reappears
    const v3Html = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: makeProposal("prop-v3-new"),
        suggestions: [],
        chosenLodgings: {},
        pinnedItems: [],
        savedTripId: null,
        drawerOpen: true,
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );
    expect(v3Html).toContain(">Lưu chuyến<");
    expect(v3Html).not.toContain("/trips/cmwt3nfzl000107lbf8uetc0l");
  });

  it("A2: renders 3-state panel mode controls (Thu gọn / Chia đôi / Mở rộng), collapsed strip with persistent inner tree, and safe localStorage helpers", () => {
    const splitHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: makeProposal("prop-a2"),
        suggestions: [],
        chosenLodgings: {},
        pinnedItems: [],
        drawerOpen: false,
        panelMode: "split",
        onPanelModeChange: () => {},
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );
    expect(splitHtml).toContain("Chế độ hiển thị panel lịch trình");
    expect(splitHtml).toContain('aria-label="Thu gọn"');
    expect(splitHtml).toContain('aria-label="Chia đôi"');
    expect(splitHtml).toContain('aria-label="Mở rộng"');
    expect(splitHtml).toContain('aria-pressed="true"');

    const collapsedHtml = renderToStaticMarkup(
      createElement(TripsagePlanPanel, {
        proposal: makeProposal("prop-a2"),
        suggestions: [],
        chosenLodgings: {},
        pinnedItems: [],
        drawerOpen: false,
        panelMode: "collapsed",
        onPanelModeChange: () => {},
        onCloseDrawer: () => {},
        onToggleChosenLodging: () => {},
        onRequestMeals: () => {},
        onAskAccess: () => {},
        onSelectSavingsOption: () => {},
        onSaved: () => {},
        onSaveStateChange: () => {},
      }),
    );
    expect(collapsedHtml).toContain("is-panel-collapsed");
    expect(collapsedHtml).toContain("tripsage-panel-collapsed-strip");
    expect(collapsedHtml).toContain('aria-label="Mở lại panel lịch trình"');
    expect(collapsedHtml).toContain("tripsage-panel-inner");

    expect(resolvePanelModeAfterCardOpen("collapsed")).toBe("split");
    expect(resolvePanelModeAfterCardOpen("split")).toBe("split");
    expect(resolvePanelModeAfterCardOpen("expanded")).toBe("expanded");

    const badStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readPlanPanelMode(badStorage)).toBe("split");
    expect(() => writePlanPanelMode(badStorage, "expanded")).not.toThrow();

    const backing = new Map<string, string>();
    const okStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: k => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
    };
    writePlanPanelMode(okStorage, "collapsed");
    expect(readPlanPanelMode(okStorage)).toBe("collapsed");
  });
});
