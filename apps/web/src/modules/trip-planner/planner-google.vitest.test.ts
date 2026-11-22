import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfiguredRoutesProvider, createGoogleRoutesProvider, resolvePlannerRoutes } from "./planner-routes";
import { candidate } from "./__fixtures__/planner-fixtures";
import { getTravelRoute } from "../trip-validation/stadia-route";
import { requestGoogleRoute, routingProviderFromEnv } from "../trip-validation/google-route";
import { travelLegSchema } from "./planner-contract";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const KEY = "fixture-google-secret";
const pair = { from: candidate("a"), to: candidate("b", { latitude: 23.2, longitude: 105.3 }), transport: "CAR" as const };
const signal = () => new AbortController().signal;
const ok = (body: unknown = { routes: [{ duration: "1800s", distanceMeters: 12345, polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" } }] }) => Response.json(body);
const adapter = (fetcher: typeof fetch, timeoutMs?: number) => createGoogleRoutesProvider({ apiKey: () => KEY, fetcher, timeoutMs });

describe("Google routing adapter", () => {
  it("defaults to Stadia; only exact GOOGLE selects Google", () => {
    expect(routingProviderFromEnv({})).toBe("STADIA");
    expect(routingProviderFromEnv({ NEXT_PUBLIC_MAPS_PROVIDER: "google" })).toBe("STADIA");
    expect(routingProviderFromEnv({ NEXT_PUBLIC_MAPS_PROVIDER: "GOOGLE" })).toBe("GOOGLE");
  });
  it("configured provider uses the Stadia endpoint by default and Google when flagged", async () => {
    const stadia = vi.fn<typeof fetch>(async () => Response.json({ trip: { status: 0, summary: { time: 60, length: 1 } } }));
    const leg = await createConfiguredRoutesProvider({ fetcher: stadia, stadiaApiKey: () => "s", env: {} }).route(pair, signal());
    expect(leg.provider).toBe("STADIA_MAPS");
    expect(stadia.mock.calls[0]![0]).toBe("https://api.stadiamaps.com/route/v1");
    const google = vi.fn<typeof fetch>(async () => ok());
    const g = await createConfiguredRoutesProvider({ fetcher: google, env: { NEXT_PUBLIC_MAPS_PROVIDER: "GOOGLE", GOOGLE_MAPS_API_KEY: KEY } }).route(pair, signal());
    expect(g.provider).toBe("GOOGLE_MAPS");
    expect(google.mock.calls[0]![0]).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  });
  it.each([["CAR", "DRIVE"], ["MOTORCYCLE", "TWO_WHEELER"]] as const)("%s -> %s, one request, key only in header, field mask set", async (transport, travelMode) => {
    const fetcher = vi.fn<typeof fetch>(async () => ok());
    const leg = await adapter(fetcher).route({ ...pair, transport }, signal());
    expect(travelLegSchema.parse(leg)).toMatchObject({ status: "VERIFIED", provider: "GOOGLE_MAPS", durationSeconds: 1800, distanceMeters: 12345, reason: null });
    expect(leg.geometry?.coordinates).toEqual([[-120.2, 38.5], [-120.95, 40.7]]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0]!;
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "x-goog-api-key": KEY, "x-goog-fieldmask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline" } });
    const body = JSON.parse(String(init?.body));
    expect(body.travelMode).toBe(travelMode);
    expect(body.origin.location.latLng).toEqual({ latitude: pair.from.latitude, longitude: pair.from.longitude });
    expect(String(init?.body)).not.toContain(KEY);
    expect(JSON.stringify(leg)).not.toContain(KEY);
  });
  it("coordinateRoute returns a VERIFIED journey route", async () => {
    const r = await adapter(async () => ok()).coordinateRoute!({ from: { latitude: 21, longitude: 105 }, to: { latitude: 23, longitude: 105 }, transport: "MOTORCYCLE" }, signal());
    expect(r).toMatchObject({ status: "VERIFIED", provider: "GOOGLE_MAPS", durationSeconds: 1800, distanceMeters: 12345 });
  });
  it("missing key and unsupported mode never dispatch", async () => {
    const fetcher = vi.fn();
    expect((await createGoogleRoutesProvider({ apiKey: () => undefined, fetcher }).route(pair, signal())).reason).toBe("NOT_CONFIGURED");
    expect((await createGoogleRoutesProvider({ apiKey: () => "  ", fetcher }).route(pair, signal())).reason).toBe("NOT_CONFIGURED");
    expect((await adapter(fetcher).route({ ...pair, transport: "BUS" as never }, signal())).reason).toBe("UNSUPPORTED_MODE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ["HTTP 500", () => new Response("echo " + KEY, { status: 500 }), "UNAVAILABLE"],
    ["HTTP 403", () => new Response("{}", { status: 403 }), "UNAVAILABLE"],
    ["bad JSON", () => new Response("not json"), "INVALID_RESPONSE"],
    ["empty routes", () => ok({ routes: [] }), "NO_ROUTE"],
    ["no routes field", () => ok({}), "NO_ROUTE"],
    ["bad duration", () => ok({ routes: [{ duration: "abc", distanceMeters: 1 }] }), "INVALID_RESPONSE"],
    ["numeric duration", () => ok({ routes: [{ duration: 5, distanceMeters: 1 }] }), "INVALID_RESPONSE"],
    ["routes not array", () => ok({ routes: {} }), "INVALID_RESPONSE"],
    ["oversized", () => new Response("x".repeat(600 * 1024)), "INVALID_RESPONSE"],
  ])("%s -> INSUFFICIENT_DATA %s without leaking the key", async (_n, make, reason) => {
    const leg = await adapter(async () => make()).route(pair, signal());
    expect(leg).toMatchObject({ status: "INSUFFICIENT_DATA", reason, provider: null, durationSeconds: null });
    expect(JSON.stringify(leg)).not.toContain(KEY);
  });
  it("missing distance yields INSUFFICIENT_DATA for the planner leg", async () => {
    const leg = await adapter(async () => ok({ routes: [{ duration: "60s" }] })).route(pair, signal());
    expect(leg.status).toBe("INSUFFICIENT_DATA");
  });
  it("network error and timeout map to UNAVAILABLE / TIMEOUT", async () => {
    expect((await adapter(async () => { throw new Error("boom " + KEY); }).route(pair, signal())).reason).toBe("UNAVAILABLE");
    vi.useFakeTimers();
    const pending = adapter(() => new Promise<Response>(() => undefined), 50).route(pair, signal());
    await vi.advanceTimersByTimeAsync(60);
    expect((await pending).reason).toBe("TIMEOUT");
  });
  it("rejects an invalid timeout configuration", async () => {
    await expect(requestGoogleRoute({ origin: pair.from, destination: pair.to, vehicle: "CAR" }, { apiKey: () => KEY, timeoutMs: 40_001 })).rejects.toThrow(RangeError);
  });
  it("shares the 27-pair budget: 27 pairs -> at most 27 requests, 28 rejected before dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => ok());
    const pairs = Array.from({ length: 27 }, (_, i) => ({ from: candidate(`f${i}`), to: candidate(`t${i}`), transport: "CAR" as const }));
    const map = await resolvePlannerRoutes(pairs, adapter(fetcher));
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(27);
    expect(map.size).toBe(27);
    fetcher.mockClear();
    await expect(resolvePlannerRoutes([...pairs, pairs[0]!], adapter(fetcher))).rejects.toThrow("budget");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("getTravelRoute follows the flag and stays Stadia by default", async () => {
    const input = { origin: pair.from, destination: pair.to, vehicle: "CAR" };
    const f = vi.fn<typeof fetch>(async () => Response.json({ trip: { status: 0, summary: { time: 60, length: 1 } } }));
    expect((await getTravelRoute(input, { apiKey: () => "s", fetcher: f })).kind).toBe("ok");
    expect(f.mock.calls[0]![0]).toBe("https://api.stadiamaps.com/route/v1");
    vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "GOOGLE"); vi.stubEnv("GOOGLE_MAPS_API_KEY", KEY);
    const g = vi.fn<typeof fetch>(async () => ok());
    expect(await getTravelRoute(input, { fetcher: g })).toMatchObject({ kind: "ok", durationSeconds: 1800 });
    expect(String(g.mock.calls[0]![0])).toContain("routes.googleapis.com");
  });
});
