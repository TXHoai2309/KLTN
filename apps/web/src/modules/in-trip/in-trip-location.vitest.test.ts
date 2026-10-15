import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { AppError } from "../../server/http/app-error";
import { isValidMapCoordinate, type MapCoordinate } from "../map/map-model";
import { inTripLocationSchema, normalizeInTripLocation, type InTripLocation } from "./in-trip-location";

const input = {
  source: "GPS",
  latitude: 23.1234567,
  longitude: 105.7654321,
  accuracyMeters: 12.5,
  capturedAt: "2026-10-15T09:30:00+07:00",
};

describe("in-trip location normalization", () => {
  it("accepts the strict contract, rounds both axes and remains compatible with maps", () => {
    const location = normalizeInTripLocation(input);
    expect(location).toEqual({ ...input, latitude: 23.12346, longitude: 105.76543 });
    expect(inTripLocationSchema.parse(input)).toEqual(location);
    expectTypeOf<InTripLocation>().toExtend<MapCoordinate>();
    expect(isValidMapCoordinate(location)).toBe(true);
  });

  it.each(["GPS", "MANUAL"])("allows optional/null/nonnegative accuracy for %s", source => {
    const { accuracyMeters: _accuracy, ...withoutAccuracy } = input;
    const absent = normalizeInTripLocation({ ...withoutAccuracy, source });
    expect(absent).not.toHaveProperty("accuracyMeters");
    for (const accuracyMeters of [null, 0, 0.25, 100_000]) {
      expect(normalizeInTripLocation({ ...input, source, accuracyMeters }).accuracyMeters).toBe(accuracyMeters);
    }
  });

  it.each([
    [90, 180], [-90, -180], [0, 0], [-23.1234567, -105.7654321],
  ])("accepts valid global coordinates %s/%s without a regional policy", (latitude, longitude) => {
    const location = normalizeInTripLocation({ ...input, latitude, longitude });
    expect(isValidMapCoordinate(location)).toBe(true);
    expect(location.latitude).toBe(Number(latitude.toFixed(5)));
    expect(location.longitude).toBe(Number(longitude.toFixed(5)));
  });

  it("canonicalizes negative zero and is deterministic/idempotent without mutating input", () => {
    const frozen = Object.freeze({ ...input, latitude: -0.000001, longitude: -0 });
    const first = normalizeInTripLocation(frozen);
    expect(Object.is(first.latitude, -0)).toBe(false);
    expect(Object.is(first.longitude, -0)).toBe(false);
    expect(normalizeInTripLocation(frozen)).toEqual(first);
    expect(normalizeInTripLocation(first)).toEqual(first);
    expect(first).not.toBe(frozen);
    expect(frozen.latitude).toBe(-0.000001);
  });

  it.each([
    "2026-10-15T02:30:00Z", "2026-10-15T09:30:00.123+07:00",
    "2000-02-29T00:00:00-04:00", "2099-12-31T23:59:59Z",
  ])("preserves an ISO timestamp with explicit timezone: %s", capturedAt => {
    expect(normalizeInTripLocation({ ...input, capturedAt }).capturedAt).toBe(capturedAt);
  });

  it.each([
    null, undefined, [], "location", 42,
    { ...input, source: "OTHER" }, { ...input, source: "gps" },
    { ...input, latitude: NaN }, { ...input, longitude: NaN },
    { ...input, latitude: Infinity }, { ...input, longitude: -Infinity },
    { ...input, latitude: "23.1" }, { ...input, longitude: "105.2" },
    { ...input, latitude: null }, { ...input, longitude: true },
    { ...input, latitude: 90.000001 }, { ...input, latitude: -90.000001 },
    { ...input, longitude: 180.000001 }, { ...input, longitude: -180.000001 },
    { ...input, accuracyMeters: -1 }, { ...input, accuracyMeters: NaN },
    { ...input, accuracyMeters: Infinity }, { ...input, accuracyMeters: "10" },
    { ...input, extra: "reject" }, { ...input, userId: "forged-owner" },
    { ...input, location: { latitude: 23, longitude: 105 } },
    { ...input, capturedAt: 1_792_033_800_000 },
    { ...input, capturedAt: new Date("2026-10-15T02:30:00Z") },
    { ...input, capturedAt: "2026-10-15" },
    { ...input, capturedAt: "2026-10-15T09:30:00" },
    { ...input, capturedAt: "2026-02-30T00:00:00Z" },
    { ...input, capturedAt: "not-a-date" }, { ...input, capturedAt: null },
  ])("rejects invalid input with a stable coded error (case %#)", candidate => {
    expect(inTripLocationSchema.safeParse(candidate).success).toBe(false);
    let caught: unknown;
    try { normalizeInTripLocation(candidate); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ code: "INVALID_IN_TRIP_LOCATION", status: 400 });
  });

  it.each(["source", "latitude", "longitude", "capturedAt"])("requires %s for either source", field => {
    for (const source of ["GPS", "MANUAL"]) {
      const candidate: Record<string, unknown> = { ...input, source };
      delete candidate[field];
      expect(() => normalizeInTripLocation(candidate)).toThrow(AppError);
    }
  });

  it("does not put raw input or coordinates in error messages/details", () => {
    try {
      normalizeInTripLocation({ ...input, latitude: "PRIVATE_INPUT", privateField: "PRIVATE_INPUT" });
      expect.fail("Expected a coded error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const failure = error as AppError;
      expect(failure.message).toBe("Vị trí đầu vào không hợp lệ.");
      expect(JSON.stringify(failure.details)).not.toContain("PRIVATE_INPUT");
      expect(JSON.stringify(failure.details)).not.toContain(String(input.longitude));
      expect(failure.details).toEqual({ issues: [
        { code: "invalid_type", path: ["latitude"] },
        { code: "unrecognized_keys", path: [] },
      ] });
    }
  });

  it("normalizes without reading a clock, logging or making network calls", () => {
    const date = vi.spyOn(Date, "now").mockImplementation(() => { throw Error("Clock read"); });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw Error("Network call"); });
    const log = vi.spyOn(console, "log");
    try {
      const result = normalizeInTripLocation(input);
      expect(result.capturedAt).toBe(input.capturedAt);
      expect(() => normalizeInTripLocation({ ...input, capturedAt: undefined })).toThrow(AppError);
      expect(date).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally { date.mockRestore(); fetch.mockRestore(); log.mockRestore(); }
  });
});
