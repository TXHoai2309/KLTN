export const EMBEDDING_PROVENANCE = Object.freeze({
  provider: "openai",
  model: "text-embedding-3-small",
  dimensions: 1536,
  tokenizer: "cl100k_base",
  tokenizerVersion: "js-tiktoken@1.0.21",
} as const);

export type EmbeddingProvenance = typeof EMBEDDING_PROVENANCE;
export type EmbeddingVector = number[];
export type ProviderEmbedding = { index: number; embedding: EmbeddingVector };
export type EmbeddingProviderRequest = { input: string[]; signal?: AbortSignal };
export type EmbeddingProvider = {
  readonly provider: "openai";
  readonly model: typeof EMBEDDING_PROVENANCE.model;
  readonly dimensions: typeof EMBEDDING_PROVENANCE.dimensions;
  embed(request: EmbeddingProviderRequest): Promise<ProviderEmbedding[]>;
};

export type EmbeddedChunk = {
  chunkIndex: number;
  inputHash: string;
  tokenCount: number;
  vector: EmbeddingVector;
  provenance: EmbeddingProvenance;
};
