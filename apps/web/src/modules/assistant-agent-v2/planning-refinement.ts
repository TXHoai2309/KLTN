import type { PlanningNeeds } from "../assistant-planning/planning-contract";

export type RefinementField = keyof PlanningNeeds["requirement"] | "companionDraft" | "requiredDestinationIds" | "preferredDestinationIds" | "excludedDestinationIds";
export type RefinementImplication = "CULTURE_PRIORITY" | "NATURE_PRIORITY" | "INTEREST_PRIORITY" | "MODERATE_PACE" | "RELAXED_PACE" | "PACKED_PACE" | "GROUP_CONTEXT" | "MOBILITY_RECHECK" | "REQUIRED_STOPS" | "EXCLUDE_STOPS" | "PREFERRED_STOPS" | "REBUILD_BRIEF" | "REBUILD_REQUESTED";
export type RefinementAssessment = {
  changedFields: RefinementField[];
  newFacts: Partial<Record<RefinementField, unknown>>;
  planningImplications: RefinementImplication[];
  requiresRegeneration: boolean;
};

/** Compare semantic needs, not unanswered profile fields. No text parsing,
 * questionnaire sequencing, destination facts or model decisions live here. */
export function assessPlanningRefinement(previous: PlanningNeeds, updated: PlanningNeeds): RefinementAssessment {
  const changedFields: RefinementField[] = [];
  const newFacts: Partial<Record<RefinementField, unknown>> = {};
  for (const field of ["durationDays", "transport", "startDate", "interests", "pace", "companions", "mobilityConstraints"] as const) {
    if (JSON.stringify(previous.requirement[field] ?? null) !== JSON.stringify(updated.requirement[field] ?? null)) {
      changedFields.push(field); newFacts[field] = updated.requirement[field];
    }
  }
  for (const field of ["companionDraft", "requiredDestinationIds", "preferredDestinationIds", "excludedDestinationIds"] as const) {
    if (JSON.stringify(previous[field] ?? (field === "companionDraft" ? null : [])) !== JSON.stringify(updated[field] ?? (field === "companionDraft" ? null : []))) {
      changedFields.push(field); newFacts[field] = updated[field];
    }
  }
  const planningImplications: RefinementImplication[] = [];
  if (changedFields.includes("interests")) {
    const interests = updated.requirement.interests ?? [];
    if (interests.includes("CULTURE_HISTORY") || interests.includes("ETHNIC_VILLAGES")) planningImplications.push("CULTURE_PRIORITY");
    if (interests.includes("NATURE")) planningImplications.push("NATURE_PRIORITY");
    if (!planningImplications.length) planningImplications.push("INTEREST_PRIORITY");
  }
  if (changedFields.includes("pace")) planningImplications.push(updated.requirement.pace === "RELAXED" ? "RELAXED_PACE" : updated.requirement.pace === "PACKED" ? "PACKED_PACE" : "MODERATE_PACE");
  if (changedFields.includes("companions") || changedFields.includes("companionDraft")) planningImplications.push("GROUP_CONTEXT");
  if (changedFields.includes("mobilityConstraints")) planningImplications.push("MOBILITY_RECHECK");
  if (changedFields.includes("requiredDestinationIds")) planningImplications.push("REQUIRED_STOPS");
  if (changedFields.includes("excludedDestinationIds")) planningImplications.push("EXCLUDE_STOPS");
  if (changedFields.includes("preferredDestinationIds")) planningImplications.push("PREFERRED_STOPS");
  if (changedFields.some(field => ["durationDays", "transport", "startDate"].includes(field))) planningImplications.push("REBUILD_BRIEF");
  return { changedFields, newFacts, planningImplications, requiresRegeneration: changedFields.length > 0 };
}
