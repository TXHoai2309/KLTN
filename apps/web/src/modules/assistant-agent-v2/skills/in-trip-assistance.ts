import "server-only";
import type { AssistantSkill } from "../skill-definition";
export const inTripAssistanceSkill = Object.freeze({
  id: "in-trip-assistance",
  description: "Assist the owner of an existing saved trip through current US-35/36/37 services.",
  instructions: `The latest owned database itinerary/revision is authoritative. Never mutate a preliminary proposal as a saved Trip.
Use existing in-trip analysis, ID verification, completed-visit protection, Validator and apply services.
Request current GPS/manual location only when material; never guess it from an itinerary stop.
Preserve completed and unaffected work. Clarify one missing scope detail using the existing reason/choice contract.
Proposals are not applied. Apply only the current reviewed, validated proposal after explicit confirmation.
Revalidate at apply; never convert insufficient evidence or violations to PASS. Claim success only after confirmed persistence.
UNKNOWN retains the exact request/key, blocks mutation and permits read-only QA. Never automatically retry apply.
QA interruptions preserve pending clarification/proposal; an agreement after QA requires re-showing the proposal.
No background GPS, external research, booking, new-trip generation or generic database writes.`,
  allowedActions: Object.freeze(["read-saved-trip", "resolve-current-location", "create-in-trip-proposal", "validate-in-trip-proposal", "apply-in-trip-proposal"] as const),
} satisfies AssistantSkill<"in-trip-assistance">);
