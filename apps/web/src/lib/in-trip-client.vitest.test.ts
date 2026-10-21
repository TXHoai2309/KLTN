import { afterEach, describe, expect, it, vi } from "vitest";

import type { InTripLocation } from "@/modules/in-trip/in-trip-location";
import {
  applyInTrip,
  decideInTripReplanResponse,
  previewInTrip,
  requestInTripReplan,
} from "./in-trip-client";
import type { InTripApplyPayload } from "@/modules/in-trip/in-trip-session";

const location: InTripLocation = {
  source: "MANUAL",
  latitude: 22.8233,
  longitude: 104.9836,
  accuracyMeters: null,
  capturedAt: "2026-10-17T12:00:00.000Z",
};

const proposedBody = {
  success: true,
  data: {
    status: "PROPOSED",
    candidate: {
      startDate: "2026-10-17",
      durationDays: 1,
      transport: "CAR",
      days: [{ dayIndex: 1, visits: [] }],
    },
    diff: { added: [], removed: [], updated: [], tripChanges: {} },
    completedVisitIds: [],
    mandatoryEndpoint: null,
  },
};

const candidate = {
  startDate: "2026-10-17",
  durationDays: 1,
  transport: "CAR" as const,
  days: [{ dayIndex: 1, visits: [] }],
};

const passedValidation = {
  timeReference: "2026-10-17T12:00:00.000Z",
  groups: {
    openingHours: { status: "SATISFIED", findings: [] },
    minimumDuration: { status: "SATISFIED", findings: [] },
    travelTime: { status: "SATISFIED", findings: [] },
    scheduleConflict: { status: "SATISFIED", findings: [] },
  },
  canConfirm: true,
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("US36 Task291 in-trip client", () => {
  it("sends location and need in a private POST body without putting coordinates in the URL", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify(proposedBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const outcome = await requestInTripReplan("trip/one", {
      baseRevision: "2026-10-17T12:00:00.000Z",
      location,
      need: "Tìm chỗ nghỉ gần đây",
    }, { fetcher });

    expect(outcome.kind).toBe("RESPONSE");
    expect(capturedUrl).toBe("/api/trips/trip%2Fone/in-trip/replan");
    expect(capturedUrl).not.toContain("22.8233");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.cache).toBe("no-store");
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({ location, need: "Tìm chỗ nghỉ gần đây" });
  });

  it("distinguishes clarification, all-completed, AI, network and timeout outcomes", () => {
    expect(decideInTripReplanResponse({ kind: "http", status: 200, body: {
      success: true,
      data: { status: "ALL_COMPLETED" },
    } })).toEqual({ kind: "RESPONSE", data: { status: "ALL_COMPLETED" } });
    expect(decideInTripReplanResponse({ kind: "http", status: 502, body: {
      success: false,
      error: { code: "AI_UNAVAILABLE", message: "provider detail" },
    } })).toMatchObject({ kind: "AI_ERROR", code: "AI_UNAVAILABLE" });
    expect(decideInTripReplanResponse({ kind: "network" })).toEqual({ kind: "NETWORK_ERROR" });
    expect(decideInTripReplanResponse({ kind: "network", timedOut: true })).toEqual({ kind: "TIMEOUT" });
  });

  it("reports timeout while retaining the request for a caller-controlled retry", async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

    const pending = requestInTripReplan("trip-1", {
      baseRevision: "2026-10-17T12:00:00.000Z",
      location,
      need: "Tìm chỗ nghỉ",
    }, { fetcher, timeoutMs: 5 });
    await vi.advanceTimersByTimeAsync(5);
    expect(await pending).toEqual({ kind: "TIMEOUT" });
  });

  it("rejects malformed success envelopes without exposing arbitrary provider text", () => {
    expect(decideInTripReplanResponse({ kind: "http", status: 200, body: {
      success: true,
      data: { status: "PROPOSED", candidate: {}, modelText: "unsafe" },
    } })).toMatchObject({ kind: "FAILED", code: "INVALID_RESPONSE" });
  });
});

describe("US37 Task295 preview and apply client", () => {
  it("previews with location in a private body and parses the four-group result", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ success: true, data: {
        validation: passedValidation,
        checkedAt: "2026-10-17T12:00:00.000Z",
        completedVisitIds: ["visit-done"],
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const outcome = await previewInTrip("trip-1", {
      baseRevision: "2026-10-17T10:00:00.000Z",
      candidate,
      location,
      mandatoryEndpoint: null,
    }, { fetcher });

    expect(outcome).toMatchObject({ status: "SUCCESS", data: { validation: passedValidation, completedVisitIds: ["visit-done"] } });
    expect(capturedUrl).toBe("/api/trips/trip-1/in-trip/preview");
    expect(capturedUrl).not.toContain("22.8233");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.cache).toBe("no-store");
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({ location, candidate });
  });

  it("returns a distinct preview timeout state", async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const pending = previewInTrip("trip-1", {
      baseRevision: "2026-10-17T10:00:00.000Z",
      candidate,
      location,
      mandatoryEndpoint: null,
    }, { fetcher, timeoutMs: 5 });
    await vi.advanceTimersByTimeAsync(5);
    expect(await pending).toEqual({ status: "TIMEOUT" });
  });

  it("preserves a fresh validation and checkedAt returned with an apply rejection", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      success: false,
      operationStatus: "FAILED",
      error: {
        code: "TRIP_VALIDATION_FAILED",
        message: "Kết quả đã đổi.",
        details: { validation: { ...passedValidation, canConfirm: false }, checkedAt: "2026-10-17T12:01:00.000Z" },
      },
    }), { status: 422, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", fetcher);
    const input: InTripApplyPayload = {
      baseRevision: "2026-10-17T10:00:00.000Z",
      candidate,
      confirmed: true,
      kind: "IN_TRIP",
      location,
      mandatoryEndpoint: null,
    };

    expect(await applyInTrip("trip-1", input, "key-1")).toMatchObject({
      status: "FAILED",
      error: { code: "TRIP_VALIDATION_FAILED" },
      checkedAt: "2026-10-17T12:01:00.000Z",
      validation: { canConfirm: false },
    });
  });

  it("uses the shared idempotent endpoint and reports success only for a valid committed response", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const responseData = {
      tripId: "trip-1",
      baseRevision: "2026-10-17T12:05:00.000Z",
      kind: "IN_TRIP",
      candidate,
      validation: passedValidation,
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ success: true, operationStatus: "SUCCESS", data: responseData }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Idempotency-Replayed": "false" },
      });
    });
    const input: InTripApplyPayload = {
      baseRevision: "2026-10-17T10:00:00.000Z",
      candidate,
      confirmed: true,
      kind: "IN_TRIP",
      location,
      mandatoryEndpoint: null,
    };

    expect(await applyInTrip("trip-1", input, "same-key")).toMatchObject({ status: "SUCCESS", data: responseData });
    expect(capturedUrl).toBe("/api/trips/trip-1/edits/apply");
    expect(new Headers(capturedInit?.headers).get("Idempotency-Key")).toBe("same-key");
    expect(capturedUrl).not.toContain("22.8233");
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({ ...input, location });
  });

  it("maps an unreachable apply result to UNKNOWN so the caller can retry unchanged", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("network down"); });
    const input: InTripApplyPayload = {
      baseRevision: "2026-10-17T10:00:00.000Z",
      candidate,
      confirmed: true,
      kind: "IN_TRIP",
      location,
      mandatoryEndpoint: null,
    };
    expect(await applyInTrip("trip-1", input, "same-key")).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
  });
});
