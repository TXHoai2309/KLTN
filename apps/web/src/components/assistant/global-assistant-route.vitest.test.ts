import { describe, expect, it } from "vitest";

import { isGlobalAssistantVisibleRoute } from "./global-assistant";

describe("isGlobalAssistantVisibleRoute", () => {
  it("hides the floating assistant launcher on /trips/[id]/edit and /trips/[id]/in-trip while keeping it on trip detail and public pages", () => {
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/edit")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/edit/sub")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/in-trip")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1/in-trip/sub")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips/new")).toBe(false);
    // Ticket 12 (design §4.2): trip detail has its own "Hỏi trợ lý" CTA and sticky mobile bar, so hide the floating pill.
    expect(isGlobalAssistantVisibleRoute("/trips/trip-1")).toBe(false);
    expect(isGlobalAssistantVisibleRoute("/trips")).toBe(true);
    expect(isGlobalAssistantVisibleRoute("/destinations/d1")).toBe(true);
  });
});
