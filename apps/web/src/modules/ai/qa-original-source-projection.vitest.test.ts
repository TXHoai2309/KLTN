import { describe, expect, it, vi } from "vitest";
import { projectQaOriginalSources, validQaSourceProjection } from "./qa-original-source-projection";
import { isQaPublicAnswerSafe } from "./qa-public-safety";
import { qaCompletedTurnSchema, type QaCompletedTurn } from "./qa-contract";
import type { QaEvidence } from "./qa-runtime-contract";

function fixture() {
  const citation={id:"c1",sourceId:"public_source",title:"Uploaded material",sourceUrl:null,locators:[{section:"Mục 16"}]};
  const evidence:QaEvidence={citationId:"c1",documentId:"private_document_01",generationId:"private_generation_01",contentVersionId:"private_version_01",chunkId:"private_chunk_01",chunkHash:"private_hash_01",text:"Synthetic claim.",tokenCount:3,score:1,citation,
    sourceBundle:{id:"bundle",hash:"hash"},originalSources:[{title:"Article one",url:"https://example.org/one"},{title:"Article two",url:"https://example.org/two"}]};
  const data:QaCompletedTurn={conversationId:"conv",turnId:"turn",turnState:"COMPLETED",context:{type:"GENERAL"},status:"ANSWERED",answerParts:[{text:"Synthetic claim.",citationIds:["c1"]}],citations:[citation],unansweredAspects:[]};
  return {data,evidence};
}
describe("server-only original-source projection",()=>{
  it("expands one verified evidence citation without changing text, aliases or locators",()=>{
    const {data,evidence}=fixture(); const original=JSON.stringify(data);
    const result=projectQaOriginalSources(data,[evidence]);
    expect(result.citations.map(c=>c.sourceUrl)).toEqual(evidence.originalSources!.map(s=>s.url));
    expect(result.answerParts[0]!.text).toBe(data.answerParts[0]!.text);
    expect(result.answerParts[0]!.citationIds).toEqual(result.citations.map(c=>c.id));
    expect(result.citations.every(c=>c.sourceId===evidence.citation.sourceId&&JSON.stringify(c.locators)===JSON.stringify(evidence.citation.locators))).toBe(true);
    expect(validQaSourceProjection(result,[evidence])).toBe(true);
    expect(isQaPublicAnswerSafe(result,[evidence])).toBe(true);
    expect(qaCompletedTurnSchema.safeParse(result).success).toBe(true);
    expect(JSON.stringify(data)).toBe(original);
  });
  it("keeps legacy snapshots and missing metadata on document fallback",()=>{
    const {data,evidence}=fixture(); delete evidence.sourceBundle;
    expect(projectQaOriginalSources(data,[evidence])).toEqual(data);
    expect(validQaSourceProjection(data,[evidence])).toBe(true);
  });
  it("rejects model URLs, injected prose URLs and forged aliases or locators",()=>{
    const {data,evidence}=fixture();
    const forged=structuredClone(data);forged.citations[0]!.sourceUrl="https://example.org/one";
    expect(validQaSourceProjection(forged,[evidence])).toBe(false);
    expect(isQaPublicAnswerSafe(forged,[evidence])).toBe(false);
    const result=projectQaOriginalSources(data,[evidence]);
    result.answerParts[0]!.text="Read https://example.org/one";
    expect(isQaPublicAnswerSafe(result,[evidence])).toBe(false);
    result.citations[0]!.sourceId="forged";
    expect(validQaSourceProjection(result,[evidence])).toBe(false);
    evidence.projectedCitations=result.citations;
    expect(validQaSourceProjection(result,[evidence])).toBe(false);
  });
  it("falls back the complete response on 128 KiB overflow",()=>{
    const {data,evidence}=fixture();
    evidence.originalSources=Array.from({length:120},(_,i)=>({title:"Article",url:`https://example.org/${i}?q=${"a".repeat(1400)}`}));
    const log=vi.spyOn(console,"warn").mockImplementation(()=>{});
    expect(projectQaOriginalSources(data,[evidence])).toBe(data);
    expect(evidence.projectedCitations).toBeUndefined();
    expect(log).toHaveBeenCalledWith("QA_SOURCE_PROJECTION",{stage:"RESPONSE_SIZE_FALLBACK",citations:120});log.mockRestore();
  });
});
