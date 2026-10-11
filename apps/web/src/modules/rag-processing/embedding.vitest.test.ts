import { describe, expect, it, vi } from "vitest";
import { sha256 } from "./content-hash";
import { EmbeddingError } from "./embedding-errors";
import { EMBEDDING_LIMITS } from "./embedding-limits";
import { countEmbeddingTokens } from "./embedding-tokenizer";
import { embedChunks } from "./embed-chunks";
import { extractDocument } from "./extract-document";
import { chunkDocument } from "./chunk-document";
import { createFakeEmbeddingProvider } from "./__fixtures__/fake-embedding-provider";
import type { DocumentChunk } from "./chunk-contract";

vi.mock("server-only", () => ({}));

const makeChunks = (texts: string[]): DocumentChunk[] => texts.map((text, index) => ({
  index, text, refs: [{ segmentId: `s${index}`, segmentStart: 0, segmentEnd: text.length, chunkStart: 0, chunkEnd: text.length }],
  locators: [{ format: "TXT", lineStart: index + 1, lineEnd: index + 1 }],
  textHash: sha256(text), chunkHash: sha256(`chunk:${index}:${text}`), chunkerVersion: "test-chunker-v1",
}));
const zeroVector = () => Array<number>(1536).fill(0);
const oneVector = () => [1, ...Array<number>(1535).fill(0)];

describe("US-19 Task183 offline embedding pipeline", () => {
  it("uses exact cl100k token counts and accepts Vietnamese text without rewriting", async () => {
    const text = "Xin chào Hà Giang 🇻🇳!";
    expect(countEmbeddingTokens(text)).toBe(16);
    const fake = createFakeEmbeddingProvider();
    const result = await embedChunks(makeChunks([text]), fake.provider, { sleep: async () => undefined, random: () => 0 });
    expect(fake.calls).toEqual([[text]]);
    expect(result[0]).toMatchObject({ chunkIndex: 0, inputHash: sha256(text), tokenCount: 16, vector: oneVector(), provenance: { model: "text-embedding-3-small", dimensions: 1536, tokenizer: "cl100k_base" } });
  });

  it("rejects invalid chunks and per-input over-budget text before any provider call", async () => {
    const fake = createFakeEmbeddingProvider();
    await expect(embedChunks(makeChunks([" "]), fake.provider)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const mismatch = makeChunks(["word"]); mismatch[0]!.textHash = "0".repeat(64);
    await expect(embedChunks(mismatch, fake.provider)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const over = makeChunks(["a ".repeat(8193)]);
    await expect(embedChunks(over, fake.provider)).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(fake.calls).toHaveLength(0);
  });

  it("enforces job token and estimated cost budgets before contacting the provider", async () => {
    const fake = createFakeEmbeddingProvider();
    await expect(embedChunks(makeChunks(["Hà Giang"]), fake.provider, { maxJobTokens: 1 })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    await expect(embedChunks(makeChunks(["Hà Giang"]), fake.provider, { maxEstimatedJobCostUsd: 0.000000000001 })).rejects.toMatchObject({ code: "COST_LIMIT" });
    expect(fake.calls).toHaveLength(0);

    const retryBudgetFake = createFakeEmbeddingProvider();
    const costly = makeChunks(Array.from({ length: 21 }, (_, index) => `${index} ${"a ".repeat(8188)}`));
    await expect(embedChunks(costly, retryBudgetFake.provider)).rejects.toMatchObject({ code: "COST_LIMIT" });
    expect(retryBudgetFake.calls).toHaveLength(0);
  });

  it("splits sequentially at both batch count and token ceilings", async () => {
    const fake = createFakeEmbeddingProvider();
    const texts = Array.from({ length: 33 }, (_, index) => `chunk ${index}`);
    const result = await embedChunks(makeChunks(texts), fake.provider, { sleep: async () => undefined, random: () => 0 });
    expect(fake.calls.map(batch => batch.length)).toEqual([32, 1]);
    expect(result.map(item => item.chunkIndex)).toEqual(Array.from({ length: 33 }, (_, index) => index));

    const tokenFake = createFakeEmbeddingProvider();
    const tokenTexts = ["a ".repeat(6000), "b ".repeat(6000), "c ".repeat(6000)];
    await embedChunks(makeChunks(tokenTexts), tokenFake.provider, { sleep: async () => undefined, random: () => 0 });
    expect(tokenFake.calls.map(batch => batch.length)).toEqual([2, 1]);
    expect(tokenFake.calls.every(batch => batch.reduce((sum, text) => sum + countEmbeddingTokens(text), 0) <= EMBEDDING_LIMITS.maxBatchTokens)).toBe(true);
  });

  it("sorts responses by validated index and rejects missing, duplicate, malformed, non-finite, and zero vectors", async () => {
    const chunks = makeChunks(["one", "two"]);
    const reversed = createFakeEmbeddingProvider(input => input.map((_, index) => ({ index: 1 - index, embedding: oneVector() })));
    const ordered = await embedChunks(chunks, reversed.provider, { sleep: async () => undefined });
    expect(ordered.map(item => item.chunkIndex)).toEqual([0, 1]);

    const badResponses = [
      [{ index: 0, embedding: oneVector() }],
      [{ index: 0, embedding: oneVector() }, { index: 0, embedding: oneVector() }],
      [{ index: 0, embedding: oneVector() }, { index: 1, embedding: Array<number>(1535).fill(1) }],
      [{ index: 0, embedding: [Number.NaN, ...Array<number>(1535).fill(0)] }, { index: 1, embedding: oneVector() }],
      [{ index: 0, embedding: zeroVector() }, { index: 1, embedding: oneVector() }],
    ];
    for (const response of badResponses) {
      const fake = createFakeEmbeddingProvider(() => response as never);
      await expect(embedChunks(chunks, fake.provider, { sleep: async () => undefined })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    }
  });

  it("retries only retryable failures with bounded jitter/Retry-After and preserves no partial result", async () => {
    const waits: number[] = [];
    let call = 0;
    const fake = createFakeEmbeddingProvider(() => {
      call += 1;
      if (call === 1) throw new EmbeddingError("PROVIDER_RATE_LIMITED", true, 321);
      return [{ index: 0, embedding: oneVector() }];
    });
    const result = await embedChunks(makeChunks(["retry"]), fake.provider, { sleep: async ms => { waits.push(ms); }, random: () => 0 });
    expect(waits).toEqual([321]);
    expect(fake.calls).toHaveLength(2);
    expect(result).toHaveLength(1);

    const permanent = createFakeEmbeddingProvider(() => { throw new EmbeddingError("PROVIDER_REJECTED", false); });
    await expect(embedChunks(makeChunks(["no retry"]), permanent.provider, { sleep: async () => undefined })).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
    expect(permanent.calls).toHaveLength(1);

    let batch = 0;
    const laterFailure = createFakeEmbeddingProvider(input => {
      batch += 1;
      if (batch === 2) throw new EmbeddingError("PROVIDER_REJECTED", false);
      return input.map((_, index) => ({ index, embedding: oneVector() }));
    });
    const batchSizedText = "a ".repeat(8191);
    await expect(embedChunks(makeChunks([batchSizedText, batchSizedText]), laterFailure.provider, { sleep: async () => undefined })).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
    expect(laterFailure.calls).toHaveLength(2);
  });

  it("aborts before and during retry waits", async () => {
    const controller = new AbortController(); controller.abort();
    const fake = createFakeEmbeddingProvider();
    await expect(embedChunks(makeChunks(["cancel"]), fake.provider, { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fake.calls).toHaveLength(0);
    const duringWait = new AbortController();
    const retrying = createFakeEmbeddingProvider(() => { throw new EmbeddingError("PROVIDER_UNAVAILABLE", true); });
    await expect(embedChunks(makeChunks(["cancel wait"]), retrying.provider, {
      signal: duringWait.signal, sleep: async () => { duringWait.abort(); },
    })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("does not make a live API request and keeps the OpenAI adapter server-only", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: oneVector() }] }), { status: 200 }));
    const { createOpenAiEmbeddingProvider } = await import("./openai-embedding-provider");
    const provider = createOpenAiEmbeddingProvider({ apiKey: () => "test-only", fetcher });
    await provider.embed({ input: ["synthetic"] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/embeddings");
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe("Bearer test-only");
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('"model":"text-embedding-3-small"');
  });

  it("runs the Task181 → Task182 → fake Task183 pipeline offline", async () => {
    const extracted = await extractDocument({ bytes: new TextEncoder().encode("Văn hóa Hà Giang.\n\nCao nguyên đá."), format: "TXT" });
    expect(extracted.status).toBe("EXTRACTED");
    if (extracted.status !== "EXTRACTED") return;
    const chunked = chunkDocument(extracted.document);
    expect(chunked.status).toBe("CHUNKED");
    if (chunked.status !== "CHUNKED") return;
    const fake = createFakeEmbeddingProvider();
    const embedded = await embedChunks(chunked.chunks, fake.provider, { sleep: async () => undefined });
    expect(embedded.map(item => item.chunkIndex)).toEqual(chunked.chunks.map(chunk => chunk.index));
    expect(embedded.every(item => item.vector.length === 1536)).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it("maps rate limits and timeouts to safe retryable errors and missing keys to configuration errors", async () => {
    const { createOpenAiEmbeddingProvider } = await import("./openai-embedding-provider");
    const rateLimited = createOpenAiEmbeddingProvider({ apiKey: () => "synthetic", fetcher: async () => new Response("", { status: 429, headers: { "retry-after": "2" } }) });
    await expect(rateLimited.embed({ input: ["synthetic"] })).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true, retryAfterMs: 2000 });

    const noKeyFetch = vi.fn<typeof fetch>();
    const noKey = createOpenAiEmbeddingProvider({ apiKey: () => undefined, fetcher: noKeyFetch });
    await expect(noKey.embed({ input: ["synthetic"] })).rejects.toMatchObject({ code: "CREDENTIALS_UNAVAILABLE", retryable: false });
    expect(noKeyFetch).not.toHaveBeenCalled();

    const invalidFetch = vi.fn<typeof fetch>();
    const directBudget = createOpenAiEmbeddingProvider({ apiKey: () => "synthetic", fetcher: invalidFetch });
    await expect(directBudget.embed({ input: ["a ".repeat(8193)] })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(invalidFetch).not.toHaveBeenCalled();

    const timeoutFetch: typeof fetch = async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("transport closed")), { once: true });
    });
    const timeout = createOpenAiEmbeddingProvider({ apiKey: () => "synthetic", fetcher: timeoutFetch, timeoutMs: 5 });
    await expect(timeout.embed({ input: ["synthetic"] })).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });
});
