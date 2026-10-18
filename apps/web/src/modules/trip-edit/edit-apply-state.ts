import type { MutationError, MutationOutcome } from "@/lib/mutation-contract";
import type { ApplyEditResult } from "./apply-edit";
import { editCandidateSchema, type EditCandidate } from "./edit-candidate";
import type { TripValidation } from "../trip-validation/trip-validation";

export type EditApplyPayload = {
  baseRevision: string;
  candidate: EditCandidate;
  confirmed: true;
  kind: "MANUAL";
};

export type PendingEditApply = {
  idempotencyKey: string;
  payload: EditApplyPayload;
};

export type EditApplyState = {
  baseRevision: string;
  baselineCandidate: EditCandidate;
  candidate: EditCandidate;
  status: "IDLE" | "SENDING" | "UNKNOWN" | "FAILED";
  pending: PendingEditApply | null;
  error: MutationError | null;
  validation: TripValidation | null;
};

export function createEditApplyState(
  baseRevision: string,
  candidate: EditCandidate,
): EditApplyState {
  const snapshot = editCandidateSchema.parse(candidate);
  return {
    baseRevision,
    baselineCandidate: structuredClone(snapshot),
    candidate: snapshot,
    status: "IDLE",
    pending: null,
    error: null,
    validation: null,
  };
}

export function updateEditApplyCandidate(
  state: EditApplyState,
  candidate: EditCandidate,
): EditApplyState {
  if (state.pending) return state;
  return {
    ...state,
    candidate: editCandidateSchema.parse(candidate),
    status: "IDLE",
    error: null,
    validation: null,
  };
}

export function clearEditApplyFailure(state: EditApplyState): EditApplyState {
  if (state.pending) return state;
  return { ...state, status: "IDLE", error: null, validation: null };
}

/** Create one immutable request snapshot for a new confirmation intent. */
export function beginEditApply(
  state: EditApplyState,
  idempotencyKey: string,
): EditApplyState {
  if (state.status !== "IDLE" || state.pending) return state;
  const payload: EditApplyPayload = {
    baseRevision: state.baseRevision,
    candidate: editCandidateSchema.parse(state.candidate),
    confirmed: true,
    kind: "MANUAL",
  };
  return {
    ...state,
    status: "SENDING",
    pending: { idempotencyKey, payload },
    error: null,
    validation: null,
  };
}

/** Retry only the exact unresolved request; never create a replacement key/body. */
export function retryUnknownEditApply(state: EditApplyState): EditApplyState {
  if (state.status !== "UNKNOWN" || !state.pending) return state;
  return { ...state, status: "SENDING", error: null };
}

export function finishEditApply(
  state: EditApplyState,
  outcome: MutationOutcome<ApplyEditResult>,
  validation: TripValidation | null = null,
): EditApplyState {
  if (!state.pending) return state;

  if (outcome.status === "UNKNOWN") {
    return { ...state, status: "UNKNOWN", error: outcome.error, validation: null };
  }

  if (outcome.status === "FAILED") {
    return {
      ...state,
      status: "FAILED",
      pending: null,
      error: outcome.error,
      validation,
    };
  }

  const appliedCandidate = editCandidateSchema.parse(outcome.data.candidate);
  return {
    ...state,
    baseRevision: outcome.data.baseRevision,
    baselineCandidate: structuredClone(appliedCandidate),
    candidate: appliedCandidate,
    status: "IDLE",
    pending: null,
    error: null,
    validation: null,
  };
}

/** Explicit local discard; callers must not invoke the apply client for this action. */
export function cancelEditApply(state: EditApplyState): EditApplyState {
  if (state.pending) return state;
  const baselineCandidate = editCandidateSchema.parse(state.baselineCandidate);
  return {
    ...state,
    candidate: baselineCandidate,
    status: "IDLE",
    pending: null,
    error: null,
    validation: null,
  };
}
