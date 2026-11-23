import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { estimateTripCost } from "@/modules/tripsage-chat/tripsage-cost";
import { TripsageCostCard } from "./tripsage-cost-card";

const ASSISTANT_CSS = readFileSync(
  resolve(process.cwd(), "src/components/assistant/assistant.css"),
  "utf8",
);
const CLIENT_SRC = readFileSync(
  resolve(process.cwd(), "src/components/tripsage-chat/tripsage-chat-client.tsx"),
  "utf8",
);
const PANEL_SRC = readFileSync(
  resolve(process.cwd(), "src/components/tripsage-chat/tripsage-plan-panel.tsx"),
  "utf8",
);

describe("Ticket 11: Mobile sheet, 48px topbar, 2-col cost list & slim composer (slim B8-B10, design §3.6/3.8/3.9/4.1)", () => {
  it("defines 48px mobile topbar, hides floating sidebar button on mobile, and styles 92% bottom sheet with sticky lg footer", () => {
    expect(CLIENT_SRC).toContain("assistant-mobile-topbar");
    expect(ASSISTANT_CSS).toMatch(/\.assistant-mobile-topbar\s*\{[^}]*height:\s*48px/);
    expect(ASSISTANT_CSS).toMatch(/\.tripsage-plan-panel\s*\{[^}]*border-radius:\s*16px 16px 0 0/);
    expect(ASSISTANT_CSS).toMatch(/\.tripsage-sheet-handle\s*\{[^}]*width:\s*36px/);
    expect(ASSISTANT_CSS).toMatch(/\.tripsage-sheet-footer\s*\{[^}]*display:\s*block/);
  });

  it("handles Android Back (popstate) and swipe-down gesture on mobile plan sheet", () => {
    expect(PANEL_SRC).toContain("popstate");
    expect(PANEL_SRC).toContain("pushState");
    expect(PANEL_SRC).toContain("onTouchStart");
    expect(PANEL_SRC).toContain("onTouchEnd");
  });

  it("uses single-line composer with 32px circular send button and shows character counter only above 80% of MAX_LENGTH", () => {
    expect(CLIENT_SRC).toContain("draft.length > MAX_LENGTH * 0.8");
    expect(ASSISTANT_CSS).toMatch(/\.assistant-composer-send-circle[^{]*\{[^}]*width:\s*32px[^}]*height:\s*32px/);
  });

  it("renders mobile 2-column cost basis sub-line inside TripsageCostCard (design §3.8)", () => {
    const cost = estimateTripCost({
      travelers: 4,
      days: 3,
      transport: "MOTORCYCLE",
      distanceKm: 240,
      lines: [{ category: "lodging", label: "Homestay", amount: 1_800_000, basis: "2 đêm × 2 phòng" }],
    });
    const html = renderToStaticMarkup(createElement(TripsageCostCard, { cost }));
    expect(html).toContain("tripsage-cost-basis-mobile");
    expect(html).toContain("2 đêm × 2 phòng");
  });

  it("Bug 6: keeps mobile composer single-row 44px with 32px circular send button, short 1-line placeholder, and single-line horizontally scrollable sheet subtabs", () => {
    // Never switch composer to flex-direction: column on mobile (<= 480px)
    expect(ASSISTANT_CSS).not.toMatch(/\.assistant-composer-input\s*\{[^}]*flex-direction\s*:\s*column/);

    // Circular send button stays 32x32 even on mobile (not stretched to 44px by legacy button[type="submit"] rule)
    expect(ASSISTANT_CSS).toMatch(/\.assistant-page\s+\.assistant-composer-bar\s+\.assistant-composer-send-circle\s*\{[^}]*width\s*:\s*32px[^}]*height\s*:\s*32px/);

    // Short 1-line placeholder and clean empty height reset
    expect(CLIENT_SRC).toContain('placeholder="Hỏi về chuyến đi Hà Giang…"');
    expect(CLIENT_SRC).toMatch(/if\s*\(!draft\)\s*\{\s*el\.style\.height\s*=\s*""/);

    // Sheet subtabs stay single-line (white-space: nowrap, overflow-x: auto, 13.5px / 500, height 36px) and compact "Kiểm tra 5/5"
    const subtabsMatch = ASSISTANT_CSS.match(/\.tripsage-panel-subtabs\s*\{([^}]*)\}/);
    expect(subtabsMatch).not.toBeNull();
    expect(subtabsMatch![1]).toMatch(/overflow-x\s*:\s*auto/);
    const subtabMatch = ASSISTANT_CSS.match(/\.tripsage-panel-subtab\s*\{([^}]*)\}/);
    expect(subtabMatch).not.toBeNull();
    expect(subtabMatch![1]).toMatch(/white-space\s*:\s*nowrap/);
    expect(subtabMatch![1]).toMatch(/flex-shrink\s*:\s*0/);
    expect(subtabMatch![1]).toMatch(/height\s*:\s*36px/);
    expect(subtabMatch![1]).toMatch(/font-size\s*:\s*13\.5px/);
    expect(PANEL_SRC).toContain("Kiểm tra {passedChecks}/{proposal.checks.length}");
  });
});
