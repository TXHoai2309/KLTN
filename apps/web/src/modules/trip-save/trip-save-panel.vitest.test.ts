import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateItinerary } from "../trip-validation/trip-validation";
import { TripSavePanel } from "./trip-save-panel";

const proposal = { startDate: "2026-10-20", durationDays: 1, transport: "CAR" as const, days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] };

describe("US-30 save component initial state", () => {
  it("presents an explicit save action without an unconfirmed success claim", () => {
    const html = renderToStaticMarkup(createElement(TripSavePanel, { proposal, validation: validateItinerary([], [], new Date("2026-10-15T00:00:00Z")) }));
    expect(html).toContain("Xác nhận và lưu");
    expect(html).not.toContain("Lưu thành công");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });
  it("keeps the save action unavailable when validation is insufficient", () => {
    const validation = validateItinerary([{ visitId: "day-1-visit-1", dayIndex: 1, order: 1, localDate: "2026-10-20", startMinute: 480, plannedDurationMinutes: 60, minimumDurationMinutes: null, openingDays: null }], [], new Date("2026-10-15T00:00:00Z"));
    const html = renderToStaticMarkup(createElement(TripSavePanel, { proposal, validation }));
    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });
});
