import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { InTripLocation } from "./in-trip-location";
import {
  beginInTripReplan,
  createInTripAssistantState,
  finishInTripReplan,
  updateInTripAssistantInput,
  validateInTripNeed,
} from "./in-trip-session";

const location: InTripLocation = {
  source: "MANUAL",
  latitude: 22.8233,
  longitude: 104.9836,
  accuracyMeters: null,
  capturedAt: "2026-10-17T12:00:00.000Z",
};

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

  it("keeps the in-trip panel read-only with no apply endpoint or confirmation control", () => {
    const source = readFileSync(
      new URL("../../components/in-trip/in-trip-assistant.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/apply-edit|\/edits\/apply|Xác nhận/u);
    expect(source).toContain("Chưa được kiểm tra bởi Validator");
    expect(source).toContain("Đề xuất chưa áp dụng");
  });
});
