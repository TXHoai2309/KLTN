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
});
