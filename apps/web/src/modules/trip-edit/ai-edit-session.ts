import type { MutationError, MutationOutcome } from "@/lib/mutation-contract";
import type { TripEditPreviewOutcome } from "@/lib/trip-edit-client";
import type { ApplyEditResult } from "./apply-edit";
import type { AiEditServiceResult } from "./ai-edit-service";
import { editCandidateSchema, type EditCandidate } from "./edit-candidate";
import type { EditResolution } from "./edit-clarification";
import type { TripValidation } from "../trip-validation/trip-validation";

export type AiEditApplyPayload = {
  baseRevision: string;
  candidate: EditCandidate;
  confirmed: true;
  kind: "AI";
};

export type PendingAiEditApply = {
  idempotencyKey: string;
  payload: AiEditApplyPayload;
};

export type AiEditSession = {
  baseRevision: string;
  baselineCandidate: EditCandidate;
  message: string;
  status:
    | "IDLE"
    | "SENDING"
    | "PROPOSED"
    | "NEEDS_CLARIFICATION"
    | "CHECKING"
    | "ERROR"
    | "APPLYING"
    | "UNKNOWN"
    | "APPLY_FAILED"
    | "APPLIED";
  result: AiEditServiceResult | null;
  error: MutationError | { code: string; message: string } | null;
  pendingApply: PendingAiEditApply | null;
};

export type AiEditRequestOutcome =
  | { kind: "RESULT"; result: AiEditServiceResult }
  | { kind: "FAILED"; status: number; code: string; message: string }
  | { kind: "NETWORK_ERROR" }
  | { kind: "TIMEOUT" };

export function createAiEditSession(
  baseRevision: string,
  baselineCandidate: EditCandidate,
): AiEditSession {
  return {
    baseRevision,
    baselineCandidate: structuredClone(editCandidateSchema.parse(baselineCandidate)),
    message: "",
    status: "IDLE",
    result: null,
    error: null,
    pendingApply: null,
  };
}

export function setAiEditMessage(session: AiEditSession, message: string): AiEditSession {
  if (
    session.pendingApply ||
    session.status === "SENDING" ||
    session.status === "CHECKING" ||
    session.status === "APPLYING"
  ) {
    return session;
  }
  return {
    ...session,
    message,
    status: "IDLE",
    result: null,
    error: null,
  };
}

export function beginAiEditRequest(session: AiEditSession): AiEditSession {
  if (
    session.pendingApply ||
    session.status === "SENDING" ||
    session.status === "CHECKING" ||
    session.status === "APPLYING" ||
    !session.message.trim()
  ) {
    return session;
  }
  return { ...session, status: "SENDING", result: null, error: null };
}

export function finishAiEditRequest(
  session: AiEditSession,
  outcome: AiEditRequestOutcome,
): AiEditSession {
  if (session.status !== "SENDING") return session;
  if (outcome.kind === "RESULT") {
    return {
      ...session,
      status: outcome.result.status,
      result: outcome.result,
      error: null,
    };
  }
  if (outcome.kind === "NETWORK_ERROR") {
    return {
      ...session,
      status: "ERROR",
      result: null,
      error: { code: "NETWORK_ERROR", message: "Không kết nối được. Yêu cầu vẫn được giữ lại, hãy thử gửi lại." },
    };
  }
  if (outcome.kind === "TIMEOUT") {
    return {
      ...session,
      status: "ERROR",
      result: null,
      error: { code: "TIMEOUT", message: "Yêu cầu mất quá nhiều thời gian. Nội dung vẫn được giữ lại, hãy thử lại." },
    };
  }
  return {
    ...session,
    status: "ERROR",
    result: null,
    error: { code: outcome.code, message: outcome.message },
  };
}

export function canConfirmAiEdit(session: AiEditSession): boolean {
  if (
    (session.status !== "PROPOSED" && session.status !== "UNKNOWN") ||
    session.result?.status !== "PROPOSED" ||
    (session.status === "UNKNOWN" && !session.pendingApply)
  ) {
    return false;
  }
  const validation = session.result.validation;
  return validation.canConfirm === true && [
    validation.groups.openingHours.status,
    validation.groups.minimumDuration.status,
    validation.groups.travelTime.status,
    validation.groups.scheduleConflict.status,
  ].every((status) => status === "SATISFIED");
}

export function beginAiEditApply(
  session: AiEditSession,
  idempotencyKey: string,
): AiEditSession {
  if (session.status !== "PROPOSED" || !canConfirmAiEdit(session) || session.result?.status !== "PROPOSED") return session;
  return {
    ...session,
    status: "APPLYING",
    pendingApply: {
      idempotencyKey,
      payload: {
        baseRevision: session.baseRevision,
        candidate: editCandidateSchema.parse(session.result.candidate),
        confirmed: true,
        kind: "AI",
      },
    },
    error: null,
  };
}

export function retryUnknownAiEditApply(session: AiEditSession): AiEditSession {
  if (session.status !== "UNKNOWN" || !session.pendingApply) return session;
  return { ...session, status: "APPLYING", error: null };
}

export function finishAiEditApply(
  session: AiEditSession,
  outcome: MutationOutcome<ApplyEditResult>,
  validation: TripValidation | null = null,
): AiEditSession {
  if (!session.pendingApply) return session;
  if (outcome.status === "UNKNOWN") {
    return { ...session, status: "UNKNOWN", error: outcome.error };
  }
  if (outcome.status === "FAILED") {
    const result = session.result?.status === "PROPOSED" && validation
      ? { ...session.result, validation }
      : session.result;
    return {
      ...session,
      status: "APPLY_FAILED",
      result,
      pendingApply: null,
      error: outcome.error,
    };
  }

  const candidate = editCandidateSchema.parse(outcome.data.candidate);
  return {
    ...session,
    baseRevision: outcome.data.baseRevision,
    baselineCandidate: structuredClone(candidate),
    status: "APPLIED",
    result: null,
    pendingApply: null,
    error: null,
  };
}

/** Keep the candidate visible when a write was rejected and require a fresh server preview. */
export function beginAiEditRecheck(session: AiEditSession): AiEditSession {
  if (
    session.result?.status !== "PROPOSED" ||
    session.pendingApply ||
    session.status === "CHECKING" ||
    session.status === "SENDING" ||
    session.status === "APPLYING" ||
    session.status === "UNKNOWN"
  ) return session;
  return { ...session, status: "CHECKING", error: null };
}

export function finishAiEditRecheck(
  session: AiEditSession,
  outcome: TripEditPreviewOutcome,
): AiEditSession {
  if (session.status !== "CHECKING" || session.result?.status !== "PROPOSED") return session;
  if (
    outcome.kind === "PREVIEWED" &&
    outcome.result.baseRevision === session.baseRevision &&
    JSON.stringify(editCandidateSchema.parse(outcome.result.candidate)) ===
      JSON.stringify(editCandidateSchema.parse(session.result.candidate))
  ) {
    return {
      ...session,
      status: "PROPOSED",
      result: { ...session.result, validation: outcome.result.validation },
      error: null,
    };
  }
  if (outcome.kind === "PREVIEWED") {
    return {
      ...session,
      status: "ERROR",
      error: { code: "INVALID_RESPONSE", message: "Kết quả kiểm tra không khớp với phương án đang giữ." },
    };
  }
  const error = outcome.kind === "FAILED"
    ? { code: outcome.code, message: outcome.message }
    : outcome.kind === "TIMEOUT"
      ? { code: "TIMEOUT", message: "Kiểm tra mất quá nhiều thời gian. Hãy thử lại." }
      : { code: "NETWORK_ERROR", message: "Không kết nối được để kiểm tra lại phương án." };
  return { ...session, status: "ERROR", error };
}

/** Rebase the editor after another confirmed write while retaining its proposal for recheck. */
export function refreshAiEditBase(
  session: AiEditSession,
  baseRevision: string,
  baselineCandidate: EditCandidate,
): AiEditSession {
  if (session.baseRevision === baseRevision || session.pendingApply) return session;
  const hasProposal = session.result?.status === "PROPOSED";
  return {
    ...session,
    baseRevision,
    baselineCandidate: structuredClone(editCandidateSchema.parse(baselineCandidate)),
    status: hasProposal ? "APPLY_FAILED" : session.status,
    error: hasProposal
      ? { code: "TRIP_REVISION_CONFLICT", message: "Hành trình đã được cập nhật. Hãy kiểm tra lại đề xuất trước khi xác nhận." }
      : session.error,
  };
}

/** Cancel only clears local AI state. It deliberately has no mutation dependency. */
export function cancelAiEditProposal(session: AiEditSession): AiEditSession {
  if (session.pendingApply) return session;
  return { ...session, status: "IDLE", result: null, error: null };
}

export function createAiEditRequestInput(
  session: AiEditSession,
  resolution?: EditResolution,
): { baseRevision: string; message: string; resolution?: EditResolution } {
  return {
    baseRevision: session.baseRevision,
    message: session.message,
    ...(resolution ? { resolution } : {}),
  };
}
