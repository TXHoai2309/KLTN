import { describe, expect, it } from "vitest";
import type { TripsageRequirement } from "./tripsage-chat-context";
import {
  EMPTY_REQUIREMENT_DRAFT,
  OPENING_MESSAGE,
  buildTripsageChatBody,
  summarizeItinerary,
  tripsageItinerarySummarySchema,
  tripsageRequirementSchema,
  validateRequirementDraft,
} from "./tripsage-chat-context";

const REQUIREMENT: TripsageRequirement = { transport: "CAR", durationDays: 2, startDate: "2026-11-02", interests: ["NATURE", "FOOD"] };

describe("tripsageRequirementSchema", () => {
  it("accepts a complete requirement", () => { expect(tripsageRequirementSchema.safeParse(REQUIREMENT).success).toBe(true); });
  it("rejects unknown keys, out-of-range days, bad enums, empty interests and impossible dates", () => {
    for (const bad of [
      { ...REQUIREMENT, extra: 1 }, { ...REQUIREMENT, durationDays: 15 }, { ...REQUIREMENT, durationDays: 0 }, { ...REQUIREMENT, transport: "BUS" },
      { ...REQUIREMENT, interests: [] }, { ...REQUIREMENT, interests: ["SHOPPING"] }, { ...REQUIREMENT, startDate: "2026-02-30" }, { ...REQUIREMENT, startDate: null },
    ]) expect(tripsageRequirementSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("validateRequirementDraft", () => {
  it("is not ok for the empty draft and names every missing field", () => {
    const result = validateRequirementDraft(EMPTY_REQUIREMENT_DRAFT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["durationDays", "interests", "startDate", "transport"]);
  });
  it("reuses the shared limits (1-14 days)", () => {
    const result = validateRequirementDraft({ transport: "CAR", durationDays: "15", startDate: "2026-11-02", interests: ["NATURE"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.durationDays).toContain("14");
  });
  it("returns the structured requirement when complete", () => {
    const result = validateRequirementDraft({ transport: "MOTORCYCLE", durationDays: "3", startDate: "2026-11-02", interests: ["NATURE"] });
    expect(result).toEqual({ ok: true, requirement: { transport: "MOTORCYCLE", durationDays: 3, startDate: "2026-11-02", interests: ["NATURE"] } });
  });
});

describe("itinerary summary", () => {
  const result = { days: [{ day: 1, stops: [{ destination: { id: "a", name: "Điểm a", latitude: 23, longitude: 105 }, arrivalMinute: 540, departureMinute: 600, inbound: { secret: 1 } }] }, { day: 2, stops: [] }], checks: [], requirement: {} } as never;
  it("keeps only day, id, name and clock times: no coordinates, no checks", () => {
    const summary = summarizeItinerary(result);
    expect(summary).toEqual({ days: [{ day: 1, stops: [{ id: "a", name: "Điểm a", arrivalMinute: 540, departureMinute: 600 }] }, { day: 2, stops: [] }] });
    expect(JSON.stringify(summary)).not.toMatch(/latitude|longitude|checks|inbound/);
  });
  it("strict schema rejects extra fields and oversized shapes", () => {
    const ok = { days: [{ day: 1, stops: [{ id: "a", name: "A", arrivalMinute: null, departureMinute: null }] }] };
    expect(tripsageItinerarySummarySchema.safeParse(ok).success).toBe(true);
    const stop = { id: "a", name: "A", arrivalMinute: 1, departureMinute: 2 };
    for (const bad of [
      { days: [{ day: 1, stops: [{ ...stop, latitude: 1 }] }] }, { days: [{ day: 1, stops: Array(5).fill(stop) }] }, { days: Array.from({ length: 15 }, (_, i) => ({ day: i + 1, stops: [] })) },
      { days: [{ day: 1, stops: [{ ...stop, name: "x".repeat(201) }] }] }, { days: [{ day: 1, stops: [{ ...stop, arrivalMinute: 5000 }] }] }, { days: [], extra: 1 },
    ]) expect(tripsageItinerarySummarySchema.safeParse(bad).success).toBe(false);
  });
});

describe("buildTripsageChatBody", () => {
  it("adds requirement and currentItinerary beside journey, defaulting to null", () => {
    expect(buildTripsageChatBody({ messages: [], journey: null, requirement: null, itinerary: null })).toEqual({ messages: [], journey: null, requirement: null, currentItinerary: null });
    const itinerary = { days: [] };
    expect(buildTripsageChatBody({ messages: [1], journey: null, requirement: REQUIREMENT, itinerary })).toMatchObject({ requirement: REQUIREMENT, currentItinerary: itinerary });
  });
  it("has a Vietnamese opening message", () => { expect(OPENING_MESSAGE).toMatch(/hành trình/); });
});
