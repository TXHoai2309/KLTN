import {
  editCandidateSchema,
  type EditCandidate,
  type SavedTripForEdit,
} from "../trip-edit/edit-candidate";

export class ReplanCompletedVisitError extends Error {
  readonly code = "REPLAN_TOUCHED_COMPLETED" as const;

  constructor() {
    super("Đề xuất có thay đổi lượt đã qua giờ theo lịch.");
    this.name = "ReplanCompletedVisitError";
  }
}

type PositionedVisit = {
  visitId: string;
  destinationId: string;
  dayIndex: number;
  startMinute: number;
  plannedDurationMinutes: number;
  order: number;
};

function persistedVisits(trip: SavedTripForEdit): Map<string, PositionedVisit> {
  const visits = new Map<string, PositionedVisit>();
  for (const day of trip.days) {
    for (const visit of day.visits) {
      if (visits.has(visit.id)) throw new ReplanCompletedVisitError();
      visits.set(visit.id, {
        visitId: visit.id,
        destinationId: visit.destinationId,
        dayIndex: day.dayIndex,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      });
    }
  }
  return visits;
}

function candidateVisits(candidate: EditCandidate): Map<string, PositionedVisit> {
  const parsed = editCandidateSchema.parse(candidate);
  const visits = new Map<string, PositionedVisit>();
  for (const day of parsed.days) {
    for (const visit of day.visits) {
      visits.set(visit.visitId, { ...visit, dayIndex: day.dayIndex });
    }
  }
  return visits;
}

/** Verify that every server-classified completed visit is unchanged in a proposal. */
export function preserveCompleted(
  originalTrip: SavedTripForEdit,
  candidate: EditCandidate,
  completedVisitIds: readonly string[],
): EditCandidate {
  const original = persistedVisits(originalTrip);
  const proposed = candidateVisits(candidate);
  const seen = new Set<string>();

  for (const visitId of completedVisitIds) {
    if (seen.has(visitId)) throw new ReplanCompletedVisitError();
    seen.add(visitId);

    const before = original.get(visitId);
    const after = proposed.get(visitId);
    if (
      !before ||
      !after ||
      before.visitId !== after.visitId ||
      before.destinationId !== after.destinationId ||
      before.dayIndex !== after.dayIndex ||
      before.startMinute !== after.startMinute ||
      before.plannedDurationMinutes !== after.plannedDurationMinutes ||
      before.order !== after.order
    ) {
      throw new ReplanCompletedVisitError();
    }
  }

  return candidate;
}
