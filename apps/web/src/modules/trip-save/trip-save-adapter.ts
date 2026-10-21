import type { PlannerResult } from "../trip-planner/planner-contract";
import { tripProposalSchema, type TripProposal } from "../trip-validation/trip-proposal-contract";

/** A preliminary plan is saveable only when every stop has a factual clock time. */
export function toSaveProposal(result: PlannerResult): TripProposal | null {
  if (!result.eligibleForFinalConfirmation || !result.requirement.startDate) return null;
  const proposal = {
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
