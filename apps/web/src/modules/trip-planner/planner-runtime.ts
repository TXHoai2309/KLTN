import { ENV } from "@/env.server";
import { routingRegistry } from "../destination/destination-routing-registry";
import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "./planner-candidates";
import { createGoogleRoutesProvider } from "./planner-routes";
import { createPlannerService } from "./planner-service";

const registry = routingRegistry(ENV.DATABASE_URL);
const service = createPlannerService({ repository: { candidates: () => registry.verified ? retrievePlannerCandidates(db, undefined, registry.excludedIds) : Promise.resolve([]), recheck: selected => recheckPlannerCandidates(db, selected, registry.excludedIds) }, routes: createGoogleRoutesProvider() });
export const plannerDependencies = { authorization: authorizationDependencies, propose: service.propose };
