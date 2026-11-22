import { describe, expect, it } from "vitest";
import {
  buildTripsageChatBody,
  changesItinerary,
  quickRepliesPartSchema,
  resolveEffectiveJourney,
  summarizeItinerary,
  tripInfoSchema,
  tripsageItinerarySummarySchema,
  withTripInfoDefaults,
  type TripsageTripInfo,
} from "./tripsage-chat-context";

const INFO: TripsageTripInfo = { transport: "CAR", durationDays: 4, startDate: "2026-12-04", interests: ["NATURE", "FOOD"] };

describe("tripInfoSchema", () => {
  it("accepts partial and complete trip info", () => {
    expect(tripInfoSchema.safeParse({}).success).toBe(true);
    expect(tripInfoSchema.safeParse({ ...INFO, pace: "RELAXED", travelers: 3 }).success).toBe(true);
  });
  it("rejects unknown keys, out-of-range days, bad enums, empty interests and impossible dates", () => {
    for (const bad of [
      { ...INFO, extra: 1 }, { ...INFO, durationDays: 15 }, { ...INFO, durationDays: 0 }, { ...INFO, transport: "BUS" },
      { ...INFO, interests: [] }, { ...INFO, interests: ["SHOPPING"] }, { ...INFO, startDate: "2026-02-30" }, { ...INFO, travelers: 0 },
      { origin: { latitude: 1 } },
    ]) expect(tripInfoSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("second-cluster and clock defaults", () => {
  it("fills interests, pace, travelers and 07:00/18:00 clocks and names what was defaulted", () => {
    expect(withTripInfoDefaults({ transport: "CAR" })).toEqual({
      info: { transport: "CAR", interests: ["NATURE", "ADVENTURE"], pace: "PACKED", travelers: 2, departureMinute: 420, returnDeadlineMinute: 1080 },
      defaulted: ["interests", "pace", "travelers", "departureMinute", "returnDeadlineMinute"],
    });
    expect(withTripInfoDefaults({ ...INFO, pace: "PACKED", travelers: 1, departureMinute: 360, returnDeadlineMinute: 1020 }).defaulted).toEqual([]);
  });
  it("never defaults first-cluster fields", () => {
    const { info } = withTripInfoDefaults({});
    expect(info).not.toHaveProperty("transport");
    expect(info).not.toHaveProperty("durationDays");
    expect(info).not.toHaveProperty("startDate");
  });
});

describe("changesItinerary", () => {
  it("is true when transport, day count, date or clocks change", () => {
    expect(changesItinerary(INFO, { ...INFO, durationDays: 5 })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, transport: "MOTORCYCLE" })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, departureMinute: 360 })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, returnDeadlineMinute: 1020 })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, interests: ["FOOD"], travelers: 4 })).toBe(false);
    expect(changesItinerary(null, INFO)).toBe(false);
    expect(changesItinerary({}, INFO)).toBe(false);
  });
});

describe("itinerary summary", () => {
  const result = { days: [{ day: 1, stops: [{ destination: { id: "a", name: "Điểm a", latitude: 23, longitude: 105 }, arrivalMinute: 540, departureMinute: 600, inbound: { secret: 1 } }] }, { day: 2, stops: [] }], checks: [], requirement: {} } as never;
  it("keeps only day, id, name, clock times and total distance: no coordinates, no checks", () => {
    const summary = summarizeItinerary(result);
    expect(summary).toEqual({ distanceKm: null, days: [{ day: 1, stops: [{ id: "a", name: "Điểm a", arrivalMinute: 540, departureMinute: 600 }] }, { day: 2, stops: [] }] });
    expect(JSON.stringify(summary)).not.toMatch(/latitude|longitude|checks|inbound/);
  });
  it("strict schema rejects extra fields and oversized shapes", () => {
    const stop = { id: "a", name: "A", arrivalMinute: 1, departureMinute: 2 };
    expect(tripsageItinerarySummarySchema.safeParse({ days: [{ day: 1, stops: [stop] }] }).success).toBe(true);
    for (const bad of [
      { days: [{ day: 1, stops: [{ ...stop, latitude: 1 }] }] }, { days: [{ day: 1, stops: Array(5).fill(stop) }] }, { days: Array.from({ length: 15 }, (_, i) => ({ day: i + 1, stops: [] })) },
      { days: [{ day: 1, stops: [{ ...stop, name: "x".repeat(201) }] }] }, { days: [{ day: 1, stops: [{ ...stop, arrivalMinute: 5000 }] }] }, { days: [], extra: 1 },
    ]) expect(tripsageItinerarySummarySchema.safeParse(bad).success).toBe(false);
  });
});

describe("quick replies part", () => {
  it("allows 1-4 short replies only", () => {
    expect(quickRepliesPartSchema.safeParse({ replies: ["4 ngày 3 đêm", "Xe máy tự lái"] }).success).toBe(true);
    for (const bad of [{ replies: [] }, { replies: ["a", "b", "c", "d", "e"] }, { replies: ["x".repeat(41)] }, { replies: ["ok"], extra: 1 }]) expect(quickRepliesPartSchema.safeParse(bad).success).toBe(false);
  });
});

describe("buildTripsageChatBody", () => {
  it("sends tripInfo, currentItinerary and originCandidatesToken beside journey", () => {
    expect(buildTripsageChatBody({ messages: [], journey: null, tripInfo: null, itinerary: null })).toEqual({ messages: [], journey: null, tripInfo: null, currentItinerary: null, accessLeg: null, originCandidatesToken: null });
    const itinerary = { days: [] };
    expect(buildTripsageChatBody({ messages: [1], journey: null, tripInfo: INFO, itinerary, originCandidatesToken: "v1.a.b" })).toMatchObject({ tripInfo: INFO, currentItinerary: itinerary, originCandidatesToken: "v1.a.b" });
  });
});

describe("resolveEffectiveJourney return clock (ADR-46)", () => {
  const origin = { label: "Hà Nội", latitude: 21, longitude: 105, source: "MANUAL" as const, confirmed: true };
  it("lets a drive-home-only final day leave at the departure clock unless the traveler chose one", () => {
    expect(resolveEffectiveJourney({ origin, departureMinute: null, returnDeadlineMinute: null, returnDepartureMinute: null }, null)?.returnDepartureMinute).toBe(420);
    expect(resolveEffectiveJourney({ origin, departureMinute: 360, returnDeadlineMinute: 1080, returnDepartureMinute: null }, null)?.returnDepartureMinute).toBe(360);
    expect(resolveEffectiveJourney({ origin, departureMinute: 360, returnDeadlineMinute: 1080, returnDepartureMinute: 600 }, null)?.returnDepartureMinute).toBe(600);
  });
});
