import { describe, expect, it } from "vitest";
import { EMPTY_PLANNING_NEEDS, type PlanningNeeds } from "../assistant-planning/planning-contract";
import { assessPlanningReadiness } from "./planning-readiness";

describe("V2 minimum useful brief readiness", () => {
  it.each([
    [{}, false, "durationDays"],
    [{ durationDays: 2 }, false, "transport"],
    [{ durationDays: 2, transport: "CAR" }, true, undefined],
    [{ durationDays: 2, transport: "CAR", startDate: null }, true, undefined],
    [{ durationDays: 3, transport: "MOTORCYCLE" }, true, undefined],
    [{ durationDays: 0, transport: "CAR" }, false, "durationDays"],
    [{ durationDays: 15, transport: "CAR" }, false, "durationDays"],
  ] as const)("assesses %j deterministically", (requirement, canDraft, firstBlocker) => {
    const needs: PlanningNeeds = { ...structuredClone(EMPTY_PLANNING_NEEDS), requirement };
    const before = structuredClone(needs);
    const result = assessPlanningReadiness(needs);
    expect(result.canDraft).toBe(canDraft);
    expect(result.blockers[0]?.field).toBe(firstBlocker);
    expect(result).toEqual(assessPlanningReadiness(needs));
    expect(needs).toEqual(before);
  });

  it("reports unknown refinements without inventing or requiring their values", () => {
    const needs: PlanningNeeds = { ...structuredClone(EMPTY_PLANNING_NEEDS), requirement: { durationDays: 2, transport: "CAR" } };
    expect(assessPlanningReadiness(needs)).toEqual({
      canDraft: true, blockers: [], usefulUnknowns: ["startDate", "interests", "pace", "companions", "groupSize", "mobility", "destinations"],
    });
    expect(needs.requirement).toEqual({ durationDays: 2, transport: "CAR" });
  });
});
