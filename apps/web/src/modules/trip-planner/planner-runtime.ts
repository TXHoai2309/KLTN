import { ENV } from "@/env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { retrievePlannerCandidates, retrievePlannerCandidateInventory, recheckPlannerCandidates } from "./planner-candidates";
import { loadDestinationTravelTimeLookup } from "./destination-travel-cache";
import { createRuntimeRouting } from "../map/runtime-routing";
import { createPlannerService } from "./planner-service";
import { registeredPlannerPropose } from "./planner-registry";

const registry = routingRegistry(ENV.DATABASE_URL);
export const plannerDependencies = {
  authorization: authorizationDependencies,
  propose: registeredPlannerPropose(registry, (...args) => createPlannerService({
    repository: { candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds), inventory: () => retrievePlannerCandidateInventory(db, undefined, registry.excludedIds), recheck: selected => recheckPlannerCandidates(db, selected, registry.excludedIds) },
    routes: createRuntimeRouting().routes,
    travelLookup: (transport, list) => loadDestinationTravelTimeLookup(db, list, transport),
  }).propose(...args)),
};
