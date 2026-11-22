import { AppError } from "@/server/http/app-error";
import { preserveCompleted, ReplanCompletedVisitError } from "../in-trip/preserve-completed";
import { splitCompletedRemaining, type SplitTripInput } from "../in-trip/split-trip";
import { effectiveTripStatus, type TripStatus } from "../trip-read/trip-status";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { tripDayDate } from "../trip-validation/trip-proposal-contract";
import type { EditCandidate, SavedTripForEdit } from "./edit-candidate";

export function classifyOngoingCompletedVisits(
  trip: SavedTripForEdit & { manuallyCompletedAt?: Date | null },
  timeReference: Date,
): { tripStatus: TripStatus; completedVisitIds: string[] } {
  const startDateIso =
    typeof trip.startDate === "string"
      ? trip.startDate.slice(0, 10)
      : trip.startDate.toISOString().slice(0, 10);
  const tripStatus = effectiveTripStatus(
    startDateIso,
    trip.durationDays,
    vietnamDateOf(timeReference),
    trip.manuallyCompletedAt ?? null,
  ).status;

  if (tripStatus !== "ONGOING" || trip.days.length === 0) {
    return { tripStatus, completedVisitIds: [] };
  }

  const splitInput: SplitTripInput = {
    startDate: startDateIso,
    durationDays: trip.durationDays,
    days: trip.days.map((day) => ({
      dayIndex: day.dayIndex,
      localDate: tripDayDate(startDateIso, day.dayIndex) ?? "",
      visits: day.visits.map((visit) => ({
        id: visit.id,
        destinationId: visit.destinationId,
        startMinute: visit.startMinute,
        plannedDurationMinutes: visit.plannedDurationMinutes,
        order: visit.order,
      })),
    })),
  };

  const split = splitCompletedRemaining(splitInput, timeReference);
  return {
    tripStatus,
    completedVisitIds: split.completed.map((item) => item.visitId),
  };
}

export function assertOngoingCompletedVisitsUnchanged(
  trip: SavedTripForEdit & { manuallyCompletedAt?: Date | null },
  candidate: EditCandidate,
  timeReference: Date,
): void {
  const { tripStatus, completedVisitIds } = classifyOngoingCompletedVisits(trip, timeReference);
  if (tripStatus !== "ONGOING" || completedVisitIds.length === 0) return;

  try {
    preserveCompleted(trip, candidate, completedVisitIds);
  } catch (error) {
    if (error instanceof ReplanCompletedVisitError) {
      throw new AppError(
        "COMPLETED_VISIT_CHANGED",
        "Không thể thay đổi hoặc xóa lượt tham quan đã hoàn tất khi chuyến đi đang diễn ra.",
        422,
        { completedVisitIds },
      );
    }
    throw error;
  }
}
