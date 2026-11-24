import { describe, expect, it } from "vitest";

import {
  hasOpenDialogOrSheet,
  isGlobalAssistantVisibleRoute,
  nextAssistantLauncherCompact,
} from "./global-assistant";

describe("isGlobalAssistantVisibleRoute", () => {
  it("hides the floating assistant launcher on /assistant, /trips/[id], edit, and in-trip while keeping public pages", () => {
    expect(isGlobalAssistantVisibleRoute("/assistant")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/assistant/chat-1")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/edit")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/edit/sub")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/in-trip")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/in-trip/sub")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/new")).toBe(false);
    // Ticket 12 (design §4.2): trip detail has its own "Hỏi trợ lý" CTA and sticky mobile bar, so hide the floating pill.
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips")).toBe(true);
    expect(isGlobalAssistantVisibleRoute("/explore")).toBe(true);
    expect(isGlobalAssistantVisibleRoute("/favorites")).toBe(true);
    expect(isGlobalAssistantVisibleRoute("/destinations/d1")).toBe(true);
  });
});

describe("hasOpenDialogOrSheet", () => {
  const makeEl = (opts: {
    tagName?: string;
    attrs?: Record<string, string | null>;
    inOverlay?: boolean;
  }) => ({
    tagName: opts.tagName ?? "DIV",
    closest: (selector: string) => (selector === "[data-assistant-overlay-root]" && opts.inOverlay ? {} : null),
    hasAttribute: (name: string) => (opts.attrs?.[name] ?? null) !== null,
    getAttribute: (name: string) => opts.attrs?.[name] ?? null,
  });

  it("ignores portal dialog or closed dialogs and returns true when a page dialog or sheet is open", () => {
    const portalOnly = {
      querySelectorAll: () => [
        makeEl({ attrs: { "aria-modal": "true" }, inOverlay: true }),
        makeEl({ tagName: "DIALOG", attrs: {} }),
        makeEl({ attrs: { "data-state": "closed" } }),
        makeEl({ attrs: { hidden: "" } }),
      ],
    } as unknown as Document;
    expect(hasOpenDialogOrSheet(portalOnly)).toBe(false);

    const openSheet = {
      querySelectorAll: () => [
        makeEl({ attrs: { "aria-modal": "true" }, inOverlay: true }),
        makeEl({ attrs: { role: "dialog", "aria-modal": "true", "data-state": "open" } }),
      ],
    } as unknown as Document;
    expect(hasOpenDialogOrSheet(openSheet)).toBe(true);
  });
});

describe("nextAssistantLauncherCompact", () => {
  it("shrinks on scroll down, restores on scroll up, and stays expanded under prefers-reduced-motion", () => {
    expect(nextAssistantLauncherCompact({ scrollY: 40, lastScrollY: 0, wasCompact: false, prefersReducedMotion: false })).toBe(false);
    expect(nextAssistantLauncherCompact({ scrollY: 220, lastScrollY: 100, wasCompact: false, prefersReducedMotion: false })).toBe(true);
    // Small jitter stays compact
    expect(nextAssistantLauncherCompact({ scrollY: 224, lastScrollY: 220, wasCompact: true, prefersReducedMotion: false })).toBe(true);
    // Scrolling up restores full label
    expect(nextAssistantLauncherCompact({ scrollY: 180, lastScrollY: 224, wasCompact: true, prefersReducedMotion: false })).toBe(false);
    // Respect prefers-reduced-motion
    expect(nextAssistantLauncherCompact({ scrollY: 400, lastScrollY: 100, wasCompact: false, prefersReducedMotion: true })).toBe(false);
  });
});
