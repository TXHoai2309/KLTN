import "server-only";
import { db } from "../../services";
import { ENV } from "../../env.server";
import { authorizationDependencies } from "../../server/authorization/server";
import { retrievePlannerCandidates, recheckPlannerCandidates } from "../trip-planner/planner-candidates";
import { createStadiaRoutesProvider } from "../trip-planner/planner-routes";
import { routingRegistry } from "../destination/destination-routing-registry";
import { saveTrip, previewTripValidation } from "../trip-save/trip-save-service";
import { tripSaveDependencies } from "../trip-save/trip-save-server";
import { createPlanningRepository } from "./planning-repository";
import { analyzePlanningText, generateAiSelection } from "./planning-ai";
import type { PlanningDependencies } from "./planning-service";
import { composePlanningReply } from "./planning-reply";

export const planningDependencies = {
  authorization: authorizationDependencies,
  forActor(userId: string, headers: Headers): PlanningDependencies {
    const registry = routingRegistry(ENV.DATABASE_URL);
    const saveDependencies = { ...tripSaveDependencies, interdayDepartureMinute: 480 };
    return {
      repository: createPlanningRepository(db, authorizationDependencies, headers, userId),
      candidates: () => retrievePlannerCandidates(db, undefined, registry.excludedIds),
      recheck: selected => recheckPlannerCandidates(db, selected, registry.excludedIds),
      routes: createStadiaRoutesProvider({ apiKey: () => ENV.STADIA_MAPS_API_KEY }),
      analyze: analyzePlanningText, generate: generateAiSelection, compose: composePlanningReply,
      save: (input, key) => saveTrip(headers, input, key, saveDependencies, new Date()),
      validateForSave: input => previewTripValidation(headers, input.proposal, saveDependencies, new Date()),
      now: () => new Date(),
    };
  },
};
