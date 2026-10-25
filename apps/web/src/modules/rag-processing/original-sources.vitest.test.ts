import { describe, expect, it } from "vitest";
import { extractDocument } from "./extract-document";
import { chunkDocument } from "./chunk-document";
import { syntheticDocx, p } from "./__fixtures__/synthetic-documents";
import { deriveOriginalSources, readOriginalSourceBundle, sourceBundleHash } from "./original-sources";
import { originalSourceUrl } from "../../lib/original-source-url";
import { readFile } from "node:fs/promises";
import { citationEvidenceText } from "./original-sources";

async function fixture(conflict = false, customBody?:string) {
  const body = Array.from({length:23},(_,i) => p(`Mục ${i+1}`, '<w:pStyle w:val="Heading2"/>') + p(`Nội dung độc lập ${i+1}.`) + p(`Nguồn: [S${i%17+1}]`)).join("") + p("DANH MỤC NGUỒN",'<w:pStyle w:val="Heading1"/>') + Array.from({length:17},(_,i) => `<w:p><w:r><w:t>[S${i+1}] Nguồn thử ${i+1}</w:t><w:br/><w:t>https://example.org/source-${i+1}</w:t></w:r></w:p>`).join("") + (conflict ? p("[S1] Khác https://example.org/other") : "");
  const styles = [1,2].map(level=>`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:pPr><w:outlineLvl w:val="${level-1}"/></w:pPr></w:style>`).join("");
  const extracted = await extractDocument({format:"DOCX",bytes:syntheticDocx(customBody??body,styles)});
  if(extracted.status!=="EXTRACTED")throw Error(extracted.status);
  const chunked=chunkDocument(extracted.document);
  if(chunked.status!=="CHUNKED")throw Error(chunked.status);
  return deriveOriginalSources(extracted.document,chunked.chunks);
}
describe("explicit original source registry",()=>{
  const bibliography = () => p("DANH MỤC NGUỒN",'<w:pStyle w:val="Heading1"/>')+p("[S1] One https://example.org/one")+p("[S2] Two https://example.org/two");
  it("uses section identity when headings and sentences repeat",async()=>{
    const bundle=await fixture(false,[1,2].map(i=>p("Same heading",'<w:pStyle w:val="Heading2"/>')+p("Same sentence.")+p(`Nguồn: [S${i}]`)).join("")+bibliography());
    expect(Object.values(bundle.bindings).filter(b=>!b.metadataOnly).map(b=>b.sourceCodes)).toEqual([["S1"],["S2"]]);
  });
  it("lets an explicit paragraph declaration override its section and excludes only metadata spans",async()=>{
    const bundle=await fixture(false,p("Mục",'<w:pStyle w:val="Heading2"/>')+p("Claim. Nguồn: [S2]")+p("Nguồn: [S1]")+bibliography());
    const bindings=Object.values(bundle.bindings).filter(b=>!b.metadataOnly);
    expect(bindings[0]!.sourceCodes).toEqual(["S2"]);
    expect(bindings[0]!.excludedSpans.length).toBeGreaterThan(0);
    expect(citationEvidenceText("Do not remove https://example.org/unsafe prose",{sourceCodes:[],metadataOnly:false,excludedSpans:[]})).toContain("https://");
  });
  it("falls back contradictory section declarations and missing definitions",async()=>{
    for(const refs of [p("Nguồn: [S1]")+p("Nguồn: [S2]"),p("Nguồn: [S99]")]){
      const bundle=await fixture(false,p("Mục",'<w:pStyle w:val="Heading2"/>')+p("Claim.")+refs+bibliography());
      expect(Object.values(bundle.bindings).filter(b=>!b.metadataOnly).every(b=>b.sourceCodes.length===0)).toBe(true);
    }
  });
  it.runIf(!!process.env.QA_CITATION_SAMPLE_DOCX)("checks the owner-supplied DOCX read-only (17 sources / 23 sections)",async()=>{
    const bytes=await readFile(process.env.QA_CITATION_SAMPLE_DOCX!);
    const extracted=await extractDocument({format:"DOCX",bytes});
    if(extracted.status!=="EXTRACTED")throw Error(extracted.status);
    const chunked=chunkDocument(extracted.document);if(chunked.status!=="CHUNKED")throw Error(chunked.status);
    const bundle=deriveOriginalSources(extracted.document,chunked.chunks);
    expect(Object.keys(bundle.registry)).toHaveLength(17);expect(bundle.sectionCount).toBe(23);
    const scopes=Object.values(bundle.scopes);
    expect(scopes[1]!.sourceCodes).toEqual(["S1","S2","S4"]);
    expect(scopes[15]!.sourceCodes).toEqual(["S1","S5","S7","S9"]);
    expect([...scopes[21]!.sourceCodes].sort()).toEqual(["S10","S11","S12","S13","S14"]);
    for(const chunk of chunked.chunks){
      const binding=bundle.bindings[chunk.chunkHash]!;
      const view=citationEvidenceText(chunk.text,binding);
      expect(view).not.toBeNull();
      if(!binding.metadataOnly)expect(view).not.toMatch(/Nguồn\s*:|https?:\/\//iu);
    }
  });
  it("resolves 23 sections against 17 definitions after the content, without hyperlink relationships",async()=>{
    const bundle=await fixture();
    expect(Object.keys(bundle.registry)).toHaveLength(17);
    expect(bundle.sectionCount).toBe(23);
    expect(Object.values(bundle.bindings).filter(b=>b.sourceCodes.length)).toHaveLength(23);
    expect(readOriginalSourceBundle(bundle,sourceBundleHash(bundle))).toEqual(bundle);
    expect(readOriginalSourceBundle({...bundle,sectionCount:0},sourceBundleHash(bundle))).toBeNull();
  });
  it("falls back affected scopes on conflicting codes without contaminating other scopes",async()=>{
    const bundle=await fixture(true);
    expect(bundle.registry.S1).toBeUndefined();
    expect(Object.values(bundle.bindings).some(b=>b.sourceCodes.includes("S1"))).toBe(false);
    expect(Object.values(bundle.bindings).some(b=>b.sourceCodes.includes("S2"))).toBe(true);
  });
  it.each(["javascript:alert(1)","http://127.0.0.1/a","http://2130706433/a","http://[::1]/a","http://[::ffff:127.0.0.1]/a","https://a.blob.vercel-storage.com/a","https://example.org/a?sig=secret","https://user:pass@example.org/a","https://example.org/admin/a"])("rejects private/unsafe URL %s",value=>expect(originalSourceUrl(value)).toBeNull());
  it("preserves article query/fragment semantics",()=>expect(originalSourceUrl("https://EXAMPLE.org:443/a?id=2&type=NEWS#part")).toBe("https://example.org/a?id=2&type=NEWS#part"));

  it("extracts sources and excludes bibliography for TXT format (Hạ Thành case)", async () => {
    const text = [
      "Thôn Hạ Thành là làng văn hóa du lịch cộng đồng người Tày tại xã Phương Độ, thành phố Hà Giang.",
      "Nguồn: [S1]",
      "",
      "DANH MỤC NGUỒN:",
      "[S1] Báo Hà Giang https://baohagiang.vn/ha-thanh",
    ].join("\n");
    const extracted = await extractDocument({ format: "TXT", bytes: new TextEncoder().encode(text) });
    if (extracted.status !== "EXTRACTED") throw new Error(extracted.status);
    const chunked = chunkDocument(extracted.document);
    if (chunked.status !== "CHUNKED") throw new Error(chunked.status);
    const bundle = deriveOriginalSources(extracted.document, chunked.chunks);

    expect(bundle.registry.S1).toEqual({ title: "Báo Hà Giang", url: "https://baohagiang.vn/ha-thanh" });
    const contentBindings = Object.values(bundle.bindings).filter(b => !b.metadataOnly);
    expect(contentBindings.length).toBeGreaterThan(0);
    expect(contentBindings[0]!.sourceCodes).toEqual(["S1"]);
    // In a single chunk containing both content and bibliography, the bibliography span is excluded from evidence:
    const cleanText = citationEvidenceText(chunked.chunks[0]!.text, contentBindings[0]!);
    expect(cleanText).not.toBeNull();
    expect(cleanText).toContain("Thôn Hạ Thành");
    expect(cleanText).not.toContain("DANH MỤC NGUỒN");
    expect(cleanText).not.toContain("https://baohagiang.vn/ha-thanh");
  });

  it("marks dedicated bibliography chunks as metadataOnly in multi-chunk TXT", async () => {
    const longContent = "Thôn Hạ Thành nổi tiếng với phong cảnh thanh bình, suối trong và văn hóa người Tày. ".repeat(30);
    const text = [
      longContent,
      "Nguồn: [S1]",
      "",
      "DANH MỤC NGUỒN:",
      "[S1] Báo Hà Giang https://baohagiang.vn/ha-thanh-1",
      "[S2] Báo Hà Giang https://baohagiang.vn/ha-thanh-2",
      "[S3] Báo Hà Giang https://baohagiang.vn/ha-thanh-3",
      "[S4] Báo Hà Giang https://baohagiang.vn/ha-thanh-4",
      "[S5] Báo Hà Giang https://baohagiang.vn/ha-thanh-5",
    ].join("\n");
    const extracted = await extractDocument({ format: "TXT", bytes: new TextEncoder().encode(text) });
    if (extracted.status !== "EXTRACTED") throw new Error(extracted.status);
    const chunked = chunkDocument(extracted.document, { maxChunkUtf16Units: 300, overlapUtf16Units: 50 });
    if (chunked.status !== "CHUNKED") throw new Error(chunked.status);
    const bundle = deriveOriginalSources(extracted.document, chunked.chunks);

    const metadataChunks = Object.values(bundle.bindings).filter(b => b.metadataOnly);
    expect(metadataChunks.length).toBeGreaterThan(0);
    const contentChunks = Object.values(bundle.bindings).filter(b => !b.metadataOnly);
    expect(contentChunks.length).toBeGreaterThan(0);
    expect(contentChunks[0]!.sourceCodes).toEqual(["S1"]);
  });

  it("extracts sources with variant declaration (without brackets, e.g. S1: and S1.)", async () => {
    const text = [
      "Đặc sắc văn hóa nhà sàn và ẩm thực cá bỗng Thôn Hạ Thành.",
      "Nguồn: S1",
      "",
      "TÀI LIỆU THAM KHẢO:",
      "S1. Cổng thông tin du lịch Hà Giang https://dulichhagiang.gov.vn/ha-thanh",
    ].join("\n");
    const extracted = await extractDocument({ format: "TXT", bytes: new TextEncoder().encode(text) });
    if (extracted.status !== "EXTRACTED") throw new Error(extracted.status);
    const chunked = chunkDocument(extracted.document);
    if (chunked.status !== "CHUNKED") throw new Error(chunked.status);
    const bundle = deriveOriginalSources(extracted.document, chunked.chunks);

    expect(bundle.registry.S1).toEqual({ title: "Cổng thông tin du lịch Hà Giang", url: "https://dulichhagiang.gov.vn/ha-thanh" });
    const contentBindings = Object.values(bundle.bindings).filter(b => !b.metadataOnly);
    expect(contentBindings[0]!.sourceCodes).toEqual(["S1"]);
  });

  it("extracts sources and excludes bibliography for PDF format segments", async () => {
    const doc = {
      format: "PDF" as const,
      originalBytesHash: "d".repeat(64),
      extractorVersion: "pdf-extractor-v1",
      normalizationVersion: "normalize-v1",
      normalizedContentHash: "",
      segments: [
        { id: "s0", ordinal: 0, kind: "paragraph" as const, text: "Thôn Hạ Thành là điểm đến nổi tiếng tại Hà Giang với kiến trúc nhà sàn truyền thống.", origin: { format: "PDF" as const, pageNumber: 1, blockIndex: 0 } },
        { id: "s1", ordinal: 1, kind: "paragraph" as const, text: "Nguồn: [S1]", origin: { format: "PDF" as const, pageNumber: 1, blockIndex: 1 } },
        { id: "s2", ordinal: 2, kind: "paragraph" as const, text: "DANH MỤC NGUỒN:", origin: { format: "PDF" as const, pageNumber: 2, blockIndex: 0 } },
        { id: "s3", ordinal: 3, kind: "paragraph" as const, text: "[S1] Cổng thông tin Hà Giang https://hagiang.gov.vn/ha-thanh", origin: { format: "PDF" as const, pageNumber: 2, blockIndex: 1 } },
      ],
      warnings: [],
    };
    const { canonical, sha256 } = await import("./content-hash");
    doc.normalizedContentHash = sha256(canonical(doc.segments.map(({ text, kind, origin }) => ({ text, kind, origin }))));
    const chunked = chunkDocument(doc);
    if (chunked.status !== "CHUNKED") throw new Error(chunked.status);
    const bundle = deriveOriginalSources(doc, chunked.chunks);

    expect(bundle.registry.S1).toEqual({ title: "Cổng thông tin Hà Giang", url: "https://hagiang.gov.vn/ha-thanh" });
    const contentBindings = Object.values(bundle.bindings).filter(b => !b.metadataOnly);
    expect(contentBindings.length).toBeGreaterThan(0);
    expect(contentBindings[0]!.sourceCodes).toEqual(["S1"]);
  });

  it("reads legacy explicit-section-sources-v1 bundles successfully", () => {
    const legacyBundle = {
      parserVersion: "explicit-section-sources-v1",
      originalBytesHash: "a".repeat(64),
      normalizedContentHash: "b".repeat(64),
      registry: { S1: { title: "Legacy Source", url: "https://example.org/legacy" } },
      bindings: { ["c".repeat(64)]: { sourceCodes: ["S1"], metadataOnly: false, excludedSpans: [] } },
      scopes: { "section-1": { segmentIds: ["s1"], sourceCodes: ["S1"], ambiguous: false } },
      sectionCount: 1,
    };
    const hash = sourceBundleHash(legacyBundle as any);
    const read = readOriginalSourceBundle(legacyBundle, hash);
    expect(read).not.toBeNull();
    expect(read?.parserVersion).toBe("explicit-section-sources-v1");
  });
});
