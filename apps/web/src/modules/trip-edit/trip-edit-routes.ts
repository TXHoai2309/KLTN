import "server-only";

import { createConfiguredRoutesProvider, ROUTING_DEADLINE_MS } from "../trip-planner/planner-routes";
import type { TripEditRouteProvider } from "./trip-edit-service";

/**
 * Shared route provider for Trip Edit preview, AI edit and apply.
 * Delegates to PLANNER_ROUTING_PROVIDER (Stadia default / Google behind flag)
 * with consistent mountain-road speed caps and bounded timeout.
 */
export function createTripEditRouteProvider(): TripEditRouteProvider {
  const provider = createConfiguredRoutesProvider();
  return async (input, options) => {
    if (!provider.coordinateRoute) return { kind: "unavailable" };
    const controller = new AbortController();
    const abort = () => controller.abort();
    options?.signal?.addEventListener("abort", abort, { once: true });
    if (options?.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, ROUTING_DEADLINE_MS);
    try {
      const route = await provider.coordinateRoute(
        {
          from: input.origin,
          to: input.destination,
          transport: input.vehicle,
        },
        controller.signal,
      );
      if (route.status !== "VERIFIED" || route.durationSeconds === null) {
        return { kind: "unavailable" };
      }
      return {
        kind: "ok",
        durationSeconds: route.durationSeconds,
        ...(route.distanceMeters != null ? { distanceMeters: route.distanceMeters } : {}),
        ...(route.geometry ? { geometry: route.geometry } : {}),
      };
    } catch {
      return { kind: "unavailable" };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", abort);
    }
  };
}
