import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createStadiaRoutesProvider } from "../trip-planner/planner-routes";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

/** Same candidate reader and Stadia provider as the existing planner. The Stadia key stays server-side. */
export function tripsagePlanningRuntime(): TripsagePlanningDeps {
  const registry = routingRegistry(ENV.DATABASE_URL);
  return {
    candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds),
    routes: createStadiaRoutesProvider({ apiKey: () => ENV.STADIA_MAPS_API_KEY }),
    now: () => new Date(),
  };
}
