import { describe, expect, it } from "vitest";
import { formatVietnameseDate, vietnameseDateInputValue } from "./date-only";
import { buildPayload, validateRequiredFields } from "@/modules/trip-requirement/trip-requirement-form-logic";

const fields = { startDate: "", durationDays: "3", transport: "CAR", companionType: "", companionGroupSize: "", interests: [], pace: "", mobilityFlags: [], mobilityNote: "" };

describe("Vietnamese date presentation and canonical form boundary", () => {
  it.each([
    ["2026-12-20", "20/12/2026"],
    ["2026-04-05", "05/04/2026"],
    ["2028-02-29", "29/02/2028"],
  ])("round trips %s without locale or timezone conversion", (iso, display) => {
    expect(formatVietnameseDate(iso)).toBe(display);
    const startDate = vietnameseDateInputValue(display);
    expect(startDate).toBe(iso);
    expect(buildPayload({ ...fields, startDate }).startDate).toBe(iso);
    expect(validateRequiredFields({ ...fields, startDate }).startDate).toBeUndefined();
  });

  it.each(["", "2", "20/", "20/12/", "31/02/2026", "29/02/2027", "12/20/2026"])("preserves incomplete or invalid text %s for correction", (text) => {
    expect(vietnameseDateInputValue(text)).toBe(text);
    expect(formatVietnameseDate(text)).toBe(text);
    const errors = validateRequiredFields({ ...fields, startDate: text });
    expect(Boolean(errors.startDate)).toBe(text !== "");
    if (errors.startDate) expect(errors.startDate).not.toContain("YYYY-MM-DD");
  });
});
