import "server-only";
import { sha256 } from "./content-hash";
import type { DocumentChunk } from "./chunk-contract";
import { EMBEDDING_PROVENANCE, type EmbeddedChunk, type EmbeddingProvider, type ProviderEmbedding } from "./embedding-contract";
import { EMBEDDING_LIMITS } from "./embedding-limits";
import { EmbeddingError } from "./embedding-errors";
import { countEmbeddingTokens } from "./embedding-tokenizer";

export type EmbeddingJobOptions = {
  maxJobTokens?: number;
  maxEstimatedJobCostUsd?: number;
  maxProviderAttempts?: number;
  maxJobProviderAttempts?: number;
  signal?: AbortSignal;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

type BudgetedChunk = { chunk: DocumentChunk; tokenCount: number };

function boundedOption(value: number | undefined, fallback: number, ceiling: number, integer = true): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result <= 0 || result > ceiling || (integer && !Number.isInteger(result))) {
    throw new EmbeddingError("INVALID_INPUT", false);
  }
  return result;
}

function validateChunk(chunk: DocumentChunk, position: number): void {
  if (!chunk || typeof chunk !== "object" || chunk.index !== position || typeof chunk.text !== "string" || chunk.text.trim().length === 0 ||
    !Array.isArray(chunk.refs) || chunk.refs.length === 0 || !Array.isArray(chunk.locators) || chunk.locators.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(chunk.textHash) || sha256(chunk.text) !== chunk.textHash ||
    !/^[a-f0-9]{64}$/u.test(chunk.chunkHash) || typeof chunk.chunkerVersion !== "string" || chunk.chunkerVersion.length === 0) {
    throw new EmbeddingError("INVALID_INPUT", false);
  }
}

function validateProviderResponse(response: unknown, expectedCount: number): ProviderEmbedding[] {
  if (!Array.isArray(response) || response.length !== expectedCount) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
  const byIndex = new Map<number, number[]>();
  for (const item of response) {
    if (!item || typeof item !== "object") throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
    const record = item as { index?: unknown; embedding?: unknown };
    if (!Number.isInteger(record.index) || (record.index as number) < 0 || (record.index as number) >= expectedCount || byIndex.has(record.index as number) || !Array.isArray(record.embedding) || record.embedding.length !== EMBEDDING_PROVENANCE.dimensions) {
      throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
    }
    const vector = record.embedding;
    if (vector.some(value => typeof value !== "number" || !Number.isFinite(value))) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
    let squaredNorm = 0;
    for (const value of vector) squaredNorm += value * value;
    if (!Number.isFinite(squaredNorm) || squaredNorm <= 0) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
    byIndex.set(record.index as number, vector as number[]);
  }
  if (byIndex.size !== expectedCount) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
  return Array.from({ length: expectedCount }, (_, index) => {
    const embedding = byIndex.get(index);
    if (!embedding) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
    return { index, embedding };
  });
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new EmbeddingError("CANCELLED", false));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new EmbeddingError("CANCELLED", false)); }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function embedChunks(chunks: readonly DocumentChunk[], provider: EmbeddingProvider, options: EmbeddingJobOptions = {}): Promise<EmbeddedChunk[]> {
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 10_000 ||
    provider?.provider !== EMBEDDING_PROVENANCE.provider || provider.model !== EMBEDDING_PROVENANCE.model || provider.dimensions !== EMBEDDING_PROVENANCE.dimensions) {
    throw new EmbeddingError("INVALID_INPUT", false);
  }
  const maxJobTokens = boundedOption(options.maxJobTokens, EMBEDDING_LIMITS.maxJobTokens, EMBEDDING_LIMITS.maxJobTokens);
  const maxEstimatedCost = boundedOption(options.maxEstimatedJobCostUsd, EMBEDDING_LIMITS.maxEstimatedJobCostUsd, EMBEDDING_LIMITS.maxEstimatedJobCostUsd, false);
  const maxBatchAttempts = boundedOption(options.maxProviderAttempts, EMBEDDING_LIMITS.maxProviderAttempts, EMBEDDING_LIMITS.maxProviderAttempts);
  const maxJobAttempts = boundedOption(options.maxJobProviderAttempts, EMBEDDING_LIMITS.maxJobProviderAttempts, EMBEDDING_LIMITS.maxJobProviderAttempts);

  const budgeted: BudgetedChunk[] = [];
  let jobTokens = 0;
  if (chunks.length > EMBEDDING_LIMITS.maxJobChunks) throw new EmbeddingError("RESOURCE_LIMIT", false);
  for (const [position, chunk] of chunks.entries()) {
    validateChunk(chunk, position);
    const tokenCount = countEmbeddingTokens(chunk.text);
    if (tokenCount < 1) throw new EmbeddingError("INVALID_INPUT", false);
    if (tokenCount > EMBEDDING_LIMITS.maxInputTokens) throw new EmbeddingError("RESOURCE_LIMIT", false);
    jobTokens += tokenCount;
    if (jobTokens > maxJobTokens) throw new EmbeddingError("RESOURCE_LIMIT", false);
    budgeted.push({ chunk, tokenCount });
  }
  // Retries may be billable too, so the preflight uses the maximum attempts per batch.
  const estimatedCostUsd = jobTokens * EMBEDDING_LIMITS.priceUsdPerMillionTokens * maxBatchAttempts / 1_000_000;
  if (estimatedCostUsd > maxEstimatedCost) throw new EmbeddingError("COST_LIMIT", false);
  if (options.signal?.aborted) throw new EmbeddingError("CANCELLED", false);

  const batches: BudgetedChunk[][] = [];
  let current: BudgetedChunk[] = [];
  let currentTokens = 0;
  for (const item of budgeted) {
    if (current.length && (current.length >= EMBEDDING_LIMITS.maxBatchChunks || currentTokens + item.tokenCount > EMBEDDING_LIMITS.maxBatchTokens)) {
      batches.push(current); current = []; currentTokens = 0;
    }
    current.push(item); currentTokens += item.tokenCount;
  }
  if (current.length) batches.push(current);

  const results: EmbeddedChunk[] = [];
  let totalProviderAttempts = 0;
  const sleep = options.sleep ?? wait;
  const random = options.random ?? Math.random;
  for (const batch of batches) {
    let attempt = 0;
    while (true) {
      if (options.signal?.aborted) throw new EmbeddingError("CANCELLED", false);
      if (totalProviderAttempts >= maxJobAttempts) throw new EmbeddingError("ATTEMPT_LIMIT", false);
      attempt += 1;
      totalProviderAttempts += 1;
      try {
        const providerResult = await provider.embed({ input: batch.map(item => item.chunk.text), signal: options.signal });
        const ordered = validateProviderResponse(providerResult, batch.length);
        results.push(...ordered.map((item, index) => ({
          chunkIndex: batch[index]!.chunk.index,
          inputHash: batch[index]!.chunk.textHash,
          tokenCount: batch[index]!.tokenCount,
          vector: item.embedding,
          provenance: EMBEDDING_PROVENANCE,
        })));
        break;
      } catch (error) {
        const failure = error instanceof EmbeddingError ? error : new EmbeddingError("PROVIDER_UNAVAILABLE", true);
        if (!failure.retryable) throw failure;
        if (attempt >= maxBatchAttempts || totalProviderAttempts >= maxJobAttempts) throw new EmbeddingError("ATTEMPT_LIMIT", false);
        const backoff = Math.min(EMBEDDING_LIMITS.baseRetryDelayMs * 2 ** (attempt - 1), EMBEDDING_LIMITS.maxRetryDelayMs);
        const jitter = Math.floor(backoff * (0.5 + Math.min(1, Math.max(0, random()))));
        await sleep(failure.retryAfterMs ?? jitter, options.signal);
      }
    }
  }
  if (results.length !== chunks.length) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
  return results;
}
