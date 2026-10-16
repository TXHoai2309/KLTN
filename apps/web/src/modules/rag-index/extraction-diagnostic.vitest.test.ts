import { describe, expect, it } from "vitest";
import { extractionDiagnostic, readExtractionDiagnostic } from "./extraction-diagnostic";
describe("safe persisted extraction diagnostics", () => {
  it("round trips through existing JSON array without breaking legacy warnings", () => {
    const diagnostic = extractionDiagnostic({ code: "UNSUPPORTED_DOCX_REGION", ooxmlPart: "word/footer1.xml", unsupportedElement: "object", location: "ftr/p[0]/r[1]/object[0]" }, "30000000-0000-4000-8000-000000000001");
    expect(readExtractionDiagnostic(["UNSUPPORTED_DOCX_REGION", diagnostic])).toEqual(diagnostic);
    expect(readExtractionDiagnostic(["UNSUPPORTED_DOCX_REGION"])).toBeNull();
    expect(diagnostic.recoverable).toBe(false);
    expect(diagnostic.extractionStage).toBe("TEXT_EXTRACTION");
  });
  it("rejects additional text, bytes, credentials and malformed metadata", () => {
    expect(readExtractionDiagnostic([{ text: "PRIVATE", credentials: "SECRET" }])).toBeNull();
    expect(() => extractionDiagnostic({ code: "UNSUPPORTED_DOCX_REGION", ooxmlPart: "https://secret.invalid" }, "30000000-0000-4000-8000-000000000001")).toThrow();
  });
});
