import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BROWSER_LOCATION_TIMEOUT_MS,
  requestBrowserLocation,
  type BrowserGeolocation,
} from "./browser-location";

const position: GeolocationPosition = {
  coords: {
    latitude: 22.8233,
    longitude: 104.9836,
    accuracy: 42,
    altitude: 100,
    altitudeAccuracy: 5,
    heading: 90,
    speed: 3,
    toJSON: () => ({}),
  },
  timestamp: Date.parse("2026-10-15T03:00:00Z"),
  toJSON: () => ({}),
};

function positionError(code: number): GeolocationPositionError {
  return { code, message: "private browser details", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("US35 Task281 explicit one-shot browser location", () => {
  it("does not read the browser or request a position on import", async () => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>();
    const readGeolocation = vi.fn(() => ({ getCurrentPosition }));
    vi.stubGlobal("navigator", { get geolocation() { return readGeolocation(); } });
    vi.resetModules();

    await import("./browser-location");

    expect(readGeolocation).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns only the OK fields after an explicit handler call with low-power 10s options", async () => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>(success => success(position));
    const watchPosition = vi.fn();
    const geolocation = { getCurrentPosition, watchPosition };
    const onClick = () => requestBrowserLocation(geolocation);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    expect(await onClick()).toEqual({
      status: "OK",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: 42,
      capturedAt: position.timestamp,
    });
    expect(getCurrentPosition).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function), expect.any(Function),
      { timeout: 10_000, enableHighAccuracy: false, maximumAge: 0 },
    );
    expect(watchPosition).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [1, "DENIED"],
    [2, "UNAVAILABLE"],
    [3, "TIMEOUT"],
  ] as const)("maps browser error %i to %s without exposing its message", async (code, status) => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>((_success, error) => error?.(positionError(code)));
    expect(await requestBrowserLocation({ getCurrentPosition })).toEqual({ status });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, undefined])("returns UNSUPPORTED without browser access for %s", async geolocation => {
    expect(await requestBrowserLocation(geolocation)).toEqual({ status: "UNSUPPORTED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles after 10s even if neither browser callback fires", async () => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>();
    const settled = vi.fn();
    const pending = requestBrowserLocation({ getCurrentPosition });
    void pending.then(settled);

    await vi.advanceTimersByTimeAsync(BROWSER_LOCATION_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ status: "TIMEOUT" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores late callbacks after timing out and never starts another request", async () => {
    let success: PositionCallback | undefined;
    let failure: PositionErrorCallback | null | undefined;
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>((onSuccess, onError) => {
      success = onSuccess;
      failure = onError;
    });
    const pending = requestBrowserLocation({ getCurrentPosition });
    await vi.advanceTimersByTimeAsync(BROWSER_LOCATION_TIMEOUT_MS);

    success!(position);
    failure?.(positionError(1));
    expect(await pending).toEqual({ status: "TIMEOUT" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps a synchronous browser exception to UNAVAILABLE without leaking details", async () => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>(() => {
      throw new Error("private browser details");
    });
    expect(await requestBrowserLocation({ getCurrentPosition })).toEqual({ status: "UNAVAILABLE" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps an unknown error code to UNAVAILABLE", async () => {
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>((_success, error) => error?.(positionError(99)));
    expect(await requestBrowserLocation({ getCurrentPosition })).toEqual({ status: "UNAVAILABLE" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not persist, navigate or log the acquired coordinates", async () => {
    const storageRead = vi.fn();
    const storageWrite = vi.fn();
    const cookieWrite = vi.fn();
    const navigate = vi.fn();
    const storage = { getItem: storageRead, setItem: storageWrite, removeItem: storageWrite, clear: storageWrite };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("document", { set cookie(value: string) { cookieWrite(value); } });
    vi.stubGlobal("location", { assign: navigate, replace: navigate, set href(value: string) { navigate(value); } });
    vi.stubGlobal("history", { pushState: navigate, replaceState: navigate });
    vi.stubGlobal("window", { localStorage: storage, sessionStorage: storage, location: globalThis.location, history: globalThis.history });
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    const getCurrentPosition = vi.fn<BrowserGeolocation["getCurrentPosition"]>(success => success(position));

    expect((await requestBrowserLocation({ getCurrentPosition })).status).toBe("OK");
    for (const sideEffect of [storageRead, storageWrite, cookieWrite, navigate, ...logs]) {
      expect(sideEffect).not.toHaveBeenCalled();
    }
  });
});
