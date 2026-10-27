import { generatePlanningProposal } from "./planning-engine";
import { AppError } from "../../server/http/app-error";

export async function evaluatePlanningCases(cases: { id: string; input: Parameters<typeof generatePlanningProposal>[0] }[]) {
  const results = [];
  for (const sample of cases) {
    try {
      const result = await generatePlanningProposal(sample.input);
      results.push({ id: sample.id, initial: result.attempts[0]!, final: result.attempts.at(-1)!, adjustments: result.attempts.length - 1, outcome: result.proposal.days.every(d => d.stops.length === 0) ? "NO_ITINERARY" : result.proposal.status, repairError: result.repairError !== null });
    } catch (error) {
      results.push({ id: sample.id, initial: null, final: null, adjustments: 0, outcome: error instanceof AppError && ["INVALID_AI_PLAN", "MANDATORY_DESTINATION_MISSING", "PACE_LIMIT"].includes(error.code) ? "STRUCTURAL_REJECTION" : "TECHNICAL_FAILURE", repairError: false });
    }
  }
  const initialPass = results.filter(r => r.initial?.status === "PROPOSAL_READY").length;
  const finalPass = results.filter(r => r.final?.status === "PROPOSAL_READY").length;
  return { kind: "OFFLINE_SYNTHETIC_SELECTION_PIPELINE", denominator: cases.length, initialPass, finalPass, initialSuccessRate: cases.length ? initialPass / cases.length : 0, finalSuccessRate: cases.length ? finalPass / cases.length : 0, results };
}
