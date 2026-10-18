import { describe, expect, it } from "vitest";

import type { TripEditPreviewOutcome } from "@/lib/trip-edit-client";
import type { EditCandidate } from "./edit-candidate";
import {
  beginEditPreview,
  canConfirmEditPreview,
  finishEditPreview,
  invalidateEditPreviewForCandidateChange,
} from "./edit-preview-state";
import type { PreviewEditResult } from "./trip-edit-service";

const candidate: EditCandidate = {
  startDate: "2026-10-20",
  durationDays: 1,
  transport: "CAR",
  days: [{
    dayIndex: 1,
    visits: [{
      visitId: "visit-1",
      destinationId: "destination-1",
      startMinute: 480,
      plannedDurationMinutes: 60,
      order: 1,
    }],
  }],
};

function result(overrides: Partial<PreviewEditResult["validation"]["groups"]> = {}): PreviewEditResult {
  const groups: PreviewEditResult["validation"]["groups"] = {
    openingHours: { status: "SATISFIED", findings: [] },
    minimumDuration: { status: "SATISFIED", findings: [] },
    travelTime: { status: "SATISFIED", findings: [] },
    scheduleConflict: { status: "SATISFIED", findings: [] },
    ...overrides,
  };
  return {
    baseRevision: "2026-10-16T10:00:00.000Z",
    candidate,
    validation: { timeReference: "2026-10-16T10:00:00.000Z", groups, canConfirm: Object.values(groups).every((group) => group.status === "SATISFIED") },
    eligibleForConfirmation: Object.values(groups).every((group) => group.status === "SATISFIED"),
  };
}

function previewOutcome(preview: PreviewEditResult): TripEditPreviewOutcome {
  return { kind: "PREVIEWED", result: preview };
}

describe("edit preview state", () => {
  it("enables confirmation only when a current result has four passing checks", () => {
    const pass = finishEditPreview(candidate, candidate, previewOutcome(result()), result().baseRevision);
    expect(canConfirmEditPreview(candidate, pass)).toBe(true);

    const violationResult = result({
      openingHours: { status: "VIOLATION", findings: [{
        group: "openingHours",
        status: "VIOLATION",
        reasonCode: "OUTSIDE_OPENING_HOURS",
        message: "Lượt tham quan nằm ngoài giờ hoạt động.",
        affectedVisitId: "visit-1",
      }] },
    });
    const violation = finishEditPreview(candidate, candidate, previewOutcome(violationResult), violationResult.baseRevision);
    expect(canConfirmEditPreview(candidate, violation)).toBe(false);

    const insufficient = result({ travelTime: { status: "INSUFFICIENT_DATA", findings: [{
      group: "travelTime",
      status: "INSUFFICIENT_DATA",
      reasonCode: "ROUTE_UNAVAILABLE",
      message: "Thiếu thời gian di chuyển cho chặng này.",
      fromVisitId: "visit-1",
      toVisitId: "visit-2",
    }] } });
    expect(canConfirmEditPreview(candidate, finishEditPreview(candidate, candidate, previewOutcome(insufficient), insufficient.baseRevision))).toBe(false);
  });

  it("invalidates a successful result when the candidate changes", () => {
    const checked = finishEditPreview(candidate, candidate, previewOutcome(result()), result().baseRevision);
    const changedCandidate: EditCandidate = {
      ...candidate,
      days: [{
        ...candidate.days[0]!,
        visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 540 }],
      }],
    };

    expect(canConfirmEditPreview(changedCandidate, checked)).toBe(false);
    const invalidated = invalidateEditPreviewForCandidateChange(candidate, changedCandidate, checked);
    expect(invalidated.status).toBe("IDLE");
    expect(invalidated.result).toBeNull();
    expect(canConfirmEditPreview(changedCandidate, invalidated)).toBe(false);
  });

  it("ignores a late result for a candidate that is no longer current", () => {
    const changedCandidate: EditCandidate = {
      ...candidate,
      days: [{ ...candidate.days[0]!, visits: [{ ...candidate.days[0]!.visits[0]!, startMinute: 600 }] }],
    };
    const late = finishEditPreview(changedCandidate, candidate, previewOutcome(result()), result().baseRevision);
    expect(late.status).toBe("IDLE");
    expect(late.result).toBeNull();
  });

  it("rejects a response that does not match the requested base revision", () => {
    const preview = result();
    const mismatched = finishEditPreview(candidate, candidate, previewOutcome(preview), "2026-10-16T11:00:00.000Z");
    expect(mismatched.status).toBe("FAILED");
    expect(mismatched.error?.code).toBe("INVALID_RESPONSE");
    expect(canConfirmEditPreview(candidate, mismatched)).toBe(false);
  });

  it("starts a fresh check without retaining an old confirmation result", () => {
    const checking = beginEditPreview();
    expect(checking.status).toBe("CHECKING");
    expect(checking.result).toBeNull();
  });
});
