import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coordinateFieldsFromValue,
  startManualLocationMapSession,
  validateManualCoordinates,
  type ManualLocationMapState,
} from "./manual-location-picker";

afterEach(() => { vi.useRealTimers(); });

describe("manual coordinate entry", () => {
  it("keeps no selection distinct from the default map viewport", () => {
    expect(coordinateFieldsFromValue(null)).toEqual({ latitude: "", longitude: "" });
    expect(validateManualCoordinates(coordinateFieldsFromValue(null))).toEqual({
      ok: false,
      errors: { latitude: "Nhập vĩ độ để chọn vị trí.", longitude: "Nhập kinh độ để chọn vị trí." },
    });
  });

  it.each([
    ["23.123456789", "105.987654321", 23.123456789, 105.987654321],
    [" 23.2 ", " 105.3 ", 23.2, 105.3],
    ["0", "0", 0, 0],
    ["-90", "180", -90, 180],
    ["90", "-180", 90, -180],
  ])("accepts the shared parser's valid pair %s / %s without rounding", (latitude, longitude, lat, lng) => {
    const fields = Object.freeze({ latitude, longitude });
    expect(validateManualCoordinates(fields)).toEqual({ ok: true, coordinates: { latitude: lat, longitude: lng } });
    expect(coordinateFieldsFromValue({ latitude: lat, longitude: lng })).toEqual({ latitude: String(lat), longitude: String(lng) });
  });

  it.each([
    ["", "105", "latitude"], [" ", "105", "latitude"],
    ["91", "105", "latitude"], ["-90.01", "105", "latitude"],
    ["NaN", "105", "latitude"], ["Infinity", "105", "latitude"],
    ["23,2", "105", "latitude"], ["23", "", "longitude"],
    ["23", "181", "longitude"], ["23", "-180.01", "longitude"],
    ["23", "abc", "longitude"],
  ])("reports the affected field for %s / %s", (latitude, longitude, field) => {
    const result = validateManualCoordinates({ latitude, longitude });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
  });

  it("reports both invalid fields without replacing or clamping them", () => {
    const fields = Object.freeze({ latitude: "91", longitude: "181" });
    const result = validateManualCoordinates(fields);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["latitude", "longitude"]);
    expect(fields).toEqual({ latitude: "91", longitude: "181" });
  });
});

describe("manual picker map lifecycle", () => {
  function fixture(load: () => Promise<string> = async () => "library") {
    const states: ManualLocationMapState[] = [];
    const dispose = vi.fn();
    let ready = () => {};
    let fail = () => {};
    const mount = vi.fn((_library: string, onReady: () => void, onFail: () => void) => {
      ready = onReady; fail = onFail;
      return dispose;
    });
    const stop = startManualLocationMapSession({ load, mount, onState: state => states.push(state) });
    return { states, mount, dispose, stop, ready: () => ready(), fail: () => fail() };
  }

  it("clears the deadline once ready and disposes on unmount", async () => {
    vi.useFakeTimers();
    const session = fixture();
    expect(session.states).toEqual(["loading"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.mount).toHaveBeenCalledOnce();
    session.ready();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(session.states).toEqual(["loading", "ready"]);
    expect(session.dispose).not.toHaveBeenCalled();
    session.stop();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports loader rejection as error rather than timeout", async () => {
    vi.useFakeTimers();
    const session = fixture(async () => { throw new Error("provider unavailable"); });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.states).toEqual(["loading", "error"]);
    expect(session.mount).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    session.stop();
  });

  it("times out at 15 seconds and ignores a late loader", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const session = fixture(() => new Promise<string>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(session.states).toEqual(["loading"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(session.states).toEqual(["loading", "timeout"]);
    resolve("late library");
    await vi.advanceTimersByTimeAsync(0);
    expect(session.mount).not.toHaveBeenCalled();
    session.stop();
  });

  it("disposes a mounted map that never becomes ready and ignores late callbacks", async () => {
    vi.useFakeTimers();
    const session = fixture();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(session.states).toEqual(["loading", "timeout"]);
    expect(session.dispose).toHaveBeenCalledOnce();
    session.ready(); session.fail();
    expect(session.states).toEqual(["loading", "timeout"]);
    session.stop();
  });

  it("cleans up provider errors and supports a separate retry session", async () => {
    vi.useFakeTimers();
    const first = fixture();
    await vi.advanceTimersByTimeAsync(0);
    first.fail();
    expect(first.states).toEqual(["loading", "error"]);
    expect(first.dispose).toHaveBeenCalledOnce();
    first.stop();
    const retry = fixture();
    await vi.advanceTimersByTimeAsync(0);
    first.ready(); retry.ready();
    expect(first.states).toEqual(["loading", "error"]);
    expect(retry.states).toEqual(["loading", "ready"]);
    retry.stop();
  });

  it("does not mount or publish state after unmount during loading", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const session = fixture(() => new Promise<string>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(0);
    session.stop();
    resolve("library");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(session.mount).not.toHaveBeenCalled();
    expect(session.states).toEqual(["loading"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
