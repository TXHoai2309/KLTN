import { describe, expect, it } from "vitest";
import { applyPlanningUnderstanding, planningUnderstandingSchema } from "./planning-ai";
import { fixtureNeeds, planningCandidate } from "../../test/planning-fixtures";
const base = planningUnderstandingSchema.parse({ intent: "NEEDS", durationDays: null, transport: null, startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [], message: "Kiểm tra nhu cầu", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE" });
describe("Multi-turn needs and destination interpretation", () => {
  it("keeps itinerary display read-only even if the model supplies extraneous needs", () => {
    const result = applyPlanningUnderstanding({ ...base, intent: "DISPLAY", durationDays: 9, transport: "MOTORCYCLE", destinations: [{ name: "Điểm a", required: true, remove: false }] }, fixtureNeeds, [planningCandidate("a")]);
    expect(result).toEqual({ intent: "DISPLAY", needs: fixtureNeeds, unresolved: [], message: "" });
  });
  it("asks for a real calendar date instead of throwing on an impossible extracted date", () => {
    const result = applyPlanningUnderstanding({ ...base, startDate: "2026-02-31" }, fixtureNeeds, []);
    expect(result.intent).toBe("CLARIFY");
    expect(result.needs).toEqual(fixtureNeeds);
    expect(result.message).toContain("ngày");
  });
  it("preserves an ambiguous mandatory destination over unrelated and clarification turns", () => {
    const candidates = [{ ...planningCandidate("a"), name: "Đồng Văn phố cổ" }, { ...planningCandidate("b"), name: "Đồng Văn cao nguyên" }];
    const first = applyPlanningUnderstanding({ ...base, destinations: [{ name: "Đồng Văn", required: true, remove: false }] }, fixtureNeeds, candidates);
    expect(first.unresolved[0]?.choices).toHaveLength(2);
    const next = applyPlanningUnderstanding({ ...base, durationDays: 3 }, first.needs, candidates, first.unresolved);
    expect(next.unresolved).toEqual(first.unresolved);
    const clarified = applyPlanningUnderstanding({ ...base, intent: "CLARIFY" }, next.needs, candidates, next.unresolved);
    expect(clarified.unresolved).toEqual(first.unresolved);
  });
  it("carries removal through disambiguation and never offers hidden choices", () => {
    const result = applyPlanningUnderstanding({ ...base, destinations: [{ name: "Điểm", required: true, remove: true }] }, fixtureNeeds, [planningCandidate("a"), planningCandidate("b"), { ...planningCandidate("hidden"), visibility: "HIDDEN" }]);
    expect(result.unresolved[0]).toMatchObject({ remove: true, choices: [{ id: "a" }, { id: "b" }] });
  });
  it("QA cannot change duration, transport or mandatory destinations", () => {
    const result = applyPlanningUnderstanding({ ...base, intent: "QA", durationDays: 9, transport: "MOTORCYCLE", destinations: [{ name: "Điểm a", required: true, remove: false }] }, fixtureNeeds, [planningCandidate("a")]);
    expect(result.needs).toEqual(fixtureNeeds);
  });
  it("offers an explicitly requested re-add without permitting unsolicited excluded options", () => {
    const needs = { ...fixtureNeeds, excludedDestinationIds: ["a"], destinationNames: { a: "Điểm a" } };
    const dialogue = { field: null, question: "Bạn muốn chỉnh gì?", recent: [], current: { days: [["b"]] } };
    const operation = { kind: "ADD" as const, day: 1, targetName: null, destinationName: "Điểm a" };
    const explicit = applyPlanningUnderstanding({ ...base, intent: "EDIT", operation }, needs, [planningCandidate("a"), planningCandidate("b")], [], dialogue);
    expect(explicit.options?.map(c => c.id)).toEqual(["a"]);
    expect(explicit.needs.excludedDestinationIds).toEqual(["a"]);
    const unsolicited = applyPlanningUnderstanding({ ...base, intent: "EDIT", operation: { ...operation, destinationName: null }, suggestedIds: ["a"] }, needs, [planningCandidate("a"), planningCandidate("b")], [], dialogue);
    expect(unsolicited.options).toEqual([]);
  });
  it("a uniquely matched short removal name also excludes the actual point", () => {
    const candidates = [{ ...planningCandidate("a"), name: "Cổng trời Quản Bạ" }];
    const result = applyPlanningUnderstanding({ ...base, destinations: [{ name: "Quản Bạ", required: false, remove: true }] }, { ...fixtureNeeds, preferredDestinationIds: ["a"] }, candidates);
    expect(result.needs.excludedDestinationIds).toContain("a");
  });
});
