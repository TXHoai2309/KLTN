import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { extractDocument } from "./extract-document";
import { chunkDocument } from "./chunk-document";
import { canonical, sha256 } from "./content-hash";
import { syntheticDocx } from "./__fixtures__/synthetic-documents";
import { researchDocx } from "./__fixtures__/research-docx";
const profiles = ["Cao nguyên đá Đồng Văn", "Di tích Căng Bắc Mê", "Chợ tình Khâu Vai"];
function assertCoverage(document: Extract<Awaited<ReturnType<typeof extractDocument>>, {status: "EXTRACTED"}>["document"]) {
  expect(document.warnings).toEqual([]);
  expect(document.normalizedContentHash).toBe(sha256(canonical(document.segments.map(({text,kind,origin}) => ({text,kind,origin})))));
  const result = chunkDocument(document);
  if (result.status !== "CHUNKED") throw new Error(result.status);
  expect(new Set(result.chunks.map(c => c.chunkHash)).size).toBe(result.chunks.length);
  expect(new Set(result.chunks.map(c => c.textHash)).size).toBe(result.chunks.length);
  for (const segment of document.segments) {
    const covered = Array<boolean>(segment.text.length).fill(false);
    for (const chunk of result.chunks) {
      expect(chunk.text).not.toMatch(/[\u0000\ufffd]/u);
      expect(chunk.textHash).toBe(sha256(chunk.text));
      for (const ref of chunk.refs.filter(r => r.segmentId === segment.id)) {
        expect(chunk.text.slice(ref.chunkStart, ref.chunkEnd)).toBe(segment.text.slice(ref.segmentStart, ref.segmentEnd));
        covered.fill(true, ref.segmentStart, ref.segmentEnd);
      }
    }
    expect(covered.every(Boolean)).toBe(true);
  }
  return result.chunks;
}
describe("DOCX complete story and source coverage", () => {
  it("retains plain URLs and rejects literal NUL instead of silently repairing XML", async () => {
    const text = "[S01] Tài liệu\nURL: https://example.org/source";
    const result = await extractDocument({format:"DOCX", bytes:syntheticDocx(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.segments[0].text).toBe(text);
    assertCoverage(result.document);
    expect(await extractDocument({format:"DOCX", bytes:syntheticDocx("<w:p><w:r><w:t>Bad\u0000text</w:t></w:r></w:p>")})).toMatchObject({status:"CORRUPT_DOCUMENT",code:"DOCX_XML_CONTROL_INVALID"});
  });
  it("does not silently omit unknown regions inside tables", async () => {
    const result = await extractDocument({format:"DOCX", bytes:syntheticDocx('<w:tbl><w:unknown><w:p><w:r><w:t>Hidden</w:t></w:r></w:p></w:unknown></w:tbl>')});
    expect(result).toMatchObject({status:"NO_EXTRACTABLE_TEXT",document:{warnings:[{code:"UNSUPPORTED_DOCX_REGION",unsupportedElement:"unknown"}]}});
  });
  it("resolves custom header filenames once and rejects invalid auxiliary namespaces", async () => {
    const extra = {
      "word/custom.xml": strToU8('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>'),
      "word/_rels/document.xml.rels": strToU8('<Relationships><Relationship Type="urn:test/header" Target="custom.xml"/><Relationship Type="urn:test/header" Target="custom.xml"/></Relationships>'),
    };
    const result = await extractDocument({format:"DOCX",bytes:syntheticDocx("", "", extra)});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.segments.map(s=>s.text)).toEqual(["Header"]);
    expect(result.document.warnings).toEqual([]);
    extra["word/custom.xml"] = strToU8('<w:hdr xmlns:w="urn:fake"/>');
    expect(await extractDocument({format:"DOCX",bytes:syntheticDocx("", "", extra)})).toMatchObject({status:"CORRUPT_DOCUMENT",code:"DOCX_NAMESPACE_INVALID"});
  });
  it("blocks unsafe hyperlink targets without fetching or indexing the target", async () => {
    const result = await extractDocument({format:"DOCX",bytes:syntheticDocx('<w:p><w:hyperlink r:id="bad"><w:r><w:t>Label</w:t></w:r></w:hyperlink></w:p>', "", {
      "word/_rels/document.xml.rels": strToU8('<Relationships><Relationship Id="bad" Type="urn:test/hyperlink" Target="file:///private" TargetMode="External"/></Relationships>'),
    })});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.segments[0].text).toBe("Label");
    expect(result.document.warnings).toMatchObject([{unsupportedElement:"hyperlink-target"}]);
  });
  it.each(profiles)("preserves %s headings, table, sources, header/footer and saved PAGE result", async title => {
    const url = "https://example.org/source?x=1&y=2";
    const bytes = researchDocx(title);
    const result = await extractDocument({format:"DOCX",bytes});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.segments.map(s=>s.text)).toEqual(["Đầu tài liệu",title,"Dữ liệu kiểm thử tiếng Việt. ".repeat(100).trim(),"[S01] Tài liệu thử nghiệm",`URL: Nguồn ${url}`,"Cuối tài liệu 1"]);
    expect(result.document.segments[1].kind).toBe("heading");
    expect(result.document.segments[3].kind).toBe("table-cell");
    expect(result.document.originalBytesHash).toBe(sha256(bytes));
    const chunks = assertCoverage(result.document);
    expect(chunks.some(c => c.text.includes("[S01]") && c.text.includes(url))).toBe(true);
    expect(await extractDocument({format:"DOCX",bytes})).toEqual(result);
  });
  it.each(["DDEAUTO", "INCLUDETEXT", "HYPERLINK"])("blocks unevaluated executable/unsupported field %s", async field => {
    const result = await extractDocument({format:"DOCX", bytes:syntheticDocx(`<w:p><w:fldSimple w:instr="${field} secret"><w:r><w:t>Saved</w:t></w:r></w:fldSimple></w:p>`)});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.warnings).toMatchObject([{code:"UNSUPPORTED_DOCX_REGION",unsupportedElement:"fldSimple",ooxmlPart:"word/document.xml"}]);
    expect(result.document.segments[0].text).toBe("Saved");
  });
});
const qaDir = process.env.RAG_DOCX_QA_DIR;
describe.skipIf(!qaDir)("owner original files read-only independent XML oracle", () => {
  const files = ["Cao_nguyen_da_Dong_Van_RAG_URL_day_du_2026.docx", "Cang_Bac_Me_Ho_so_du_lieu_RAG_nguon_URL_day_du_2026.docx", "Khau_Vai_RAG_2026.docx"];
  it.each(files)("complete extraction and chunk coverage: %s", async name => {
    const oracle = JSON.parse(readFileSync(join(qaDir!, "oracle.json"),"utf8"))[name] as { path:string; paragraphs:string[]; urls:string[]; hash:string };
    const bytes = new Uint8Array(readFileSync(oracle.path));
    const result = await extractDocument({format:"DOCX",bytes});
    if (result.status !== "EXTRACTED") throw new Error(result.status);
    expect(result.document.originalBytesHash).toBe(oracle.hash);
    expect(result.document.warnings.map(w=>({region:w.region,part:w.ooxmlPart}))).toEqual([]);
    expect(result.document.segments.map(s=>sha256(s.text))).toEqual(oracle.paragraphs.map(text=>sha256(text)));
    const chunks = assertCoverage(result.document);
    for (const url of oracle.urls) expect(chunks.some(c=>c.text.includes(url)), "complete source URL in retrievable chunk").toBe(true);
    expect(await extractDocument({format:"DOCX",bytes})).toEqual(result);
    console.info("DOCX_QA", {name,paragraphs:oracle.paragraphs.length,urls:oracle.urls.length,chunks:chunks.length,hash:oracle.hash});
  });
});
