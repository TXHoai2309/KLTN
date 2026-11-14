import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";
import { createConfiguredRoutesProvider } from "../trip-planner/planner-routes";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

/** Same candidate reader and routing provider (Stadia by default) as the existing planner. Provider keys stays server-side. */
export function tripsagePlanningRuntime(): TripsagePlanningDeps {
  const registry = routingRegistry(ENV.DATABASE_URL);
  return {
    candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds),
    routes: createConfiguredRoutesProvider({ stadiaApiKey: () => ENV.STADIA_MAPS_API_KEY }),
    now: () => new Date(),
  };
}
