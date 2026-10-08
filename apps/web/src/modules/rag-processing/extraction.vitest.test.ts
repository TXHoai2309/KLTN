import { describe, expect, it } from "vitest";
import { strToU8, zipSync, Zip, ZipDeflate } from "fflate";
import { extractDocument } from "./extract-document";
import { EXTRACTION_LIMITS } from "./extraction-limits";
import { encryptedSyntheticPdf, p, syntheticDocx, syntheticPdf } from "./__fixtures__/synthetic-documents";
import { sha256 } from "./content-hash";

const extract = (format: string, bytes: Uint8Array) => extractDocument({ format, bytes });

describe("Task181 TXT", () => {
  it("strict UTF8/BOM/CRLF/CR/NFD keeps accents and original lines", async () => {
    const bytes = strToU8("\uFEFF  Tiếng Việt\r\nDòng hai\r\n\r\nĐoạn cuối\r");
    const result = await extract("TXT", bytes);
    expect(result.status).toBe("EXTRACTED");
    if (result.status !== "EXTRACTED") throw new Error("extraction failed");
    expect(result.document.segments.map(s => s.text)).toEqual(["Tiếng Việt\nDòng hai", "Đoạn cuối"]);
    expect(result.document.segments.map(s => s.origin)).toEqual([{ format: "TXT", lineStart: 1, lineEnd: 2 }, { format: "TXT", lineStart: 4, lineEnd: 4 }]);
    const nfd = await extract("TXT", strToU8("Tiếng Việt".normalize("NFD")));
    if (nfd.status !== "EXTRACTED") throw new Error("NFD failed");
    expect(nfd.document.segments[0].text).toBe("Tiếng Việt");
    expect(result.document.originalBytesHash).toBe(sha256(bytes));
  });
  it.each([new Uint8Array(), strToU8(" \r\n\t ")])("empty text has explicit reason", async bytes => {
    expect(await extract("TXT", bytes)).toMatchObject({ status: "NO_EXTRACTABLE_TEXT", reason: "NO_TEXT", document: { segments: [] } });
  });
  it("rejects invalid UTF8 rather than replacing bytes", async () => { expect(await extract("TXT", new Uint8Array([0xc3, 0x28]))).toMatchObject({ status: "INVALID_ENCODING" }); });
  it("rejects binary controls", async () => { expect(await extract("TXT", new Uint8Array([0, 1]))).toMatchObject({ status: "CORRUPT_DOCUMENT" }); });
  it("does not deduplicate repeated paragraphs or invent headings", async () => {
    const r = await extract("TXT", strToU8("# tiêu đề\n\nLặp lại\n\nLặp lại"));
    if (r.status !== "EXTRACTED") throw new Error("failed");
    expect(r.document.segments).toHaveLength(3);
    expect(r.document.segments.every(s => s.kind === "paragraph" && !("pageNumber" in s.origin) && !("section" in s.origin))).toBe(true);
  });
});

describe("Task181 PDF", () => {
  it("real Unicode text, empty/image pages, and physical page association", async () => {
    const result = await extract("PDF", syntheticPdf([{ text: "Tiếng Việt: dữ liệu tổng hợp." }, {}, { text: "Trang thứ ba.", image: true }, { image: true }]));
    if (result.status !== "EXTRACTED") throw new Error(JSON.stringify(result));
    expect(result.document.segments.map(s => s.text)).toEqual(["Tiếng Việt: dữ liệu tổng hợp.", "Trang thứ ba."]);
    expect(result.document.segments.map(s => s.origin)).toEqual([{ format: "PDF", pageNumber: 1, blockIndex: 0 }, { format: "PDF", pageNumber: 3, blockIndex: 0 }]);
    expect(result.document.warnings).toContainEqual({ code: "PAGE_WITHOUT_TEXT", pageNumber: 2 });
    expect(result.document.warnings).toContainEqual({ code: "PAGE_WITHOUT_TEXT", pageNumber: 4 });
    expect(result.document.warnings).toContainEqual({ code: "PDF_READING_ORDER_HEURISTIC" });
  });
  it("image-only returns no text without OCR", async () => { expect(await extract("PDF", syntheticPdf([{ image: true }]))).toMatchObject({ status: "NO_EXTRACTABLE_TEXT", document: { segments: [], warnings: expect.arrayContaining([{ code: "PAGE_WITHOUT_TEXT", pageNumber: 1 }]) } }); });
  it("real password encryption is classified", async () => { expect(await extract("PDF", encryptedSyntheticPdf())).toMatchObject({ status: "PASSWORD_REQUIRED" }); });
  it("corrupt input never succeeds", async () => { expect(await extract("PDF", strToU8("%PDF-1.4\ninvalid\n%%EOF"))).toMatchObject({ status: "CORRUPT_DOCUMENT" }); });
  it("rejects over 500 physical pages", async () => { expect(await extract("PDF", syntheticPdf(Array.from({ length: 501 }, () => ({}))))).toMatchObject({ status: "RESOURCE_LIMIT", code: "PDF_PAGE_LIMIT" }); });
  it("repeated extraction is deterministic and does not detach caller bytes", async () => {
    const bytes = syntheticPdf([{ text: "Kiểm thử." }]);
    const before = sha256(bytes);
    expect(await extract("PDF", bytes)).toEqual(await extract("PDF", bytes));
    expect(sha256(bytes)).toBe(before);
  });
});

describe("Task181 DOCX", () => {
  const styles = '<w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Inherited"><w:basedOn w:val="Base"/></w:style>';
  it("body runs/headings/tables/inheritance stay in order; repeated headings are distinct", async () => {
    const heading = '<w:pStyle w:val="Inherited"/>';
    const bytes = syntheticDocx(p("Mục thử nghiệm", heading) + '<w:p><w:r><w:t>Tiếng </w:t></w:r><w:r><w:t>Việt &amp; bảng</w:t></w:r></w:p>' + `<w:tbl><w:tr><w:tc>${p("Ô một")}</w:tc><w:tc>${p("Ô hai")}</w:tc></w:tr></w:tbl>` + p("Mục thử nghiệm", heading) + p("Đoạn cuối"), styles);
    const r = await extract("DOCX", bytes);
    if (r.status !== "EXTRACTED") throw new Error(JSON.stringify(r));
    expect(r.document.segments.map(s => s.text)).toEqual(["Mục thử nghiệm", "Tiếng Việt & bảng", "Ô một", "Ô hai", "Mục thử nghiệm", "Đoạn cuối"]);
    expect(r.document.segments.map(s => s.kind)).toEqual(["heading", "paragraph", "table-cell", "table-cell", "heading", "paragraph"]);
    expect(r.document.segments[2].origin).toMatchObject({ table: { index: 0, row: 0, cell: 0 } });
    expect(r.document.segments[0].origin).toMatchObject({ section: { id: "section-0", title: "Mục thử nghiệm", level: 1 } });
    expect(r.document.segments[4].origin).toMatchObject({ section: { id: "section-4", title: "Mục thử nghiệm", level: 1 } });
    expect(r.document.segments.every(s => !("pageNumber" in s.origin))).toBe(true);
    expect(await extract("DOCX", bytes)).toEqual(r);
  });
  it("bold is not a verified heading", async () => {
    const r = await extract("DOCX", syntheticDocx('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Đậm</w:t></w:r></w:p>'));
    if (r.status !== "EXTRACTED") throw new Error("failed");
    expect(r.document.segments[0]).toMatchObject({ kind: "paragraph", origin: { format: "DOCX", blockIndex: 0 } });
    expect(r.document.segments[0].origin).not.toHaveProperty("section");
  });
  it("warns for excluded content; no embedded code/external fetch", async () => {
    const r = await extract("DOCX", syntheticDocx(p("Đọc được") + '<w:p><w:r><w:drawing><w:txbxContent>' + p("Không đọc") + '</w:txbxContent></w:drawing></w:r></w:p><w:altChunk/>', "", { "word/header1.xml": strToU8("private header"), "word/footnotes.xml": strToU8("footnote"), "word/_rels/document.xml.rels": strToU8('<Relationships><Relationship Target="https://invalid.example" TargetMode="External"/></Relationships>') }));
    if (r.status !== "EXTRACTED") throw new Error(JSON.stringify(r));
    expect(r.document.segments.map(s => s.text)).toEqual(["Đọc được"]);
    expect(r.document.warnings.map(w => w.region)).toEqual(expect.arrayContaining(["word/header1.xml", "word/footnotes.xml", "drawing", "altChunk"]));
  });
  it.each(["<w:p>", "<w:p><w:r></w:p>", '<w:p xmlns:w="urn:fake"><w:r><w:t>Fake</w:t></w:r></w:p>', p("&unknown;"), p("&constructor;"), p("&bare"), p("&#0;")])("rejects malformed/hostile OOXML %s", async body => { expect(await extract("DOCX", syntheticDocx(body))).toMatchObject({ status: "CORRUPT_DOCUMENT" }); });
  it("detects excluded regions by relationships even with nonstandard names", async () => {
    const r = await extract("DOCX", syntheticDocx(p("Body"), "", { "word/custom-name.xml": strToU8("excluded text"), "word/_rels/document.xml.rels": strToU8('<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="custom-name.xml"/></Relationships>') }));
    if (r.status !== "EXTRACTED") throw new Error("failed");
    expect(r.document.warnings).toContainEqual({ code: "UNSUPPORTED_DOCX_REGION", region: "relationship:header" });
  });
  it("rejects DTD/entity constructs before expansion", async () => { expect(await extract("DOCX", syntheticDocx(p("&xxe;"), "", { "word/document.xml": strToU8('<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///private">]><x>&xxe;</x>') }))).toMatchObject({ status: "CORRUPT_DOCUMENT", code: "XML_DTD_UNSAFE" }); });
  it("style cycles fail explicitly", async () => { expect(await extract("DOCX", syntheticDocx(p("text"), '<w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="A"/></w:style>'))).toMatchObject({ status: "CORRUPT_DOCUMENT", code: "DOCX_STYLE_CYCLE" }); });
  it("empty body yields explicit no text", async () => { expect(await extract("DOCX", syntheticDocx(""))).toMatchObject({ status: "NO_EXTRACTABLE_TEXT" }); });
  it("corrupt ZIP and unsafe paths fail", async () => {
    expect(await extract("DOCX", new Uint8Array([0x50, 0x4b]))).toMatchObject({ status: "CORRUPT_DOCUMENT" });
    expect(await extract("DOCX", syntheticDocx(p("text"), "", { "../escape": strToU8("x") }))).toMatchObject({ status: "CORRUPT_DOCUMENT" });
  });
  it("bounds XML depth before parsing", async () => { expect(await extract("DOCX", syntheticDocx("<w:sdt>".repeat(129) + p("x") + "</w:sdt>".repeat(129)))).toMatchObject({ status: "RESOURCE_LIMIT", code: "XML_DEPTH_LIMIT" }); });
  it("bounds ZIP entry count", async () => {
    const extras = Object.fromEntries(Array.from({ length: EXTRACTION_LIMITS.zipEntries }, (_, i) => [`unused/${i}`, new Uint8Array()]));
    expect(await extract("DOCX", syntheticDocx(p("x"), "", extras))).toMatchObject({ status: "RESOURCE_LIMIT", code: "ZIP_ENTRY_LIMIT" });
  });
  it("bounds actual bytes despite lying local header size", async () => {
    const bytes = syntheticDocx(p("a".repeat(EXTRACTION_LIMITS.singleXmlBytes + 1)));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length - 30; offset++) {
      if (view.getUint32(offset, true) === 0x04034b50) view.setUint32(offset + 22, 1, true);
    }
    expect(await extract("DOCX", bytes)).toMatchObject({ status: "RESOURCE_LIMIT", code: "XML_PART_LIMIT" });
  });
  it("bounds actual decompressed bytes for descriptor ZIP without upfront size", async () => {
    const pieces: Uint8Array[] = [];
    const zip = new Zip((error, bytes) => { if (error) throw error; pieces.push(bytes); });
    const part = new ZipDeflate("word/document.xml");
    zip.add(part);
    const block = new Uint8Array(65536).fill(65);
    for (let i = 0; i < 257; i++) part.push(block, i === 256);
    zip.end();
    const bytes = new Uint8Array(Buffer.concat(pieces));
    expect(await extract("DOCX", bytes)).toMatchObject({ status: "RESOURCE_LIMIT", code: "XML_PART_LIMIT" });
  });
  it("missing OOXML parts fail", async () => { expect(await extract("DOCX", zipSync({ "fake.txt": strToU8("x") }))).toMatchObject({ status: "CORRUPT_DOCUMENT" }); });
  it("selected XML aggregate budget counts actual emitted bytes", async () => {
    const large = new Uint8Array(11 * 1024 * 1024).fill(32);
    expect(await extract("DOCX", syntheticDocx(p("x"), "", { "[Content_Types].xml": large, "_rels/.rels": large, "word/styles.xml": large }))).toMatchObject({ status: "RESOURCE_LIMIT", code: "XML_TOTAL_LIMIT" });
  });
  it("central checksum mismatch never becomes successful extraction", async () => {
    const bytes = syntheticDocx(p("Text"));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 16, 123, true);
    }
    expect(await extract("DOCX", bytes)).toMatchObject({ status: "CORRUPT_DOCUMENT", code: "DOCX_ZIP_CHECKSUM_INVALID" });
  });
});

describe("Task181 resource/format limits", () => {
  it("unsupported format is distinct", async () => { expect(await extract("RTF", strToU8("x"))).toEqual({ status: "UNSUPPORTED_FORMAT", code: "FORMAT_NOT_SUPPORTED" }); });
  it("oversize input fails before parsing", async () => { expect(await extract("PDF", new Uint8Array(EXTRACTION_LIMITS.inputBytes + 1))).toMatchObject({ status: "RESOURCE_LIMIT", code: "INPUT_LIMIT" }); });
  it("input at 20MiB reaches parser, not input rejection", async () => { expect(await extract("TXT", new Uint8Array(EXTRACTION_LIMITS.inputBytes).fill(32))).toMatchObject({ status: "NO_EXTRACTABLE_TEXT" }); });
  it("oversize normalized text fails without a truncated result", async () => { expect(await extract("TXT", strToU8("x".repeat(EXTRACTION_LIMITS.textUtf16Units + 1)))).toEqual({ status: "RESOURCE_LIMIT", code: "TEXT_LIMIT" }); });
  it("oversize segment count fails without a truncated result", async () => { expect(await extract("TXT", strToU8("x\n\n".repeat(EXTRACTION_LIMITS.segments + 1)))).toMatchObject({ status: "RESOURCE_LIMIT", code: "SEGMENT_LIMIT" }); });
});
