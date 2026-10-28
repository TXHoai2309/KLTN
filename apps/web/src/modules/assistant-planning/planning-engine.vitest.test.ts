import { describe, it, expect, vi } from "vitest";
import { missingLeg } from "../trip-planner/planner-routes";
import { applyPlanningEdit, assertEditScope, assertPlanningSelection, generatePlanningProposal, scheduleSelection } from "./planning-engine";
import { planningNow, fixtureNeeds, planningCandidate, fixtureRoutes } from "../../test/planning-fixtures";
describe("Conversational itinerary deterministic boundary", () => {
  it("rejects unknown, repeated, hidden and missing mandatory destinations", () => {
    const candidates = [planningCandidate("a")];
    for (const days of [[["unknown"]], [["a", "a"]], [[], []]]) expect(() => assertPlanningSelection({ days }, fixtureNeeds, candidates)).toThrow();
    expect(() => assertPlanningSelection({ days: [["a"]] }, { ...fixtureNeeds, requiredDestinationIds: ["b"] }, candidates)).toThrow(/bắt buộc/);
    expect(() => assertPlanningSelection({ days: [["a"]] }, fixtureNeeds, [{ ...candidates[0]!, visibility: "HIDDEN" }])).toThrow();
  });
  it("checks genuine dates/routes and never certifies a relative proposal", async () => {
    const candidates = [planningCandidate("a"), planningCandidate("b")];
    const ready = await scheduleSelection(fixtureNeeds, { days: [["a", "b"]] }, candidates, fixtureRoutes, planningNow);
    expect(ready.eligibleForFinalConfirmation).toBe(true);
    const relative = await scheduleSelection({ ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, startDate: null } }, { days: [["a", "b"]] }, candidates, fixtureRoutes, planningNow);
    expect(relative.eligibleForFinalConfirmation).toBe(false);
    const missing = await scheduleSelection(fixtureNeeds, { days: [["a", "b"]] }, candidates, { route: async p => missingLeg(p, "UNAVAILABLE") }, planningNow);
    expect(missing.checks.find(c => c.key === "TRAVEL_TIME")?.status).toBe("INSUFFICIENT_DATA");
  });
  it("runs at most two repairs and stops when evidence is missing", async () => {
    const candidates = [planningCandidate("a", 400), planningCandidate("b", 400)];
    const generate = vi.fn(async () => ({ days: [["a", "b"]] }));
    const input = { needs: fixtureNeeds, candidates, previous: null, instruction: "", generate, routes: fixtureRoutes, now: planningNow, recheck: async () => true };
    const result = await generatePlanningProposal(input);
    expect(result.attempts).toHaveLength(3);
    expect(generate).toHaveBeenCalledTimes(3);
    generate.mockClear();
    await generatePlanningProposal({ ...input, routes: { route: async p => missingLeg(p, "UNAVAILABLE") } });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("never sends a destination without usable visit duration to the model", async () => {
    const candidates = [planningCandidate("a"), { ...planningCandidate("missing"), suggestedDurationMinutes: null, minimumDurationMinutes: null }];
    const generate = vi.fn(async (input: { candidates: readonly { id: string }[] }) => ({ days: [[input.candidates.at(-1)!.id]] }));
    const result = await generatePlanningProposal({ needs: fixtureNeeds, candidates, previous: null, instruction: "", generate, routes: fixtureRoutes, now: planningNow, recheck: async () => true });
    expect(result.selection.days).toEqual([["a"]]);
    expect(generate.mock.calls[0]![0].candidates.map(c => c.id)).toEqual(["a"]);
  });
  it("excluded stops cannot be selected even if the model proposes them", () => {
    expect(() => assertPlanningSelection({ days: [["a"]] }, { ...fixtureNeeds, excludedDestinationIds: ["a"] }, [planningCandidate("a")], planningNow)).toThrow(/đã yêu cầu bỏ/);
  });
  it("applies a confirmed replacement deterministically and rejects reordering other days", () => {
    const previous = { days: [["a", "b"], ["c", "d"]] };
    const edit = { kind: "REPLACE" as const, day: 1, targetId: "b", destinationId: "e" };
    expect(applyPlanningEdit(previous, edit).days).toEqual([["a", "e"], ["c", "d"]]);
    expect(previous.days).toEqual([["a", "b"], ["c", "d"]]);
    expect(() => assertEditScope({ days: [["a", "e"], ["d", "c"]] }, previous, edit)).toThrow(/ngoài yêu cầu/);
  });
});
