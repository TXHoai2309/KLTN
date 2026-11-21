import { describe, expect, it } from "vitest";
import {
  buildTripsageChatBody,
  changesItinerary,
  quickRepliesPartSchema,
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

describe("second-cluster defaults", () => {
  it("fills interests, pace and travelers and names what was defaulted", () => {
    expect(withTripInfoDefaults({ transport: "CAR" })).toEqual({ info: { transport: "CAR", interests: ["NATURE", "ADVENTURE"], pace: "MODERATE", travelers: 2 }, defaulted: ["interests", "pace", "travelers"] });
    expect(withTripInfoDefaults({ ...INFO, pace: "PACKED", travelers: 1 }).defaulted).toEqual([]);
  });
  it("never defaults first-cluster fields", () => {
    const { info } = withTripInfoDefaults({});
    expect(info).not.toHaveProperty("transport");
    expect(info).not.toHaveProperty("durationDays");
    expect(info).not.toHaveProperty("startDate");
  });
});

describe("changesItinerary", () => {
  it("is true only when a recorded transport, day count or date changes", () => {
    expect(changesItinerary(INFO, { ...INFO, durationDays: 5 })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, transport: "MOTORCYCLE" })).toBe(true);
    expect(changesItinerary(INFO, { ...INFO, interests: ["FOOD"], travelers: 4 })).toBe(false);
    expect(changesItinerary(null, INFO)).toBe(false);
    expect(changesItinerary({}, INFO)).toBe(false);
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
  it("sends tripInfo and currentItinerary beside journey", () => {
    expect(buildTripsageChatBody({ messages: [], journey: null, tripInfo: null, itinerary: null })).toEqual({ messages: [], journey: null, tripInfo: null, currentItinerary: null });
    const itinerary = { days: [] };
    expect(buildTripsageChatBody({ messages: [1], journey: null, tripInfo: INFO, itinerary })).toMatchObject({ tripInfo: INFO, currentItinerary: itinerary });
  });
});
