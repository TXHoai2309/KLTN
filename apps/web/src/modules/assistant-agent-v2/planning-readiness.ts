import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import type { PlanningNeeds } from "../assistant-planning/planning-contract";

export type PlanningNeedKey = "durationDays" | "transport" | "startDate" | "interests" | "pace" | "companions" | "groupSize" | "mobility" | "destinations";
export type PlanningReadiness = {
  canDraft: boolean;
  blockers: { field: "durationDays" | "transport"; reason: "MISSING" | "INVALID" }[];
  usefulUnknowns: PlanningNeedKey[];
};

/** Readiness is not validity or save eligibility. The existing engine still
 * checks explicit constraints, destinations and every required evidence source. */
export function assessPlanningReadiness(needs: PlanningNeeds): PlanningReadiness {
  const r = needs.requirement;
  const usefulUnknowns: PlanningNeedKey[] = [];
  if (!r.startDate) usefulUnknowns.push("startDate");
  if (!r.interests?.length) usefulUnknowns.push("interests");
  if (!r.pace) usefulUnknowns.push("pace");
  if (!r.companions && !needs.companionDraft?.type) usefulUnknowns.push("companions");
  if (!r.companions?.groupSize && !needs.companionDraft?.groupSize) usefulUnknowns.push("groupSize");
  if (!r.mobilityConstraints) usefulUnknowns.push("mobility");
  if (!needs.requiredDestinationIds.length && !needs.preferredDestinationIds.length) usefulUnknowns.push("destinations");
  for (const field of ["durationDays", "transport"] as const) {
    if (!tripRequirementInputSchema.shape[field].safeParse(r[field]).success) {
      return { canDraft: false, blockers: [{ field, reason: r[field] == null ? "MISSING" : "INVALID" }], usefulUnknowns };
    }
  }
  return { canDraft: true, blockers: [], usefulUnknowns };
}
