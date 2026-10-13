import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractionResultSchema,
  type ExtractionResult,
} from "../preference-extraction/preference-extraction-contract";
import type { CheckResult } from "./trip-requirement-check";
import {
  applyFieldEdit,
  clearField,
  confirmDraft,
  draftFromExtraction,
  draftFromFormFields,
  draftToCandidate,
  draftToFormFields,
  countReviewIssues,
  countReviewValues,
  countUnactionedAiFields,
  listMissingRequiredFields,
  invalidateConfirmation,
  hasUserTransportNormalizationMismatch,
  REVIEW_FIELD_KEYS,
  restoreAiValue,
  type ReviewFieldKey,
  type ReviewRawFieldValue,
} from "./trip-requirement-review";
import { tripRequirementInputSchema } from "./trip-requirement-contract";
import type { TripRequirementFormFields } from "./trip-requirement-form-logic";

const fullForm: TripRequirementFormFields = {
  startDate: "2026-10-20",
  durationDays: "3",
  transport: "MOTORCYCLE",
  companionType: "COUPLE",
  companionGroupSize: "2",
  interests: ["NATURE", "FOOD"],
  pace: "RELAXED",
  mobilityFlags: ["AVOID_LONG_WALKING"],
  mobilityNote: "Nghỉ giữa chặng",
};

const extractionValues = {
  startDate: "2026-10-20",
  durationDays: 3,
  companions: { type: "COUPLE", groupSize: 2 },
  interests: ["NATURE", "FOOD"],
  pace: "RELAXED",
  transport: "MOTORCYCLE",
  mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: "Nghỉ giữa chặng" },
} as const;

function resultForStatus(
  status: "EXTRACTED" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED",
): ExtractionResult {
  const fields = Object.fromEntries(
    REVIEW_FIELD_KEYS.map((field) => {
      if (status === "MISSING") {
        return [field, { status, value: null, sourceText: null, note: null }];
      }
      if (status === "EXTRACTED") {
        return [field, { status, value: extractionValues[field], sourceText: `nguồn ${field}`, note: null }];
      }
      return [field, { status, value: null, sourceText: `mơ hồ ${field}`, note: `Ghi chú ${field}` }];
    }),
  );
  const clarifications = status === "AMBIGUOUS" || status === "UNSUPPORTED"
    ? REVIEW_FIELD_KEYS.map((field) => ({
        field,
        reason: "OTHER" as const,
        message: `Server yêu cầu xử lý ${field}.`,
        sourceText: `mơ hồ ${field}`,
      }))
    : [];
  const missingRequired = status === "EXTRACTED" ? [] : ["durationDays", "transport"] as const;
  return extractionResultSchema.parse({
    fields,
    clarifications,
    missingRequired,
    meta: { model: "review-test", latencyMs: 0, inputLength: 80 },
  });
}

describe("US26-FE-REVIEW review draft", () => {
  it.each(["EXTRACTED", "AMBIGUOUS", "MISSING", "UNSUPPORTED"] as const)(
    "maps %s across all seven fields without changing the fixed order",
    (status) => {
      const draft = draftFromExtraction(resultForStatus(status));
      expect(Object.keys(draft.fields)).toEqual([...REVIEW_FIELD_KEYS]);
      for (const field of REVIEW_FIELD_KEYS) {
        expect(draft.fields[field].aiStatus).toBe(status);
        expect(draft.fields[field].key).toBe(field);
        if (status === "EXTRACTED") {
          expect(draft.fields[field].origin).toBe("AI");
          expect(draft.fields[field].value).toEqual(extractionValues[field]);
          expect(draft.fields[field].aiValue).toEqual(extractionValues[field]);
        } else {
          expect(draft.fields[field].origin).toBe("EMPTY");
          expect(draft.fields[field].value).toBeNull();
          expect(draft.fields[field].aiValue).toBeNull();
          expect(draft.fields[field].sourceText).toBe(status === "MISSING" ? null : `mơ hồ ${field}`);
        }
      }
    },
  );

  it.each([
    ["UNSUPPORTED", "xe đạp"],
    ["AMBIGUOUS", "grab"],
    ["AMBIGUOUS", "xe máy hoặc ô tô"],
    ["MISSING", null],
  ] as const)("keeps transport empty for %s source %s", (status, sourceText) => {
    const result = extractionResultSchema.parse({
      ...resultForStatus("EXTRACTED"),
      fields: {
        ...resultForStatus("EXTRACTED").fields,
        transport: { status, value: null, sourceText, note: null },
      },
      missingRequired: ["transport"],
    });
    const draft = draftFromExtraction(result);
    expect(draft.fields.transport.value).toBeNull();
    expect(draft.fields.transport.aiValue).toBeNull();
    expect(draft.fields.transport.sourceText).toBe(sourceText);
  });

  it("keeps server clarification messages as review issues for ambiguous and unsupported values", () => {
    for (const status of ["AMBIGUOUS", "UNSUPPORTED"] as const) {
      const draft = draftFromExtraction(resultForStatus(status));
      for (const field of REVIEW_FIELD_KEYS) {
        expect(draft.fields[field].issues).toEqual([
          {
            code: "OTHER",
            field,
            severity: "WARNING",
            message: `Server yêu cầu xử lý ${field}.`,
          },
        ]);
      }
    }
  });

  it("maps controlled US-24 form values to USER/EMPTY and canonical candidate values", () => {
    const draft = draftFromFormFields(fullForm);
    expect(REVIEW_FIELD_KEYS.every((field) => draft.fields[field].origin === "USER")).toBe(true);
    expect(countReviewValues(draft)).toBe(7);
    expect(countUnactionedAiFields(draft)).toBe(0);
    expect(listMissingRequiredFields(draft)).toEqual([]);
    expect(countReviewIssues(draft)).toBe(0);
    expect(tripRequirementInputSchema.safeParse(draftToCandidate(draft)).success).toBe(true);

    const empty = draftFromFormFields({
      ...fullForm,
      startDate: "",
      companionType: "",
      interests: [],
      pace: "",
      mobilityFlags: [],
      mobilityNote: "",
    });
    expect(empty.fields.startDate.origin).toBe("EMPTY");
    expect(empty.fields.companions.origin).toBe("EMPTY");
    expect(empty.fields.interests.origin).toBe("EMPTY");
    expect(empty.fields.pace.origin).toBe("EMPTY");
    expect(empty.fields.mobilityConstraints.origin).toBe("EMPTY");
  });

  it("never coerces an unsupported transport into MOTORCYCLE or CAR", () => {
    const draft = draftFromFormFields({ ...fullForm, transport: "BICYCLE" });
    const candidate = draftToCandidate(draft);
    expect(draft.fields.transport.value).toBeNull();
    expect(candidate.transport).not.toBe("MOTORCYCLE");
    expect(candidate.transport).not.toBe("CAR");
    expect(draft.fields.transport.issues[0]).toMatchObject({
      field: "transport",
      severity: "ERROR",
    });
  });

  it("keeps an explicit user choice when the server normalization disagrees", () => {
    const draft = draftFromFormFields(fullForm);
    const serverRequirement = tripRequirementInputSchema.parse({
      ...draftToCandidate(draft),
      transport: "CAR",
    });
    expect(draft.fields.transport.value).toBe("MOTORCYCLE");
    expect(hasUserTransportNormalizationMismatch(draft, serverRequirement)).toBe(true);
    expect(draft.fields.transport.value).toBe("MOTORCYCLE");
  });

  it("edits every review field through the shared form contract and preserves AI provenance", () => {
    const draft = draftFromExtraction(resultForStatus("EXTRACTED"));
    const now = new Date("2026-10-12T03:00:00.000Z");
    const edits: Array<[ReviewFieldKey, ReviewRawFieldValue]> = [
      ["startDate", "2026-10-21"],
      ["durationDays", "4"],
      ["companions", { type: "SOLO", groupSize: "1" }],
      ["interests", ["FOOD", "FOOD", "NATURE"]],
      ["pace", "PACKED"],
      ["transport", "CAR"],
      ["mobilityConstraints", { flags: ["SENIORS", "SENIORS"], note: "Cần nghỉ giữa chặng" }],
    ];

    let current = draft;
    for (const [key, value] of edits) {
      const result = applyFieldEdit(current, key, value, now);
      expect(result.ok).toBe(true);
      if (result.ok) current = result.draft;
    }

    expect(current.fields.transport.value).toBe("CAR");
    expect(current.fields.transport.aiValue).toBe("MOTORCYCLE");
    expect(current.fields.transport.origin).toBe("USER");
    expect(current.fields.transport.edited).toBe(true);
    expect(current.fields.interests.value).toEqual(["NATURE", "FOOD"]);
    expect(current.fields.mobilityConstraints.value).toEqual({ flags: ["SENIORS"], note: "Cần nghỉ giữa chặng" });
    expect(draftToFormFields(current)).toMatchObject({ durationDays: "4", transport: "CAR" });
  });

  it("allows filling AI-empty/ambiguous fields and keeps a failed edit out of the draft", () => {
    const now = new Date("2026-10-12T03:00:00.000Z");
    for (const status of ["MISSING", "AMBIGUOUS"] as const) {
      const draft = draftFromExtraction(resultForStatus(status));
      const result = applyFieldEdit(draft, "transport", "MOTORCYCLE", now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.draft.fields.transport.value).toBe("MOTORCYCLE");
        expect(result.draft.fields.transport.origin).toBe("USER");
        expect(result.draft.fields.transport.edited).toBe(true);
      }
    }

    const draft = draftFromFormFields(fullForm);
    const failed = applyFieldEdit(draft, "durationDays", "15", now);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.errors.durationDays).toBe("Thời lượng tối đa là 14 ngày.");
    expect(failed.draft).toBe(draft);
  });

  it("validates date, companions, and optional note without changing other fields", () => {
    const now = new Date("2026-10-09T17:00:00.000Z");
    const draft = draftFromFormFields(fullForm);
    const dateCases = [
      ["", true],
      ["2026-02-30", false],
      ["10/10/2026", false],
      ["2026-10-09", false],
      ["2026-10-10", true],
    ] as const;
    for (const [value, valid] of dateCases) {
      const result = applyFieldEdit(draft, "startDate", value, now);
      expect(result.ok).toBe(valid);
    }

    const invalidCompanions = applyFieldEdit(draft, "companions", { type: "SOLO", groupSize: "3" }, now);
    expect(invalidCompanions.ok).toBe(false);
    if (!invalidCompanions.ok) expect(invalidCompanions.errors["companions.groupSize"]).toContain("Số người");

    const invalidNote = applyFieldEdit(draft, "mobilityConstraints", {
      flags: [],
      note: "x".repeat(501),
    }, now);
    expect(invalidNote.ok).toBe(false);
    if (!invalidNote.ok) expect(invalidNote.errors["mobilityConstraints.note"]).toContain("500");
  });

  it("supports clear/restore semantics and always resets confirmation", () => {
    const draft = draftFromExtraction(resultForStatus("EXTRACTED"));
    const cleared = clearField(draft, "startDate");
    expect(cleared.fields.startDate).toMatchObject({ value: null, origin: "EMPTY", edited: true });
    expect(cleared.fields.startDate.aiValue).toBe("2026-10-20");

    const edited = applyFieldEdit(draft, "transport", "CAR", new Date("2026-10-12T03:00:00.000Z"));
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.confirmation).toBe("NOT_CONFIRMED");
      const restored = restoreAiValue(edited.draft, "transport");
      expect(restored.fields.transport.value).toBe("MOTORCYCLE");
      expect(restored.fields.transport.origin).toBe("AI");
      expect(restored.fields.transport.edited).toBe(false);
    }
    const ambiguous = draftFromExtraction(resultForStatus("AMBIGUOUS"));
    expect(restoreAiValue(ambiguous, "transport")).toBe(ambiguous);
  });

  it("keeps shared editor controls accessible and free of browser storage", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/trips/new/trip-field-editors.tsx"), "utf8");
    expect(source).toContain("aria-describedby");
    expect(source).toContain("role=\"alert\"");
    expect(source).toContain("Ngày bắt đầu");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("keeps the review screen client-safe and without confirmation/create/storage actions", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/trips/new/trip-review-screen.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/dangerouslySetInnerHTML|localStorage|sessionStorage|history\./u);
    expect(source).not.toContain("Tạo hành trình");
    expect(source).toContain("Xác nhận nhu cầu");
    expect(source).toContain("checkTripRequirement");
    expect(source).toContain("AbortController");
    expect(source).toContain("onConfirmed");
    expect(source).toContain("aria-busy");
    expect(source).toContain("required");
    expect(source).toContain("Quay lại chỉnh sửa trong biểu mẫu");
    expect(source).toContain("AI chỉ gợi ý");
    expect(source).toContain("aria-live=\"polite\"");
  });

  it("confirms only an authoritative confirmable result and syncs server normalization", () => {
    const draft = draftFromExtraction(resultForStatus("EXTRACTED"));
    const result: CheckResult = {
      requirement: tripRequirementInputSchema.parse({
        ...extractionValues,
        startDate: "2026-10-21",
        interests: ["FOOD", "NATURE"],
      }),
      issues: [{
        code: "PACE_MOBILITY_MISMATCH" as const,
        field: "pace" as const,
        severity: "WARNING" as const,
        message: "Cần cân nhắc nhịp độ.",
      }],
      confirmable: true,
      readiness: {
        preliminary: true,
        finalConfirmation: true,
        missing: [],
        startDateIssue: null,
        usesRelativeDays: false,
      },
      usesRelativeDays: false,
    };
    const confirmed = confirmDraft(draft, result, new Date("2026-10-12T04:00:00.000Z"));
    expect(confirmed.confirmation.state).toBe("CONFIRMED");
    expect(confirmed.confirmation.snapshot).toMatchObject({
      eligibleForFinalConfirmation: true,
      checkedAt: "2026-10-12T04:00:00.000Z",
      warnings: [{ code: "PACE_MOBILITY_MISMATCH" }],
    });
    expect(confirmed.draft.fields.startDate.value).toBe("2026-10-21");
    expect(confirmed.draft.fields.startDate.origin).toBe("AI");
    expect(confirmed.draft.fields.startDate.edited).toBe(false);
    expect(confirmed.draft.fields.startDate.aiValue).toBe("2026-10-20");
  });

  it("does not confirm an issue result and invalidation drops the snapshot", () => {
    const draft = draftFromFormFields(fullForm);
    const result: CheckResult = {
      requirement: tripRequirementInputSchema.parse(draftToCandidate(draft)),
      issues: [{
        code: "START_DATE_IN_PAST" as const,
        field: "startDate" as const,
        severity: "ERROR" as const,
        message: "Ngày bắt đầu không được ở trong quá khứ.",
      }],
      confirmable: false,
      readiness: {
        preliminary: true,
        finalConfirmation: false,
        missing: ["startDate"] as const,
        startDateIssue: "IN_PAST" as const,
        usesRelativeDays: false,
      },
      usesRelativeDays: false,
    };
    expect(confirmDraft(draft, result).confirmation).toEqual({ state: "NOT_CONFIRMED", snapshot: null });
    expect(invalidateConfirmation()).toEqual({ state: "NOT_CONFIRMED", snapshot: null });
  });
});
