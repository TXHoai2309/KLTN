import type { SegmentOrigin } from "./extraction-contract";

export type ChunkOptions = { maxChunkUtf16Units: number; overlapUtf16Units: number };
export type SourceReference = { segmentId: string; segmentStart: number; segmentEnd: number; chunkStart: number; chunkEnd: number };
export type InternalLocator = SegmentOrigin;
export type DocumentChunk = {
  index: number;
  text: string;
  refs: SourceReference[];
  locators: InternalLocator[];
  textHash: string;
  chunkHash: string;
  chunkerVersion: string;
};
export type ChunkingResult =
  | { status: "CHUNKED"; chunks: DocumentChunk[] }
  | { status: "NO_EXTRACTABLE_TEXT"; reason: "NO_TEXT"; chunks: [] }
  | { status: "INVALID_INPUT" | "RESOURCE_LIMIT"; code: string; chunks: [] };
