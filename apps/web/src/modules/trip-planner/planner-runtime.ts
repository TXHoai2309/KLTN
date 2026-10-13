import "server-only";
import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "./planner-candidates";
import { createGoogleRoutesProvider } from "./planner-routes";
import { createPlannerService } from "./planner-service";

const service = createPlannerService({ repository: { candidates: () => retrievePlannerCandidates(db), recheck: selected => recheckPlannerCandidates(db, selected) }, routes: createGoogleRoutesProvider() });
export const plannerDependencies = { authorization: authorizationDependencies, propose: service.propose };
