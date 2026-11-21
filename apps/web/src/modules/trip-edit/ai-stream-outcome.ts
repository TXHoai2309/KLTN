import type { AiTripEditStreamOutcome } from "@/lib/trip-edit-client";
import type {
  AiEditAdvisedResult,
  AiEditClarificationResult,
  AiEditNeedsLocationResult,
  AiEditProposalResult,
} from "./ai-edit-service";
import type { EditResolution } from "./edit-clarification";

export const STREAM_INTERRUPTED_NOTICE = "Kết nối bị ngắt trước khi áp dụng — lịch chưa thay đổi.";
export const STREAM_STOPPED_NOTICE = "Đã dừng — lịch chưa thay đổi.";

export type AiOutcomeContext = {
  prompt: string;
  resolution?: EditResolution;
  steps: readonly string[];
  streamedCorrectionNote?: string | null;
};

export type AiStreamOutcomeDecision =
  | {
      action: "APPLY_PROPOSED";
      mutateDraft: true;
      result: AiEditProposalResult;
      summary: string;
      steps: string[];
      correctionNote?: string;
    }
  | {
      action: "COMMIT_ADVISED";
      mutateDraft: false;
      result: AiEditAdvisedResult;
      steps: string[];
      correctionNote?: string;
    }
  | {
      action: "COMMIT_CLARIFYING";
      mutateDraft: false;
      result: AiEditClarificationResult;
      prompt: string;
    }
  | {
      action: "REQUEST_LOCATION";
      mutateDraft: false;
      result: AiEditNeedsLocationResult;
    }
  | {
      action: "INTERRUPTED";
      mutateDraft: false;
      prompt: string;
      resolution?: EditResolution;
      partialText: string;
      notice: string;
      steps: string[];
    }
  | {
      action: "STOPPED";
      mutateDraft: false;
      prompt: string;
      resolution?: EditResolution;
      partialText: string;
      notice: string;
      steps: string[];
    }
  | {
      action: "CONFLICT_REBASE";
      mutateDraft: false;
    }
  | {
      action: "ERROR";
      mutateDraft: false;
      prompt: string;
      resolution?: EditResolution;
      message: string;
      canRetry: boolean;
      completedVisitDetails?: unknown;
    };

/**
 * Pure decision function mapping a streamed or JSON AI edit outcome to the exact
 * workspace update. Only a verified `RESULT` with `status === "PROPOSED"` is
 * permitted to mutate the client `Edit draft` (`mutateDraft: true`).
 */
export function resolveAiStreamOutcome(
  outcome: AiTripEditStreamOutcome,
  context: AiOutcomeContext,
): AiStreamOutcomeDecision {
  const steps = [...context.steps];

  if (outcome.kind === "STOPPED") {
    return {
      action: "STOPPED",
      mutateDraft: false,
      prompt: context.prompt,
      ...(context.resolution ? { resolution: context.resolution } : {}),
      partialText: outcome.partialText.trim(),
      notice: STREAM_STOPPED_NOTICE,
      steps,
    };
  }

  if (outcome.kind === "INTERRUPTED") {
    return {
      action: "INTERRUPTED",
      mutateDraft: false,
      prompt: context.prompt,
      ...(context.resolution ? { resolution: context.resolution } : {}),
      partialText: outcome.partialText.trim(),
      notice: STREAM_INTERRUPTED_NOTICE,
      steps,
    };
  }

  if (outcome.kind === "TIMEOUT") {
    return {
      action: "ERROR",
      mutateDraft: false,
      prompt: context.prompt,
      ...(context.resolution ? { resolution: context.resolution } : {}),
      message:
        "Trợ lý AI chưa phản hồi sau 5 phút nên đã dừng. Lịch trình và câu lệnh của bạn vẫn được giữ nguyên; hãy thử lại.",
      canRetry: true,
    };
  }

  if (outcome.kind === "NETWORK_ERROR") {
    return {
      action: "ERROR",
      mutateDraft: false,
      prompt: context.prompt,
      ...(context.resolution ? { resolution: context.resolution } : {}),
      message: "Mất kết nối mạng khi gọi AI. Câu lệnh của bạn vẫn được giữ nguyên để thử lại.",
      canRetry: true,
    };
  }

  if (outcome.kind === "FAILED") {
    if (outcome.code === "TRIP_REVISION_CONFLICT") {
      return { action: "CONFLICT_REBASE", mutateDraft: false };
    }
    if (outcome.code === "COMPLETED_VISIT_CHANGED") {
      return {
        action: "ERROR",
        mutateDraft: false,
        prompt: context.prompt,
        message: outcome.message,
        canRetry: false,
        completedVisitDetails: outcome.details,
      };
    }
    return {
      action: "ERROR",
      mutateDraft: false,
      prompt: context.prompt,
      ...(context.resolution ? { resolution: context.resolution } : {}),
      message: outcome.message,
      canRetry: true,
    };
  }

  const result = outcome.result;
  if (result.status === "NEEDS_LOCATION") {
    return { action: "REQUEST_LOCATION", mutateDraft: false, result };
  }
  if (result.status === "NEEDS_CLARIFICATION") {
    return { action: "COMMIT_CLARIFYING", mutateDraft: false, result, prompt: context.prompt };
  }
  if (result.status === "ADVISED") {
    const correctionNote = result.correctionNote ?? context.streamedCorrectionNote ?? undefined;
    return {
      action: "COMMIT_ADVISED",
      mutateDraft: false,
      result,
      steps,
      ...(correctionNote ? { correctionNote } : {}),
    };
  }

  const correctionNote = result.correctionNote ?? context.streamedCorrectionNote ?? undefined;
  return {
    action: "APPLY_PROPOSED",
    mutateDraft: true,
    result,
    summary: result.aiSummary ?? "AI đã cập nhật bản nháp hiện tại.",
    steps,
    ...(correctionNote ? { correctionNote } : {}),
  };
}
