import { describe, expect, it } from "vitest";

import { tripSaveRequestSchema } from "./trip-save-contract";

const base = { confirm: true, proposal: {
  startDate: "2026-10-20", durationDays: 2, transport: "CAR",
  days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }, { dayIndex: 2, visits: [] }],
} };
const good = { slotId: "d1-visit-1", kind: "ACTIVITY", placeId: "ChIJabc", name: "Chợ phiên", distanceKm: 1.2 };

describe("save contract nearbySuggestions (ADR-45)", () => {
  it("keeps valid items and silently drops malformed ones instead of failing the save", () => {
    const parsed = tripSaveRequestSchema.parse({ ...base, nearbySuggestions: [good, { slotId: "bad", kind: "MEAL", placeId: "", name: "x", distanceKm: 1 }, { ...good, extra: true }] });
    expect(parsed.nearbySuggestions).toEqual([good]);
  });

  it("is optional", () => {
    expect(tripSaveRequestSchema.parse(base).nearbySuggestions).toBeUndefined();
  });
});
