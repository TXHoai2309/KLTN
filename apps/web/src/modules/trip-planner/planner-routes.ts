import { requestStadiaRoute } from "../trip-validation/stadia-route";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { travelLegSchema, type TravelLeg } from "./planner-contract";
import type { PlannerCandidate } from "./planner-candidates";
import { plannerRouteGeometry } from "./planner-route-geometry";
import { journeyRouteSchema, type JourneyRoute } from "../trip-origin/journey-route-contract";

export type RoutePair = { from: PlannerCandidate; to: PlannerCandidate; transport: TripTransport };
export type CoordinateRoutePair = { from: { latitude: number; longitude: number }; to: { latitude: number; longitude: number }; transport: TripTransport };
export type RouteProvider = { route: (pair: RoutePair, signal: AbortSignal) => Promise<TravelLeg>; coordinateRoute?: (pair: CoordinateRoutePair, signal: AbortSignal) => Promise<JourneyRoute> };
export const ROUTING_DEADLINE_MS = 10_000;
/** Owner-approved 2026-11-07. Provider free-flow times gave 76-91 km/h on Hà Giang mountain roads. */
export const MAX_AVERAGE_KMH: Record<TripTransport, number> = { CAR: 50, MOTORCYCLE: 40 };
export function cappedDurationSeconds(durationSeconds: number, distanceMeters: number | null | undefined, transport: TripTransport): number {
  return distanceMeters == null ? durationSeconds : Math.max(durationSeconds, Math.ceil(distanceMeters / 1000 / MAX_AVERAGE_KMH[transport] * 3600));
}
export function missingLeg(pair: RoutePair, reason: NonNullable<TravelLeg["reason"]>): TravelLeg {
  return { fromDestinationId: pair.from.id, toDestinationId: pair.to.id, status: "INSUFFICIENT_DATA", reason, durationSeconds: null, distanceMeters: null, provider: null };
}
/** Planner requires both metrics; US29B/30 may validate a duration-only snapshot. */
export function createStadiaRoutesProvider(options: { apiKey?: () => string | undefined | Promise<string | undefined>; fetcher?: typeof fetch; timeoutMs?: number } = {}): RouteProvider {
  return { async route(pair, signal) {
    const route = await requestStadiaRoute({ origin: pair.from, destination: pair.to, vehicle: pair.transport }, { ...options, signal });
    if (route.kind !== "ok") return missingLeg(pair, route.reason);
    const geometry = plannerRouteGeometry(route.geometry);
    const parsed = travelLegSchema.safeParse({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id,
      status: "VERIFIED", reason: null, durationSeconds: cappedDurationSeconds(route.durationSeconds, route.distanceMeters, pair.transport),
      distanceMeters: route.distanceMeters ?? null, provider: "STADIA_MAPS", ...(geometry ? { geometry } : {}) });
    return parsed.success ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
  }, async coordinateRoute(pair, signal) {
    const result = await requestStadiaRoute({ origin: pair.from, destination: pair.to, vehicle: pair.transport }, { ...options, signal });
    if (result.kind !== "ok") return { status: "INSUFFICIENT_DATA", reason: result.reason, durationSeconds: null, distanceMeters: null, provider: null };
    const geometry = plannerRouteGeometry(result.geometry);
    const route = journeyRouteSchema.safeParse({ status: "VERIFIED", reason: null, durationSeconds: cappedDurationSeconds(result.durationSeconds, result.distanceMeters, pair.transport), distanceMeters: result.distanceMeters ?? null, provider: "STADIA_MAPS", ...(geometry ? { geometry } : {}) });
    return route.success ? route.data : { status: "INSUFFICIENT_DATA", reason: "INVALID_RESPONSE", durationSeconds: null, distanceMeters: null, provider: null };
  } };
}

/** Shared worker/deadline primitive for the original and origin-extended chain. */
export async function resolveBoundedRoutes<T, R>(pairs: readonly T[], route: (pair: T, signal: AbortSignal) => Promise<R>, missing: (pair: T, reason: "TIMEOUT" | "UNAVAILABLE") => R, timeoutMs = ROUTING_DEADLINE_MS): Promise<R[]> {
  if (pairs.length > 29) throw new Error("Journey route budget exceeded");
  const controller = new AbortController();
  const results: R[] = new Array(pairs.length);
  let cursor = 0;
  const timer = setTimeout(() => controller.abort(), Math.min(ROUTING_DEADLINE_MS, Math.max(1, timeoutMs)));
  const workers = Array.from({ length: Math.min(3, pairs.length) }, async () => {
    while (cursor < pairs.length && !controller.signal.aborted) {
      const index = cursor++, pair = pairs[index]!;
      let listener: (() => void) | undefined;
      try {
        const expired = new Promise<R>(resolve => {
          listener = () => resolve(missing(pair, "TIMEOUT"));
          controller.signal.addEventListener("abort", listener, { once: true });
          if (controller.signal.aborted) listener();
        });
        results[index] = await Promise.race([route(pair, controller.signal), expired]);
      } catch { results[index] = missing(pair, "UNAVAILABLE"); }
      finally { if (listener) controller.signal.removeEventListener("abort", listener); }
    }
  });
  try { await Promise.all(workers); }
  finally { clearTimeout(timer); }
  for (let index = 0; index < pairs.length; index++) if (!results[index]) results[index] = missing(pairs[index]!, "TIMEOUT");
  return results;
}

/** One deadline for ALL mandatory routing, at most 27 directed pairs, three in flight. */
export async function resolvePlannerRoutes(pairs: readonly RoutePair[], provider: RouteProvider, timeoutMs = ROUTING_DEADLINE_MS): Promise<Map<string, TravelLeg>> {
  if (pairs.length > 27) throw new Error("Planner route budget exceeded");
  const results = await resolveBoundedRoutes(pairs, async (pair, signal) => {
    const parsed = travelLegSchema.safeParse(await provider.route(pair, signal));
    return parsed.success && parsed.data.fromDestinationId === pair.from.id && parsed.data.toDestinationId === pair.to.id ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
  }, missingLeg, timeoutMs);
  return new Map(pairs.map((pair, index) => [pair.to.id, results[index]!]));
}
