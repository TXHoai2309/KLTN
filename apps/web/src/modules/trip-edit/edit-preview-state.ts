import { editCandidateSchema, type EditCandidate } from "./edit-candidate";
import type { TripEditPreviewOutcome } from "@/lib/trip-edit-client";
import type { PreviewEditResult } from "./trip-edit-service";

export type EditPreviewState = {
  status: "IDLE" | "CHECKING" | "PREVIEWED" | "FAILED" | "NETWORK_ERROR" | "TIMEOUT";
  checkedCandidate: EditCandidate | null;
  result: PreviewEditResult | null;
  error: { code: string; message: string } | null;
};

export const EMPTY_EDIT_PREVIEW_STATE: EditPreviewState = {
  status: "IDLE",
  checkedCandidate: null,
  result: null,
  error: null,
};

export function areEditCandidatesEqual(left: EditCandidate, right: EditCandidate): boolean {
  return JSON.stringify(editCandidateSchema.parse(left)) === JSON.stringify(editCandidateSchema.parse(right));
}

export function beginEditPreview(): EditPreviewState {
  return { ...EMPTY_EDIT_PREVIEW_STATE, status: "CHECKING" };
}

export function invalidateEditPreviewForCandidateChange(
  previousCandidate: EditCandidate,
  nextCandidate: EditCandidate,
  state: EditPreviewState,
): EditPreviewState {
  return areEditCandidatesEqual(previousCandidate, nextCandidate)
    ? state
    : EMPTY_EDIT_PREVIEW_STATE;
}

/**
 * Ignore a late preview if the Traveler changed the candidate while the
 * request was in flight. Network failures leave the candidate untouched.
 */
export function finishEditPreview(
  currentCandidate: EditCandidate,
  requestedCandidate: EditCandidate,
  outcome: TripEditPreviewOutcome,
  expectedBaseRevision: string,
): EditPreviewState {
  if (!areEditCandidatesEqual(currentCandidate, requestedCandidate)) {
    return EMPTY_EDIT_PREVIEW_STATE;
  }

  switch (outcome.kind) {
    case "PREVIEWED":
      if (
        outcome.result.baseRevision !== expectedBaseRevision ||
        !areEditCandidatesEqual(requestedCandidate, outcome.result.candidate)
      ) {
        return {
          status: "FAILED",
          checkedCandidate: null,
          result: null,
          error: { code: "INVALID_RESPONSE", message: "Phản hồi kiểm tra không khớp với phương án đang sửa." },
        };
      }
      return {
        status: "PREVIEWED",
        checkedCandidate: editCandidateSchema.parse(requestedCandidate),
        result: outcome.result,
        error: null,
      };
    case "FAILED":
      return {
        status: "FAILED",
        checkedCandidate: null,
        result: null,
        error: { code: outcome.code, message: outcome.message },
      };
    case "NETWORK_ERROR":
      return { ...EMPTY_EDIT_PREVIEW_STATE, status: "NETWORK_ERROR" };
    case "TIMEOUT":
      return { ...EMPTY_EDIT_PREVIEW_STATE, status: "TIMEOUT" };
  }
}

/** Require a current result and explicit PASS-equivalent status for all four groups. */
export function canConfirmEditPreview(
  candidate: EditCandidate,
  state: EditPreviewState,
): boolean {
  if (state.status !== "PREVIEWED" || !state.checkedCandidate || !state.result) return false;
  if (!areEditCandidatesEqual(candidate, state.checkedCandidate)) return false;

  const validation = state.result.validation;
  return validation.canConfirm === true && [
    validation.groups.openingHours.status,
    validation.groups.minimumDuration.status,
    validation.groups.travelTime.status,
    validation.groups.scheduleConflict.status,
  ].every((status) => status === "SATISFIED");
}
