import type { EditCandidate, SavedTripForEdit } from "../trip-edit/edit-candidate";
import type { TripValidation } from "../trip-validation/trip-validation";
import { preserveCompleted, ReplanCompletedVisitError } from "./preserve-completed";
import { splitCompletedRemaining, type SplitTripInput } from "./split-trip";

export type TimeRecheckTrip = Omit<SavedTripForEdit, "days"> & Omit<SplitTripInput, "days"> & {
  days: readonly (SavedTripForEdit["days"][number] & SplitTripInput["days"][number])[];
};

export type InTripTimeRecheckResult =
  | {
      status: "READY";
      checkedAt: string;
      completedVisitIds: string[];
      validation: TripValidation;
    }
  | {
      status: "REJECTED";
      code: "COMPLETED_VISIT_CHANGED" | "IN_TRIP_VALIDATION_CHANGED" | "ALL_COMPLETED";
      checkedAt: string;
      completedVisitIds: string[];
      validation: TripValidation;
    };

/** Re-evaluate server-derived completion and fresh Validator output before an In-trip write. */
export function recheckInTripTime(input: {
  trip: TimeRecheckTrip;
  candidate: EditCandidate;
  now: Date;
  validation: TripValidation;
}): InTripTimeRecheckResult {
  if (Number.isNaN(input.now.getTime())) throw new RangeError("now must be valid");
  const checkedAt = input.now.toISOString();
  const split = splitCompletedRemaining(input.trip, input.now);
  const completedVisitIds = split.completed.map((visit) => visit.visitId);

  try {
    preserveCompleted(input.trip, input.candidate, completedVisitIds);
  } catch (error) {
    if (!(error instanceof ReplanCompletedVisitError)) throw error;
    return {
      status: "REJECTED",
      code: "COMPLETED_VISIT_CHANGED",
      checkedAt,
      completedVisitIds,
      validation: input.validation,
    };
  }

  if (split.status === "ALL_COMPLETED") {
    return {
      status: "REJECTED",
      code: "ALL_COMPLETED",
      checkedAt,
      completedVisitIds,
      validation: input.validation,
    };
  }

  if (!input.validation.canConfirm) {
    return {
      status: "REJECTED",
      code: "IN_TRIP_VALIDATION_CHANGED",
      checkedAt,
      completedVisitIds,
      validation: input.validation,
    };
  }

  return { status: "READY", checkedAt, completedVisitIds, validation: input.validation };
}
