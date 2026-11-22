import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plus, Trash2 } from "lucide-react";

import { TravelerButton, travelerButtonClassName } from "./traveler-button";
import { TravelerDayTabs, travelerDayColorVar } from "./traveler-day-tabs";

const ROOT = resolve(process.cwd(), "../..");
const GLOBALS_CSS = readFileSync(resolve(ROOT, "packages/ui/src/styles/globals.css"), "utf8");
const TRIPS_CSS = readFileSync(resolve(process.cwd(), "src/app/trips/trips.css"), "utf8");
const TRAVELER_UI_CSS = readFileSync(resolve(process.cwd(), "src/components/traveler-ui/traveler-ui.css"), "utf8");

describe("Ticket 01: Traveler UI tokens, buttons, day tabs, and trips.css compliance", () => {
  it("defines all required --tv-* tokens in both light (:root) and dark (.dark) themes", () => {
    const requiredTokens = [
      "--tv-ink",
      "--tv-ink-2",
      "--tv-ink-3",
      "--tv-ground",
      "--tv-surface",
      "--tv-sunken",
      "--tv-line",
      "--tv-accent",
      "--tv-accent-hover",
      "--tv-on-accent",
      "--tv-accent-tint",
      "--tv-warn-ink",
      "--tv-warn-bg",
      "--tv-danger",
      "--tv-focus",
      "--tv-day-1",
      "--tv-day-2",
      "--tv-day-3",
      "--tv-day-4",
      "--tv-day-5",
      "--tv-day-6",
      "--tv-day-7",
      "--tv-font-ui",
      "--tv-font-title",
      "--tv-text-xs",
      "--tv-text-sm",
      "--tv-text-md",
      "--tv-text-lg",
      "--tv-text-xl",
      "--tv-text-2xl",
      "--tv-space-1",
      "--tv-space-2",
      "--tv-space-3",
      "--tv-space-4",
      "--tv-space-5",
      "--tv-space-6",
      "--tv-space-7",
      "--tv-radius-control",
      "--tv-radius-card",
      "--tv-radius-pill",
      "--tv-shadow-float",
      "--tv-motion-fast",
      "--tv-motion-sheet",
    ];
    for (const token of requiredTokens) {
      expect(GLOBALS_CSS).toContain(`${token}:`);
    }

    const darkBlock = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(".dark {"));
    for (const darkToken of [
      "--tv-ink: #e6ece8",
      "--tv-ink-2: #a3b0a9",
      "--tv-ink-3: #77847d",
      "--tv-ground: #111613",
      "--tv-surface: #18201b",
      "--tv-sunken: #202a24",
      "--tv-line: #2c3731",
      "--tv-accent: #6fb894",
      "--tv-accent-hover: #85c7a5",
      "--tv-on-accent: #0d1a13",
      "--tv-accent-tint: #1d2e25",
      "--tv-warn-ink: #f0b863",
      "--tv-warn-bg: #33270f",
      "--tv-danger: #f2867c",
      "--tv-focus: #6fb894",
    ]) {
      expect(darkBlock).toContain(darkToken);
    }
  });

  it("renders TravelerButton across all 3 sizes, 6 variants, and loading state", () => {
    const primary = renderToStaticMarkup(
      createElement(TravelerButton, { variant: "primary", size: "md", icon: createElement(Plus, { size: 16 }) }, "Lưu chuyến"),
    );
    expect(primary).toContain("tv-btn tv-btn--primary tv-btn--md");
    expect(primary).toContain("Lưu chuyến");

    const smSecondary = renderToStaticMarkup(
      createElement(TravelerButton, { variant: "secondary", size: "sm" }, "Đổi giờ"),
    );
    expect(smSecondary).toContain("tv-btn tv-btn--secondary tv-btn--sm");

    const lgLoading = renderToStaticMarkup(
      createElement(TravelerButton, { variant: "primary", size: "lg", loading: true }, "Lưu chuyến"),
    );
    expect(lgLoading).toContain("tv-btn--lg");
    expect(lgLoading).toContain('aria-busy="true"');
    expect(lgLoading).toContain("tv-btn-spinner");

    const iconDanger = renderToStaticMarkup(
      createElement(TravelerButton, { variant: "icon", size: "md", "aria-label": "Xóa" }, createElement(Trash2, { size: 16 })),
    );
    expect(iconDanger).toContain("tv-btn--icon");
    expect(iconDanger).toContain('aria-label="Xóa"');

    expect(travelerButtonClassName({ variant: "link", size: "sm" })).toBe("tv-btn tv-btn--link tv-btn--sm");
    expect(travelerButtonClassName({ variant: "text" })).toBe("tv-btn tv-btn--text tv-btn--md");
    expect(travelerButtonClassName({ variant: "danger" })).toBe("tv-btn tv-btn--danger tv-btn--md");
  });

  it("renders TravelerDayTabs with day color dot, inline count, and travel days", () => {
    expect(travelerDayColorVar(1)).toBe("--tv-day-1");
    expect(travelerDayColorVar(4)).toBe("--tv-day-4");
    expect(travelerDayColorVar(8)).toBe("--tv-day-1");

    const html = renderToStaticMarkup(
      createElement(TravelerDayTabs, {
        activeId: "day-1",
        onSelect: () => {},
        tabs: [
          { id: "outbound", label: "Ngày đi 12/12", kind: "travel" },
          { id: "day-1", label: "Ngày 1", count: 4, dayNumber: 1, kind: "trip" },
          { id: "day-2", label: "Ngày 2", count: 3, dayNumber: 2, kind: "trip" },
          { id: "return", label: "Ngày về 16/12", kind: "travel" },
        ],
      }),
    );
    expect(html).toContain("tv-day-tabs");
    expect(html).toContain("Ngày đi 12/12");
    expect(html).toContain("Ngày 1");
    expect(html).toContain("· 4");
    expect(html).toContain("· 3");
    expect(html).toContain("--tv-tab-color:var(--tv-day-1)");
    expect(html).toContain('aria-selected="true"');
  });

  it("enforces design system rules in trips.css and traveler-ui.css (no 650/700+, no hardcoded hex, no card/btn/tab box-shadow)", () => {
    for (const css of [TRIPS_CSS, TRAVELER_UI_CSS]) {
      expect(css).not.toMatch(/font-weight\s*:\s*(650|700|750|800|900)\b/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toContain("#142238");
      expect(css).not.toContain("#143e2d");
      expect(css).not.toContain("#35765c");
      // Only allow box-shadow: none or box-shadow: var(--tv-shadow-float) (on floating elements like dialog/menu)
      const shadows = [...css.matchAll(/box-shadow\s*:\s*([^;]+);/g)].map(m => m[1]!.trim());
      for (const value of shadows) {
        expect(["none", "var(--tv-shadow-float)"]).toContain(value);
      }
    }
  });
});
