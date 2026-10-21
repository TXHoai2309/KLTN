import type { QaAnswer, QaEvidence } from "./qa-runtime-contract";
import { originalSourceUrl } from "../../lib/original-source-url";

const privateReferencePatterns = [
  /\bfile:\/\//iu,
  /\b[A-Z]:[\\/]/iu,
  /\\\\[^\\/\s]+[\\/][^\\/\s]+/u,
  /(?:^|[\s"'([{=])\/([A-Za-z0-9._-]+\/){1,}[A-Za-z0-9._-]*/u,
  /(?:^|[\s"'([{=])\/\/[^/\s]+\/[^/\s]+/u,
  /blob\.vercel-storage\.com/iu,
  /(?:https?:\/\/|\/api\/admin\/|\brag\/[a-z0-9_-]+\/)/iu,
  /(?:[?&](?:token|signature|sig|se|sp|sv|sr|skoid|sktid|skt|ske|sks|skv)=)/iu,
  /["']?embedding["']?\s*[:=]/iu,
  /\b(?:OPENAI|CRON|DATABASE)_[A-Z0-9_]*(?:KEY|SECRET|URL)\b/iu,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/iu,
];

export function isQaPublicMetadataSafe(value: unknown): boolean {
  const strings:string[]=[];
  const collect=(item:unknown)=>{
    if(typeof item==="string")strings.push(item);
    else if(Array.isArray(item))item.forEach(collect);
    else if(item&&typeof item==="object")Object.values(item).forEach(collect);
  };
  collect(value);
  return !strings.some(text=>privateReferencePatterns.some(pattern=>pattern.test(text)));
}

// Projection alone is insufficient if a source sentence/title itself quotes an
// internal path. Only a server-projected, provenance-bound citation URL can bypass
// the URL prohibition; all prose and the remaining metadata use the old checks.
export function isQaPublicAnswerSafe(answer: QaAnswer, evidence: readonly QaEvidence[]): boolean {
  for (const citation of answer.citations) if (citation.sourceUrl &&
    (originalSourceUrl(citation.sourceUrl)!==citation.sourceUrl || !evidence.some(item=>item.sourceBundle && item.originalSources?.some(source=>source.url===citation.sourceUrl && source.title===citation.title) && item.projectedCitations?.some(candidate=>JSON.stringify(candidate)===JSON.stringify(citation))))) return false;
  if(!isQaPublicMetadataSafe({...answer,citations:answer.citations.map(citation=>({...citation,sourceUrl:null}))}))return false;
  const publicText = JSON.stringify(answer);
  for (const item of evidence) {
    if ([item.documentId, item.generationId, item.contentVersionId, item.chunkId, item.chunkHash]
      .some(id => id.length >= 8 && publicText.includes(id))) return false;
  }
  return true;
}
