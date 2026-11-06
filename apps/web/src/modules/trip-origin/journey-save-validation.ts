import "server-only";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import { toTripValidation } from "../trip-planner/planner-save-adapter";
import { plannerResultSchema, type TravelLeg } from "../trip-planner/planner-contract";
import { assertJourneyReady } from "./trip-origin-service";
import { planJourney, scheduleJourneyEvidence } from "./journey-planner";
import type { JourneyPlan } from "./journey-route-contract";
import { AppError } from "@/server/http/app-error";

export type JourneyDestination = {
  id: string; latitude: number; longitude: number; minimumDurationMinutes: number | null;
  openingDays: { dayOfWeek: string; status: string; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[];
};
export function journeySaveInput(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>) {
  assertJourneyReady(proposal.journey, proposal.days.at(-1)?.visits.length === 0);
  const ids = proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId));
  if (ids.length > 28 || new Set(ids).size !== ids.length) throw new AppError("INVALID_JOURNEY_VISITS", "Hành trình đi/về chỉ hỗ trợ tối đa 28 điểm không lặp.", 422);
  const requirement = tripRequirementInputSchema.parse({ startDate: proposal.startDate, durationDays: proposal.durationDays, transport: proposal.transport, journey: proposal.journey });
  const selected: PlannerCandidate[][] = proposal.days.map(day => day.visits.map(visit => {
    const row = destinations.get(visit.destinationId);
    if (!row) throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn khả dụng.", 422);
    return { ...row, name: row.id, description: "", area: "", address: null, category: "", image: null, visibility: "VISIBLE", revision: "canonical-save", suggestedDurationMinutes: visit.plannedDurationMinutes };
  }));
  const fixed = new Map(proposal.days.flatMap(day => day.visits.map(visit => [visit.destinationId, visit.startMinute] as const)));
  return { requirement, selected, fixed };
}

export function journeyValidation(proposal: TripProposal, scheduled: ReturnType<typeof scheduleJourneyEvidence>, selected: PlannerCandidate[][], now: Date): TripValidation {
  // Build the same shared checks from actual canonical candidates and requested clocks.
  const requirement = tripRequirementInputSchema.parse({ startDate: proposal.startDate, durationDays: proposal.durationDays, transport: proposal.transport, journey: proposal.journey });
  const validated = validatePlannerDays(requirement, scheduled.days, selected.flat(), scheduled.travelOnlyDays);
  for (const day of proposal.days) for (const visit of day.visits) {
    const canonical = selected.flat().find(candidate => candidate.id === visit.destinationId)!;
    if (canonical.minimumDurationMinutes !== null && visit.plannedDurationMinutes < canonical.minimumDurationMinutes) {
      const minimum = validated.checks.find(check => check.key === "MINIMUM_DURATION")!;
      minimum.status = "VIOLATION";
      minimum.issues.push({ code: "VISIT_TOO_SHORT", message: "Thời lượng tham quan ngắn hơn mức tối thiểu hiện tại.", day: day.dayIndex, destinationId: visit.destinationId });
    }
  }
  const travel = validated.checks.find(check => check.key === "TRAVEL_TIME")!;
  if (scheduled.check.status === "VIOLATION" || travel.status === "PASS") travel.status = scheduled.check.status;
  travel.issues.push(...scheduled.check.issues);
  const result = plannerResultSchema.parse({ proposalId: "fresh-save-validation", phase: "PRELIMINARY_PROPOSAL", status: validated.checks.some(check => check.status === "VIOLATION") ? "NO_FEASIBLE_ITINERARY" : validated.checks.every(check => check.status === "PASS") ? "PROPOSAL_READY" : "INSUFFICIENT_DATA",
    requirement, timezone: "Asia/Ho_Chi_Minh", days: scheduled.days, checks: validated.checks, warnings: [], reasonCodes: [], eligibleForFinalConfirmation: validated.checks.every(check => check.status === "PASS") && requirement.startDate !== null, journeyPlan: scheduled.journeyPlan });
  return toTripValidation(result, now);
}

export async function freshJourneyValidation(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>, routes: RouteProvider, now: Date) {
  const input = journeySaveInput(proposal, destinations);
  const scheduled = await planJourney(input.requirement, input.selected, routes, 10_000, false, input.fixed);
  return { validation: journeyValidation(proposal, scheduled, input.selected, now), plan: scheduled.journeyPlan };
}

/** Reuse ONLY fresh server evidence; any changed coordinate invalidates it before this call. */
export function revalidateJourneySnapshot(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>, plan: JourneyPlan, now: Date) {
  const input = journeySaveInput(proposal, destinations);
  const transfers = new Map<string, TravelLeg>();
  for (const leg of plan.legs) if (leg.kind === "TRANSFER" && leg.from.kind === "ATTRACTION" && leg.to.kind === "ATTRACTION") transfers.set(leg.to.destinationId, { ...leg.route, fromDestinationId: leg.from.destinationId, toDestinationId: leg.to.destinationId });
  const outbound = plan.legs.find(leg => leg.kind === "OUTBOUND")!.route;
  const returning = plan.legs.find(leg => leg.kind === "RETURN")!.route;
  const scheduled = scheduleJourneyEvidence(input.requirement, input.selected, transfers, outbound, returning, input.fixed);
  return { validation: journeyValidation(proposal, scheduled, input.selected, now), plan: scheduled.journeyPlan };
}
