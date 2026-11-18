import { requestStadiaRoute } from "../trip-validation/stadia-route";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { travelLegSchema, type TravelLeg } from "./planner-contract";
import type { PlannerCandidate } from "./planner-candidates";
import { plannerRouteGeometry } from "./planner-route-geometry";

export type RoutePair = { from: PlannerCandidate; to: PlannerCandidate; transport: TripTransport };
export type RouteProvider = { route: (pair: RoutePair, signal: AbortSignal) => Promise<TravelLeg> };
export const ROUTING_DEADLINE_MS = 10_000;
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
      status: "VERIFIED", reason: null, durationSeconds: route.durationSeconds,
      distanceMeters: route.distanceMeters ?? null, provider: "STADIA_MAPS", ...(geometry ? { geometry } : {}) });
    return parsed.success ? parsed.data : missingLeg(pair, "INVALID_RESPONSE");
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
