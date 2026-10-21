import { describe,expect,it } from "vitest";
import { extractDocument } from "../rag-processing/extract-document";
import { chunkDocument, DEFAULT_CHUNK_OPTIONS } from "../rag-processing/chunk-document";
import { rebuildCitationBundle } from "./rag-citation-backfill";
import { sourceBundleHash } from "../rag-processing/original-sources";

describe("citation backfill exact provenance",()=>{
  async function fixture(){
    const bytes=new TextEncoder().encode("Synthetic preserved paragraph.");
    const extracted=await extractDocument({format:"TXT",bytes});
    if(extracted.status!=="EXTRACTED")throw Error("fixture");
    const chunked=chunkDocument(extracted.document);if(chunked.status!=="CHUNKED")throw Error("fixture");
    return {bytes,chunks:chunked.chunks,target:{...extracted.document,fileType:"TXT",chunkerVersion:chunked.chunks[0]!.chunkerVersion,chunkOptions:DEFAULT_CHUNK_OPTIONS}};
  }
  it("reproduces metadata without changing chunks and retries identically",async()=>{
    const {bytes,chunks,target}=await fixture();const snapshot=JSON.stringify(chunks);
    const first=await rebuildCitationBundle(target,bytes,chunks);
    expect(sourceBundleHash(await rebuildCitationBundle(target,bytes,chunks))).toBe(sourceBundleHash(first));
    expect(JSON.stringify(chunks)).toBe(snapshot);
  });
  it("rejects mismatched originals, versions and stored chunk associations",async()=>{
    const {bytes,chunks,target}=await fixture();
    await expect(rebuildCitationBundle(target,new TextEncoder().encode("Changed"),chunks)).rejects.toThrow("CITATION_ORIGINAL_MISMATCH");
    await expect(rebuildCitationBundle({...target,extractorVersion:"old"},bytes,chunks)).rejects.toThrow("CITATION_VERSION_MISMATCH");
    await expect(rebuildCitationBundle(target,bytes,[{...chunks[0]!,text:"Changed"}])).rejects.toThrow("CITATION_CHUNK_MISMATCH");
  });
});
