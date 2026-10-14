import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { shouldApplyRequestResponse } from "@/modules/trip-requirement/trip-requirement-form-logic";

describe("US25-FE-CONNECT source contracts", () => {
  it("models one in-flight request and ignores stale or unmounted responses", () => {
    const lock = { current: false };
    expect(claimSubmission(lock)).toBe(true);
    expect(claimSubmission(lock)).toBe(false);
    releaseSubmission(lock);
    expect(shouldApplyRequestResponse(4, 4, true)).toBe(true);
    expect(shouldApplyRequestResponse(4, 5, true)).toBe(false);
    expect(shouldApplyRequestResponse(4, 4, false)).toBe(false);
  });

  it("keeps analysis client-safe, single-flight and free of browser persistence", () => {
    const root = process.cwd();
    const form = readFileSync(resolve(root, "src/app/trips/new/trip-requirement-form.tsx"), "utf8");
    const input = readFileSync(resolve(root, "src/app/trips/new/natural-language-input.tsx"), "utf8");
    const client = readFileSync(resolve(root, "src/lib/preference-extraction-client.ts"), "utf8");

    expect(form).toContain("analyzeTripNeeds");
    expect(form).toContain("claimSubmission(naturalLanguageLock)");
    expect(form).toContain("AbortController");
    expect(form).toContain("naturalLanguageSequenceRef");
    expect(form).toContain("shouldApplyRequestResponse");
    expect(input).not.toMatch(/\bfetch\s*\(/u);
    expect([form, input, client].join("\n")).not.toMatch(/localStorage|sessionStorage|history\./u);
    expect(client).toContain('credentials: "same-origin"');
  });

  it("keeps result rendering read-only and applies no implicit evaluation or save", () => {
    const root = process.cwd();
    const form = readFileSync(resolve(root, "src/app/trips/new/trip-requirement-form.tsx"), "utf8");
    const panel = readFileSync(resolve(root, "src/app/trips/new/extraction-result-panel.tsx"), "utf8");
    const apply = readFileSync(resolve(root, "src/modules/preference-extraction/apply-extraction.ts"), "utf8");
    const fillHandler = form.match(/function handleFillExtractionForm\(\)[\s\S]*?\n  \}\n\n  function handleUseExtractionSuggestion/u)?.[0] ?? "";

    expect(panel).toContain("Điền vào biểu mẫu");
    expect(panel).toContain("Dùng gợi ý này");
    expect(panel).toContain("Bỏ gợi ý");
    expect(panel).not.toContain("dangerouslySetInnerHTML");
    expect(apply).not.toContain("fetch(");
    expect(fillHandler).not.toContain("evaluate");
    expect(fillHandler).not.toContain("setReview");
    expect(form).not.toContain('onAnalyze={() => undefined}');
  });
});
