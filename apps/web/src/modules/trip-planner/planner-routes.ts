import { requestStadiaRoute } from "../trip-validation/stadia-route";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { travelLegSchema, type TravelLeg } from "./planner-contract";
import type { PlannerCandidate } from "./planner-candidates";

export type RoutePair = { from: PlannerCandidate; to: PlannerCandidate; transport: TripTransport };
export type RouteProvider = { route: (pair: RoutePair, signal: AbortSignal) => Promise<TravelLeg> };
export const ROUTING_DEADLINE_MS = 10_000;
export function missingLeg(pair: RoutePair, reason: NonNullable<TravelLeg["reason"]>): TravelLeg {
  return { fromDestinationId: pair.from.id, toDestinationId: pair.to.id, status: "INSUFFICIENT_DATA", reason, durationSeconds: null, distanceMeters: null, provider: null };
}
/** Planner requires both metrics; US29B/30 may validate a duration-only snapshot. */
export function createStadiaRoutesProvider(options: { apiKey?: () => string | undefined; fetcher?: typeof fetch; timeoutMs?: number } = {}): RouteProvider {
  return { async route(pair, signal) {
    const route = await requestStadiaRoute({ origin: pair.from, destination: pair.to, vehicle: pair.transport }, { ...options, signal });
    if (route.kind !== "ok") return missingLeg(pair, route.reason);
    const parsed = travelLegSchema.safeParse({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id,
      status: "VERIFIED", reason: null, durationSeconds: route.durationSeconds,
      distanceMeters: route.distanceMeters ?? null, provider: "STADIA_MAPS" });
    return parsed.success ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
  } };
}

/** Stadia standard routing provider (ADR-17 / US-29B). CAR -> auto, MOTORCYCLE -> motorcycle. */
export function createStadiaRoutesProvider(options: { apiKey?: () => string | undefined; fetcher?: typeof fetch; timeoutMs?: number } = {}): RouteProvider {
  return { async route(pair, parentSignal) {
    if (pair.transport !== "CAR" && pair.transport !== "MOTORCYCLE") return missingLeg(pair, "UNSUPPORTED_MODE");
    const key = (options.apiKey ?? (() => process.env.STADIA_MAPS_API_KEY))();
    if (!key) return missingLeg(pair, "NOT_CONFIGURED");
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal.addEventListener("abort", abort, { once: true });
    if (parentSignal.aborted) abort();
    const timeoutMs = Math.min(ROUTING_DEADLINE_MS, Math.max(1, options.timeoutMs ?? ROUTING_DEADLINE_MS));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<TravelLeg>(resolve => {
        rejectAbort = () => resolve(missingLeg(pair, "TIMEOUT"));
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        timer = setTimeout(abort, timeoutMs);
        if (controller.signal.aborted) rejectAbort();
      });
      const request = async (): Promise<TravelLeg> => {
        if (controller.signal.aborted) return missingLeg(pair, "TIMEOUT");
        try {
          const costing = pair.transport === "CAR" ? "auto" : "motorcycle";
          const response = await (options.fetcher ?? ((input, init) => globalThis.fetch(input, init)))("https://api.stadiamaps.com/route/v1", {
            method: "POST", redirect: "error", signal: controller.signal,
            headers: { "Content-Type": "application/json", authorization: `Stadia-Auth ${key}` },
            body: JSON.stringify({
              locations: [
                { lat: pair.from.latitude, lon: pair.from.longitude, type: "break" },
                { lat: pair.to.latitude, lon: pair.to.longitude, type: "break" },
              ],
              costing,
              units: "kilometers",
            }),
          });
          if (!response.ok) return missingLeg(pair, response.status === 400 ? "UNSUPPORTED_MODE" : "UNAVAILABLE");
          const body = await boundedBody(response) as { trip?: { summary?: { time?: unknown; length?: unknown } } };
          if (!body || typeof body !== "object" || !("trip" in body)) return missingLeg(pair, "INVALID_RESPONSE");
          const summary = body.trip?.summary;
          const durationSeconds = typeof summary?.time === "number" && Number.isFinite(summary.time) && summary.time >= 0 ? Math.round(summary.time) : null;
          const distanceMeters = typeof summary?.length === "number" && Number.isFinite(summary.length) && summary.length >= 0 ? Math.round(summary.length * 1000) : null;
          if (durationSeconds === null || distanceMeters === null) return missingLeg(pair, "INVALID_RESPONSE");
          const parsed = travelLegSchema.safeParse({
            fromDestinationId: pair.from.id,
            toDestinationId: pair.to.id,
            status: "VERIFIED",
            reason: null,
            durationSeconds,
            distanceMeters,
            provider: "STADIA_MAPS",
          });
          return parsed.success ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
        } catch { return missingLeg(pair, controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE"); }
      };
      return await Promise.race([request(), aborted]);
    } finally {
      clearTimeout(timer); parentSignal.removeEventListener("abort", abort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    }
  } };
}

/** One deadline for ALL mandatory routing, at most 27 directed pairs, three in flight. */
export async function resolvePlannerRoutes(pairs: readonly RoutePair[], provider: RouteProvider, timeoutMs = ROUTING_DEADLINE_MS): Promise<Map<string, TravelLeg>> {
  if (pairs.length > 27) throw new Error("Planner route budget exceeded");
  const controller = new AbortController();
  const legs = new Map<string, TravelLeg>();
  let cursor = 0;
  const timer = setTimeout(() => controller.abort(), Math.min(ROUTING_DEADLINE_MS, Math.max(1, timeoutMs)));
  const workers = Array.from({ length: Math.min(3, pairs.length) }, async () => {
    while (cursor < pairs.length && !controller.signal.aborted) {
      const pair = pairs[cursor++]!;
      let listener: (() => void) | undefined;
      try {
        const expired = new Promise<TravelLeg>(resolve => {
          listener = () => resolve(missingLeg(pair, "TIMEOUT"));
          controller.signal.addEventListener("abort", listener, { once: true });
          if (controller.signal.aborted) listener();
        });
        const raw = await Promise.race([provider.route(pair, controller.signal), expired]);
        const parsed = travelLegSchema.safeParse(raw);
        const leg = parsed.success && parsed.data.fromDestinationId === pair.from.id && parsed.data.toDestinationId === pair.to.id ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
        legs.set(pair.to.id, leg);
      } catch { legs.set(pair.to.id, missingLeg(pair, "UNAVAILABLE")); }
      finally { if (listener) controller.signal.removeEventListener("abort", listener); }
    }
  });
  try { await Promise.all(workers); }
  finally { clearTimeout(timer); }
  for (const pair of pairs) if (!legs.has(pair.to.id)) legs.set(pair.to.id, missingLeg(pair, "TIMEOUT"));
  return legs;
}
