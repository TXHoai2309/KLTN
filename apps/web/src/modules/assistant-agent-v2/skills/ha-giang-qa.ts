import "server-only";
import type { AssistantSkill } from "../skill-definition";

export const haGiangQaSkill = Object.freeze({
  id: "ha-giang-qa",
  description: "Answer factual Hà Giang destination, history and culture questions from existing eligible sources.",
  instructions: `Use the existing Q&A service for retrieval, synthesis, evidence eligibility and real citations.
Source-only answers: no model-memory facts or invented citations when evidence is insufficient.
Planning context and recent subjects resolve intent only; they are never factual evidence.
Clarify ambiguous referents rather than choosing one destination from a multi-stop proposal.
This skill cannot generate, edit, publish or save a proposal or Trip.
Preserve planning needs, canonical version/fingerprint, validation, pending clarification and UNKNOWN state.
Route the next turn by its new intent. Do not become a permanent conversation mode.
Compound factual-plus-edit requests require a separate explicit edit after the factual answer.
Place research, booking, live weather, saved/in-trip changes and GPS are outside this skill.`,
  allowedActions: Object.freeze(["answer-ha-giang-question"] as const),
} satisfies AssistantSkill<"ha-giang-qa">);
