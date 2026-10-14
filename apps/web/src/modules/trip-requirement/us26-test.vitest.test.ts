import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractionResultSchema,
  type ExtractionResult,
} from "../preference-extraction/preference-extraction-contract";
import { preferenceUtterances } from "../preference-extraction/__fixtures__/utterances";
import {
  applyFieldEdit,
  clearField,
  confirmDraft,
  draftFromExtraction,
  draftFromFormFields,
  draftToCandidate,
  invalidateConfirmation,
  restoreAiValue,
  REVIEW_FIELD_KEYS,
  type ReviewRawFieldValue,
  type TripRequirementReviewDraft,
} from "./trip-requirement-review";
import {
  checkTripRequirement,
  type CheckResult,
} from "./trip-requirement-check";
import {
  assertStartDateForFinalConfirmation,
} from "./trip-requirement-readiness";
import {
  tripRequirementInputSchema,
  type TripRequirementInput,
} from "./trip-requirement-contract";
import {
  validateRequiredFields,
  type TripRequirementFormFields,
} from "./trip-requirement-form-logic";

const NOW_BEFORE_VIETNAM_MIDNIGHT = new Date("2026-10-09T16:59:59Z");
const NOW_AFTER_VIETNAM_MIDNIGHT = new Date("2026-10-09T17:00:00Z");

const completeFields: TripRequirementFormFields = {
  startDate: "2026-10-20",
  durationDays: "3",
  transport: "CAR",
  companionType: "COUPLE",
  companionGroupSize: "2",
  interests: ["NATURE", "FOOD"],
  pace: "MODERATE",
  mobilityFlags: [],
  mobilityNote: "",
};

function fixtureResult(id: string): ExtractionResult {
  const fixture = preferenceUtterances.find((item) => item.id === id);
  if (!fixture) throw new Error(`Missing fixture ${id}`);

  const fields = Object.fromEntries(REVIEW_FIELD_KEYS.map((field) => {
    const expected = fixture.expected[field];
    if (expected.status === "MISSING") {
      return [field, { status: "MISSING", value: null, sourceText: null, note: null }];
    }
    return [field, {
      status: expected.status,
      value: expected.status === "EXTRACTED" ? expected.value : null,
      sourceText: `${fixture.id} source text`,
      note: expected.status === "EXTRACTED" ? null : `${expected.status} fixture`,
    }];
  }));

  const missingRequired = (["durationDays", "transport"] as const).filter(
    (field) => fixture.expected[field].status !== "EXTRACTED",
  );
  return extractionResultSchema.parse({
    fields,
    clarifications: [],
    missingRequired,
    meta: { model: "us26-test-fixture", latencyMs: 0, inputLength: [...fixture.text].length },
  });
}

function edit(
  draft: TripRequirementReviewDraft,
  key: Parameters<typeof applyFieldEdit>[1],
  value: ReviewRawFieldValue,
): TripRequirementReviewDraft {
  const result = applyFieldEdit(draft, key, value, new Date("2026-10-12T03:00:00Z"));
  if (!result.ok) throw new Error(`Expected ${key} edit to be valid: ${JSON.stringify(result.errors)}`);
  return result.draft;
}

describe("US26-TEST review → authoritative check → confirmation", () => {
  it("reuses a US-25 full fixture and lets user edits win over AI values", () => {
    let draft = draftFromExtraction(fixtureResult("full-04"));
    expect(draft.fields.transport.value).toBe("CAR");
    expect(draft.fields.companions.value).toEqual({ type: "COUPLE", groupSize: 2 });

    draft = edit(draft, "transport", "MOTORCYCLE");
    draft = edit(draft, "durationDays", "5");
    draft = edit(draft, "companions", { type: "FAMILY", groupSize: "4" });
    draft = edit(draft, "interests", ["FOOD", "FOOD", "NATURE"]);
    draft = edit(draft, "mobilityConstraints", { flags: ["AVOID_LONG_WALKING", "AVOID_LONG_WALKING"], note: "  Nghỉ giữa chặng  " });

    expect(draft.fields.transport).toMatchObject({ origin: "USER", value: "MOTORCYCLE", edited: true, aiValue: "CAR" });
    expect(draft.fields.durationDays).toMatchObject({ value: 5, aiValue: 3, origin: "USER", edited: true });
    expect(draft.fields.companions).toMatchObject({ value: { type: "FAMILY", groupSize: 4 }, aiValue: { type: "COUPLE", groupSize: 2 } });
    expect(draft.fields.interests.value).toEqual(["NATURE", "FOOD"]);
    expect(draft.fields.mobilityConstraints.value).toEqual({ flags: ["AVOID_LONG_WALKING"], note: "Nghỉ giữa chặng" });

    const candidate = draftToCandidate(draft);
    expect(candidate).toEqual({
      startDate: "2026-12-24",
      durationDays: 5,
      transport: "MOTORCYCLE",
      companions: { type: "FAMILY", groupSize: 4 },
      interests: ["NATURE", "FOOD"],
      pace: "PACKED",
      mobilityConstraints: { flags: ["AVOID_LONG_WALKING"], note: "Nghỉ giữa chặng" },
    });
    expect(tripRequirementInputSchema.safeParse(candidate).success).toBe(true);

    const result = checkTripRequirement(candidate, new Date("2026-10-12T03:00:00Z"));
    expect(result.confirmable).toBe(true);
    const confirmed = confirmDraft(draft, result, new Date("2026-10-12T03:00:01Z"));
    expect(confirmed.confirmation.state).toBe("CONFIRMED");
    expect(confirmed.confirmation.snapshot?.requirement.transport).toBe("MOTORCYCLE");
    expect(confirmed.confirmation.snapshot?.warnings).toEqual([
      expect.objectContaining({ code: "PACE_MOBILITY_MISMATCH", severity: "WARNING" }),
    ]);
  });

  it("handles AI empty/ambiguous/unsupported and restores or clears without guessing", () => {
    const ambiguous = draftFromExtraction(fixtureResult("ambiguous-01"));
    const filled = edit(ambiguous, "transport", "MOTORCYCLE");
    expect(filled.fields.transport).toMatchObject({ origin: "USER", value: "MOTORCYCLE", aiStatus: "AMBIGUOUS", aiValue: null });

    const unsupported = draftFromExtraction(fixtureResult("unsupported-01"));
    expect(unsupported.fields.transport).toMatchObject({ value: null, origin: "EMPTY", aiStatus: "UNSUPPORTED" });
    expect(draftToCandidate(unsupported).transport).toBeNull();
    expect(edit(unsupported, "transport", "MOTORCYCLE").fields.transport.value).toBe("MOTORCYCLE");

    const extracted = draftFromExtraction(fixtureResult("full-03"));
    const changed = edit(extracted, "transport", "MOTORCYCLE");
    expect(changed.fields.transport.aiValue).toBe("CAR");
    expect(restoreAiValue(changed, "transport").fields.transport.value).toBe("CAR");
    expect(clearField(changed, "transport").fields.transport).toMatchObject({ value: null, origin: "EMPTY", aiValue: "CAR", edited: true });
    expect(edit(changed, "transport", "MOTORCYCLE").fields.transport.value).toBe("MOTORCYCLE");
  });

  it.each([
    ["durationDays", "0", "durationDays"],
    ["durationDays", "15", "durationDays"],
    ["durationDays", "2.5", "durationDays"],
    ["durationDays", "abc", "durationDays"],
    ["transport", "", "transport"],
    ["transport", "BICYCLE", "transport"],
    ["companions", { type: "SOLO", groupSize: "3" }, "companions.groupSize"],
    ["mobilityConstraints", { flags: [], note: "x".repeat(501) }, "mobilityConstraints.note"],
  ] as const)("keeps invalid in-place edit %s out of the draft", (key, value, errorKey) => {
    const draft = draftFromFormFields(completeFields);
    const before = structuredClone(draft);
    const result = applyFieldEdit(draft, key as Parameters<typeof applyFieldEdit>[1], value as ReviewRawFieldValue, new Date("2026-10-12T03:00:00Z"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[errorKey]).toBeTruthy();
    expect(result.draft).toEqual(before);
  });
});

describe("US26-TEST start-date matrix", () => {
  it.each([
    ["10/10/2026", "START_DATE_INVALID"],
    ["2026-1-5", "START_DATE_INVALID"],
    ["abc", "START_DATE_INVALID"],
    ["2026-02-30", "START_DATE_INVALID"],
    ["2026-13-01", "START_DATE_INVALID"],
    ["2027-02-29", "START_DATE_INVALID"],
  ] as const)("rejects invalid date %s at the authoritative check", (startDate, code) => {
    const result = checkTripRequirement({ startDate, durationDays: 3, transport: "CAR" }, NOW_BEFORE_VIETNAM_MIDNIGHT);
    expect(result.confirmable).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ field: "startDate", code, severity: "ERROR" }));
  });

  it("handles past/today/future, empty relative days, leap year and Vietnam midnight", () => {
    expect(checkTripRequirement({ startDate: "2026-10-08", durationDays: 3, transport: "CAR" }, NOW_BEFORE_VIETNAM_MIDNIGHT).confirmable).toBe(false);
    expect(checkTripRequirement({ startDate: "2026-10-09", durationDays: 3, transport: "CAR" }, NOW_BEFORE_VIETNAM_MIDNIGHT).confirmable).toBe(true);
    expect(checkTripRequirement({ startDate: "2026-10-10", durationDays: 3, transport: "CAR" }, NOW_AFTER_VIETNAM_MIDNIGHT).confirmable).toBe(true);
    expect(checkTripRequirement({ startDate: null, durationDays: 3, transport: "CAR" }, NOW_BEFORE_VIETNAM_MIDNIGHT)).toMatchObject({ confirmable: true, usesRelativeDays: true, readiness: { finalConfirmation: false } });
    expect(checkTripRequirement({ startDate: "2028-02-29", durationDays: 3, transport: "CAR" }, new Date("2028-02-28T00:00:00Z")).confirmable).toBe(true);
    expect(checkTripRequirement({ startDate: "2026-10-09", durationDays: 3, transport: "CAR" }, NOW_AFTER_VIETNAM_MIDNIGHT).issues).toContainEqual(expect.objectContaining({ code: "START_DATE_IN_PAST" }));
  });

  it("keeps the final server guard stricter than preliminary confirmation", () => {
    const preliminary = tripRequirementInputSchema.parse({ startDate: null, durationDays: 3, transport: "CAR" });
    expect(() => assertStartDateForFinalConfirmation(preliminary, NOW_BEFORE_VIETNAM_MIDNIGHT)).toThrowError(expect.objectContaining({ code: "TRIP_START_DATE_REQUIRED", status: 422 }));
    const past = tripRequirementInputSchema.parse({ startDate: "2026-10-08", durationDays: 3, transport: "CAR" });
    expect(() => assertStartDateForFinalConfirmation(past, NOW_BEFORE_VIETNAM_MIDNIGHT)).toThrowError(expect.objectContaining({ code: "TRIP_START_DATE_IN_PAST", status: 422 }));
  });

  it("keeps the first client error in the contract order", () => {
    const errors = validateRequiredFields({
      ...completeFields,
      durationDays: "",
      transport: "",
    });
    expect(Object.keys(errors)).toEqual(["durationDays", "transport"]);
  });
});

describe("US26-TEST confirmation state and source contracts", () => {
  it("confirms preliminary data only as a page-session snapshot", () => {
    const draft = draftFromFormFields({ ...completeFields, startDate: "" });
    const result = checkTripRequirement(draftToCandidate(draft), new Date("2026-10-12T03:00:00Z"));
    expect(result.confirmable).toBe(true);
    const confirmation = confirmDraft(draft, result, new Date("2026-10-12T03:00:00Z")).confirmation;
    expect(confirmation).toMatchObject({ state: "CONFIRMED", snapshot: { usesRelativeDays: true, eligibleForFinalConfirmation: false } });
    expect(invalidateConfirmation()).toEqual({ state: "NOT_CONFIRMED", snapshot: null });
  });

  it("does not confirm an authoritative ERROR or bypass /check in the screen", () => {
    const errorResult: CheckResult = {
      requirement: tripRequirementInputSchema.parse({
        startDate: "2026-10-08",
        durationDays: 3,
        transport: "CAR",
        companions: { type: "COUPLE", groupSize: 2 },
        interests: ["CULTURE_HISTORY", "FOOD"],
        pace: "MODERATE",
        mobilityConstraints: { flags: [], note: null },
      }),
      issues: [{ code: "START_DATE_IN_PAST", field: "startDate", severity: "ERROR", message: "Ngày bắt đầu không được ở trong quá khứ." }],
      confirmable: false,
      readiness: { preliminary: true, finalConfirmation: false, missing: ["startDate"], startDateIssue: "IN_PAST", usesRelativeDays: false },
      usesRelativeDays: false,
    };
    expect(confirmDraft(draftFromFormFields(completeFields), errorResult).confirmation.state).toBe("NOT_CONFIRMED");

    const reviewSource = readFileSync(resolve(process.cwd(), "src/app/trips/new/trip-review-screen.tsx"), "utf8");
    const clientSource = readFileSync(resolve(process.cwd(), "src/lib/trip-requirement-check-client.ts"), "utf8");
    for (const source of [reviewSource, clientSource]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|OpenAI|openai/iu);
      expect(source).not.toContain("Tạo hành trình");
    }
    expect(reviewSource).toContain("checkTripRequirement");
    expect(reviewSource).toContain("checkInFlightRef");
    expect(reviewSource).toContain("required");
    expect(reviewSource).toContain("onConfirmed");
    expect(clientSource).toContain("/api/trip-requirements/check");
    expect(clientSource).not.toContain("/api/trip-requirements/evaluate");
  });
});

