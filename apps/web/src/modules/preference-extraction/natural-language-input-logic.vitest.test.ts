import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_PREFERENCE_INPUT_LENGTH,
  MIN_PREFERENCE_INPUT_LENGTH,
} from "./preference-extraction-contract";
import {
  countNaturalLanguageCodePoints,
  getNaturalLanguageAnalyzeButtonState,
  getNaturalLanguageTextState,
} from "./natural-language-input-logic";

describe("US25-FE-INPUT natural-language input logic", () => {
  it("counts Unicode code points rather than UTF-16 code units", () => {
    expect(countNaturalLanguageCodePoints("😀")).toBe(1);
    expect(countNaturalLanguageCodePoints("e\u0301")).toBe(2);

    const normalized = getNaturalLanguageTextState("e\u0301 đi xe máy");
    expect(normalized.normalizedText).toBe("é đi xe máy");
    expect(normalized.length).toBe([...normalized.normalizedText].length);
  });

  it.each([
    ["abcd", "TOO_SHORT"],
    ["abcde", "VALID"],
    ["a".repeat(MAX_PREFERENCE_INPUT_LENGTH), "VALID"],
    ["a".repeat(MAX_PREFERENCE_INPUT_LENGTH + 1), "TOO_LONG"],
  ])("classifies the %s boundary without truncating", (value, status) => {
    const result = getNaturalLanguageTextState(value);
    expect(result.status).toBe(status);
    expect(result.length).toBe([...value].length);
    if (status === "TOO_SHORT") expect(result.message).toContain(`${MIN_PREFERENCE_INPUT_LENGTH}`);
    if (status === "TOO_LONG") expect(result.message).toContain(`${MAX_PREFERENCE_INPUT_LENGTH}`);
  });

  it("normalizes trim, NFC and control characters before the next task submits", () => {
    const result = getNaturalLanguageTextState("\u0000  e\u0301 đi xe máy  \u0007");

    expect(result.status).toBe("VALID");
    expect(result.normalizedText).toBe("é đi xe máy");
    expect(result.normalizedText).not.toContain("\u0000");
  });

  it("uses the shared schema messages for short and long text", () => {
    expect(getNaturalLanguageTextState("").message).toBe(
      `Nhu cầu chuyến đi phải có ít nhất ${MIN_PREFERENCE_INPUT_LENGTH} ký tự.`,
    );
    expect(getNaturalLanguageTextState("a".repeat(1001)).message).toBe(
      `Nhu cầu chuyến đi không được quá ${MAX_PREFERENCE_INPUT_LENGTH} ký tự.`,
    );
  });

  it("derives button state only from text validity and processing", () => {
    const valid = getNaturalLanguageTextState("đi xe máy 3 ngày");
    const short = getNaturalLanguageTextState("abc");
    const long = getNaturalLanguageTextState("a".repeat(1001));

    expect(getNaturalLanguageAnalyzeButtonState(valid, false)).toEqual({
      disabled: false,
      reason: null,
      label: "Phân tích nhu cầu",
    });
    expect(getNaturalLanguageAnalyzeButtonState(valid, true)).toMatchObject({
      disabled: true,
      reason: "Đang phân tích nhu cầu…",
    });
    expect(getNaturalLanguageAnalyzeButtonState(short, false)).toMatchObject({
      disabled: true,
      reason: expect.stringContaining("5"),
    });
    expect(getNaturalLanguageAnalyzeButtonState(long, false)).toMatchObject({
      disabled: true,
      reason: expect.stringContaining("1000"),
    });
  });

  it("keeps the FE-INPUT component local and ready for the next API task", () => {
    const componentPath = resolve(
      process.cwd(),
      "src/app/trips/new/natural-language-input.tsx",
    );
    const component = readFileSync(componentPath, "utf8");
    const form = readFileSync(
      resolve(process.cwd(), "src/app/trips/new/trip-requirement-form.tsx"),
      "utf8",
    );

    expect(component).toContain('htmlFor="trip-natural-language-text"');
    expect(component).toContain("aria-describedby=");
    expect(component).toContain('type="button"');
    expect(component).toContain("onAnalyze(textState.normalizedText)");
    expect(component).toContain("EXAMPLE_PROMPTS");
    expect(component).not.toMatch(/\bfetch\s*\(/u);
    expect(component).not.toMatch(/localStorage|sessionStorage|history\./u);
    expect(form).toContain("<NaturalLanguageInput");
    expect(form).toContain('status={naturalLanguageStatus}');
  });
});
