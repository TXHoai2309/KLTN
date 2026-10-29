import "server-only";
import { AssistantV2Error } from "./agent-errors";
import type { AssistantSkill } from "./skill-definition";
import { travelPlanningSkill } from "./skills/travel-planning";
import { itineraryReplanningSkill } from "./skills/itinerary-replanning";
import { haGiangQaSkill } from "./skills/ha-giang-qa";
import { inTripAssistanceSkill } from "./skills/in-trip-assistance";

/** The only source of executable skill IDs. No dynamic discovery in V2-01. */
export const assistantSkills = Object.freeze({
  "travel-planning": travelPlanningSkill,
  "itinerary-replanning": itineraryReplanningSkill,
  "ha-giang-qa": haGiangQaSkill,
  "in-trip-assistance": inTripAssistanceSkill,
});

export type AssistantSkillId = keyof typeof assistantSkills;

/** All consumers load instructions/configuration through this boundary. */
export function loadAssistantSkill(id: string): AssistantSkill<AssistantSkillId> {
  if (!Object.hasOwn(assistantSkills, id)) throw new AssistantV2Error("UNKNOWN_SKILL");
  return assistantSkills[id as AssistantSkillId];
}
