import type { InTripLocation } from "./in-trip-location";
import type { SplitTripStatus, SplitTripVisit } from "./split-trip";
import type { EditCandidate, EditCandidateDiff } from "@/modules/trip-edit/edit-candidate";
import type { EditClarification } from "@/modules/trip-edit/edit-clarification";
import type { ReplanClarificationReason } from "./replan-contract";

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
};

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
  return { session: createInTripSession(tripStatus), proposal: { status: "IDLE" } };
}

/** Input changes make any prior proposal or clarification stale. */
export function updateInTripAssistantInput(
  state: InTripAssistantState,
  input: Partial<Pick<InTripSession, "location" | "need">>,
): InTripAssistantState {
  return {
    session: { ...state.session, ...input },
    proposal: { status: "IDLE" },
  };
}

export function canSubmitInTripReplan(state: InTripAssistantState): boolean {
  return state.proposal.status !== "REQUESTING" && canRequestInTripReplan(state.session);
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
        return { ...state, proposal: { status: "PROPOSED", result: outcome.data } };
      case "NEEDS_CLARIFICATION":
        return { ...state, proposal: { status: "NEEDS_CLARIFICATION", result: outcome.data } };
      case "ALL_COMPLETED":
        return { ...state, proposal: { status: "ALL_COMPLETED" } };
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

export function getInTripStep(session: InTripSession): InTripStep {
  if (session.tripStatus === "ALL_COMPLETED") return "ALL_COMPLETED";
  if (session.location === null) return "LOCATION";
  return validateInTripNeed(session.need).valid ? "READY" : "NEED";
}

export function canRequestInTripReplan(session: InTripSession): boolean {
  return getInTripStep(session) === "READY";
}
