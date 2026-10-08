import { getDocument, InvalidPDFException } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ExtractionWarning } from "../extraction-contract";
import { ProcessingError, limit } from "../extraction-errors";
import { EXTRACTION_LIMITS } from "../extraction-limits";
import { SegmentCollector } from "../segment-collector";

export async function extractPdf(bytes: Uint8Array) {
  const collector = new SegmentCollector();
  const warnings: ExtractionWarning[] = [{ code: "PDF_READING_ORDER_HEURISTIC" }];
  const loading = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0, stopAtErrors: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > EXTRACTION_LIMITS.pdfPages) limit("PDF_PAGE_LIMIT");
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        let block = 0;
        let line = "";
        let previous: { y: number; right: number } | undefined;
        const before = collector.segments.length;
        const flush = () => {
          collector.add(line, { format: "PDF", pageNumber: n, blockIndex: block++ });
          line = "";
        };
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5];
          if (previous && Math.abs(previous.y - y) > 2 && line) flush();
          if (line && previous && item.transform[4] - previous.right > 1) line += " ";
          line += item.str;
          if (line.length > EXTRACTION_LIMITS.textUtf16Units) limit("TEXT_LIMIT");
          previous = { y, right: item.transform[4] + item.width };
          if (item.hasEOL) flush();
        }
        flush();
        if (collector.segments.length === before) warnings.push({ code: "PAGE_WITHOUT_TEXT", pageNumber: n });
      } finally { page.cleanup(); }
    }
    return { segments: collector.segments, warnings };
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new ProcessingError("PASSWORD_REQUIRED", "PDF_PASSWORD_REQUIRED");
    if (error instanceof InvalidPDFException) throw new ProcessingError("CORRUPT_DOCUMENT", "PDF_INVALID");
    throw new ProcessingError("EXTRACTION_FAILED", "PDF_PARSER_FAILED");
  } finally { await loading.destroy(); }
}
