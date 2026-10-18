import { canonical, sha, decodeVector, refuse } from "./rag-sync-lib.mjs";

export async function validateReusable(doc, rows, bytes, processing) {
  const versions = rows.rag_content_version.filter(row => row.ragDocumentId === doc.id);
  const generations = rows.rag_index_generation.filter(row => row.ragDocumentId === doc.id);
  const publications = rows.rag_index_publication.filter(row => row.ragDocumentId === doc.id);
  if (doc.status !== "INDEXED" || publications.length !== 1 || !doc.uploadedById || doc.sizeBytes !== bytes.length) refuse("DOCUMENT_NOT_REUSABLE");
  const pub = publications[0], gen = generations.find(row => row.id === pub.generationId);
  if (!gen || gen.state !== "READY" || !gen.readyAt || gen.embeddingProvider !== "openai" || gen.embeddingModel !== "text-embedding-3-small" || gen.embeddingDimensions !== 1536 ||
      gen.tokenizer !== "cl100k_base" || gen.tokenizerVersion !== "js-tiktoken@1.0.21") refuse("GENERATION_NOT_REUSABLE");
  const version = versions.find(row => row.id === gen.contentVersionId);
  if (!version || version.originalBytesHash !== sha(bytes)) refuse("ORIGINAL_HASH_MISMATCH");
  const input = { ragDocumentId: doc.id, originalBytesHash: version.originalBytesHash, normalizedContentHash: version.normalizedContentHash,
    extractorVersion: version.extractorVersion, normalizationVersion: version.normalizationVersion };
  if (processing.contentVersionIdentity(input) !== version.identityHash) refuse("CONTENT_IDENTITY_MISMATCH");
  const extracted = await processing.extractDocument({ format: doc.fileType, bytes: new Uint8Array(bytes) });
  if (extracted.status !== "EXTRACTED" || extracted.document.extractorVersion !== version.extractorVersion || extracted.document.normalizationVersion !== version.normalizationVersion ||
      extracted.document.normalizedContentHash !== version.normalizedContentHash || extracted.document.originalBytesHash !== version.originalBytesHash ||
      extracted.document.warnings.some(warning => warning.code !== "PDF_READING_ORDER_HEURISTIC")) refuse("EXTRACTION_VERSION_OR_CONTENT_MISMATCH");
  const rechunked = processing.chunkDocument(extracted.document, gen.chunkOptions);
  if (rechunked.status !== "CHUNKED") refuse("CHUNK_REPLAY_FAILED");
  const chunks = rows.rag_chunk.filter(row => row.generationId === gen.id).sort((a, b) => a.index - b.index);
  if (chunks.length !== gen.expectedChunkCount || chunks.length !== rechunked.chunks.length) refuse("CHUNK_COUNT_MISMATCH");
  const embeddings = [];
  let totalTokens = 0;
  for (const [index, chunk] of chunks.entries()) {
    const replay = rechunked.chunks[index];
    if (chunk.ragDocumentId !== doc.id || chunk.index !== index || canonical(Object.fromEntries(Object.keys(replay).map(key => [key, chunk[key]]))) !== canonical(replay) || sha(chunk.text) !== chunk.textHash) refuse("CHUNK_CONTENT_HASH_MISMATCH");
    const matches = rows.rag_chunk_embedding.filter(row => row.chunkId === chunk.id);
    if (matches.length !== 1) refuse("MISSING_OR_DUPLICATE_EMBEDDING");
    const embedding = matches[0], vector = decodeVector(embedding.vectorBinary);
    if (embedding.inputHash !== chunk.textHash || embedding.tokenCount !== processing.countEmbeddingTokens(chunk.text) || embedding.vectorHash !== sha(canonical(vector.map(value => Object.is(value, -0) ? 0 : value)))) refuse("EMBEDDING_HASH_OR_TOKEN_MISMATCH");
    totalTokens += embedding.tokenCount;
    embeddings.push({ chunkIndex: index, inputHash: embedding.inputHash, vector, tokenCount: embedding.tokenCount, provenance: processing.EMBEDDING_PROVENANCE });
  }
  if (totalTokens !== gen.expectedTokenCount) refuse("TOKEN_TOTAL_MISMATCH");
  const generationKey = processing.generationIdentity({ ragDocumentId: doc.id, contentVersionId: version.id, chunkerVersion: gen.chunkerVersion,
    chunkOptions: gen.chunkOptions, provenance: processing.EMBEDDING_PROVENANCE, chunks: rechunked.chunks, embeddings });
  if (generationKey !== gen.generationKey) refuse("GENERATION_IDENTITY_MISMATCH");
  if (rows.rag_index_job.some(job => job.ragDocumentId === doc.id && ["QUEUED", "RUNNING", "UNKNOWN"].includes(job.status))) refuse("UNFINISHED_EXECUTION_REVIEW_REQUIRED");
  return { documentId: doc.id, versionId: version.id, generationId: gen.id, publicationId: pub.id, chunks: chunks.length,
    embeddings: embeddings.length, tokenCount: totalTokens, originalSha256: sha(bytes), normalizedContentHash: version.normalizedContentHash,
    integrity: "TECHNICALLY_READY", dimensions: 1536, allHashesMatch: true, deterministicExtractionAndChunkReplay: true,
    rights: "RIGHTS_REVIEW_REQUIRED", targetPublicQaApproved: false };
}

export function selectedRows(state, verified) {
  const ids = new Set(verified.map(item => item.documentId)), gens = new Set(verified.map(item => item.generationId)), versions = new Set(verified.map(item => item.versionId));
  const chunks = state.rows.rag_chunk.filter(row => gens.has(row.generationId));
  const chunkIds = new Set(chunks.map(row => row.id));
  if (state.rows.rag_domain_origin.some(row => ids.has(row.ragDocumentId))) refuse("DOMAIN_ORIGIN_REVIEW_REQUIRED");
  return {
    rag_document: state.rows.rag_document.filter(row => ids.has(row.id)).map(row => ({ ...row, publicQaApproved: false })),
    rag_content_version: state.rows.rag_content_version.filter(row => versions.has(row.id)),
    rag_index_generation: state.rows.rag_index_generation.filter(row => gens.has(row.id)),
    rag_chunk: chunks,
    rag_chunk_embedding: state.rows.rag_chunk_embedding.filter(row => chunkIds.has(row.chunkId)),
    rag_index_publication: state.rows.rag_index_publication.filter(row => ids.has(row.ragDocumentId)),
    rag_index_job: [], rag_domain_origin: [],
  };
}

export function conflictPlan(expected, target) {
  const counts = {}, conflicts = [];
  for (const [table, rows] of Object.entries(expected)) {
    let inserts = 0, replays = 0;
    for (const row of rows) {
      const existing = target[table].find(item => item.id === row.id);
      if (!existing) { inserts++; continue; }
      // pgvector text is only transport; binary representation is authoritative.
      const clean = input => Object.fromEntries(Object.entries(input).filter(([key]) => key !== "embedding").map(([key,value])=>[key,key === "vectorBinary" ? Buffer.from(value,"base64").toString("hex") : value]));
      if (canonical(clean(existing)) !== canonical(clean(row))) conflicts.push({ table, id: row.id });
      else replays++;
    }
    counts[table] = { inserts, replays };
  }
  // A storage path already registered to another ID must never be overwritten.
  for (const doc of expected.rag_document) if (target.rag_document.some(row => row.storagePath === doc.storagePath && row.id !== doc.id)) conflicts.push({ table: "rag_document", id: doc.id, reason: "STORAGE_PATH_CONFLICT" });
  return { counts, conflicts, expectedInserts: Object.values(counts).reduce((n, item) => n + item.inserts, 0), expectedUpdates: 0, expectedDeletes: 0 };
}
