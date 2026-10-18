import { describe, expect, it } from "vitest";

import type { MutationOutcome } from "@/lib/mutation-contract";
import type { ApplyEditResult } from "./apply-edit";
import type { AiEditServiceResult } from "./ai-edit-service";
import type { EditCandidate } from "./edit-candidate";
import {
  beginAiEditApply,
  beginAiEditRequest,
  beginAiEditRecheck,
  canConfirmAiEdit,
  cancelAiEditProposal,
  createAiEditRequestInput,
  createAiEditSession,
  finishAiEditApply,
  finishAiEditRequest,
  retryUnknownAiEditApply,
  setAiEditMessage,
} from "./ai-edit-session";

const revision = "2026-10-16T10:00:00.000Z";
const nextRevision = "2026-10-16T10:00:00.001Z";
const original: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{ dayIndex: 1, visits: [{
    visitId: "visit-1",
    destinationId: "destination-1",
    startMinute: 480,
    plannedDurationMinutes: 60,
    order: 1,
  }] }],
};
const candidate: EditCandidate = {
  ...original,
  days: [{ dayIndex: 1, visits: [{ ...original.days[0]!.visits[0]!, startMinute: 540 }] }],
};

function validation(status: "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA" = "SATISFIED") {
  const groups = {
    openingHours: { status, findings: [] },
    minimumDuration: { status: "SATISFIED" as const, findings: [] },
    travelTime: { status: "SATISFIED" as const, findings: [] },
    scheduleConflict: { status: "SATISFIED" as const, findings: [] },
  };
  return {
    timeReference: revision,
    groups,
    canConfirm: status === "SATISFIED",
  };
}

function proposal(validationStatus: "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA" = "SATISFIED"): AiEditServiceResult {
  return {
    status: "PROPOSED",
    candidate,
    intent: {
      intentType: "CHANGE_TIME",
      targetVisitIds: ["visit-1"] as never,
      destinationId: null,
      params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
      affected: { visitIds: ["visit-1"] as never, dayIndexes: [1] },
      needsClarification: false,
      clarificationReason: null,
    },
    diff: {
      added: [],
      removed: [],
      updated: [],
      tripChanges: {},
    },
    validation: validation(validationStatus),
  } as AiEditServiceResult;
}

function proposedSession() {
  const requested = beginAiEditRequest(setAiEditMessage(createAiEditSession(revision, original), "Đổi giờ đi"));
  return finishAiEditRequest(requested, { kind: "RESULT", result: proposal() });
}

function success(): MutationOutcome<ApplyEditResult> {
  return {
    status: "SUCCESS",
    data: {
      tripId: "trip-1",
      baseRevision: nextRevision,
      kind: "AI",
      candidate,
      validation: validation(),
    },
  };
}

describe("AI edit session", () => {
  it("represents proposals, clarification, and provider errors while preserving input", () => {
    const base = setAiEditMessage(createAiEditSession(revision, original), "Chuyển bảo tàng sang sáng");
    const sending = beginAiEditRequest(base);
    const clarification = finishAiEditRequest(sending, {
      kind: "RESULT",
      result: {
        status: "NEEDS_CLARIFICATION",
        reason: "MISSING_TARGET",
        intent: {
          intentType: "UNCLEAR",
          targetVisitIds: [],
          destinationId: null,
          params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
          affected: { visitIds: [], dayIndexes: [] },
          needsClarification: true,
          clarificationReason: "MISSING_TARGET",
        } as never,
        clarification: {
          code: "MISSING_TARGET",
          prompt: "Bạn muốn chỉnh sửa điểm đến nào trong hành trình?",
        },
      } as AiEditServiceResult,
    });
    expect(clarification.status).toBe("NEEDS_CLARIFICATION");
    expect(clarification.result?.status).toBe("NEEDS_CLARIFICATION");
    expect(clarification.result && "candidate" in clarification.result).toBe(false);

    const aiError = finishAiEditRequest(beginAiEditRequest(base), {
      kind: "FAILED",
      status: 503,
      code: "AI_UNAVAILABLE",
      message: "Không thể tạo đề xuất bằng AI.",
    });
    expect(aiError.status).toBe("ERROR");
    expect(aiError.message).toBe(base.message);
    expect(aiError.error?.code).toBe("AI_UNAVAILABLE");
  });

  it("enables confirmation only when every validation group passes", () => {
    expect(canConfirmAiEdit(proposedSession())).toBe(true);
    expect(canConfirmAiEdit(finishAiEditRequest(
      beginAiEditRequest(setAiEditMessage(createAiEditSession(revision, original), "Yêu cầu")),
      { kind: "RESULT", result: proposal("VIOLATION") },
    ))).toBe(false);
    expect(canConfirmAiEdit(finishAiEditRequest(
      beginAiEditRequest(setAiEditMessage(createAiEditSession(revision, original), "Yêu cầu")),
      { kind: "RESULT", result: proposal("INSUFFICIENT_DATA") },
    ))).toBe(false);
  });

  it("discards a proposal locally without producing an apply payload", () => {
    const cancelled = cancelAiEditProposal(proposedSession());

    expect(cancelled.status).toBe("IDLE");
    expect(cancelled.result).toBeNull();
    expect(cancelled.baseRevision).toBe(revision);
    expect(cancelled.pendingApply).toBeNull();
  });

  it("retains the same key and payload when retrying an UNKNOWN apply", () => {
    const begun = beginAiEditApply(proposedSession(), "ai-key-1");
    const unknown = finishAiEditApply(begun, {
      status: "UNKNOWN",
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Retry" },
      retryWithSameKey: true,
    });
    const retried = retryUnknownAiEditApply(unknown);

    expect(retried.status).toBe("APPLYING");
    expect(canConfirmAiEdit(unknown)).toBe(true);
    expect(retried.pendingApply).toEqual(begun.pendingApply);
    expect(retried.pendingApply?.idempotencyKey).toBe("ai-key-1");
    expect(retried.pendingApply?.payload).toEqual(begun.pendingApply?.payload);
  });

  it("updates base revision only after SUCCESS and retains proposal after conflict", () => {
    const begun = beginAiEditApply(proposedSession(), "ai-key-2");
    const applied = finishAiEditApply(begun, success());
    expect(applied.status).toBe("APPLIED");
    expect(applied.baseRevision).toBe(nextRevision);
    expect(applied.baselineCandidate).toEqual(candidate);
    expect(applied.result).toBeNull();

    const request = createAiEditRequestInput(proposedSession(), { selectedVisitId: "visit-1" });
    expect(request).toEqual({ baseRevision: revision, message: "Đổi giờ đi", resolution: { selectedVisitId: "visit-1" } });

    const conflict: MutationOutcome<ApplyEditResult> = {
      status: "FAILED",
      httpStatus: 409,
      error: { code: "TRIP_REVISION_CONFLICT", message: "Hành trình đã đổi." },
    };
    const failed = finishAiEditApply(begun, conflict);
    expect(failed.status).toBe("APPLY_FAILED");
    expect(failed.result?.status).toBe("PROPOSED");
    expect(failed.result?.status === "PROPOSED" && failed.result.candidate).toEqual(candidate);
    expect(canConfirmAiEdit(failed)).toBe(false);
    expect(beginAiEditRecheck(failed).status).toBe("CHECKING");
  });
});
