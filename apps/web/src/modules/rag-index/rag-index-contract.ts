import type { DocumentChunk } from "../rag-processing/chunk-contract";
import type { EmbeddedChunk, EmbeddingProvenance } from "../rag-processing/embedding-contract";

export type ContentVersionInput = {
  ragDocumentId: string;
  originalBytesHash: string;
  normalizedContentHash: string;
  extractorVersion: string;
  normalizationVersion: string;
};

export type IndexGenerationInput = {
  ragDocumentId: string;
  contentVersionId: string;
  chunkerVersion: string;
  chunkOptions: Record<string, number>;
  provenance: EmbeddingProvenance;
  chunks: readonly DocumentChunk[];
  embeddings: readonly EmbeddedChunk[];
};

export type GenerationProgress = {
  state: "BUILDING" | "READY";
  expectedChunkCount: number;
  actualChunkCount: number;
  actualEmbeddingCount: number;
  expectedTokenCount: number;
  actualTokenCount: number;
  complete: boolean;
};

export type PublishedGenerationMetadata = {
  ragDocumentId: string;
  generationId: string;
  contentVersionId: string;
  generationKey: string;
  chunkerVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  tokenizer: string;
  tokenizerVersion: string;
  expectedChunkCount: number;
  expectedTokenCount: number;
};
