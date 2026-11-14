import type { PlannerResult } from "../trip-planner/planner-contract";
import { tripProposalSchema, type TripProposal } from "../trip-validation/trip-proposal-contract";
import { assessUnchecked, type UncheckedItem } from "./unchecked-checks";

function buildProposal(result: PlannerResult): TripProposal | null {
  if (!result.requirement.startDate) return null;
  const proposal = {
    ...(result.requirement.journey === undefined ? {} : { journey: structuredClone(result.requirement.journey) }),
    startDate: result.requirement.startDate,
    durationDays: result.requirement.durationDays,
    transport: result.requirement.transport,
    days: result.days.map(day => ({
      dayIndex: day.day,
      visits: day.stops.map(stop => ({
        destinationId: stop.destination.id,
        startMinute: stop.arrivalMinute,
        plannedDurationMinutes: stop.visitDurationMinutes,
        order: stop.order,
      })),
    })),
  };
  if (result.days.some(day => day.stops.some(stop => stop.scheduleState !== "PLANNED" || stop.arrivalMinute === null))) return null;
  const parsed = tripProposalSchema.safeParse(proposal);
  return parsed.success && parsed.data.days.some(day => day.visits.length > 0) ? parsed.data : null;
}

/** A preliminary plan is saveable only when every stop has a factual clock time. */
export function toSaveProposal(result: PlannerResult): TripProposal | null {
  if (!result.eligibleForFinalConfirmation) return null;
  return buildProposal(result);
}

/**
 * Ticket 09: a schedule with no FAILED check whose only gaps are unchecked data of external places may be offered for Save
 * after an explicit confirmation. The list is what the client expects; the server recomputes and compares it.
 */
export function toUncheckedSavePlan(result: PlannerResult): { proposal: TripProposal; unchecked: UncheckedItem[] } | null {
  if (result.eligibleForFinalConfirmation) return null;
  const assessment = assessUnchecked(result);
  if (assessment.kind !== "UNCHECKED") return null;
  const proposal = buildProposal(result);
  return proposal ? { proposal, unchecked: assessment.items } : null;
}
