export const EMBEDDING_LIMITS = Object.freeze({
  maxInputTokens: 8192,
  maxJobChunks: 10_000,
  maxBatchChunks: 32,
  maxBatchTokens: 16_000,
  maxJobTokens: 200_000,
  // OpenAI's published text-embedding-3-small rate: $0.02 per 1M tokens.
  // Re-check provider pricing before enabling live indexing.
  priceUsdPerMillionTokens: 0.02,
  maxEstimatedJobCostUsd: 0.01,
  maxProviderAttempts: 3,
  maxJobProviderAttempts: 939,
  baseRetryDelayMs: 250,
  maxRetryDelayMs: 60_000,
  requestTimeoutMs: 30_000,
  maxResponseBytes: 4 * 1024 * 1024,
});
