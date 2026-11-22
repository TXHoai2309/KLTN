import type { TripStatus } from "../trip-read/trip-status";
import type { EditCandidate, EditCandidateVisit } from "./edit-candidate";

export type RebaseDraftInput = {
  workingDraft: EditCandidate;
  latestBaseline: EditCandidate;
  latestTripStatus: TripStatus;
  completedVisitIds: readonly string[];
};

export type RebaseDraftResult = {
  rebasedCandidate: EditCandidate;
  lockedRestoredCount: number;
  message: string;
};

/**
 * Rebases user's in-progress `workingDraft` onto a newer `latestBaseline` after a 409 conflict:
 * - Preserves uncompleted edits/additions/deletions from `workingDraft`.
 * - Enforces immutable baseline fields (`startDate`, `durationDays`, `transport`) and post-departure locked `journey`.
 * - Restores any `ONGOING` elapsed visits (`completedVisitIds`) back to their exact baseline positions & times.
 */
export function rebaseEditDraft(input: RebaseDraftInput): RebaseDraftResult {
  const completedSet = new Set(input.completedVisitIds);
  let lockedRestoredCount = 0;

  const days = input.latestBaseline.days.map((baseDay) => {
    const draftDay = input.workingDraft.days.find((d) => d.dayIndex === baseDay.dayIndex);
    const lockedBaseVisits = baseDay.visits
      .filter((v) => completedSet.has(v.visitId))
      .sort((a, b) => a.order - b.order);

    const draftRemaining = (draftDay?.visits ?? []).filter(
      (v) => !completedSet.has(v.visitId),
    );

    for (const locked of lockedBaseVisits) {
      const prevInDraft = input.workingDraft.days
        .flatMap((d) => d.visits.map((v) => ({ ...v, dayIndex: d.dayIndex })))
        .find((v) => v.visitId === locked.visitId);
      if (
        !prevInDraft ||
        prevInDraft.dayIndex !== baseDay.dayIndex ||
        prevInDraft.destinationId !== locked.destinationId ||
        prevInDraft.startMinute !== locked.startMinute ||
        prevInDraft.plannedDurationMinutes !== locked.plannedDurationMinutes ||
        prevInDraft.order !== locked.order
      ) {
        lockedRestoredCount += 1;
      }
    }

    if (lockedBaseVisits.length === 0) {
      return {
        dayIndex: baseDay.dayIndex,
        visits: draftRemaining.map((v, idx) => ({ ...v, order: idx + 1 })),
      };
    }

    const totalSlots = lockedBaseVisits.length + draftRemaining.length;
    const merged: (EditCandidateVisit | null)[] = Array.from({ length: totalSlots }, () => null);

    // Place locked completed visits into their canonical 1-based baseline slots first.
    const unplacedLocked: EditCandidateVisit[] = [];
    for (const locked of lockedBaseVisits) {
      const slot = locked.order - 1;
      if (slot >= 0 && slot < merged.length && merged[slot] === null) {
        merged[slot] = { ...locked };
      } else {
        unplacedLocked.push({ ...locked });
      }
    }

    let remIdx = 0;
    for (let i = 0; i < merged.length; i++) {
      if (merged[i] !== null) continue;
      if (unplacedLocked.length > 0) {
        merged[i] = unplacedLocked.shift()!;
      } else if (remIdx < draftRemaining.length) {
        merged[i] = { ...draftRemaining[remIdx++]!, order: i + 1 };
      }
    }

    const visits = merged
      .filter((v): v is EditCandidateVisit => v !== null)
      .map((v, idx) => ({
        ...v,
        order: completedSet.has(v.visitId) ? v.order : idx + 1,
      }));

    return {
      dayIndex: baseDay.dayIndex,
      visits,
    };
  });

  const rebasedJourney =
    input.latestTripStatus === "UPCOMING"
      ? input.workingDraft.journey
      : input.latestBaseline.journey;

  const rebasedCandidate: EditCandidate = {
    startDate: input.latestBaseline.startDate,
    durationDays: input.latestBaseline.durationDays,
    transport: input.latestBaseline.transport,
    days,
    ...(rebasedJourney !== undefined ? { journey: rebasedJourney } : {}),
  };

  const message =
    lockedRestoredCount > 0
      ? `Đã rebase bản nháp lên phiên bản mới và khôi phục ${lockedRestoredCount} lượt đã hoàn tất theo lịch chính thức.`
      : "Đã rebase toàn bộ thay đổi trong bản nháp lên phiên bản mới nhất.";

  return { rebasedCandidate, lockedRestoredCount, message };
}
