import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestBrowserLocation, type BrowserGeolocation } from "./browser-location";
import { createLocationFlowState, getLocationFlowMessage, transitionLocationFlow } from "./location-flow";
import { normalizeInTripLocation } from "./in-trip-location";
import { validateManualCoordinates } from "./manual-location-picker";

const capturedAt = "2026-10-15T03:00:00.000Z";
const position: GeolocationPosition = {
  coords: {
    latitude: 22.8234567, longitude: 104.9836543, accuracy: 12.5,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.parse(capturedAt),
  toJSON: () => ({}),
};

function fakeGeolocation() {
  const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>();
  return {
    getCurrentPosition,
    succeed(index = getCurrentPosition.mock.calls.length - 1) {
      getCurrentPosition.mock.calls[index]![0](position);
    },
    fail(code: number) {
      getCurrentPosition.mock.calls.at(-1)![1]?.({
        code, message: "Private browser error", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
      });
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("US35 Task285 composed helpers (test-only caller, not application integration)", () => {
  it("carries explicit GPS success through the flow into a normalized location", async () => {
    const gps = fakeGeolocation();
    const idle = createLocationFlowState();
    expect(gps.getCurrentPosition).not.toHaveBeenCalled();
    // This explicit test action stands in for a future UI click handler.
    const requesting = transitionLocationFlow(idle, { type: "REQUEST_GPS" });
    const pending = requestBrowserLocation(gps);
    gps.succeed();
    const result = await pending;
    const state = transitionLocationFlow(requesting, { type: "GPS_RESULT", requestId: requesting.requestId, result });
    expect(state.status).toBe("gps_ok");
    if (state.status !== "gps_ok") throw Error("Expected GPS snapshot");
    // Explicit fixture conversion: helper281 emits epoch milliseconds; schema284 requires ISO.
    const location = normalizeInTripLocation({
      ...state.location, source: "GPS", capturedAt: new Date(state.location.capturedAt).toISOString(),
    });
    expect(location).toEqual({ source: "GPS", latitude: 22.82346, longitude: 104.98365, accuracyMeters: 12.5, capturedAt });
    expect(gps.getCurrentPosition).toHaveBeenCalledExactlyOnceWith(expect.any(Function), expect.any(Function), {
      timeout: 10_000, enableHighAccuracy: false, maximumAge: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[1, "denied"], [2, "unavailable"], [3, "timeout"]] as const)(
    "carries browser failure %i into %s then allows a valid manual location", async (code, expected) => {
      const gps = fakeGeolocation();
      const requesting = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
      const pending = requestBrowserLocation(gps);
      gps.fail(code);
      const failed = transitionLocationFlow(requesting, { type: "GPS_RESULT", requestId: requesting.requestId, result: await pending });
      expect(failed.status).toBe(expected);
      expect(failed).not.toHaveProperty("location");
      expect(getLocationFlowMessage(failed)).toContain("thủ công");
      expect(getLocationFlowMessage(failed)).not.toContain("Private browser error");
      const manual = transitionLocationFlow(failed, { type: "SELECT_MANUAL" });
      expect(manual.status).toBe("manual");
      const fields = validateManualCoordinates({ latitude: "22.8234567", longitude: "104.9836543" });
      if (!fields.ok) throw Error("Expected valid manual pair");
      expect(normalizeInTripLocation({ source: "MANUAL", ...fields.coordinates, capturedAt })).toEqual({
        source: "MANUAL", latitude: 22.82346, longitude: 104.98365, capturedAt,
      });
      expect(gps.getCurrentPosition).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps unsupported GPS distinct from a selected manual location", async () => {
    const requesting = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const failed = transitionLocationFlow(requesting, {
      type: "GPS_RESULT", requestId: requesting.requestId, result: await requestBrowserLocation(undefined),
    });
    expect(failed.status).toBe("unsupported");
    const manual = transitionLocationFlow(failed, { type: "SELECT_MANUAL" });
    expect(manual).not.toHaveProperty("location");
    expect(() => normalizeInTripLocation({ source: "MANUAL", capturedAt })).toThrowError(
      expect.objectContaining({ code: "INVALID_IN_TRIP_LOCATION" }),
    );
  });

  it.each([
    "Hà Giang",
    { source: "MANUAL", province: "Hà Giang", capturedAt },
    { source: "MANUAL", latitude: "Hà Giang", longitude: "Đồng Văn", capturedAt },
    { source: "MANUAL", latitude: 22.8, capturedAt },
    { source: "MANUAL", longitude: 104.9, capturedAt },
    { source: "MANUAL", latitude: NaN, longitude: 104.9, capturedAt },
    { source: "MANUAL", latitude: 22.8, longitude: 181, capturedAt },
  ])("rejects insufficiently specific manual input after denied GPS (case %#)", async candidate => {
    const gps = fakeGeolocation();
    const requesting = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const pending = requestBrowserLocation(gps);
    gps.fail(1);
    const denied = transitionLocationFlow(requesting, { type: "GPS_RESULT", requestId: requesting.requestId, result: await pending });
    const manual = transitionLocationFlow(denied, { type: "SELECT_MANUAL" });
    expect(() => normalizeInTripLocation(candidate)).toThrowError(expect.objectContaining({ code: "INVALID_IN_TRIP_LOCATION" }));
    expect(manual.status).toBe("manual");
    expect(manual).not.toHaveProperty("location");
    expect(gps.getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("keeps province text invalid in keyboard fields until a complete valid pair is supplied", () => {
    expect(validateManualCoordinates({ latitude: "Hà Giang", longitude: "" }).ok).toBe(false);
    expect(validateManualCoordinates({ latitude: "22.8", longitude: "" }).ok).toBe(false);
    const fields = validateManualCoordinates({ latitude: "0", longitude: "0" });
    if (!fields.ok) throw Error("Expected valid global pair");
    expect(normalizeInTripLocation({ source: "MANUAL", ...fields.coordinates, capturedAt })).toEqual({
      source: "MANUAL", latitude: 0, longitude: 0, capturedAt,
    });
    // A valid pair passes shape/range only, without inventing a Hà Giang boundary.
  });

  it("does not let a late successful GPS result replace manual selection", async () => {
    const gps = fakeGeolocation();
    const requesting = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const pending = requestBrowserLocation(gps);
    const manual = transitionLocationFlow(requesting, { type: "SELECT_MANUAL" });
    const selected = normalizeInTripLocation({ source: "MANUAL", latitude: 23, longitude: 105, capturedAt });
    gps.succeed();
    expect(transitionLocationFlow(manual, { type: "GPS_RESULT", requestId: requesting.requestId, result: await pending })).toBe(manual);
    expect(selected).toEqual({ source: "MANUAL", latitude: 23, longitude: 105, capturedAt });
  });

  it("allows retry after denied GPS with a fresh request id and normalized success", async () => {
    const gps = fakeGeolocation();
    const first = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const pending = requestBrowserLocation(gps);
    gps.fail(1);
    const firstResult = await pending;
    const denied = transitionLocationFlow(first, { type: "GPS_RESULT", requestId: first.requestId, result: firstResult });
    const retry = transitionLocationFlow(denied, { type: "REQUEST_GPS" });
    expect(retry.requestId).toBe(first.requestId + 1);
    expect(transitionLocationFlow(retry, { type: "GPS_RESULT", requestId: first.requestId, result: firstResult })).toBe(retry);
    const retryPending = requestBrowserLocation(gps);
    gps.succeed();
    const state = transitionLocationFlow(retry, { type: "GPS_RESULT", requestId: retry.requestId, result: await retryPending });
    if (state.status !== "gps_ok") throw Error("Expected GPS retry success");
    expect(normalizeInTripLocation({ ...state.location, source: "GPS", capturedAt: new Date(state.location.capturedAt).toISOString() }).source).toBe("GPS");
    expect(gps.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("falls back to manual after the watchdog when the browser never answers", async () => {
    const gps = fakeGeolocation();
    const requesting = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const pending = requestBrowserLocation(gps);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    const timeout = transitionLocationFlow(requesting, { type: "GPS_RESULT", requestId: requesting.requestId, result });
    expect(timeout.status).toBe("timeout");
    const manual = transitionLocationFlow(timeout, { type: "SELECT_MANUAL" });
    gps.succeed();
    expect(transitionLocationFlow(manual, { type: "GPS_RESULT", requestId: requesting.requestId, result })).toBe(manual);
    expect(normalizeInTripLocation({ source: "MANUAL", latitude: 23, longitude: 105, capturedAt }).source).toBe("MANUAL");
    expect(vi.getTimerCount()).toBe(0);
  });
});
