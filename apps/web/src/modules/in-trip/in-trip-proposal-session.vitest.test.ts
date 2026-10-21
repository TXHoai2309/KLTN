import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { InTripLocation } from "./in-trip-location";
import {
  beginInTripApply,
  beginInTripPreview,
  beginInTripReplan,
  canConfirmInTrip,
  cancelInTripProposal,
  createInTripAssistantState,
  finishInTripApply,
  finishInTripPreview,
  finishInTripReplan,
  retryUnknownInTripApply,
  updateInTripAssistantInput,
  validateInTripNeed,
} from "./in-trip-session";
import type { TripValidation } from "../trip-validation/trip-validation";

const location: InTripLocation = {
  source: "MANUAL",
  latitude: 22.8233,
  longitude: 104.9836,
  accuracyMeters: null,
  capturedAt: "2026-10-17T12:00:00.000Z",
};

const candidate = {
  startDate: "2026-10-17",
  durationDays: 1,
  transport: "CAR" as const,
  days: [{ dayIndex: 1, visits: [] }],
};

function validation(status: "SATISFIED" | "VIOLATION" | "INSUFFICIENT_DATA" = "SATISFIED"): TripValidation {
  const finding = status === "SATISFIED" ? [] : [{
    group: "travelTime" as const,
    status,
    reasonCode: status,
    message: "Kiểm tra chưa đạt.",
  }];
  return {
    timeReference: "2026-10-17T12:00:00.000Z",
    groups: {
      openingHours: { status: "SATISFIED", findings: [] },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: { status, findings: finding },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: status === "SATISFIED",
  };
}

function checkedState(checks = validation()) {
  const entered = updateInTripAssistantInput(createInTripAssistantState("HAS_REMAINING"), {
    location,
    need: "Tìm chỗ nghỉ",
  });
  const requesting = beginInTripReplan(entered);
  const proposed = finishInTripReplan(requesting, { kind: "RESPONSE", data: {
    status: "PROPOSED",
    candidate,
    diff: { added: [], removed: [], updated: [], tripChanges: {} },
    completedVisitIds: [],
    mandatoryEndpoint: null,
  } });
  const checking = beginInTripPreview(proposed);
  return finishInTripPreview(checking, { status: "SUCCESS", data: {
    validation: checks,
    checkedAt: "2026-10-17T12:00:00.000Z",
    completedVisitIds: [],
  } });
}

describe("US36 Task291 proposal state", () => {
  it("counts the 500-character request limit by Unicode code point like the API", () => {
    expect(validateInTripNeed("🙂".repeat(500)).valid).toBe(true);
    expect(validateInTripNeed("🙂".repeat(501))).toEqual({ valid: false, reason: "TOO_LONG" });
  });

  it("shows proposed, clarification, all-completed, and AI failure as separate states", () => {
    const initial = createInTripAssistantState("HAS_REMAINING");
    const requesting = beginInTripReplan(updateInTripAssistantInput(initial, {
      location,
      need: "Tìm chỗ nghỉ",
    }));

    const proposed = finishInTripReplan(requesting, { kind: "RESPONSE", data: {
      status: "PROPOSED",
      candidate: {
        startDate: "2026-10-17",
        durationDays: 1,
        transport: "CAR",
        days: [{ dayIndex: 1, visits: [] }],
      },
      diff: { added: [], removed: [], updated: [], tripChanges: {} },
      completedVisitIds: ["visit-done"],
      mandatoryEndpoint: { destinationId: "destination-final", deadline: "18:30" },
    } });
    expect(proposed.proposal.status).toBe("PROPOSED");

    const clarification = finishInTripReplan(requesting, { kind: "RESPONSE", data: {
      status: "NEEDS_CLARIFICATION",
      clarificationReason: "MISSING_TARGET",
      clarification: { code: "MISSING_TARGET", prompt: "Bạn muốn chỉnh sửa lượt nào?" },
    } });
    expect(clarification.proposal.status).toBe("NEEDS_CLARIFICATION");

    const allCompleted = finishInTripReplan(requesting, { kind: "RESPONSE", data: { status: "ALL_COMPLETED" } });
    expect(allCompleted.proposal.status).toBe("ALL_COMPLETED");

    const aiError = finishInTripReplan(requesting, {
      kind: "AI_ERROR",
      code: "AI_UNAVAILABLE",
      message: "Dịch vụ AI hiện chưa sẵn sàng.",
    });
    expect(aiError.proposal.status).toBe("AI_ERROR");
  });

  it("retains the entered need and location after network errors and timeouts", () => {
    const entered = updateInTripAssistantInput(createInTripAssistantState("HAS_REMAINING"), {
      location,
      need: "Muốn nghỉ gần đây",
    });
    const requesting = beginInTripReplan(entered);
    const networkError = finishInTripReplan(requesting, { kind: "NETWORK_ERROR" });
    expect(networkError.session).toEqual(entered.session);
    expect(networkError.session.location).toEqual(location);
    expect(networkError.session.need).toBe("Muốn nghỉ gần đây");

    const timeout = finishInTripReplan(requesting, { kind: "TIMEOUT" });
    expect(timeout.session).toEqual(entered.session);
  });

  it("invalidates an old proposal when need or location changes", () => {
    const entered = updateInTripAssistantInput(createInTripAssistantState("HAS_REMAINING"), {
      location,
      need: "Tìm chỗ nghỉ",
    });
    const requesting = beginInTripReplan(entered);
    const proposed = finishInTripReplan(requesting, { kind: "RESPONSE", data: { status: "ALL_COMPLETED" } });

    expect(updateInTripAssistantInput(proposed, { need: "Tìm chỗ ăn" }).proposal.status).toBe("IDLE");
    expect(updateInTripAssistantInput(proposed, { location: null }).proposal.status).toBe("IDLE");
  });

  it("connects preview and confirmation while keeping location out of URLs", () => {
    const source = readFileSync(
      new URL("../../components/in-trip/in-trip-assistant.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("previewInTrip");
    expect(source).toContain("applyInTrip");
    expect(source).toContain("Xác nhận");
    expect(source).toContain("Đề xuất chưa áp dụng");
    expect(source).toContain("Kiểm tra lúc");
    expect(source).toContain("Kiểm tra lại");
    expect(source).toContain("cancelInTripProposal");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|console\.(?:log|info|warn|error)/u);
  });

  it("enables confirmation only for a current preview with all four PASS groups", () => {
    expect(canConfirmInTrip(checkedState())).toBe(true);
    expect(canConfirmInTrip(checkedState(validation("INSUFFICIENT_DATA")))).toBe(false);
    const checked = checkedState();
    expect(canConfirmInTrip(updateInTripAssistantInput(checked, { need: "Tìm chỗ ăn" }))).toBe(false);
    expect(canConfirmInTrip(updateInTripAssistantInput(checked, { location: { ...location, latitude: 22.9 } }))).toBe(false);
  });

  it("keeps exact key and payload for UNKNOWN retry", () => {
    const applying = beginInTripApply(checkedState(), "2026-10-17T10:00:00.000Z", "key-once");
    const unknown = finishInTripApply(applying, {
      status: "UNKNOWN",
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "unknown" },
      retryWithSameKey: true,
    });
    const retrying = retryUnknownInTripApply(unknown);
    expect(retrying.apply).toEqual({
      status: "APPLYING",
      pending: { idempotencyKey: "key-once", payload: applying.apply.status === "APPLYING" ? applying.apply.pending.payload : null },
    });
  });

  it("keeps a rejected proposal and fresh validation visible until rechecked", () => {
    const applying = beginInTripApply(checkedState(), "2026-10-17T10:00:00.000Z", "key-reject");
    const rejected = finishInTripApply(applying, {
      status: "FAILED",
      error: { code: "TRIP_VALIDATION_FAILED", message: "Kết quả đã đổi." },
      validation: validation("VIOLATION"),
      checkedAt: "2026-10-17T12:01:00.000Z",
    });
    expect(rejected.proposal.status).toBe("PROPOSED");
    expect(rejected.apply).toMatchObject({ status: "FAILED", validation: { canConfirm: false } });
    expect(canConfirmInTrip(rejected)).toBe(false);
  });

  it("records the new server baseRevision only after SUCCESS", () => {
    const applying = beginInTripApply(checkedState(), "2026-10-17T10:00:00.000Z", "key-success");
    const saved = finishInTripApply(applying, {
      status: "SUCCESS",
      data: {
        tripId: "trip-1",
        baseRevision: "2026-10-17T12:05:00.000Z",
        candidate,
        kind: "IN_TRIP",
        validation: validation(),
      },
    });
    expect(saved.apply).toEqual({ status: "SUCCESS", baseRevision: "2026-10-17T12:05:00.000Z" });
  });

  it("discards locally without calling the apply API", () => {
    const cancelled = cancelInTripProposal(checkedState());
    expect(cancelled.proposal.status).toBe("IDLE");
    const source = readFileSync(new URL("../../components/in-trip/in-trip-assistant.tsx", import.meta.url), "utf8");
    const cancelHandler = source.match(/function cancelProposal\(\) \{([\s\S]*?)\n  \}/u)?.[1] ?? "";
    expect(cancelHandler).toContain("cancelInTripProposal");
    expect(cancelHandler).not.toMatch(/applyInTrip|sendIdempotentMutation/u);
  });
});
