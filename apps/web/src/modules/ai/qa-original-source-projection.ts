import type { QaCompletedTurn, QaPublicCitation } from "./qa-contract";
import { qaCompletedTurnSchema } from "./qa-contract";
import type { QaEvidence } from "./qa-runtime-contract";
import { originalSourceUrl } from "../../lib/original-source-url";

export function projectQaOriginalSources(data: QaCompletedTurn, evidence: readonly QaEvidence[]): QaCompletedTurn {
  if (data.status !== "ANSWERED" && data.status !== "PARTIAL") return data;
  const registry = new Map<string,QaPublicCitation[]>();
  let index=0;
  const reserved = new Set(data.citations.map(citation => citation.id));
  const nextId = () => { let id: string; do { id = `ref${++index}`; } while (reserved.has(id)); reserved.add(id); return id; };
  for (const citation of data.citations) {
    const item=evidence.find(entry=>entry.citationId===citation.id);
    const sources=item?.sourceBundle && item.originalSources?.length ? item.originalSources : undefined;
    registry.set(citation.id,sources && sources.every(source=>originalSourceUrl(source.url)===source.url)
      ? sources.map(source=>({...citation,id:nextId(),title:source.title,sourceUrl:source.url})) : [citation]);
  }
  const result=qaCompletedTurnSchema.parse({...data,
    answerParts:data.answerParts.map(part=>({...part,citationIds:[...new Set(part.citationIds.flatMap(id=>registry.get(id)!.map(c=>c.id)))]})),
    citations:[...registry.values()].flat(),
  });
  if (Buffer.byteLength(JSON.stringify({success:true,operationStatus:"SUCCESS",data:result}),"utf8")>128*1024) {
    console.warn("QA_SOURCE_PROJECTION",{stage:"RESPONSE_SIZE_FALLBACK",citations:result.citations.length});
    return data;
  }
  for (const item of evidence) if(registry.has(item.citationId)) item.projectedCitations=registry.get(item.citationId);
  return result;
}

/** Validates the server projection again at the persistence boundary. */
export function validQaSourceProjection(data: QaCompletedTurn, evidence: readonly QaEvidence[]): boolean {
  return data.citations.every(citation=>evidence.some(item=>{
    const candidates=item.projectedCitations ?? [item.citation];
    return candidates.some(candidate=>JSON.stringify(candidate)===JSON.stringify(citation)) &&
      citation.sourceId === item.citation.sourceId && JSON.stringify(citation.locators) === JSON.stringify(item.citation.locators) &&
      (!citation.sourceUrl || !!item.sourceBundle && !!item.originalSources?.some(source=>source.url===citation.sourceUrl && source.title===citation.title) && originalSourceUrl(citation.sourceUrl)===citation.sourceUrl);
  }));
}
