import { describe, expect, it } from "vitest";

import type { BrowserLocationResult } from "./browser-location";
import {
  createLocationFlowState,
  getLocationFlowMessage,
  transitionLocationFlow,
  type GpsLocation,
  type LocationFlowEvent,
  type LocationFlowState,
} from "./location-flow";

const location: GpsLocation = {
  latitude: 22.8233,
  longitude: 104.9836,
  accuracyMeters: 42,
  capturedAt: 1_792_032_000_000,
};

const states: LocationFlowState[] = [
  { status: "idle", requestId: 7 },
  { status: "requesting", requestId: 7 },
  { status: "gps_ok", requestId: 7, location },
  { status: "denied", requestId: 7 },
  { status: "unavailable", requestId: 7 },
  { status: "timeout", requestId: 7 },
  { status: "unsupported", requestId: 7 },
  { status: "manual", requestId: 7 },
];

const outcomes: { result: BrowserLocationResult; expected: LocationFlowState["status"] }[] = [
  { result: { status: "OK", ...location }, expected: "gps_ok" },
  { result: { status: "DENIED" }, expected: "denied" },
  { result: { status: "UNAVAILABLE" }, expected: "unavailable" },
  { result: { status: "TIMEOUT" }, expected: "timeout" },
  { result: { status: "UNSUPPORTED" }, expected: "unsupported" },
];

const resultTransitions = states.flatMap(state => outcomes.map(outcome => ({
  from: state.status,
  state,
  result: outcome.result,
  expected: state.status === "requesting" ? outcome.expected : state.status,
})));

describe("US35 Task282 pure GPS/manual location flow", () => {
  it("starts idle without a selected location or an in-flight request", () => {
    expect(createLocationFlowState()).toEqual({ status: "idle", requestId: 0 });
    expect(createLocationFlowState()).not.toBe(createLocationFlowState());
  });

  it.each(states)("$status → requesting on explicit REQUEST_GPS, with no duplicate while pending", state => {
    const next = transitionLocationFlow(state, { type: "REQUEST_GPS" });
    expect(next).toEqual({ status: "requesting", requestId: state.status === "requesting" ? 7 : 8 });
    if (state.status === "requesting") expect(next).toBe(state);
    expect(next).not.toHaveProperty("location");
  });

  it.each(states)("$status → manual is always available and manual can leave for GPS again", state => {
    const manual = transitionLocationFlow(state, { type: "SELECT_MANUAL" });
    expect(manual).toEqual({ status: "manual", requestId: 7 });
    expect(manual).not.toHaveProperty("location");

    const retry = transitionLocationFlow(manual, { type: "REQUEST_GPS" });
    expect(retry).toEqual({ status: "requesting", requestId: 8 });
    expect(transitionLocationFlow(retry, { type: "GPS_RESULT", requestId: 8, result: { status: "OK", ...location } }))
      .toEqual({ status: "gps_ok", requestId: 8, location });
  });

  it.each(resultTransitions)("$from + $result.status → $expected", ({ state, result, expected }) => {
    const next = transitionLocationFlow(state, { type: "GPS_RESULT", requestId: 7, result });
    expect(next.status).toBe(expected);
    expect(next.requestId).toBe(7);
    if (state.status !== "requesting") {
      expect(next).toBe(state);
    } else if (result.status === "OK") {
      expect(next).toEqual({ status: "gps_ok", requestId: 7, location });
    } else {
      expect(next).toEqual({ status: expected, requestId: 7 });
      expect(next).not.toHaveProperty("location");
    }
  });

  it("ignores every result with an obsolete or mismatched request id", () => {
    const pending: LocationFlowState = { status: "requesting", requestId: 7 };
    for (const requestId of [0, 6, 8]) {
      for (const { result } of outcomes) {
        expect(transitionLocationFlow(pending, { type: "GPS_RESULT", requestId, result })).toBe(pending);
      }
    }
  });

  it.each(["DENIED", "TIMEOUT"] as const)("can retry after %s and still choose manual after success", status => {
    const first = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const failed = transitionLocationFlow(first, { type: "GPS_RESULT", requestId: first.requestId, result: { status } });
    expect(failed.status).toBe(status === "DENIED" ? "denied" : "timeout");

    const retry = transitionLocationFlow(failed, { type: "REQUEST_GPS" });
    expect(retry).toEqual({ status: "requesting", requestId: 2 });
    const ready = transitionLocationFlow(retry, { type: "GPS_RESULT", requestId: retry.requestId, result: { status: "OK", ...location } });
    expect(ready).toEqual({ status: "gps_ok", requestId: 2, location });
    expect(transitionLocationFlow(ready, { type: "SELECT_MANUAL" })).toEqual({ status: "manual", requestId: 2 });
  });

  it("keeps manual selected if GPS finishes after switching, including during a newer retry", () => {
    const first = transitionLocationFlow(createLocationFlowState(), { type: "REQUEST_GPS" });
    const manual = transitionLocationFlow(first, { type: "SELECT_MANUAL" });
    const oldResult: LocationFlowEvent = { type: "GPS_RESULT", requestId: first.requestId, result: { status: "OK", ...location } };
    expect(transitionLocationFlow(manual, oldResult)).toBe(manual);

    const retry = transitionLocationFlow(manual, { type: "REQUEST_GPS" });
    expect(transitionLocationFlow(retry, oldResult)).toBe(retry);
    const current = transitionLocationFlow(retry, { type: "GPS_RESULT", requestId: retry.requestId, result: { status: "TIMEOUT" } });
    expect(current).toEqual({ status: "timeout", requestId: 2 });
    expect(transitionLocationFlow(current, { type: "SELECT_MANUAL" }).status).toBe("manual");
  });

  it("copies successful GPS data so mutation of a callback result cannot change the selection", () => {
    const result: Extract<BrowserLocationResult, { status: "OK" }> = { status: "OK", ...location };
    const next = transitionLocationFlow({ status: "requesting", requestId: 1 }, { type: "GPS_RESULT", requestId: 1, result });
    result.latitude = 0;
    expect(next).toEqual({ status: "gps_ok", requestId: 1, location });
  });

  it("provides code-owned Vietnamese messages for all eight states without blaming the user", () => {
    expect(Object.fromEntries(states.map(state => [state.status, getLocationFlowMessage(state)]))).toEqual({
      idle: "Chọn cách cung cấp vị trí: dùng GPS hoặc chọn thủ công.",
      requesting: "Đang lấy vị trí GPS. Bạn vẫn có thể chuyển sang chọn vị trí thủ công.",
      gps_ok: "Đã lấy được vị trí GPS. Bạn có thể dùng vị trí này hoặc chọn thủ công.",
      denied: "Chưa có quyền truy cập vị trí. Bạn có thể chọn vị trí thủ công hoặc thử lại GPS.",
      unavailable: "Hiện chưa lấy được vị trí GPS. Bạn có thể chọn vị trí thủ công hoặc thử lại.",
      timeout: "Chưa lấy được vị trí GPS trong thời gian chờ. Bạn có thể chọn vị trí thủ công hoặc thử lại.",
      unsupported: "Trình duyệt hiện không hỗ trợ lấy vị trí GPS. Bạn có thể chọn vị trí thủ công.",
      manual: "Chọn vị trí thủ công để tiếp tục.",
    });
    for (const state of states) {
      expect(getLocationFlowMessage(state)).not.toContain(String(location.latitude));
    }
  });

  it("is deterministic and never mutates frozen input states or events", () => {
    for (const state of states) {
      const frozenState = Object.freeze(structuredClone(state));
      if (frozenState.status === "gps_ok") Object.freeze(frozenState.location);
      const events: LocationFlowEvent[] = [
        { type: "REQUEST_GPS" },
        { type: "SELECT_MANUAL" },
        ...outcomes.map(({ result }): LocationFlowEvent => ({ type: "GPS_RESULT", requestId: 7, result: Object.freeze({ ...result }) })),
      ];
      for (const event of events) {
        Object.freeze(event);
        const beforeState = structuredClone(frozenState);
        const beforeEvent = structuredClone(event);
        expect(transitionLocationFlow(frozenState, event)).toEqual(transitionLocationFlow(frozenState, event));
        expect(frozenState).toEqual(beforeState);
        expect(event).toEqual(beforeEvent);
      }
    }
  });
});
