import { describe,expect,it,vi } from "vitest";
import type { Database } from "@KLTN/db";
import { loadCitationBundle,persistCitationBundle } from "./rag-citation-store";
import { ORIGINAL_SOURCE_PARSER,sourceBundleHash,type OriginalSourceBundle } from "../rag-processing/original-sources";
import { lockQaEvidenceEligibility } from "../ai/qa-retrieval";
import type { QaEvidence } from "../ai/qa-runtime-contract";
vi.mock("server-only",()=>({}));
const bundle:OriginalSourceBundle={parserVersion:ORIGINAL_SOURCE_PARSER,originalBytesHash:"a".repeat(64),normalizedContentHash:"b".repeat(64),registry:{S1:{title:"Article",url:"https://example.org/article"}},bindings:{chunkhash:{sourceCodes:["S1"],metadataOnly:false,excludedSpans:[]}},scopes:{section:{segmentIds:["segment"],sourceCodes:["S1"],ambiguous:false}},sectionCount:1};
const row=()=>({id:"bundle",generationId:"generation",contentVersionId:"version",metadata:structuredClone(bundle),metadataHash:sourceBundleHash(bundle)});
function database(options:{stale?:boolean;versionMismatch?:boolean;conflict?:boolean}={}){
  let inserted=false;
  const query=vi.fn(async(sql:{sql:string})=>{
    if(sql.sql.includes("FROM rag_citation_bundle"))return inserted?[{...row(),...(options.conflict?{metadataHash:"bad"}:{})}]:[];
    if(sql.sql.includes("FOR UPDATE"))return options.stale?[]:[{id:"doc"}];
    if(sql.sql.includes("FROM rag_index_publication"))return options.stale?[]:[{id:"publication"}];
    if(sql.sql.includes("FROM rag_index_generation"))return options.versionMismatch?[]:[{id:"generation"}];
    if(sql.sql.includes("FROM rag_chunk"))return [{chunkHash:"chunkhash"}];
    throw Error("Unexpected query");
  });
  const execute=vi.fn(async(_sql:unknown)=>{inserted=true;return 1;});
  const tx={$queryRaw:query,$executeRaw:execute};
  return {db:{...tx,$transaction:async(work:(tx:unknown)=>unknown)=>work(tx)} as unknown as Database,query,execute};
}
describe("immutable citation sidecar persistence and completion fence",()=>{
  it("uses the document lock, exact identities and confirmed idempotent insertion",async()=>{
    const t=database();await persistCitationBundle(t.db,"doc","generation","version",bundle,true);
    await persistCitationBundle(t.db,"doc","generation","version",bundle,true);
    expect(t.execute).toHaveBeenCalledTimes(2);
    expect(t.execute.mock.calls[0]![0]).toMatchObject({sql:expect.stringContaining("ON CONFLICT")});
    expect(t.query.mock.calls[0]![0].sql).toContain("FOR UPDATE");
  });
  it.each([{stale:true},{versionMismatch:true},{conflict:true}])("refuses stale/version/conflicting replay %j",async options=>{
    const t=database(options);await expect(persistCitationBundle(t.db,"doc","generation","version",bundle,true)).rejects.toThrow(/CITATION_/u);
    if(!options.conflict)expect(t.execute).not.toHaveBeenCalled();
  });
  it("distinguishes missing migration from an operational database failure",async()=>{
    const db={$queryRaw:vi.fn().mockRejectedValue({meta:{code:"42P01"}})} as unknown as Database;
    expect(await loadCitationBundle(db,"gen")).toBeNull();
    vi.mocked(db.$queryRaw).mockRejectedValue(Error("offline"));await expect(loadCitationBundle(db,"gen")).rejects.toThrow("offline");
  });
  it("rechecks source integrity and the exact evidence view inside completion lock",async()=>{
    const identity={documentId:"doc",generationId:"generation",contentVersionId:"version",chunkId:"chunk",chunkHash:"chunkhash",text:"Synthetic claim."};
    const evidence:QaEvidence={...identity,citationId:"c1",citation:{id:"c1",sourceId:"public_source",title:"Uploaded",sourceUrl:null,locators:[]},tokenCount:3,score:1,sourceBundle:{id:"bundle",hash:sourceBundleHash(bundle)},originalSources:[bundle.registry.S1!]};
    let metadata=row();let eligible=true;
    const tx={$queryRaw:vi.fn(async(sql:{sql:string})=>sql.sql.includes("rag_citation_bundle")?[metadata]:sql.sql.includes("FOR UPDATE")?[{id:"doc"}]:eligible?[identity]:[])};
    expect(await lockQaEvidenceEligibility(tx as never,[evidence])).toBe(true);
    metadata={...metadata,metadataHash:"changed"};expect(await lockQaEvidenceEligibility(tx as never,[evidence])).toBe(false);
    metadata=row();evidence.text="Forged view";expect(await lockQaEvidenceEligibility(tx as never,[evidence])).toBe(false);
    evidence.text=identity.text;eligible=false;expect(await lockQaEvidenceEligibility(tx as never,[evidence])).toBe(false);
  });
});
