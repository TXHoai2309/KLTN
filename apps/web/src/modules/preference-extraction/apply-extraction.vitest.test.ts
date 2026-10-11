import { describe, expect, it } from "vitest";

import {
  applyExtractionToForm,
  dismissExtractionSuggestion,
  removeExtractionSuggestion,
  useExtractionSuggestion,
} from "./apply-extraction";
import type { TripRequirementFormFields } from "../trip-requirement/trip-requirement-form-logic";
import { extractionResultSchema } from "./preference-extraction-contract";

const emptyFields: TripRequirementFormFields = {
  startDate: "",
  durationDays: "",
  transport: "",
  companionType: "",
  companionGroupSize: "",
  interests: [],
  pace: "",
  mobilityFlags: [],
  mobilityNote: "",
};

const fullResult = extractionResultSchema.parse({
  fields: {
    startDate: { status: "EXTRACTED", value: "2026-10-20", sourceText: "ngày 20/10", note: null },
    durationDays: { status: "EXTRACTED", value: 3, sourceText: "3 ngày", note: null },
    transport: { status: "EXTRACTED", value: "MOTORCYCLE", sourceText: "xe máy", note: null },
    companions: { status: "EXTRACTED", value: { type: "COUPLE", groupSize: 2 }, sourceText: "với bạn gái", note: null },
    interests: { status: "EXTRACTED", value: ["FOOD", "PHOTOGRAPHY"], sourceText: "chụp ảnh và ăn uống", note: null },
    pace: { status: "EXTRACTED", value: "RELAXED", sourceText: "đi thong thả", note: null },
    mobilityConstraints: { status: "EXTRACTED", value: { flags: ["AVOID_LONG_WALKING"], note: "nghỉ giữa chặng" }, sourceText: "không đi bộ xa", note: null },
  },
  clarifications: [],
  missingRequired: [],
  meta: { model: "test-model", latencyMs: 4, inputLength: 80 },
});

describe("apply-extraction", () => {
  it("fills only empty fields and records applied suggestions", () => {
    const result = applyExtractionToForm(emptyFields, fullResult);
    expect(result.fields).toMatchObject({
      startDate: "2026-10-20",
      durationDays: "3",
      transport: "MOTORCYCLE",
      companionType: "COUPLE",
      companionGroupSize: "2",
      interests: ["FOOD", "PHOTOGRAPHY"],
      pace: "RELAXED",
      mobilityFlags: ["AVOID_LONG_WALKING"],
      mobilityNote: "nghỉ giữa chặng",
    });
    expect(result.suggestions.durationDays?.status).toBe("APPLIED");
    expect(result.suggestions.interests?.sourceText).toBe("chụp ảnh và ăn uống");
  });

  it("never overwrites a user value and leaves a conflicting suggestion pending", () => {
    const result = applyExtractionToForm({ ...emptyFields, durationDays: "5", transport: "CAR" }, fullResult);
    expect(result.fields.durationDays).toBe("5");
    expect(result.fields.transport).toBe("CAR");
    expect(result.suggestions.durationDays?.status).toBe("PENDING");
    expect(result.suggestions.transport?.status).toBe("PENDING");
  });

  it("does not apply ambiguous, unsupported or missing values", () => {
    const result = extractionResultSchema.parse({
      ...fullResult,
      fields: {
        ...fullResult.fields,
        startDate: { status: "AMBIGUOUS", value: null, sourceText: "cuối tháng", note: "Cần ngày cụ thể." },
        transport: { status: "UNSUPPORTED", value: null, sourceText: "tàu", note: "Chưa hỗ trợ." },
        durationDays: { status: "MISSING", value: null, sourceText: null, note: null },
      },
      missingRequired: ["durationDays", "transport"],
      clarifications: [
        { field: "startDate", reason: "AMBIGUOUS_DATE", message: "Cần ngày cụ thể.", sourceText: "cuối tháng" },
      ],
    });
    const applied = applyExtractionToForm(emptyFields, result);
    expect(applied.fields.startDate).toBe("");
    expect(applied.fields.durationDays).toBe("");
    expect(applied.fields.transport).toBe("");
    expect(Object.keys(applied.suggestions)).not.toContain("startDate");
  });

  it("supports explicit use and dismissal of pending or applied suggestions", () => {
    const pending = applyExtractionToForm({ ...emptyFields, durationDays: "5" }, fullResult);
    const used = useExtractionSuggestion(pending.fields, pending.suggestions, "durationDays");
    expect(used.fields.durationDays).toBe("3");
    expect(used.suggestions.durationDays?.status).toBe("APPLIED");

    const dismissed = dismissExtractionSuggestion(used.fields, used.suggestions, "durationDays");
    expect(dismissed.fields.durationDays).toBe("");
    expect(dismissed.suggestions.durationDays).toBeUndefined();
  });

  it("removes the applied label without erasing a later user edit", () => {
    const applied = applyExtractionToForm(emptyFields, fullResult);
    const afterEdit = { ...applied.fields, durationDays: "7" };
    const suggestions = removeExtractionSuggestion(applied.suggestions, "durationDays");
    expect(afterEdit.durationDays).toBe("7");
    expect(suggestions.durationDays).toBeUndefined();
  });
});
