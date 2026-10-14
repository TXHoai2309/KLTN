import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ClarificationRequest } from "./trip-clarification-rules";
import {
  advisoryCount,
  blockingCount,
  canConfirm,
  firstBlockingFieldKey,
  mergeClarificationRequests,
} from "./trip-clarification-logic";
import { draftFromFormFields, type TripRequirementReviewDraft } from "./trip-requirement-review";
import type { TripRequirementFormFields } from "./trip-requirement-form-logic";

const NOW = new Date("2026-10-12T03:00:00Z");

const fullFields: TripRequirementFormFields = {
  startDate: "2026-10-20",
  durationDays: "3",
  transport: "MOTORCYCLE",
  companionType: "COUPLE",
  companionGroupSize: "2",
  interests: ["NATURE"],
  pace: "RELAXED",
  mobilityFlags: [],
  mobilityNote: "",
};

function request(
  overrides: Partial<ClarificationRequest> & Pick<ClarificationRequest, "id" | "field" | "severity">,
): ClarificationRequest {
  return {
    kind: "MISSING",
    question: `Cần làm rõ ${overrides.field}.`,
    sourceText: null,
    resolution: { type: "ENTER_VALUE" },
    ...overrides,
  };
}

function draft(fields: Partial<TripRequirementFormFields> = {}): TripRequirementReviewDraft {
  return draftFromFormFields({ ...fullFields, ...fields });
}

describe("US27-FE-CLARIFY clarification logic", () => {
  it("dedupes by id, lets check data win, and orders blocking fields first", () => {
    const analyze = request({
      id: "transport:UNSUPPORTED",
      field: "transport",
      severity: "ADVISORY",
      question: "AI wording",
    });
    const check = request({
      id: "transport:UNSUPPORTED",
      field: "transport",
      severity: "BLOCKING",
      question: "Server wording",
    });
    const result = mergeClarificationRequests(
      [analyze, request({ id: "pace:AMBIGUOUS", field: "pace", severity: "ADVISORY" })],
      [check, request({ id: "durationDays:MISSING", field: "durationDays", severity: "BLOCKING" })],
      { draft: draft({ durationDays: "", transport: "" }) },
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual([
      "durationDays:MISSING",
      "transport:UNSUPPORTED",
      "pace:AMBIGUOUS",
    ]);
    expect(result[1]?.question).toBe("Server wording");
    expect(blockingCount(result)).toBe(2);
    expect(advisoryCount(result)).toBe(1);
    expect(firstBlockingFieldKey(result)).toBe("durationDays");
  });

  it("removes a blocking request after its field becomes valid and restores it when cleared", () => {
    const missing = request({ id: "durationDays:MISSING", field: "durationDays", severity: "BLOCKING" });
    const requests = [missing];
    expect(mergeClarificationRequests(requests, [], { draft: draft({ durationDays: "" }) }, NOW)).toHaveLength(1);
    expect(mergeClarificationRequests(requests, [], { draft: draft() }, NOW)).toEqual([]);
    expect(mergeClarificationRequests(requests, [], { draft: draft({ durationDays: "" }) }, NOW)).toHaveLength(1);
  });

  it("does not treat an invalid/past start date as resolved", () => {
    const startDate = request({ id: "startDate:INVALID", field: "startDate", severity: "BLOCKING" });
    expect(mergeClarificationRequests([startDate], [], { draft: draft({ startDate: "2026-10-11" }) }, NOW)).toHaveLength(1);
    expect(mergeClarificationRequests([startDate], [], { draft: draft({ startDate: "2026-10-20" }) }, NOW)).toEqual([]);
  });

  it("keeps a cross-field companion blocker until the US-26 rule is clear", () => {
    const companions = request({ id: "companions:CONFLICT", field: "companions", severity: "BLOCKING" });
    const conflicting = draft({ companionType: "SOLO", companionGroupSize: "1", mobilityFlags: ["YOUNG_CHILDREN"] });
    expect(mergeClarificationRequests([companions], [], { draft: conflicting }, NOW)).toHaveLength(1);
    const resolved = draft({ companionType: "COUPLE", companionGroupSize: "2", mobilityFlags: ["YOUNG_CHILDREN"] });
    expect(mergeClarificationRequests([companions], [], { draft: resolved }, NOW)).toEqual([]);
  });

  it("honors in-memory advisory dismissal while keeping blocking requests non-dismissible", () => {
    const advisory = request({ id: "pace:AMBIGUOUS", field: "pace", severity: "ADVISORY" });
    const blocking = request({ id: "transport:MISSING", field: "transport", severity: "BLOCKING" });
    const result = mergeClarificationRequests(
      [advisory, blocking],
      [],
      { draft: draft({ transport: "" }), dismissedAdvisoryIds: [advisory.id, blocking.id] },
      NOW,
    );
    expect(result.map((item) => item.id)).toEqual([blocking.id]);
  });

  it.each([
    [{ acknowledged: false, editingKey: null, isChecking: false }, false],
    [{ acknowledged: true, editingKey: "durationDays", isChecking: false }, false],
    [{ acknowledged: true, editingKey: null, isChecking: true }, false],
    [{ acknowledged: true, editingKey: null, isChecking: false }, true],
  ] as const)("canConfirm applies the US-26 gates (%j)", (state, expected) => {
    expect(canConfirm([], state)).toBe(expected);
  });

  it("keeps CHOOSE_ONE contract data free of a default selection", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/trips/new/trip-clarification-panel.tsx"), "utf8");
    expect(source).not.toContain("defaultValue");
    expect(source).not.toContain("selected=");
    expect(source).toContain('type="radio"');
    expect(source).toContain("checked={selectedChoice === option.value}");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("mục bắt buộc ·");
    expect(source).toContain("!isBlocking");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("OpenAI");
    expect(source).not.toMatch(/>\s*Tạo hành trình\s*</);
  });
});

