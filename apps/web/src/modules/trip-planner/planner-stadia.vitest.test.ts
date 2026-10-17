import { afterEach, describe, expect, it, vi } from "vitest";
import { createStadiaRoutesProvider, resolvePlannerRoutes } from "./planner-routes";
import { candidate, requirement, referenceTime } from "./__fixtures__/planner-fixtures";
import { createPlannerService } from "./planner-service";
import { getTravelRoute, requestStadiaRoute } from "../trip-validation/stadia-route";
import { travelLegSchema } from "./planner-contract";

afterEach(() => vi.useRealTimers());
const pair = { from: candidate("a"), to: candidate("b", { latitude: 23.2, longitude: 105.3 }), transport: "CAR" as const };
const input = { origin: pair.from, destination: pair.to, vehicle: "CAR" };
const payload = (time: unknown = 1800.5, length: unknown = 10.1234) => ({ trip: { status: 0, summary: { time, length } } });
const signal = () => new AbortController().signal;
const adapter = (fetcher: typeof fetch, timeoutMs?: number) => createStadiaRoutesProvider({ apiKey: () => "fixture-server-secret", fetcher, timeoutMs });

describe("US28 shared Stadia adapter", () => {
  it.each([["CAR", "auto"], ["MOTORCYCLE", "motorcycle"]] as const)("%s uses exactly one %s request and keeps credentials server-side", async (transport, costing) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload()));
    const leg = await adapter(fetcher).route({ ...pair, transport }, signal());
    expect(leg).toMatchObject({ status: "VERIFIED", provider: "STADIA_MAPS", durationSeconds: 1800.5, distanceMeters: 10123.4 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.stadiamaps.com/route/v1");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error", headers: { authorization: "Stadia-Auth fixture-server-secret" } });
    expect(JSON.parse(String(init?.body))).toEqual({ locations: [
      { lat: pair.from.latitude, lon: pair.from.longitude, type: "break" },
      { lat: pair.to.latitude, lon: pair.to.longitude, type: "break" },
    ], costing, units: "kilometers" });
    expect(JSON.stringify(leg)).not.toMatch(/fixture-server-secret|trip|shape|Google/);
  });
  it("missing key and unsupported vehicle never dispatch", async () => {
    const fetcher = vi.fn();
    expect((await createStadiaRoutesProvider({ apiKey: () => undefined, fetcher }).route(pair, signal())).reason).toBe("NOT_CONFIGURED");
    for (const transport of ["BUS", "WALKING", "BICYCLE", "DRIVE", "TWO_WHEELER"]) {
      expect((await adapter(fetcher).route({ ...pair, transport: transport as never }, signal())).reason).toBe("UNSUPPORTED_MODE");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ latitude: NaN }, { longitude: Infinity }, { latitude: -91 }, { latitude: 91 }, { longitude: -181 }, { longitude: 181 }])("invalid coordinates %j never dispatch", async change => {
    const fetcher = vi.fn();
    expect((await adapter(fetcher).route({ ...pair, from: { ...pair.from, ...change } }, signal())).reason).toBe("INVALID_RESPONSE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ trip: { summary: { length: 1 } } }, payload(10, null), payload(10, "1"), payload(10, -1), payload(10, 10001), payload(604801, 1), payload(null, 1), payload("10", 1), payload(-1, 1)])("missing/invalid/bounded metrics cannot verify %j", async body => {
    const leg = await adapter(async () => Response.json(body)).route(pair, signal());
    expect(leg).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "INVALID_RESPONSE", durationSeconds: null, distanceMeters: null, provider: null });
  });
  it("missing distance remains optional for US29B/US30 but cannot pass US28", async () => {
    const fetcher = async () => Response.json({ trip: { summary: { time: 60 } } });
    expect(await getTravelRoute(input, { apiKey: () => "fixture", fetcher })).toEqual({ kind: "ok", durationSeconds: 60 });
    expect((await adapter(fetcher).route(pair, signal())).reason).toBe("INVALID_RESPONSE");
  });
  it.each([{}, { trip: null }, { trip: { status: 1 } }])("no route %j is explicit", async body => {
    expect((await adapter(async () => Response.json(body)).route(pair, signal())).reason).toBe("NO_ROUTE");
  });
  it.each([400, 401, 403, 429, 500, 503])("HTTP %i never retries or substitutes a vehicle", async status => {
    let cancelled = false;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status }));
    expect((await adapter(fetcher).route({ ...pair, transport: "MOTORCYCLE" }, signal())).reason).toBe("UNAVAILABLE");
    expect(fetcher).toHaveBeenCalledOnce(); expect(cancelled).toBe(true);
  });
  it.each(["{", "null", JSON.stringify({ trip: { summary: { time: null } } })])("malformed response %s is INVALID_RESPONSE", async body => {
    expect((await adapter(async () => new Response(body)).route(pair, signal())).reason).toBe("INVALID_RESPONSE");
  });
  it("bounds oversized bodies and cancels their stream", async () => {
    let cancelled = false;
    const fetcher = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(512 * 1024 + 1)); }, cancel() { cancelled = true; } }));
    expect((await adapter(fetcher).route(pair, signal())).reason).toBe("INVALID_RESPONSE"); expect(cancelled).toBe(true);
  });
  it.each(["fetch", "body"])("timeout aborts actual %s and bounds even an uncooperative dependency", async stage => {
    vi.useFakeTimers(); let fetchSignal: AbortSignal | undefined; let cancelled = false;
    const fetcher: typeof fetch = async (_url, init) => {
      fetchSignal = init?.signal as AbortSignal;
      return stage === "fetch" ? new Promise<Response>(() => {}) : new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    };
    const pending = adapter(fetcher, 30).route(pair, signal());
    await vi.advanceTimersByTimeAsync(31);
    expect((await pending).reason).toBe("TIMEOUT"); expect(fetchSignal?.aborted).toBe(true);
    if (stage === "body") expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("parent abort cancels body; an already aborted parent dispatches nothing", async () => {
    const parent = new AbortController(); let cancelled = false; let fetchSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => { fetchSignal = init?.signal as AbortSignal; return new Response(new ReadableStream({ cancel() { cancelled = true; } })); });
    const pending = adapter(fetcher).route(pair, parent.signal);
    await Promise.resolve(); await Promise.resolve(); parent.abort();
    expect((await pending).reason).toBe("TIMEOUT"); expect(fetchSignal?.aborted).toBe(true); expect(cancelled).toBe(true);
    fetcher.mockClear(); expect((await adapter(fetcher).route(pair, parent.signal)).reason).toBe("TIMEOUT"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("late fetch after abort has its response cancelled", async () => {
    const parent = new AbortController(); let release!: (r: Response) => void; let cancelled = false;
    const pending = adapter(async () => new Promise(r => { release = r; })).route(pair, parent.signal);
    parent.abort(); expect((await pending).reason).toBe("TIMEOUT");
    release(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    await Promise.resolve(); await Promise.resolve(); expect(cancelled).toBe(true);
  });
  it("global ten-second deadline aborts three in-flight HTTP requests and starts no more", async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => { signals.push(init?.signal as AbortSignal); return new Promise(() => {}); });
    const pairs = Array.from({ length: 27 }, (_, i) => ({ ...pair, to: candidate(`target-${i}`) }));
    const pending = resolvePlannerRoutes(pairs, adapter(fetcher));
    await vi.advanceTimersByTimeAsync(10_001);
    const legs = await pending;
    expect(fetcher).toHaveBeenCalledTimes(3); expect(signals.every(s => s.aborted)).toBe(true);
    expect(legs.size).toBe(27); expect([...legs.values()].every(l => l.reason === "TIMEOUT")).toBe(true);
    await expect(resolvePlannerRoutes([...pairs, pair], adapter(fetcher))).rejects.toThrow("budget");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shared detailed boundary distinguishes transport/network/missing key without leaking exceptions", async () => {
    expect(await requestStadiaRoute({ ...input, vehicle: "BUS" })).toEqual({ kind: "unavailable", reason: "UNSUPPORTED_MODE" });
    expect(await requestStadiaRoute(input, { apiKey: () => { throw new Error("private-key"); } })).toEqual({ kind: "unavailable", reason: "UNAVAILABLE" });
  });
  it("incomplete Stadia evidence produces missing clocks and never eligible/PASS in real engine", async () => {
    const service = createPlannerService({ repository: { candidates: async () => [pair.from, pair.to], recheck: async () => true }, routes: adapter(async () => Response.json({ trip: { summary: { time: 1 } } })), now: () => referenceTime });
    const p = await service.propose("u", "missing-route", { ...requirement, durationDays: 1 });
    expect(p.status).toBe("INSUFFICIENT_DATA"); expect(p.eligibleForFinalConfirmation).toBe(false);
    expect(p.days[0]?.stops[1]?.arrivalMinute).toBeNull(); expect(p.checks.find(c => c.key === "TRAVEL_TIME")?.status).toBe("INSUFFICIENT_DATA");
  });
  it("new legs reject historical Google and non-finite metrics", () => {
    const leg = { fromDestinationId: "a", toDestinationId: "b", status: "VERIFIED", reason: null, durationSeconds: 1, distanceMeters: 1, provider: "STADIA_MAPS" };
    expect(travelLegSchema.safeParse(leg).success).toBe(true);
    for (const change of [{ provider: "GOOGLE_ROUTES" }, { distanceMeters: null }, { durationSeconds: NaN }, { distanceMeters: Infinity }]) expect(travelLegSchema.safeParse({ ...leg, ...change }).success).toBe(false);
  });
});
