import { describe, expect, it } from "vitest";

import type { MutationOutcome } from "@/lib/mutation-contract";
import type { ApplyEditResult } from "./apply-edit";
import {
  beginEditApply,
  cancelEditApply,
  createEditApplyState,
  finishEditApply,
  retryUnknownEditApply,
  updateEditApplyCandidate,
} from "./edit-apply-state";
import type { EditCandidate } from "./edit-candidate";

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
const changed: EditCandidate = {
  ...original,
  days: [{ dayIndex: 1, visits: [{ ...original.days[0]!.visits[0]!, startMinute: 540 }] }],
};

function success(): MutationOutcome<ApplyEditResult> {
  return {
    status: "SUCCESS",
    data: {
      tripId: "trip-1",
      baseRevision: nextRevision,
      kind: "MANUAL",
      candidate: changed,
      validation: {
        timeReference: revision,
        groups: {
          openingHours: { status: "SATISFIED", findings: [] },
          minimumDuration: { status: "SATISFIED", findings: [] },
          travelTime: { status: "SATISFIED", findings: [] },
          scheduleConflict: { status: "SATISFIED", findings: [] },
        },
        canConfirm: true,
      },
    },
  };
}

describe("edit apply state", () => {
  it("discards a candidate locally on cancel and leaves no request to send", () => {
    const edited = updateEditApplyCandidate(createEditApplyState(revision, original), changed);
    const cancelled = cancelEditApply(edited);

    expect(cancelled.candidate).toEqual(original);
    expect(cancelled.baseRevision).toBe(revision);
    expect(cancelled.pending).toBeNull();
    expect(cancelled.status).toBe("IDLE");
  });

  it("keeps the same key and payload when retrying UNKNOWN", () => {
    const begun = beginEditApply(createEditApplyState(revision, changed), "key-1");
    const unknown = finishEditApply(begun, {
      status: "UNKNOWN",
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Retry" },
      retryWithSameKey: true,
    });
    const retry = retryUnknownEditApply(unknown);

    expect(cancelEditApply(unknown)).toBe(unknown);
    expect(retry.status).toBe("SENDING");
    expect(retry.pending).toEqual(begun.pending);
    expect(retry.pending?.idempotencyKey).toBe("key-1");
    expect(retry.pending?.payload).toEqual(begun.pending?.payload);
  });

  it("updates the base revision only after SUCCESS", () => {
    const begun = beginEditApply(createEditApplyState(revision, changed), "key-2");
    const applied = finishEditApply(begun, success());

    expect(applied.status).toBe("IDLE");
    expect(applied.baseRevision).toBe(nextRevision);
    expect(applied.baselineCandidate).toEqual(changed);
    expect(applied.candidate).toEqual(changed);
    expect(applied.pending).toBeNull();
  });

  it("keeps the candidate and old revision after a 409", () => {
    const begun = beginEditApply(createEditApplyState(revision, changed), "key-3");
    const conflict: MutationOutcome<ApplyEditResult> = {
      status: "FAILED",
      httpStatus: 409,
      error: { code: "TRIP_REVISION_CONFLICT", message: "Trip changed" },
    };
    const failed = finishEditApply(begun, conflict);

    expect(failed.status).toBe("FAILED");
    expect(failed.candidate).toEqual(changed);
    expect(failed.baseRevision).toBe(revision);
    expect(failed.pending).toBeNull();
    expect(failed.error?.code).toBe("TRIP_REVISION_CONFLICT");
  });
});
