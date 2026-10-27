import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { evaluatePlanningCases } from "./planning-evaluation";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { missingLeg } from "../trip-planner/planner-routes";

it("evaluates all requests including technical, structural and insufficient-data outcomes", async () => {
  const input = { needs: fixtureNeeds, candidates: [planningCandidate("a"), planningCandidate("b")], previous: null, instruction: "", generate: async () => ({ days: [["a", "b"]] }), routes: fixtureRoutes, now: planningNow, recheck: async () => true };
  const report = await evaluatePlanningCases([
    { id: "ready", input },
    { id: "repair-overfull-day", input: { ...input, candidates: [planningCandidate("a", 400), planningCandidate("b", 400)], generate: async data => ({ days: [data.feedback.length ? ["a"] : ["a", "b"]] }) } },
    { id: "relative-days", input: { ...input, needs: { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, startDate: null } } } },
    { id: "routing-unavailable", input: { ...input, routes: { route: async pair => missingLeg(pair, "UNAVAILABLE") } } },
    { id: "unknown-destination", input: { ...input, generate: async () => ({ days: [["invented"]] }) } },
    { id: "provider-error", input: { ...input, generate: async () => { throw Error("synthetic provider failure"); } } },
    { id: "no-itinerary-found", input: { ...input, candidates: [], generate: async () => ({ days: [[]] }) } },
  ]);
  expect(report.denominator).toBe(7); expect(report.results).toHaveLength(7);
  expect(report.initialPass).toBe(1); expect(report.finalPass).toBe(2);
  expect(report.results.find(r => r.id === "routing-unavailable")?.adjustments).toBe(0);
  expect(report.results.find(r => r.id === "repair-overfull-day")?.adjustments).toBe(1);
  if (process.env.ASSISTANT_PLANNING_EVALUATION === "1") {
    const target = path.resolve("../../docs/implementation/assistant-trip-planning-evaluation.json");
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  }
});
