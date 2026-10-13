import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sourceFiles = [
  "src/app/trips/new/trip-requirement-form.tsx",
  "src/app/trips/new/trip-field-editors.tsx",
  "src/app/trips/new/trip-review-screen.tsx",
  "src/app/trips/new/trip-clarification-panel.tsx",
  "src/app/trips/new/extraction-result-panel.tsx",
  "src/app/trips/new/natural-language-input.tsx",
  "src/modules/preference-extraction/apply-extraction.ts",
  "src/modules/trip-requirement/trip-requirement-form-logic.ts",
  "src/modules/trip-requirement/trip-requirement-review.ts",
  "src/lib/trip-requirement-check-client.ts",
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("US27-FE-NOSUBST source contract", () => {
  it("has one explicit extraction resolver and no literal transport fallback", () => {
    const apply = source("src/modules/preference-extraction/apply-extraction.ts");
    const review = source("src/modules/trip-requirement/trip-requirement-review.ts");
    expect(apply).toContain("resolveTransportCandidateFromExtraction");
    expect(review).toContain("resolveTransportCandidateFromExtraction");

    for (const path of sourceFiles) {
      const text = source(path);
      expect(text, path).not.toMatch(/transport\s*:\s*["'](?:MOTORCYCLE|CAR)["']/u);
      expect(text, path).not.toMatch(/(?:transport|value)\s*\?\?\s*["'](?:MOTORCYCLE|CAR)["']/u);
      expect(text, path).not.toMatch(/(?:transport|value)\s*\|\|\s*["'](?:MOTORCYCLE|CAR)["']/u);
    }
  });

  it("does not give the transport radios a browser default or auto-focus a choice", () => {
    const text = source("src/app/trips/new/trip-field-editors.tsx");
    const start = text.indexOf("export function TransportEditor");
    const end = text.indexOf("export type CompanionsEditorProps");
    const transportEditor = text.slice(start, end);
    expect(transportEditor).not.toMatch(/defaultChecked|defaultValue/u);
    expect(transportEditor).not.toContain("autoFocus");
    expect(transportEditor).toContain("checked={value === option.value}");
    expect(transportEditor).toContain("Bạn đã chọn ${option.label}");
  });

  it("keeps unsupported wording free from replacement/default-choice promises", () => {
    for (const path of sourceFiles) {
      const text = source(path);
      expect(text, path).not.toMatch(/thay bằng|tự động chuyển|đã chọn giúp/iu);
    }
  });

  it("does not add storage, HTML injection or a create action to the client touchpoints", () => {
    for (const path of sourceFiles) {
      const text = source(path);
      expect(text, path).not.toMatch(/localStorage|sessionStorage|dangerouslySetInnerHTML/u);
      expect(text, path).not.toContain("Tạo hành trình");
    }
  });
});

