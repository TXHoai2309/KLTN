// Node-only entry: no storage acquisition, lifecycle writes, or public projection.
import type { ExtractedDocument, ExtractionInput, ExtractionResult } from "./extraction-contract";
import { ProcessingError } from "./extraction-errors";
import { EXTRACTION_LIMITS } from "./extraction-limits";
import { canonical, sha256 } from "./content-hash";
import { NORMALIZATION_VERSION } from "./normalize-text";
import { extractTxt } from "./extractors/txt";
import { extractDocx } from "./extractors/docx";

export const EXTRACTOR_VERSIONS = { PDF: "pdfjs-4.10.38-lines-v1", DOCX: "ooxml-body-v1", TXT: "utf8-paragraphs-v1" } as const;

export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  if (input.format !== "PDF" && input.format !== "DOCX" && input.format !== "TXT") return { status: "UNSUPPORTED_FORMAT", code: "FORMAT_NOT_SUPPORTED" };
  if (!(input.bytes instanceof Uint8Array)) return { status: "CORRUPT_DOCUMENT", code: "BYTES_REQUIRED" };
  if (input.bytes.byteLength > EXTRACTION_LIMITS.inputBytes) return { status: "RESOURCE_LIMIT", code: "INPUT_LIMIT" };
  const format = input.format;
  try {
    const extracted = format === "TXT" ? extractTxt(input.bytes)
      : format === "DOCX" ? extractDocx(input.bytes)
      : await (await import("./extractors/pdf")).extractPdf(input.bytes);
    const document: ExtractedDocument = {
      format,
      originalBytesHash: sha256(input.bytes),
      extractorVersion: EXTRACTOR_VERSIONS[format],
      normalizationVersion: NORMALIZATION_VERSION,
      normalizedContentHash: sha256(canonical(extracted.segments.map(({ text, kind, origin }) => ({ text, kind, origin })))),
      ...extracted,
    };
    return document.segments.length ? { status: "EXTRACTED", document } : { status: "NO_EXTRACTABLE_TEXT", reason: "NO_TEXT", document };
  } catch (error) {
    if (error instanceof ProcessingError) return { status: error.state, code: error.code };
    return { status: "EXTRACTION_FAILED", code: "PARSER_FAILED" };
  }
}
