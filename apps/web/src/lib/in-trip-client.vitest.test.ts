import { afterEach, describe, expect, it, vi } from "vitest";

import type { InTripLocation } from "@/modules/in-trip/in-trip-location";
import {
  decideInTripReplanResponse,
  requestInTripReplan,
} from "./in-trip-client";

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

afterEach(() => vi.useRealTimers());

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
