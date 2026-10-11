import { describe, expect, it } from "vitest";

import {
  TRIP_REQUIREMENT_ERROR_MESSAGES,
  tripRequirementInputSchema,
  tripRequirementFieldErrors,
} from "./trip-requirement-contract";

describe("trip requirement contract", () => {
  it("parses and normalizes a complete payload", () => {
    const result = tripRequirementInputSchema.parse({
      startDate: " 2026-02-28 ",
      durationDays: 5,
      transport: "MOTORCYCLE",
      companions: { type: "FRIENDS", groupSize: 3 },
      interests: ["FOOD", "NATURE", "FOOD"],
      pace: "MODERATE",
      mobilityConstraints: {
        flags: ["SENIORS", "AVOID_LONG_WALKING", "SENIORS"],
        note: "  Đi chậm  ",
      },
    });

    expect(result).toEqual({
      startDate: "2026-02-28",
      durationDays: 5,
      transport: "MOTORCYCLE",
      companions: { type: "FRIENDS", groupSize: 3 },
      interests: ["NATURE", "FOOD"],
      pace: "MODERATE",
      mobilityConstraints: {
        flags: ["AVOID_LONG_WALKING", "SENIORS"],
        note: "Đi chậm",
      },
    });
  });

  it.each([
    [{ startDate: null, transport: "CAR" }, "durationDays"],
    [{ startDate: null, durationDays: 3 }, "transport"],
  ])("rejects missing required field %j", (payload, field) => {
    const parsed = tripRequirementInputSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(tripRequirementFieldErrors(parsed.error)).toHaveProperty(field);
  });

  it.each(["BICYCLE", ""]) ("rejects unsupported transport %j", (transport) => {
    expect(
      tripRequirementInputSchema.safeParse({
        startDate: null,
        durationDays: 3,
        transport,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys at every contract object boundary", () => {
    const parsed = tripRequirementInputSchema.safeParse({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      unexpected: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(tripRequirementFieldErrors(parsed.error)).toEqual({
        unexpected: TRIP_REQUIREMENT_ERROR_MESSAGES.UNKNOWN_FIELD,
      });
    }

    const nested = tripRequirementInputSchema.safeParse({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      companions: { type: "SOLO", groupSize: 1, unexpected: true },
    });
    expect(nested.success).toBe(false);
    if (!nested.success) {
      expect(tripRequirementFieldErrors(nested.error)).toEqual({
        "companions.unexpected": TRIP_REQUIREMENT_ERROR_MESSAGES.UNKNOWN_FIELD,
      });
    }
  });

  it("rejects a date that is not present in the calendar", () => {
    const parsed = tripRequirementInputSchema.safeParse({
      startDate: "2026-02-30",
      durationDays: 3,
      transport: "CAR",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid SOLO group size", () => {
    const parsed = tripRequirementInputSchema.safeParse({
      startDate: null,
      durationDays: 3,
      transport: "CAR",
      companions: { type: "SOLO", groupSize: 3 },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(tripRequirementFieldErrors(parsed.error)).toHaveProperty(
        "companions.groupSize",
      );
    }
  });
});
