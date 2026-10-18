import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { InTripLocation } from "./in-trip-location";
import {
  canRequestInTripReplan,
  createInTripSession,
  getInTripStep,
  IN_TRIP_NEED_MAX_LENGTH,
  validateInTripNeed,
} from "./in-trip-session";

const selectedLocation: InTripLocation = {
  source: "MANUAL",
  latitude: 22.8233,
  longitude: 104.9836,
  accuracyMeters: null,
  capturedAt: "2026-10-17T12:00:00.000Z",
};

describe("US36 Task287 in-trip assistant session", () => {
  it("rejects empty and whitespace-only needs", () => {
    expect(validateInTripNeed("")).toEqual({ valid: false, reason: "REQUIRED" });
    expect(validateInTripNeed(" \t\n ")).toEqual({ valid: false, reason: "REQUIRED" });
  });

  it("rejects needs longer than the 500-character limit", () => {
    expect(validateInTripNeed("x".repeat(IN_TRIP_NEED_MAX_LENGTH + 1))).toEqual({
      valid: false,
      reason: "TOO_LONG",
    });
  });

  it("accepts a short need and returns trimmed text without changing the source", () => {
    const original = "  Muốn ăn trưa gần đây  ";
    expect(validateInTripNeed(original)).toEqual({ valid: true, normalized: "Muốn ăn trưa gần đây" });
    expect(original).toBe("  Muốn ăn trưa gần đây  ");
  });

  it("keeps the ordered steps: location, need, then ready", () => {
    const initial = createInTripSession("HAS_REMAINING");
    expect(getInTripStep(initial)).toBe("LOCATION");
    expect(canRequestInTripReplan(initial)).toBe(false);

    const withLocation = { ...initial, location: selectedLocation };
    expect(getInTripStep(withLocation)).toBe("NEED");
    expect(canRequestInTripReplan(withLocation)).toBe(false);

    const ready = { ...withLocation, need: "Tìm chỗ ăn trưa" };
    expect(getInTripStep(ready)).toBe("READY");
    expect(canRequestInTripReplan(ready)).toBe(true);
  });

  it("never allows a request without a selected location", () => {
    const session = { ...createInTripSession("HAS_REMAINING" as const), need: "Tìm chỗ ăn trưa" };
    expect(canRequestInTripReplan(session)).toBe(false);
  });

  it("does not allow a request after all scheduled visits are complete", () => {
    const session = {
      ...createInTripSession("ALL_COMPLETED" as const),
      location: selectedLocation,
      need: "Tìm chỗ ăn trưa",
    };
    expect(getInTripStep(session)).toBe("ALL_COMPLETED");
    expect(canRequestInTripReplan(session)).toBe(false);
  });

  it("keeps location and need out of browser storage and URL state", () => {
    const assistantSource = readFileSync(
      new URL("../../components/in-trip/in-trip-assistant.tsx", import.meta.url),
      "utf8",
    );
    expect(assistantSource).not.toMatch(/\b(?:localStorage|sessionStorage|document\.cookie)\b/);
    expect(assistantSource).not.toMatch(/\b(?:URLSearchParams|searchParams|location\.href)\b/);
    expect(assistantSource).not.toMatch(/\bconsole\.(?:log|warn|error)\b/);
  });
});
