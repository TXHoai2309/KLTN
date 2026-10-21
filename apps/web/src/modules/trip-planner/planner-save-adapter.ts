import type { PlannerResult } from "./planner-contract";
import type { TripProposal } from "../trip-validation/trip-proposal-contract";
import type { TripValidation, ValidationFinding, ValidationGroupName, ValidationGroupStatus } from "../trip-validation/trip-validation";

export function toTripProposal(proposal: PlannerResult): TripProposal {
  return {
    startDate: proposal.requirement.startDate,
    durationDays: proposal.requirement.durationDays,
    transport: proposal.requirement.transport,
    days: proposal.days.map((day) => ({
      dayIndex: day.day,
      visits: day.stops.map((stop) => {
        const startMinute = stop.arrivalMinute ?? 480;
        const plannedDurationMinutes = Math.min(stop.visitDurationMinutes, Math.max(1, 1440 - startMinute));
        return {
          destinationId: stop.destination.id,
          startMinute,
          plannedDurationMinutes,
          order: stop.order,
        };
      }),
    })),
  };
}

export function toTripValidation(proposal: PlannerResult, now = new Date()): TripValidation {
  const getStatus = (key: PlannerResult["checks"][number]["key"]): ValidationGroupStatus => {
    const check = proposal.checks.find((c) => c.key === key);
    if (!check) return "INSUFFICIENT_DATA";
    return check.status === "PASS" ? "SATISFIED" : check.status;
  };

  const getFindings = (
    key: PlannerResult["checks"][number]["key"],
    group: ValidationGroupName,
  ): ValidationFinding[] => {
    const check = proposal.checks.find((c) => c.key === key);
    if (!check) return [];
    return check.issues.map((issue) => ({
      group,
      status:
        issue.code === "CLOSED" ||
        issue.code === "OUTSIDE_OPENING_HOURS" ||
        issue.code === "VISIT_TOO_SHORT" ||
        issue.code === "TRANSFER_TOO_SHORT" ||
        issue.code === "SCHEDULE_CONFLICT" ||
        issue.code === "NO_TIME_SLOT" ||
        issue.code === "INELIGIBLE_OR_DUPLICATE"
          ? "VIOLATION"
          : "INSUFFICIENT_DATA",
      reasonCode: issue.code,
      message: issue.message,
      affectedVisitId: issue.destinationId ?? undefined,
    }));
  };

  return {
    timeReference: now.toISOString(),
    groups: {
      openingHours: {
        status: getStatus("OPENING_HOURS"),
        findings: getFindings("OPENING_HOURS", "openingHours"),
      },
      minimumDuration: {
        status: getStatus("MINIMUM_DURATION"),
        findings: getFindings("MINIMUM_DURATION", "minimumDuration"),
      },
      travelTime: {
        status: getStatus("TRAVEL_TIME"),
        findings: getFindings("TRAVEL_TIME", "travelTime"),
      },
      scheduleConflict: {
        status: getStatus("SCHEDULE_CONFLICTS"),
        findings: getFindings("SCHEDULE_CONFLICTS", "scheduleConflict"),
      },
    },
    canConfirm:
      proposal.eligibleForFinalConfirmation &&
      proposal.checks.every((c) => c.status === "PASS"),
  };
}
