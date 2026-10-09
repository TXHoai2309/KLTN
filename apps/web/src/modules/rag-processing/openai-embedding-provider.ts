import "server-only";
import { EMBEDDING_LIMITS } from "./embedding-limits";
import { EmbeddingError } from "./embedding-errors";
import { countEmbeddingTokens } from "./embedding-tokenizer";
import type { EmbeddingProvider, ProviderEmbedding } from "./embedding-contract";

type OpenAiProviderOptions = {
  apiKey?: () => string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function retryAfterMs(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  if (/^\d{1,6}$/u.test(value.trim())) return Math.min(Number(value.trim()) * 1000, EMBEDDING_LIMITS.maxRetryDelayMs);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(Math.max(0, date - now), EMBEDDING_LIMITS.maxRetryDelayMs);
}

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > EMBEDDING_LIMITS.maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createOpenAiEmbeddingProvider(options: OpenAiProviderOptions = {}): EmbeddingProvider {
  const getKey = options.apiKey ?? (() => process.env.OPENAI_API_KEY);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? EMBEDDING_LIMITS.requestTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > EMBEDDING_LIMITS.requestTimeoutMs) throw new EmbeddingError("INVALID_INPUT", false);
  return {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    async embed({ input, signal }): Promise<ProviderEmbedding[]> {
      if (!Array.isArray(input) || input.length < 1 || input.length > EMBEDDING_LIMITS.maxBatchChunks || input.some(text => typeof text !== "string" || text.length === 0)) {
        throw new EmbeddingError("INVALID_INPUT", false);
      }
      let batchTokens = 0;
      for (const text of input) {
        if (text.trim().length === 0) throw new EmbeddingError("INVALID_INPUT", false);
        const count = countEmbeddingTokens(text);
        if (count > EMBEDDING_LIMITS.maxInputTokens) throw new EmbeddingError("RESOURCE_LIMIT", false);
        batchTokens += count;
      }
      if (batchTokens > EMBEDDING_LIMITS.maxBatchTokens) throw new EmbeddingError("RESOURCE_LIMIT", false);
      let key: string | undefined;
      try { key = getKey(); }
      catch { throw new EmbeddingError("CREDENTIALS_UNAVAILABLE", false); }
      if (typeof key !== "string" || key.length === 0) throw new EmbeddingError("CREDENTIALS_UNAVAILABLE", false);
      if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);

      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        let response: Response;
        try {
          response = await fetcher("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ model: "text-embedding-3-small", dimensions: 1536, encoding_format: "float", input }),
            signal: controller.signal,
            redirect: "error",
          });
        } catch {
          if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
          if (timedOut) throw new EmbeddingError("PROVIDER_TIMEOUT", true);
          throw new EmbeddingError("PROVIDER_UNAVAILABLE", true);
        }

        if (!response.ok) {
          const delay = retryAfterMs(response.headers.get("retry-after"), Date.now());
          await response.body?.cancel().catch(() => undefined);
          if (response.status === 429) throw new EmbeddingError("PROVIDER_RATE_LIMITED", true, delay);
          if (response.status === 408 || response.status >= 500) throw new EmbeddingError("PROVIDER_UNAVAILABLE", true, delay);
          throw new EmbeddingError("PROVIDER_REJECTED", false);
        }

        let responseText: string;
        try { responseText = await readBounded(response); }
        catch (error) {
          if (error instanceof EmbeddingError) throw error;
          if (signal?.aborted) throw new EmbeddingError("CANCELLED", false);
          if (timedOut) throw new EmbeddingError("PROVIDER_TIMEOUT", true);
          throw new EmbeddingError("PROVIDER_UNAVAILABLE", true);
        }
        let payload: unknown;
        try { payload = JSON.parse(responseText); }
        catch { throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false); }
        if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
          throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
        }
        const data = (payload as { data: unknown[] }).data;
        if (data.some(entry => !entry || typeof entry !== "object" || !("index" in entry) || !("embedding" in entry))) throw new EmbeddingError("INVALID_PROVIDER_RESPONSE", false);
        return data.map(entry => {
          const record = entry as { index: number; embedding: number[] };
          return { index: record.index, embedding: record.embedding };
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
