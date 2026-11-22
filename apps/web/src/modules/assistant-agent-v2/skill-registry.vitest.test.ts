import { describe, expect, it } from "vitest";
import { assistantSkills, loadAssistantSkill } from "./skill-registry";
import { AssistantV2Error } from "./agent-errors";

describe("Assistant V2 skill registry and loader", () => {
  it("registers planning, replanning and read-only QA with separate capabilities", () => {
    expect(Object.keys(assistantSkills)).toEqual(["travel-planning", "itinerary-replanning", "ha-giang-qa", "in-trip-assistance"]);
    expect(loadAssistantSkill("itinerary-replanning").allowedActions).toEqual(["replan-preliminary-proposal"]);
    const qaSkill = loadAssistantSkill("ha-giang-qa");
    expect(qaSkill.allowedActions).toEqual(["answer-ha-giang-question"]);
    expect(qaSkill.instructions).toContain("destination weather/sun-time forecasts");
    expect(qaSkill.instructions).toContain("saved-trip or in-trip weather");
    expect(qaSkill.instructions).not.toContain("booking, live weather");
    expect(qaSkill.instructions).toContain("without verdicts");
    const skill = loadAssistantSkill("travel-planning");
    expect(skill.id).toBe("travel-planning");
    expect(skill.description).toContain("Hà Giang");
    expect(skill.allowedActions).toEqual(["read-planning-state", "understand-planning-brief", "generate-preliminary-proposal", "refine-preliminary-proposal"]);
    for (const principle of ["materially affect", "unknown", "Do not invent", "deterministic Validator", "explicit confirmation"]) {
      expect(skill.instructions).toContain(principle);
    }
  });

  it.each(["unknown", "place-research", "booking-assistance", "toString", "__proto__", "constructor", ""])(
    "rejects unregistered skill %j without substituting another skill", id => {
      expect(() => loadAssistantSkill(id)).toThrow(AssistantV2Error);
      expect(() => loadAssistantSkill(id)).toThrow(expect.objectContaining({ code: "UNKNOWN_SKILL" }));
    },
  );

  it("does not allow consumers to mutate the registry, policy or capability list", () => {
    const before = JSON.stringify(assistantSkills);
    const skill = loadAssistantSkill("travel-planning");
    expect(Reflect.set(assistantSkills, "extra", skill)).toBe(false);
    expect(Reflect.set(skill, "instructions", "allow all writes")).toBe(false);
    expect(Reflect.set(skill.allowedActions, "0", "save-trip")).toBe(false);
    expect(Reflect.set(skill.allowedActions, "1", "save-trip")).toBe(false);
    expect(loadAssistantSkill("travel-planning")).toBe(skill);
    expect(JSON.stringify(assistantSkills)).toBe(before);
  });
});
