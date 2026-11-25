import "server-only";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation } from "../trip-validation/trip-validation";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import type { RouteProvider } from "../trip-planner/planner-routes";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { validatePlannerDays } from "../trip-planner/planner-validator";
import { toTripValidation } from "../trip-planner/planner-save-adapter";
import { plannerResultSchema, type PlannerResult, type TravelLeg } from "../trip-planner/planner-contract";
import { assertJourneyReady } from "./trip-origin-service";
import { planJourney, scheduleJourneyEvidence } from "./journey-planner";
import type { JourneyPlan } from "./journey-route-contract";
import { AppError } from "@/server/http/app-error";

export type JourneyDestination = {
  id: string; latitude: number; longitude: number; minimumDurationMinutes: number | null;
  /** Ticket 09: a place outside the KLTN catalogue, resolved by the server (never client data). The Validator reports it as unchecked. */
  external?: true;
  openingDays: { dayOfWeek: string; status: string; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[];
};
/** Minimum floor (minutes) for an explicit traveler-chosen shorter visit duration (ADR-48/ADR-51). */
export const USER_CHOSEN_MIN_VISIT_MINUTES = 15;

export function allowsUserChosenShortVisit(
  visit: { plannedDurationMinutes: number; userChosenDuration?: true },
  canonical: { minimumDurationMinutes: number | null; external?: true },
): boolean {
  return (
    visit.userChosenDuration === true &&
    !canonical.external &&
    canonical.minimumDurationMinutes !== null &&
    visit.plannedDurationMinutes >= USER_CHOSEN_MIN_VISIT_MINUTES &&
    visit.plannedDurationMinutes < canonical.minimumDurationMinutes
  );
}

export function journeySaveInput(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>) {
  assertJourneyReady(proposal.journey, proposal.days.at(-1)?.visits.length === 0);
  const ids = proposal.days.flatMap(day => day.visits.map(visit => visit.destinationId));
  if (ids.length > 28 || new Set(ids).size !== ids.length) throw new AppError("INVALID_JOURNEY_VISITS", "Hành trình đi/về chỉ hỗ trợ tối đa 28 điểm không lặp.", 422);
  const requirement = tripRequirementInputSchema.parse({
    startDate: proposal.startDate,
    durationDays: proposal.durationDays,
    transport: proposal.transport,
    journey: proposal.journey,
    ...(proposal.restMode ? { restMode: proposal.restMode } : {}),
    ...(proposal.dayRhythm ? { dayRhythm: proposal.dayRhythm } : {}),
  });
  const canonicalMinimums = new Map<string, number | null>();
  const selected: PlannerCandidate[][] = proposal.days.map(day => day.visits.map(visit => {
    const row = destinations.get(visit.destinationId);
    if (!row) throw new AppError("DESTINATION_UNAVAILABLE", "Có điểm đến không còn khả dụng.", 422);
    canonicalMinimums.set(row.id, row.minimumDurationMinutes);
    const shortOk = allowsUserChosenShortVisit(visit, row);
    return {
      ...row,
      name: row.id,
      description: "",
      area: "",
      address: null,
      category: "",
      image: null,
      visibility: row.external ? "EXTERNAL" : "VISIBLE",
      revision: "canonical-save",
      suggestedDurationMinutes: visit.plannedDurationMinutes,
      ...(shortOk ? { minimumDurationMinutes: visit.plannedDurationMinutes } : {}),
      ...(visit.userChosenDuration ? { userChosenDuration: true as const } : {}),
    };
  }));
  const fixed = new Map(proposal.days.flatMap(day => day.visits.map(visit => [visit.destinationId, visit.startMinute] as const)));
  return { requirement, selected, fixed, canonicalMinimums };
}

export function journeyValidationResult(
  proposal: TripProposal,
  scheduled: ReturnType<typeof scheduleJourneyEvidence>,
  selected: PlannerCandidate[][],
  now: Date,
  canonicalMinimums?: ReadonlyMap<string, number | null>,
): PlannerResult {
  // Build the same shared checks from actual canonical candidates and requested clocks.
  const requirement = tripRequirementInputSchema.parse({
    startDate: proposal.startDate,
    durationDays: proposal.durationDays,
    transport: proposal.transport,
    journey: proposal.journey,
    ...(proposal.restMode ? { restMode: proposal.restMode } : {}),
    ...(proposal.dayRhythm ? { dayRhythm: proposal.dayRhythm } : {}),
  });
  const validated = validatePlannerDays(requirement, scheduled.days, selected.flat(), scheduled.travelOnlyDays);
  const warnings: PlannerResult["warnings"] = [];
  for (const day of proposal.days) for (const visit of day.visits) {
    const candidate = selected.flat().find(c => c.id === visit.destinationId)!;
    const canonicalMin = canonicalMinimums?.has(visit.destinationId)
      ? canonicalMinimums.get(visit.destinationId)!
      : candidate.minimumDurationMinutes;
    if (canonicalMin !== null && visit.plannedDurationMinutes < canonicalMin) {
      if (allowsUserChosenShortVisit(visit, { minimumDurationMinutes: canonicalMin, external: candidate.external })) {
        warnings.push({
          code: "USER_SHORT_VISIT",
          day: day.dayIndex,
          destinationId: visit.destinationId,
          message: `Bạn chọn thời lượng ${visit.plannedDurationMinutes} phút, ngắn hơn mức khuyến nghị tối thiểu ${canonicalMin} phút.`,
        });
      } else {
        const minimum = validated.checks.find(check => check.key === "MINIMUM_DURATION")!;
        minimum.status = "VIOLATION";
        if (!minimum.issues.some(issue => issue.code === "VISIT_TOO_SHORT" && issue.destinationId === visit.destinationId)) {
          minimum.issues.push({ code: "VISIT_TOO_SHORT", message: "Thời lượng tham quan ngắn hơn mức tối thiểu hiện tại.", day: day.dayIndex, destinationId: visit.destinationId });
        }
      }
    }
  }
  const travel = validated.checks.find(check => check.key === "TRAVEL_TIME")!;
  if (scheduled.check.status === "VIOLATION" || travel.status === "PASS") travel.status = scheduled.check.status;
  travel.issues.push(...scheduled.check.issues);
  if (scheduled.warnings?.length) warnings.push(...scheduled.warnings);
  return plannerResultSchema.parse({ proposalId: "fresh-save-validation", phase: "PRELIMINARY_PROPOSAL", status: validated.checks.some(check => check.status === "VIOLATION") ? "NO_FEASIBLE_ITINERARY" : validated.checks.every(check => check.status === "PASS") ? "PROPOSAL_READY" : "INSUFFICIENT_DATA",
    requirement, timezone: "Asia/Ho_Chi_Minh", days: scheduled.days, checks: validated.checks, warnings, reasonCodes: [], eligibleForFinalConfirmation: validated.checks.every(check => check.status === "PASS") && requirement.startDate !== null, journeyPlan: scheduled.journeyPlan });
}

export function journeyValidation(proposal: TripProposal, scheduled: ReturnType<typeof scheduleJourneyEvidence>, selected: PlannerCandidate[][], now: Date): TripValidation {
  return toTripValidation(journeyValidationResult(proposal, scheduled, selected, now), now);
}

export async function freshJourneyValidation(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>, routes: RouteProvider, now: Date) {
  const input = journeySaveInput(proposal, destinations);
  const scheduled = await planJourney(input.requirement, input.selected, routes, 10_000, false, input.fixed);
  const result = journeyValidationResult(proposal, scheduled, input.selected, now, input.canonicalMinimums);
  return { validation: toTripValidation(result, now), plan: scheduled.journeyPlan, result };
}

/** Reuse ONLY fresh server evidence; any changed coordinate invalidates it before this call. */
export function revalidateJourneySnapshot(proposal: TripProposal, destinations: ReadonlyMap<string, JourneyDestination>, plan: JourneyPlan, now: Date) {
  const input = journeySaveInput(proposal, destinations);
  const transfers = new Map<string, TravelLeg>();
  for (const leg of plan.legs) if (leg.kind === "TRANSFER" && leg.from.kind === "ATTRACTION" && leg.to.kind === "ATTRACTION") transfers.set(leg.to.destinationId, { ...leg.route, fromDestinationId: leg.from.destinationId, toDestinationId: leg.to.destinationId });
  const outbound = plan.legs.find(leg => leg.kind === "OUTBOUND")!.route;
  const returning = plan.legs.find(leg => leg.kind === "RETURN")!.route;
  const scheduled = scheduleJourneyEvidence(input.requirement, input.selected, transfers, outbound, returning, input.fixed, plan.overnightStays);
  const result = journeyValidationResult(proposal, scheduled, input.selected, now, input.canonicalMinimums);
  return { validation: toTripValidation(result, now), plan: scheduled.journeyPlan, result };
}
