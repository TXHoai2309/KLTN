import { describe, expect, it } from "vitest";

import { applyExtractionToForm } from "./apply-extraction";
import { extractPreferences } from "./preference-extraction-service";
import type { ModelOutput } from "./preference-extraction-contract";
import { explicitTripDatesInSource } from "../trip-requirement/explicit-trip-date";

const emptyForm = {
  startDate: "", durationDays: "", transport: "", companionType: "",
  companionGroupSize: "", interests: [], pace: "", mobilityFlags: [], mobilityNote: "",
};
const missing = { status: "MISSING" as const, value: null, sourceText: null, note: null };

async function handoff(source: string, value: string, status: "EXTRACTED" | "AMBIGUOUS" = "EXTRACTED") {
  const output: ModelOutput = { fields: {
    startDate: status === "EXTRACTED"
      ? { status, value, sourceText: source, note: null }
      : { status, value: null, sourceText: source, note: null },
    durationDays: missing, transport: missing, companions: missing,
    interests: missing, pace: missing, mobilityConstraints: missing,
  } };
  const result = await extractPreferences(`Bắt đầu ${source}, đi 3 ngày bằng xe máy.`, {
    llm: { complete: async () => ({ rawText: JSON.stringify(output), model: "test-model" }) },
    now: () => new Date("2026-10-17T05:00:00Z"),
  });
  return { result, form: applyExtractionToForm(emptyForm, result) };
}

describe("verified start date to form handoff", () => {
  it.each([
    ["24/12/2026", "24/12/2026"],
    ["24/12/2026", "2026-12-24"],
    ["24/12/2026.", "2026-12-24"],
    ["2026-12-24", "2026-12-24"],
    ["24-12-2026", "24-12-2026"],
    ["24.12.2026", "24.12.2026"],
    ["ngày 24 tháng 12 năm 2026", "2026-12-24"],
    ["24 tháng 12 năm 2026", "24 tháng 12 năm 2026"],
    ["ngay 24 thang 12 nam 2026", "2026-12-24"],
    ["24/12/2026 hoặc 2026-12-24", "2026-12-24"],
  ])("fills %s from model value %s as an ISO date", async (source, value) => {
    const { result, form } = await handoff(source, value);
    expect(result.fields.startDate).toMatchObject({ status: "EXTRACTED", value: "2026-12-24", sourceText: source });
    expect(form.fields.startDate).toBe("2026-12-24");
    expect(form.suggestions.startDate?.status).toBe("APPLIED");
    // Existing user-entered dates remain authoritative.
    const conflict = applyExtractionToForm({ ...emptyForm, startDate: "2026-12-25" }, result);
    expect(conflict.fields.startDate).toBe("2026-12-25");
    expect(conflict.suggestions.startDate?.status).toBe("PENDING");
  });

  it.each([
    ["24/12", "2026-12-24"],
    ["ngày mai", "2026-10-18"],
    ["31/02/2027", "2027-02-28"],
    ["24/12/2026", "2026-12-25"],
    ["24/12/2026", "bắt đầu 2026-12-24"],
    ["24/12/2026 hoặc 25.12.2026", "2026-12-24"],
    ["24 tháng 12 năm 2026 hay 25 tháng 12 năm 2026", "2026-12-24"],
    ["24/12-2026", "2026-12-24"],
  ])("keeps unverified source %s / value %s out of the date input", async (source, value) => {
    const { result, form } = await handoff(source, value);
    expect(result.fields.startDate.status).toBe("AMBIGUOUS");
    expect(form.fields.startDate).toBe("");
  });

  it("rejects past dates after normalizing the model value", async () => {
    const { result, form } = await handoff("24/12/2025", "24/12/2025");
    expect(result.fields.startDate.status).toBe("UNSUPPORTED");
    expect(form.fields.startDate).toBe("");
  });

  it("does not promote an ambiguous model field into an extracted value", async () => {
    expect((await handoff("24/12/2026", "", "AMBIGUOUS")).form.fields.startDate).toBe("");
  });

  it("validates leap days and deduplicates equivalent formats", () => {
    expect(explicitTripDatesInSource("29.02.2028 và 2028-02-29")).toEqual(["2028-02-29"]);
    expect(explicitTripDatesInSource("29.02.2027")).toEqual([]);
  });
});
