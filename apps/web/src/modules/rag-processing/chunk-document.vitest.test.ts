import { describe, expect, it } from "vitest";
import type { ExtractedDocument, ExtractedSegment, SegmentOrigin } from "./extraction-contract";
import type { DocumentChunk } from "./chunk-contract";
import { chunkDocument } from "./chunk-document";
import { canonical, sha256 } from "./content-hash";
import { extractDocument } from "./extract-document";
import { EXTRACTION_LIMITS } from "./extraction-limits";
import { strToU8 } from "fflate";
import { syntheticPdf } from "./__fixtures__/synthetic-documents";

function document(texts: string[], origins?: SegmentOrigin[]): ExtractedDocument {
  const segments: ExtractedSegment[] = texts.map((text, ordinal) => ({ id: `s${ordinal}`, ordinal, kind: "paragraph", text, origin: origins?.[ordinal] ?? { format: "TXT", lineStart: ordinal + 1, lineEnd: ordinal + 1 } }));
  return { format: origins?.[0]?.format ?? "TXT", originalBytesHash: sha256("synthetic-bytes"), extractorVersion: "synthetic-v1", normalizationVersion: "nfc-v1", normalizedContentHash: sha256(canonical(segments.map(({ text, kind, origin }) => ({ text, kind, origin })))), segments, warnings: [] };
}
function chunks(doc: ExtractedDocument, size = 1600, overlap = 200) {
  const result = chunkDocument(doc, { maxChunkUtf16Units: size, overlapUtf16Units: overlap });
  if (result.status !== "CHUNKED") throw new Error(JSON.stringify(result));
  return result.chunks;
}
function verifyRefs(doc: ExtractedDocument, output: DocumentChunk[]) {
  for (const chunk of output) {
    let cursor = 0;
    for (const ref of chunk.refs) {
      const segment = doc.segments.find(s => s.id === ref.segmentId)!;
      expect(segment).toBeDefined();
      expect(ref.segmentStart).toBeGreaterThanOrEqual(0);
      expect(ref.segmentEnd).toBeLessThanOrEqual(segment.text.length);
      expect(ref.segmentEnd).toBeGreaterThan(ref.segmentStart);
      expect(chunk.text.slice(ref.chunkStart, ref.chunkEnd)).toBe(segment.text.slice(ref.segmentStart, ref.segmentEnd));
      const separator = chunk.text.slice(cursor, ref.chunkStart);
      expect(["", "\n\n"]).toContain(separator);
      cursor = ref.chunkEnd;
      expect(chunk.locators).toContainEqual(segment.origin);
    }
    expect(chunk.text.slice(cursor)).toMatch(/^\s*$/);
    expect(chunk.textHash).toBe(sha256(chunk.text));
    for (const locator of chunk.locators) expect(chunk.refs.some(ref => canonical(doc.segments.find(s => s.id === ref.segmentId)!.origin) === canonical(locator))).toBe(true);
  }
}

describe("Task182 deterministic chunks", () => {
  it("preserves paragraph boundaries and repeated paragraphs", () => {
    const doc = document(["Đoạn một", "Lặp lại", "Lặp lại"]);
    const output = chunks(doc);
    expect(output.map(c => c.text)).toEqual(["Đoạn một\n\nLặp lại\n\nLặp lại"]);
    expect(output[0].refs.map(r => r.segmentId)).toEqual(["s0", "s1", "s2"]);
    verifyRefs(doc, output);
  });
  it("handles long paragraphs, overlap and exact source slices", () => {
    const doc = document(["Đây là đoạn tổng hợp dài. ".repeat(240).trim()]);
    const output = chunks(doc, 80, 20);
    expect(output.length).toBeGreaterThan(50);
    output.forEach((c, i) => { expect(c.index).toBe(i); expect(c.text.length).toBeLessThanOrEqual(80); });
    expect(output.some((c, i) => i > 0 && c.refs[0].segmentStart < output[i - 1].refs.at(-1)!.segmentEnd)).toBe(true);
    expect(output.at(-1)!.refs.at(-1)!.segmentEnd).toBe(doc.segments[0].text.length);
    verifyRefs(doc, output);
  });
  it("no overlap reconstructs every source character exactly once", () => {
    const doc = document(["Kiểm thử tiếng Việt. ".repeat(50).trim()]);
    const output = chunks(doc, 63, 0);
    expect(output.map(c => c.text).join("")).toBe(doc.segments[0].text);
    verifyRefs(doc, output);
  });
  it("prefers sentences then words before arbitrary splits", () => {
    expect(chunks(document(["Một câu. Hai câu dài hơn nhiều chữ."]), 17, 0)[0].text).toBe("Một câu. ");
    expect(chunks(document(["một hai ba bốn năm sáu bảy"]), 12, 0)[0].text).toBe("một hai ba ");
  });
  it("never carries overlap across sections, including repeated heading titles", () => {
    const doc = document(["Mục một có nội dung rất dài. ".repeat(8).trim(), "Mục hai."], [
      { format: "DOCX", blockIndex: 0, section: { id: "section-a", title: "Trùng tên", level: 1 } },
      { format: "DOCX", blockIndex: 1, section: { id: "section-b", title: "Trùng tên", level: 1 } },
    ]);
    const output = chunks(doc, 50, 20);
    expect(output.at(-1)!.text).toBe("Mục hai.");
    expect(output.at(-1)!.refs.map(r => r.segmentId)).toEqual(["s1"]);
    expect(output.every(c => new Set(c.locators.map(l => l.format === "DOCX" ? l.section?.id : "")).size === 1)).toBe(true);
  });
  it("noncontiguous pages 2 and 4 stay exactly 2 and 4", () => {
    const doc = document(["Trang hai.", "Trang bốn."], [{ format: "PDF", pageNumber: 2, blockIndex: 0 }, { format: "PDF", pageNumber: 4, blockIndex: 0 }]);
    const output = chunks(doc);
    expect(output[0].locators).toEqual([{ format: "PDF", pageNumber: 2, blockIndex: 0 }, { format: "PDF", pageNumber: 4, blockIndex: 0 }]);
    verifyRefs(doc, output);
  });
  it("overlap retains all and only contributing page associations", () => {
    const doc = document(["Trang hai có đoạn kiểm thử dài. ".repeat(3).trim(), "Trang bốn có nội dung."] , [{ format: "PDF", pageNumber: 2, blockIndex: 0 }, { format: "PDF", pageNumber: 4, blockIndex: 0 }]);
    const output = chunks(doc, 75, 25);
    verifyRefs(doc, output);
    expect(output.at(-1)!.locators.map(l => l.format === "PDF" ? l.pageNumber : 0)).toEqual([2, 4]);
  });
  it("uses grapheme boundaries for emoji, ZWJ and combining sequences", () => {
    const value = "👨‍👩‍👧‍👦🙂q\u0301 ".repeat(25).trim();
    const doc = document([value]);
    const output = chunks(doc, 30, 10);
    const boundaries = new Set([0, ...Array.from(new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(value), p => p.index + p.segment.length)]);
    for (const c of output) for (const ref of c.refs) { expect(boundaries.has(ref.segmentStart)).toBe(true); expect(boundaries.has(ref.segmentEnd)).toBe(true); }
    verifyRefs(doc, output);
  });
  it("an oversized indivisible grapheme fails instead of looping or splitting", () => {
    expect(chunkDocument(document(["👨‍👩‍👧‍👦"]), { maxChunkUtf16Units: 2, overlapUtf16Units: 1 })).toEqual({ status: "INVALID_INPUT", code: "GRAPHEME_EXCEEDS_CHUNK_SIZE", chunks: [] });
  });
  it("one-unit chunks with zero overlap always advance", () => { expect(chunks(document(["abcdef"]), 1, 0).map(c => c.text)).toEqual(["a", "b", "c", "d", "e", "f"]); });
  it("default options and repeated executions are stable", () => {
    const doc = document(["Nội dung tổng hợp. ".repeat(200).trim()]);
    expect(chunkDocument(doc)).toEqual(chunkDocument(doc));
    expect(chunkDocument(doc)).toEqual(chunkDocument(doc, { maxChunkUtf16Units: 1600, overlapUtf16Units: 200 }));
    expect(chunks(doc).every(c => c.text.length <= 1600)).toBe(true);
  });
  it("identity changes for versions/options/source, independently of text hash", () => {
    const doc = document(["Ngắn."]);
    const original = chunks(doc)[0];
    for (const changed of [{ ...doc, extractorVersion: "v2" }, { ...doc, normalizationVersion: "v2" }, { ...doc, originalBytesHash: sha256("different bytes") }]) {
      expect(chunks(changed)[0].chunkHash).not.toBe(original.chunkHash);
      expect(chunks(changed)[0].textHash).toBe(original.textHash);
    }
    expect(chunks(doc, 1000, 100)[0].chunkHash).not.toBe(original.chunkHash);
  });
  it.each([{ maxChunkUtf16Units: 0 }, { maxChunkUtf16Units: 8001 }, { maxChunkUtf16Units: 1.5 }, { overlapUtf16Units: -1 }, { overlapUtf16Units: 801 }, { overlapUtf16Units: NaN }])("invalid options %j", options => { expect(chunkDocument(document(["text"]), options)).toMatchObject({ status: "INVALID_INPUT", chunks: [] }); });
  it("empty model gives explicit reason", () => { expect(chunkDocument(document([]))).toEqual({ status: "NO_EXTRACTABLE_TEXT", reason: "NO_TEXT", chunks: [] }); });
  it("rejects inconsistent hashes, origins, ordering and duplicate IDs", () => {
    const doc = document(["one", "two"]);
    expect(chunkDocument({ ...doc, normalizedContentHash: sha256("wrong") })).toMatchObject({ status: "INVALID_INPUT" });
    for (const changed of [{ ...doc.segments[1], id: "s0" }, { ...doc.segments[1], ordinal: 3 }, { ...doc.segments[1], text: " two " }, { ...doc.segments[1], origin: { format: "PDF" as const, pageNumber: 1, blockIndex: 0 } }]) {
      expect(chunkDocument({ ...doc, segments: [doc.segments[0], changed] })).toMatchObject({ status: "INVALID_INPUT" });
    }
  });
  it("chunk count and segment count limits fail without partial chunks", () => {
    expect(chunkDocument(document(["x".repeat(EXTRACTION_LIMITS.chunks + 1)]), { maxChunkUtf16Units: 1, overlapUtf16Units: 0 })).toEqual({ status: "RESOURCE_LIMIT", code: "CHUNK_LIMIT", chunks: [] });
    const doc = document(["x"]);
    expect(chunkDocument({ ...doc, segments: Array(EXTRACTION_LIMITS.segments + 1).fill(doc.segments[0]) })).toMatchObject({ status: "RESOURCE_LIMIT", code: "SEGMENT_LIMIT", chunks: [] });
  });
  it("TXT/PDF extraction integrates with chunking without metadata fabrication", async () => {
    for (const input of [{ format: "TXT", bytes: strToU8("Đoạn một\n\nĐoạn hai") }, { format: "PDF", bytes: syntheticPdf([{ text: "Trang một." }, {}, { text: "Trang ba." }]) }]) {
      const r = await extractDocument(input);
      if (r.status !== "EXTRACTED") throw new Error("failed");
      verifyRefs(r.document, chunks(r.document));
      if (input.format === "TXT") expect(chunks(r.document)[0].locators.every(l => !("pageNumber" in l) && !("section" in l))).toBe(true);
    }
  });
});
