import { describe, expect, it } from "vitest";
import { appendPlanningDraftSuggestion } from "./planning-suggestion-draft";
import { planningPreferenceReplies } from "../../modules/assistant-planning/planning-preferences";
import { fixtureNeeds } from "../../test/planning-fixtures";

describe("planning suggestions respect answer cardinality", () => {
  it("replaces a pace choice while keeping the user's other text", () => {
    const choices = planningPreferenceReplies({ ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["NATURE"] } });
    let draft = "Mình thích chụp ảnh.";
    for (const choice of choices) draft = appendPlanningDraftSuggestion(draft, choice);
    expect(draft).toBe(`Mình thích chụp ảnh.\n${choices.at(-1)!.text}`);
  });
});
