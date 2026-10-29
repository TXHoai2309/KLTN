import "server-only";
import type { AssistantSkill } from "../skill-definition";

export const itineraryReplanningSkill = Object.freeze({
  id: "itinerary-replanning",
  description: "Apply bounded modifications to the latest unsaved itinerary proposal.",
  instructions: `Operate on the latest canonical proposal and explicit requested delta.
Prefer bounded edits over full regeneration. Preserve unaffected days and explicit user constraints.
Clarify ambiguous targets, destinations or days instead of guessing. Recalculate affected route/schedule dependencies.
The deterministic Validator remains authoritative; missing evidence is not PASS.
Never partially publish a failed compound edit. Cross-day dependencies outside the requested scope require explicit acceptance.
Explain the delta and actual validation status, not the whole itinerary. A proposal is not a saved Trip.
Never save without the existing explicit save flow. Saved/in-trip/GPS/QA/research are outside this skill.`,
  allowedActions: Object.freeze(["replan-preliminary-proposal"] as const),
} satisfies AssistantSkill<"itinerary-replanning">);
