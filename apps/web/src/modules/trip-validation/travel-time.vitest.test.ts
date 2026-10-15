import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkTravelLeg, getTravelRoute, toStadiaCosting } from "./stadia-route";
import { checkTravelTime } from "./travel-time";

const origin = { latitude: 23.192222, longitude: 105.196944 };
const destination = { latitude: 23.3634061, longitude: 105.3163001 };
const input = { origin, destination, vehicle: "CAR" as const };
const visits = { previousVisit: { visitId: "first", startMinute: 480, plannedDurationMinutes: 60 }, nextVisit: { visitId: "second", startMinute: 600 } };
const route = { trip: { summary: { time: 3600, length: 53.51 }, legs: [{ shape: "??AC" }] } };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("US-29B Stadia routing boundary", () => {
  it("maps the existing car and motorcycle values to Stadia profiles and rejects unsupported values", () => {
    expect(toStadiaCosting("CAR")).toBe("auto");
    expect(toStadiaCosting("MOTORCYCLE")).toBe("motorcycle");
    expect(() => toStadiaCosting("BICYCLE")).toThrow();
  });

  it("uses one server-side standard route request and normalizes duration, distance and polyline6 geometry", async () => {
    const calls: { url: unknown; init: RequestInit | undefined }[] = [];
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url, init });
      return response(route);
    }) as unknown as typeof fetch;
    const result = await getTravelRoute(input, { apiKey: () => "fixture-secret", fetcher });
    expect(result).toEqual({ kind: "ok", durationSeconds: 3600, distanceMeters: 53510,
      geometry: { type: "LineString", coordinates: [[0, 0], [0.000002, 0.000001]] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.stadiamaps.com/route/v1");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ authorization: "Stadia-Auth fixture-secret" });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ locations: [
      { lat: origin.latitude, lon: origin.longitude, type: "break" },
      { lat: destination.latitude, lon: destination.longitude, type: "break" },
    ], costing: "auto", units: "kilometers" });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });

  it("sends motorcycle directly and never substitutes auto", async () => {
    let costing = "";
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      costing = JSON.parse(String(init?.body)).costing;
      return response(route);
    }) as typeof fetch;
    expect((await getTravelRoute({ ...input, vehicle: "MOTORCYCLE" }, { apiKey: () => "fixture", fetcher })).kind).toBe("ok");
    expect(costing).toBe("motorcycle");
  });

  it("rejects unsupported vehicle before any provider call", async () => {
    const fetcher = vi.fn(async () => response(route)) as unknown as typeof fetch;
    await expect(getTravelRoute({ ...input, vehicle: "BICYCLE" as never }, { apiKey: () => "fixture", fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("missing or invalid coordinates never invoke routing", async () => {
    const fetcher = vi.fn(async () => response(route)) as unknown as typeof fetch;
    expect(await getTravelRoute({ ...input, origin: null }, { apiKey: () => "fixture", fetcher })).toEqual({ kind: "unavailable" });
    expect(await getTravelRoute({ ...input, origin: { latitude: 91, longitude: 10 } }, { apiKey: () => "fixture", fetcher })).toEqual({ kind: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("missing server key, empty route, malformed duration and provider 5xx are unavailable", async () => {
    const cases = [response({}), response({ trip: { summary: { time: "3600" } } }), response({ error: "provider" }, 503)];
    expect(await getTravelRoute(input, { apiKey: () => undefined, fetcher: vi.fn() as unknown as typeof fetch })).toEqual({ kind: "unavailable" });
    for (const item of cases) {
      const fetcher = vi.fn(async () => item) as unknown as typeof fetch;
      expect(await getTravelRoute(input, { apiKey: () => "fixture", fetcher })).toEqual({ kind: "unavailable" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("normalizes an aborted request to unavailable without retry", async () => {
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    })) as unknown as typeof fetch;
    expect(await getTravelRoute(input, { apiKey: () => "fixture", fetcher, timeoutMs: 5 })).toEqual({ kind: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("composes a provider failure into an insufficient travel-time check", async () => {
    const fetcher = vi.fn(async () => response({ error: "provider" }, 503)) as unknown as typeof fetch;
    const result = await checkTravelLeg({ ...input, ...visits }, { apiKey: () => "fixture", fetcher });
    expect(result).toEqual({ route: { kind: "unavailable" }, check: {
      status: "INSUFFICIENT_DATA", affectedVisitId: "second", reason: "ROUTE_UNAVAILABLE",
    } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("US-29B pure travel-time check", () => {
  it("passes when the gap exceeds the routing snapshot", () => {
    expect(checkTravelTime(visits, { kind: "ok", durationSeconds: 3599 })).toEqual({ status: "PASS", affectedVisitId: "second", reason: "TRAVEL_TIME_MET" });
  });
  it("passes when the gap exactly equals required travel time", () => {
    expect(checkTravelTime(visits, { kind: "ok", durationSeconds: 3600 }).status).toBe("PASS");
  });
  it("violates when the gap is shorter than required", () => {
    expect(checkTravelTime(visits, { kind: "ok", durationSeconds: 3600.001 })).toEqual({ status: "VIOLATION", affectedVisitId: "second", reason: "TRAVEL_TIME_SHORT" });
  });
  it("marks timeout, provider failure and missing route insufficient", () => {
    expect(checkTravelTime(visits, { kind: "unavailable" })).toEqual({ status: "INSUFFICIENT_DATA", affectedVisitId: "second", reason: "ROUTE_UNAVAILABLE" });
  });
  it("does not pass invalid provider duration or missing visit timing", () => {
    for (const durationSeconds of [NaN, Infinity, -1]) {
      expect(checkTravelTime(visits, { kind: "ok", durationSeconds }).status).toBe("INSUFFICIENT_DATA");
    }
    expect(checkTravelTime({ ...visits, nextVisit: { visitId: "second", startMinute: NaN } }, { kind: "ok", durationSeconds: 0 }).status).toBe("INSUFFICIENT_DATA");
  });
});
