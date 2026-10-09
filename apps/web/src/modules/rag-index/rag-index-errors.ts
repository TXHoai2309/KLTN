export type RagIndexErrorCode =
  | "INVALID_INDEX_INPUT"
  | "RAG_DOCUMENT_NOT_FOUND"
  | "CONTENT_VERSION_CONFLICT"
  | "GENERATION_CONFLICT"
  | "GENERATION_NOT_BUILDING"
  | "GENERATION_NOT_COMPLETE"
  | "GENERATION_NOT_READY"
  | "DOCUMENT_NOT_ELIGIBLE"
  | "CHUNK_CONFLICT"
  | "EMBEDDING_CONFLICT";

export class RagIndexError extends Error {
  constructor(readonly code: RagIndexErrorCode) {
    super(code);
    this.name = "RagIndexError";
  }
}
