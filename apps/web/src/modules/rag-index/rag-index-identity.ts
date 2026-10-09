import { canonical, sha256 } from "../rag-processing/content-hash";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";
import { EMBEDDING_LIMITS } from "../rag-processing/embedding-limits";
import { RagIndexError } from "./rag-index-errors";
import type { ContentVersionInput, IndexGenerationInput } from "./rag-index-contract";

const hash = /^[a-f0-9]{64}$/u;

export function contentVersionIdentity(input: ContentVersionInput): string {
  if (!input || typeof input.ragDocumentId !== "string" || input.ragDocumentId.length === 0 ||
    !hash.test(input.originalBytesHash) || !hash.test(input.normalizedContentHash) ||
    typeof input.extractorVersion !== "string" || input.extractorVersion.length < 1 || input.extractorVersion.length > 200 ||
    typeof input.normalizationVersion !== "string" || input.normalizationVersion.length < 1 || input.normalizationVersion.length > 200) {
    throw new RagIndexError("INVALID_INDEX_INPUT");
  }
  return sha256(canonical(input));
}

export function generationIdentity(input: IndexGenerationInput): string {
  if (!input || typeof input.ragDocumentId !== "string" || !input.ragDocumentId || typeof input.contentVersionId !== "string" || !input.contentVersionId ||
    typeof input.chunkerVersion !== "string" || !input.chunkerVersion || input.chunkerVersion.length > 200 ||
    !input.chunkOptions || typeof input.chunkOptions !== "object" || Array.isArray(input.chunkOptions) ||
    Object.keys(input.chunkOptions).sort().join(",") !== "maxChunkUtf16Units,overlapUtf16Units" ||
    !Number.isInteger(input.chunkOptions.maxChunkUtf16Units) || input.chunkOptions.maxChunkUtf16Units < 1 || input.chunkOptions.maxChunkUtf16Units > 8000 ||
    !Number.isInteger(input.chunkOptions.overlapUtf16Units) || input.chunkOptions.overlapUtf16Units < 0 || input.chunkOptions.overlapUtf16Units > Math.floor(input.chunkOptions.maxChunkUtf16Units / 2) ||
    input.provenance?.provider !== EMBEDDING_PROVENANCE.provider || input.provenance.model !== EMBEDDING_PROVENANCE.model || input.provenance.dimensions !== EMBEDDING_PROVENANCE.dimensions ||
    input.provenance.tokenizer !== EMBEDDING_PROVENANCE.tokenizer || input.provenance.tokenizerVersion !== EMBEDDING_PROVENANCE.tokenizerVersion ||
    !Array.isArray(input.chunks) || input.chunks.length === 0 || input.chunks.length > 10_000 ||
    input.chunks.some(chunk => !chunk || typeof chunk !== "object" || typeof chunk.text !== "string" || typeof chunk.textHash !== "string" || typeof chunk.chunkHash !== "string") ||
    !Array.isArray(input.embeddings) || input.embeddings.length !== input.chunks.length || input.embeddings.some(item => !item || typeof item !== "object")) {
    throw new RagIndexError("INVALID_INDEX_INPUT");
  }
  for (const [index, chunk] of input.chunks.entries()) {
    if (chunk.index !== index || chunk.chunkerVersion !== input.chunkerVersion || !hash.test(chunk.textHash) || sha256(chunk.text) !== chunk.textHash || !hash.test(chunk.chunkHash)) throw new RagIndexError("INVALID_INDEX_INPUT");
  }
  const orderedEmbeddings = [...input.embeddings].sort((a, b) => a.chunkIndex - b.chunkIndex);
  let tokenCount = 0;
  for (const [index, embedded] of orderedEmbeddings.entries()) {
    if (!embedded || embedded.chunkIndex !== index || embedded.inputHash !== input.chunks[index]!.textHash || !Number.isInteger(embedded.tokenCount) || embedded.tokenCount < 1 || embedded.tokenCount > EMBEDDING_LIMITS.maxInputTokens ||
      !embedded.provenance || !Array.isArray(embedded.vector) ||
      embedded.provenance.model !== input.provenance.model || embedded.provenance.provider !== input.provenance.provider || embedded.provenance.dimensions !== input.provenance.dimensions ||
      embedded.provenance.tokenizer !== input.provenance.tokenizer || embedded.provenance.tokenizerVersion !== input.provenance.tokenizerVersion ||
      embedded.vector.length !== EMBEDDING_PROVENANCE.dimensions || embedded.vector.some((value: number) => !Number.isFinite(value))) throw new RagIndexError("INVALID_INDEX_INPUT");
    tokenCount += embedded.tokenCount;
  }
  if (tokenCount > EMBEDDING_LIMITS.maxJobTokens || tokenCount * EMBEDDING_LIMITS.priceUsdPerMillionTokens * EMBEDDING_LIMITS.maxProviderAttempts / 1_000_000 > EMBEDDING_LIMITS.maxEstimatedJobCostUsd) throw new RagIndexError("INVALID_INDEX_INPUT");
  const vectorNormValid = orderedEmbeddings.every(({ vector }) => {
    let squared = 0; for (const value of vector) squared += value * value;
    return Number.isFinite(squared) && squared > 0;
  });
  if (!vectorNormValid) throw new RagIndexError("INVALID_INDEX_INPUT");
  return sha256(canonical({
    ragDocumentId: input.ragDocumentId,
    contentVersionId: input.contentVersionId,
    chunkerVersion: input.chunkerVersion,
    chunkOptions: input.chunkOptions,
    embedding: input.provenance,
    chunkHashes: input.chunks.map(chunk => chunk.chunkHash),
    expectedChunkCount: input.chunks.length,
    expectedTokenCount: tokenCount,
  }));
}
