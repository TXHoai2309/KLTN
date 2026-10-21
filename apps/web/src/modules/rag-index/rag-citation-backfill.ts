import { extractDocument } from "../rag-processing/extract-document";
import { chunkDocument } from "../rag-processing/chunk-document";
import type { ChunkOptions, DocumentChunk } from "../rag-processing/chunk-contract";
import { canonical, sha256 } from "../rag-processing/content-hash";
import { deriveOriginalSources } from "../rag-processing/original-sources";

export type CitationBackfillTarget = {
  fileType:string; originalBytesHash:string; normalizedContentHash:string;
  extractorVersion:string; normalizationVersion:string; chunkerVersion:string; chunkOptions:ChunkOptions;
};
/** Pure re-derivation, never invokes embeddings, changes a file, or rewrites chunks. */
export async function rebuildCitationBundle(target:CitationBackfillTarget,bytes:Uint8Array,stored:readonly DocumentChunk[]) {
  if (sha256(bytes)!==target.originalBytesHash) throw new Error("CITATION_ORIGINAL_MISMATCH");
  const extracted=await extractDocument({bytes,format:target.fileType});
  if (extracted.status!=="EXTRACTED" || extracted.document.normalizedContentHash!==target.normalizedContentHash || extracted.document.extractorVersion!==target.extractorVersion || extracted.document.normalizationVersion!==target.normalizationVersion) throw new Error("CITATION_VERSION_MISMATCH");
  const chunked=chunkDocument(extracted.document,target.chunkOptions);
  const fields=(chunk:DocumentChunk)=>({index:chunk.index,text:chunk.text,refs:chunk.refs,locators:chunk.locators,textHash:chunk.textHash,chunkHash:chunk.chunkHash,chunkerVersion:chunk.chunkerVersion});
  if (chunked.status!=="CHUNKED" || chunked.chunks.some(c=>c.chunkerVersion!==target.chunkerVersion) || canonical(chunked.chunks.map(fields))!==canonical(stored.map(fields))) throw new Error("CITATION_CHUNK_MISMATCH");
  return deriveOriginalSources(extracted.document,chunked.chunks);
}
