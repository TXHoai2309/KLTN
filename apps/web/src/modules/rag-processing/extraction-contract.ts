export type DocumentFormat = "PDF" | "DOCX" | "TXT";
export type SegmentOrigin =
  | { format: "PDF"; pageNumber: number; blockIndex: number }
  | { format: "DOCX"; blockIndex: number; section?: { id: string; title: string; level: number }; table?: { index: number; row: number; cell: number } }
  | { format: "TXT"; lineStart: number; lineEnd: number };
export type ExtractedSegment = {
  id: string;
  ordinal: number;
  kind: "heading" | "paragraph" | "table-cell";
  text: string;
  origin: SegmentOrigin;
};
export type ExtractionWarning = {
  code: "PAGE_WITHOUT_TEXT" | "PDF_READING_ORDER_HEURISTIC" | "UNSUPPORTED_DOCX_REGION";
  pageNumber?: number;
  region?: string;
};
export type ExtractedDocument = {
  format: DocumentFormat;
  originalBytesHash: string;
  extractorVersion: string;
  normalizationVersion: string;
  normalizedContentHash: string;
  segments: ExtractedSegment[];
  warnings: ExtractionWarning[];
};
export type ExtractionFailureState = "UNSUPPORTED_FORMAT" | "INVALID_ENCODING" | "CORRUPT_DOCUMENT" | "PASSWORD_REQUIRED" | "RESOURCE_LIMIT" | "EXTRACTION_FAILED";
export type ExtractionResult =
  | { status: "EXTRACTED"; document: ExtractedDocument }
  | { status: "NO_EXTRACTABLE_TEXT"; reason: "NO_TEXT"; document: ExtractedDocument }
  | { status: ExtractionFailureState; code: string };
export type ExtractionInput = { bytes: Uint8Array; format: string };
