import { z } from "zod";
import type { ExtractedDocument, ExtractedSegment } from "./extraction-contract";
import type { ChunkingResult, ChunkOptions, DocumentChunk, SourceReference } from "./chunk-contract";
import { canonical, sha256 } from "./content-hash";
import { EXTRACTION_LIMITS } from "./extraction-limits";
import { normalizeText } from "./normalize-text";

export const CHUNKER_VERSION = "structure-grapheme-v1";
export const DEFAULT_CHUNK_OPTIONS: Readonly<ChunkOptions> = Object.freeze({ maxChunkUtf16Units: 1600, overlapUtf16Units: 200 });
// Only inserted separator: two LF characters between distinct source segments.
export const CHUNK_SEPARATOR = "\n\n";
const natural = z.number().int().nonnegative();
const section = z.object({ id: z.string().min(1), title: z.string().min(1), level: z.number().int().min(1).max(9) }).strict();
const origin = z.discriminatedUnion("format", [
  z.object({ format: z.literal("PDF"), pageNumber: z.number().int().min(1).max(EXTRACTION_LIMITS.pdfPages), blockIndex: natural }).strict(),
  z.object({ format: z.literal("DOCX"), blockIndex: natural, section: section.optional(), table: z.object({ index: natural, row: natural, cell: natural }).strict().optional() }).strict(),
  z.object({ format: z.literal("TXT"), lineStart: z.number().int().positive(), lineEnd: z.number().int().positive() }).strict(),
]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const documentSchema = z.object({
  format: z.enum(["PDF", "DOCX", "TXT"]), originalBytesHash: hash,
  extractorVersion: z.string().min(1).max(200), normalizationVersion: z.string().min(1).max(200), normalizedContentHash: hash,
  segments: z.array(z.object({ id: z.string().min(1).max(200), ordinal: natural, kind: z.enum(["heading", "paragraph", "table-cell"]), text: z.string().min(1), origin }).strict()),
  warnings: z.array(z.object({ code: z.enum(["PAGE_WITHOUT_TEXT", "PDF_READING_ORDER_HEURISTIC", "UNSUPPORTED_DOCX_REGION"]), pageNumber: z.number().int().positive().optional(), region: z.string().optional() }).strict()),
}).strict();

type Span = { start: number; end: number; segment: ExtractedSegment };
const graphemes = new Intl.Segmenter("vi", { granularity: "grapheme" });

function lowerBound(values: number[], target: number): number {
  let lo = 0; let hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; }
  return lo;
}

function cut(text: string, start: number, ceiling: number, previousEnd: number, ends: number[], boundaries: number[]): number {
  if (ceiling >= text.length) return text.length;
  // Prefer complete paragraphs, but overlap alone must never count as progress.
  const paragraphEnd = ends[lowerBound(ends, ceiling + 1) - 1] ?? 0;
  if (paragraphEnd > previousEnd && paragraphEnd > start) return paragraphEnd;
  const safe = boundaries[lowerBound(boundaries, ceiling + 1) - 1] ?? start;
  if (safe <= previousEnd) return safe;
  const available = text.slice(start, safe);
  let sentence = 0;
  for (const match of available.matchAll(/[.!?…](?:["'”’)]*)\s+/gu)) {
    const end = start + match.index! + match[0].length;
    if (end > previousEnd && boundaries[lowerBound(boundaries, end)] === end) sentence = end;
  }
  if (sentence) return sentence;
  let word = 0;
  for (const match of available.matchAll(/\s+/gu)) {
    const end = start + match.index! + match[0].length;
    if (end > previousEnd && boundaries[lowerBound(boundaries, end)] === end) word = end;
  }
  return word || safe;
}

function nextStart(text: string, end: number, overlap: number, boundaries: number[]): number {
  if (!overlap) return end;
  const target = Math.max(0, end - overlap);
  let boundary = boundaries[lowerBound(boundaries, target)] ?? end;
  const suffix = text.slice(boundary, end);
  // Move forward to a word boundary when the target lands inside a word.
  if (boundary > 0 && !/\s/u.test(text[boundary - 1]) && !/\s/u.test(text[boundary])) {
    const space = /\s+/u.exec(suffix);
    boundary = space ? boundary + space.index + space[0].length : end;
  }
  return boundaries[lowerBound(boundaries, boundary)] ?? end;
}

export function chunkDocument(input: ExtractedDocument, supplied: Partial<ChunkOptions> = {}): ChunkingResult {
  const fail = (code: string, status: "INVALID_INPUT" | "RESOURCE_LIMIT" = "INVALID_INPUT"): ChunkingResult => ({ status, code, chunks: [] });
  if (supplied === null || typeof supplied !== "object" || Array.isArray(supplied)) return fail("CHUNK_OPTIONS_INVALID");
  const options = { ...DEFAULT_CHUNK_OPTIONS, ...supplied };
  if (Object.keys(supplied).some(key => key !== "maxChunkUtf16Units" && key !== "overlapUtf16Units") || !Number.isInteger(options.maxChunkUtf16Units) || options.maxChunkUtf16Units < 1 || options.maxChunkUtf16Units > 8000 || !Number.isInteger(options.overlapUtf16Units) || options.overlapUtf16Units < 0 || options.overlapUtf16Units > Math.floor(options.maxChunkUtf16Units / 2)) return fail("CHUNK_OPTIONS_INVALID");
  if (input?.segments?.length > EXTRACTION_LIMITS.segments) return fail("SEGMENT_LIMIT", "RESOURCE_LIMIT");
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return fail("DOCUMENT_INVALID");
  const document = parsed.data;
  const ids = new Set<string>();
  let units = 0;
  for (const [i, segment] of document.segments.entries()) {
    if (segment.ordinal !== i || ids.has(segment.id) || segment.origin.format !== document.format || normalizeText(segment.text) !== segment.text) return fail("SEGMENT_INVALID");
    if (segment.origin.format === "TXT" && segment.origin.lineEnd < segment.origin.lineStart) return fail("SEGMENT_INVALID");
    ids.add(segment.id);
    units += segment.text.length;
    if (units > EXTRACTION_LIMITS.textUtf16Units) return fail("TEXT_LIMIT", "RESOURCE_LIMIT");
  }
  if (sha256(canonical(document.segments.map(({ text, kind, origin }) => ({ text, kind, origin })))) !== document.normalizedContentHash) return fail("CONTENT_HASH_MISMATCH");
  if (!document.segments.length) return { status: "NO_EXTRACTABLE_TEXT", reason: "NO_TEXT", chunks: [] };
  const groups: ExtractedSegment[][] = [];
  let previousSection: string | undefined;
  for (const segment of document.segments) {
    const key = segment.origin.format === "DOCX" ? segment.origin.section?.id : undefined;
    if (!groups.length || key !== previousSection) groups.push([]);
    groups[groups.length - 1].push(segment);
    previousSection = key;
  }
  const chunks: DocumentChunk[] = [];
  for (const group of groups) {
    const pieces: string[] = [];
    const spans: Span[] = [];
    let length = 0;
    for (const segment of group) {
      if (pieces.length) { pieces.push(CHUNK_SEPARATOR); length += CHUNK_SEPARATOR.length; }
      spans.push({ start: length, end: length + segment.text.length, segment });
      pieces.push(segment.text); length += segment.text.length;
    }
    const text = pieces.join("");
    const ends = spans.map(span => span.end);
    const boundaries: number[] = [];
    for (const part of graphemes.segment(text)) boundaries.push(part.index);
    boundaries.push(text.length);
    let start = 0;
    let previousEnd = 0;
    while (start < text.length) {
      const end = cut(text, start, Math.min(text.length, start + options.maxChunkUtf16Units), previousEnd, ends, boundaries);
      if (end <= previousEnd || end <= start) return fail("GRAPHEME_EXCEEDS_CHUNK_SIZE");
      const refs: SourceReference[] = [];
      const locators: DocumentChunk["locators"] = [];
      const seenLocators = new Set<string>();
      for (let spanIndex = lowerBound(ends, start + 1); spanIndex < spans.length; spanIndex++) {
        const span = spans[spanIndex];
        if (span.start >= end) break;
        const from = Math.max(start, span.start);
        const to = Math.min(end, span.end);
        if (to <= from) continue;
        refs.push({ segmentId: span.segment.id, segmentStart: from - span.start, segmentEnd: to - span.start, chunkStart: from - start, chunkEnd: to - start });
        const locatorKey = canonical(span.segment.origin);
        if (!seenLocators.has(locatorKey)) { locators.push(span.segment.origin); seenLocators.add(locatorKey); }
      }
      if (refs.length) {
        if (chunks.length >= EXTRACTION_LIMITS.chunks) return fail("CHUNK_LIMIT", "RESOURCE_LIMIT");
        const index = chunks.length;
        const chunkText = text.slice(start, end);
        const chunkerVersion = CHUNKER_VERSION;
        const chunkHash = sha256(canonical({ originalBytesHash: document.originalBytesHash, normalizedContentHash: document.normalizedContentHash, extractorVersion: document.extractorVersion, normalizationVersion: document.normalizationVersion, chunkerVersion, options, index, text: chunkText, refs, locators }));
        chunks.push({ index, text: chunkText, refs, locators, textHash: sha256(chunkText), chunkHash, chunkerVersion });
      }
      if (end === text.length) break;
      start = nextStart(text, end, options.overlapUtf16Units, boundaries);
      previousEnd = end;
      // Do not emit an isolated separator chunk.
      const nextSpan = spans[lowerBound(ends, start + 1)];
      if (nextSpan) start = Math.max(start, nextSpan.start);
    }
  }
  return { status: "CHUNKED", chunks };
}
