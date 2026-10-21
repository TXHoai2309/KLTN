import type { InTripLocation } from "./in-trip-location";
import type { SplitTripStatus, SplitTripVisit } from "./split-trip";
import type { EditCandidate, EditCandidateDiff } from "@/modules/trip-edit/edit-candidate";
import type { EditClarification } from "@/modules/trip-edit/edit-clarification";
import type { ReplanClarificationReason } from "./replan-contract";
import type { TripValidation } from "../trip-validation/trip-validation";

export const IN_TRIP_NEED_MAX_LENGTH = 500;

export type InTripNeedValidation =
  | { valid: true; normalized: string }
  | { valid: false; reason: "REQUIRED" | "TOO_LONG" };

export type InTripSession = {
  tripStatus: SplitTripStatus;
  location: InTripLocation | null;
  need: string;
};

export type InTripReplanResponse =
  | {
      status: "PROPOSED";
      candidate: EditCandidate;
      diff: EditCandidateDiff;
      completedVisitIds: string[];
      mandatoryEndpoint: { destinationId: string; deadline: string } | null;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      clarificationReason: ReplanClarificationReason;
      clarification: EditClarification;
    }
  | { status: "ALL_COMPLETED" };

export type InTripReplanOutcome =
  | { kind: "RESPONSE"; data: InTripReplanResponse }
  | { kind: "AI_ERROR"; code: string; message: string }
  | { kind: "FAILED"; status: number; code: string; message: string }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TIMEOUT" };

export type InTripProposalState =
  | { status: "IDLE" }
  | { status: "REQUESTING" }
  | { status: "PROPOSED"; result: Extract<InTripReplanResponse, { status: "PROPOSED" }> }
  | {
      status: "NEEDS_CLARIFICATION";
      result: Extract<InTripReplanResponse, { status: "NEEDS_CLARIFICATION" }>;
    }
  | { status: "ALL_COMPLETED" }
  | { status: "AI_ERROR"; code: string; message: string }
  | { status: "FAILED"; httpStatus: number; code: string; message: string }
  | { status: "NETWORK_ERROR" }
  | { status: "TIMEOUT" };

export type InTripAssistantState = {
  session: InTripSession;
  proposal: InTripProposalState;
  validation: InTripValidationState;
  apply: InTripApplyState;
};

export type InTripPreviewData = {
  validation: TripValidation;
  checkedAt: string;
  completedVisitIds: string[];
};

export type InTripPreviewOutcome =
  | { status: "SUCCESS"; data: InTripPreviewData }
  | {
      status: "FAILED";
      code: string;
      message: string;
      httpStatus: number;
      validation?: TripValidation;
      checkedAt?: string;
    }
  | { status: "NETWORK_ERROR" }
  | { status: "TIMEOUT" };

export type InTripApplyPayload = {
  baseRevision: string;
  candidate: EditCandidate;
  confirmed: true;
  kind: "IN_TRIP";
  location: InTripLocation;
  mandatoryEndpoint: { destinationId: string; deadline: string } | null;
};

export type InTripApplyData = {
  tripId: string;
  baseRevision: string;
  candidate: EditCandidate;
  kind: "IN_TRIP";
  validation: TripValidation;
};

export type InTripApplyOutcome =
  | { status: "SUCCESS"; data: InTripApplyData; replayed?: boolean }
  | {
      status: "FAILED";
      error: { code: string; message: string };
      httpStatus?: number;
      validation?: TripValidation;
      checkedAt?: string;
    }
  | { status: "UNKNOWN"; error: { code: string; message: string }; retryWithSameKey: true };

type CheckedInTripSnapshot = {
  proposal: Extract<InTripReplanResponse, { status: "PROPOSED" }>;
  need: string;
  location: InTripLocation;
};

export type InTripValidationState =
  | { status: "IDLE" }
  | { status: "CHECKING" }
  | { status: "CHECKED"; data: InTripPreviewData; snapshot: CheckedInTripSnapshot }
  | {
      status: "FAILED";
      code: string;
      message: string;
      httpStatus?: number;
      data?: InTripPreviewData;
    };

export type PendingInTripApply = { idempotencyKey: string; payload: InTripApplyPayload };

export type InTripApplyState =
  | { status: "IDLE" }
  | { status: "APPLYING"; pending: PendingInTripApply }
  | { status: "UNKNOWN"; pending: PendingInTripApply; error: { code: string; message: string } }
  | {
      status: "FAILED";
      code: string;
      message: string;
      httpStatus?: number;
      validation?: TripValidation;
      checkedAt?: string;
    }
  | { status: "SUCCESS"; baseRevision: string };

export type InTripStep = "LOCATION" | "NEED" | "READY" | "ALL_COMPLETED";

export type InTripVisitSummary = SplitTripVisit & {
  destinationName: string;
  area: string;
};

export function validateInTripNeed(value: string): InTripNeedValidation {
  if ([...value].length > IN_TRIP_NEED_MAX_LENGTH) {
    return { valid: false, reason: "TOO_LONG" };
  }

  const normalized = value.trim();
  if (normalized.length === 0) return { valid: false, reason: "REQUIRED" };
  return { valid: true, normalized };
}

export function createInTripSession(tripStatus: SplitTripStatus): InTripSession {
  return { tripStatus, location: null, need: "" };
}

export function createInTripAssistantState(tripStatus: SplitTripStatus): InTripAssistantState {
  return {
    session: createInTripSession(tripStatus),
    proposal: { status: "IDLE" },
    validation: { status: "IDLE" },
    apply: { status: "IDLE" },
  };
}

/** Input changes make any prior proposal or clarification stale. */
export function updateInTripAssistantInput(
  state: InTripAssistantState,
  input: Partial<Pick<InTripSession, "location" | "need">>,
): InTripAssistantState {
  if (state.apply.status === "APPLYING" || state.apply.status === "UNKNOWN") return state;
  return {
    session: { ...state.session, ...input },
    proposal: { status: "IDLE" },
    validation: { status: "IDLE" },
    apply: { status: "IDLE" },
  };
}

export function canSubmitInTripReplan(state: InTripAssistantState): boolean {
  return state.proposal.status !== "REQUESTING" && state.apply.status === "IDLE" && canRequestInTripReplan(state.session);
}

export function beginInTripReplan(state: InTripAssistantState): InTripAssistantState {
  return canSubmitInTripReplan(state)
    ? { ...state, proposal: { status: "REQUESTING" } }
    : state;
}

/** Keep the entered need and ephemeral location when a request succeeds or fails. */
export function finishInTripReplan(
  state: InTripAssistantState,
  outcome: InTripReplanOutcome,
): InTripAssistantState {
  if (state.proposal.status !== "REQUESTING") return state;

  if (outcome.kind === "RESPONSE") {
    switch (outcome.data.status) {
      case "PROPOSED":
        return { ...state, proposal: { status: "PROPOSED", result: outcome.data }, validation: { status: "IDLE" }, apply: { status: "IDLE" } };
      case "NEEDS_CLARIFICATION":
        return { ...state, proposal: { status: "NEEDS_CLARIFICATION", result: outcome.data }, validation: { status: "IDLE" }, apply: { status: "IDLE" } };
      case "ALL_COMPLETED":
        return { ...state, proposal: { status: "ALL_COMPLETED" }, validation: { status: "IDLE" }, apply: { status: "IDLE" } };
    }
  }

  switch (outcome.kind) {
    case "AI_ERROR":
      return { ...state, proposal: { status: "AI_ERROR", code: outcome.code, message: outcome.message } };
    case "FAILED":
      return {
        ...state,
        proposal: {
          status: "FAILED",
          httpStatus: outcome.status,
          code: outcome.code,
          message: outcome.message,
        },
      };
    case "NETWORK_ERROR":
      return { ...state, proposal: { status: "NETWORK_ERROR" } };
    case "TIMEOUT":
      return { ...state, proposal: { status: "TIMEOUT" } };
  }
}

export function beginInTripPreview(state: InTripAssistantState): InTripAssistantState {
  if (state.proposal.status !== "PROPOSED" || !state.session.location || state.apply.status === "APPLYING" || state.apply.status === "UNKNOWN") {
    return state;
  }
  return { ...state, validation: { status: "CHECKING" }, apply: { status: "IDLE" } };
}

export function finishInTripPreview(
  state: InTripAssistantState,
  outcome: InTripPreviewOutcome,
): InTripAssistantState {
  if (state.proposal.status !== "PROPOSED" || state.validation.status !== "CHECKING") return state;
  if (outcome.status === "SUCCESS") {
    return {
      ...state,
      validation: {
        status: "CHECKED",
        data: outcome.data,
        snapshot: {
          proposal: structuredClone(state.proposal.result),
          need: state.session.need,
          location: structuredClone(state.session.location!),
        },
      },
      apply: { status: "IDLE" },
    };
  }

  const code = outcome.status === "TIMEOUT" ? "PREVIEW_TIMEOUT"
    : outcome.status === "NETWORK_ERROR" ? "PREVIEW_NETWORK_ERROR" : outcome.code;
  const message = outcome.status === "TIMEOUT" ? "Kiểm tra đã hết thời gian chờ. Hãy thử kiểm tra lại."
    : outcome.status === "NETWORK_ERROR" ? "Không kết nối được để kiểm tra phương án. Hãy thử lại."
      : outcome.message;
  const data = "validation" in outcome && outcome.validation && outcome.checkedAt
    ? { validation: outcome.validation, checkedAt: outcome.checkedAt, completedVisitIds: [] }
    : undefined;
  return {
    ...state,
    validation: { status: "FAILED", code, message, ...(outcome.status === "FAILED" ? { httpStatus: outcome.httpStatus } : {}), ...(data ? { data } : {}) },
    apply: { status: "IDLE" },
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isInTripPreviewCurrent(state: InTripAssistantState): boolean {
  if (state.proposal.status !== "PROPOSED" || state.validation.status !== "CHECKED" || !state.session.location) return false;
  return sameJson(state.validation.snapshot.proposal, state.proposal.result)
    && state.validation.snapshot.need === state.session.need
    && sameJson(state.validation.snapshot.location, state.session.location);
}

export function canConfirmInTrip(state: InTripAssistantState): boolean {
  if (state.apply.status !== "IDLE" || !isInTripPreviewCurrent(state)) return false;
  const validation = state.validation.status === "CHECKED" ? state.validation.data.validation : null;
  return validation?.canConfirm === true && [
    validation.groups.openingHours.status,
    validation.groups.minimumDuration.status,
    validation.groups.travelTime.status,
    validation.groups.scheduleConflict.status,
  ].every((status) => status === "SATISFIED");
}

export function beginInTripApply(
  state: InTripAssistantState,
  baseRevision: string,
  idempotencyKey: string,
): InTripAssistantState {
  if (!canConfirmInTrip(state) || state.proposal.status !== "PROPOSED" || !state.session.location) return state;
  const payload: InTripApplyPayload = {
    baseRevision,
    candidate: structuredClone(state.proposal.result.candidate),
    confirmed: true,
    kind: "IN_TRIP",
    location: structuredClone(state.session.location),
    mandatoryEndpoint: state.proposal.result.mandatoryEndpoint,
  };
  return { ...state, apply: { status: "APPLYING", pending: { idempotencyKey, payload } } };
}

export function retryUnknownInTripApply(state: InTripAssistantState): InTripAssistantState {
  if (state.apply.status !== "UNKNOWN") return state;
  return { ...state, apply: { status: "APPLYING", pending: state.apply.pending } };
}

export function finishInTripApply(
  state: InTripAssistantState,
  outcome: InTripApplyOutcome,
): InTripAssistantState {
  if (state.apply.status !== "APPLYING") return state;
  if (outcome.status === "UNKNOWN") {
    return { ...state, apply: { status: "UNKNOWN", pending: state.apply.pending, error: outcome.error } };
  }
  if (outcome.status === "FAILED") {
    return {
      ...state,
      apply: {
        status: "FAILED",
        code: outcome.error.code,
        message: outcome.error.message,
        ...(outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
        ...(outcome.validation ? { validation: outcome.validation } : {}),
        ...(outcome.checkedAt ? { checkedAt: outcome.checkedAt } : {}),
      },
    };
  }
  return { ...state, apply: { status: "SUCCESS", baseRevision: outcome.data.baseRevision } };
}

/** Discard only a local proposal. An unresolved mutation cannot be described as cancelled. */
export function cancelInTripProposal(state: InTripAssistantState): InTripAssistantState {
  if (state.apply.status === "APPLYING" || state.apply.status === "UNKNOWN") return state;
  return { ...state, proposal: { status: "IDLE" }, validation: { status: "IDLE" }, apply: { status: "IDLE" } };
}

export function getInTripStep(session: InTripSession): InTripStep {
  if (session.tripStatus === "ALL_COMPLETED") return "ALL_COMPLETED";
  if (session.location === null) return "LOCATION";
  return validateInTripNeed(session.need).valid ? "READY" : "NEED";
}

export function canRequestInTripReplan(session: InTripSession): boolean {
  return getInTripStep(session) === "READY";
}
