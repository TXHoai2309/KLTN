import "server-only";
import { Tiktoken } from "js-tiktoken/lite";
import cl100k from "js-tiktoken/ranks/cl100k_base";
import { EmbeddingError } from "./embedding-errors";

const encoder = new Tiktoken(cl100k);

export function countEmbeddingTokens(text: string): number {
  if (typeof text !== "string") throw new EmbeddingError("INVALID_INPUT", false);
  try {
    // Treat special-token spellings in source material as ordinary text.
    return encoder.encode(text, [], []).length;
  } catch {
    throw new EmbeddingError("INVALID_INPUT", false);
  }
}
