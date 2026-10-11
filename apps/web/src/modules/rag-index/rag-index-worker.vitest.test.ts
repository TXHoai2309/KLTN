import { describe, expect, it, vi } from "vitest";
import { createFakeEmbeddingProvider } from "../rag-processing/__fixtures__/fake-embedding-provider";
import { EmbeddingError } from "../rag-processing/embedding-errors";
import { extractDocument } from "../rag-processing/extract-document";
import { encryptedSyntheticPdf, p, syntheticDocx, syntheticPdf } from "../rag-processing/__fixtures__/synthetic-documents";
import { sha256 } from "../rag-processing/content-hash";
import { createRagIndexWorker, type RagIndexWorkerDependencies } from "./rag-index-worker";

vi.mock("server-only", () => ({}));

function harness(options: { status?: string; content?: string; fileType?: "TXT" | "PDF" | "DOCX"; bytes?: Uint8Array; persistedIndexes?: number[]; providerFailure?: EmbeddingError; signal?: AbortSignal; leaseMs?: number; renewFailure?: boolean; holdStorageUntilAbort?: boolean; onVerifyGeneration?: () => void } = {}) {
  const fileType = options.fileType ?? "TXT";
  const bytes = options.bytes ?? new TextEncoder().encode(options.content ?? "Hà Giang có cao nguyên đá và nhiều giá trị văn hóa.");
  const fileName = fileType === "TXT" ? "synthetic.txt" : fileType === "PDF" ? "synthetic.pdf" : "synthetic.docx";
  const mimeType = fileType === "TXT" ? "text/plain" : fileType === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const job = {
    id: "job-1", ragDocumentId: "doc-1", requestedById: "admin-1", status: "RUNNING" as const,
    phase: "ACQUIRING" as const, leaseToken: "lease-1", attemptCount: 1, cancelRequestedAt: null,
    contentVersionId: null, generationId: null, pendingBatchIndexes: null,
  };
  const calls: string[] = [];
  const savedIndexes = new Set(options.persistedIndexes ?? []);
  const failures: Array<{ status: string; code: string; options?: unknown }> = [];
  const recordedWarnings: string[][] = [];
  const persistedEmbeddingBatches: number[][] = [];
  let providerCalls = 0;
  const { provider } = createFakeEmbeddingProvider(input => {
    providerCalls += 1;
    if (options.providerFailure) throw options.providerFailure;
    return input.map((_, index) => ({ index, embedding: [1, ...Array<number>(1535).fill(0)] }));
  });
  const jobs = {
    claimNext: vi.fn(async () => job),
    renew: vi.fn(async () => {
      if (options.renewFailure) throw new Error("Synthetic database connection failure");
      return "RENEWED" as const;
    }),
    getDocumentForJob: vi.fn(async () => ({
      id: "doc-1", status: options.status ?? "APPROVED", originalFileName: fileName,
      fileType, mimeType, sizeBytes: bytes.byteLength, storagePath: "private/registered-path",
    })),
    checkpoint: vi.fn(async (_lease, phase: string, pending?: number[] | null) => { calls.push(`phase:${phase}:${pending?.join(",") ?? ""}`); }),
    recordWarnings: vi.fn(async (_lease, codes: string[]) => { recordedWarnings.push([...codes]); }),
    setIdentities: vi.fn(async () => undefined),
    listPersistedEmbeddingIndexes: vi.fn(async () => [...savedIndexes].sort((a, b) => a - b)),
    markFailure: vi.fn(async (_lease, status: string, code: string, failureOptions?: unknown) => { failures.push({ status, code, options: failureOptions }); }),
  };
  const index = {
    createOrFindContentVersion: vi.fn(async (input: { originalBytesHash: string }) => ({ id: "cv-1", identityHash: sha256(JSON.stringify(input)) })),
    createOrFindGeneration: vi.fn(async () => ({ id: "generation-1", generationKey: "g".repeat(64), state: "BUILDING" as const })),
    persistChunks: vi.fn(async () => 1),
    verifyPersistedEmbeddingMetadata: vi.fn(async () => undefined),
    persistEmbeddings: vi.fn(async (_docId, _generationId, batch: Array<{ chunkIndex: number }>) => {
      const indexes = batch.map(item => item.chunkIndex);
      persistedEmbeddingBatches.push(indexes);
      indexes.forEach(index => savedIndexes.add(index));
      calls.push("persist:embeddings");
      return batch.length;
    }),
    verifyGeneration: vi.fn(async () => {
      options.onVerifyGeneration?.();
      return { state: "READY" as const, expectedChunkCount: 1, actualChunkCount: 1, actualEmbeddingCount: 1, expectedTokenCount: 12, actualTokenCount: 12, complete: true };
    }),
    finalizeReadyGeneration: vi.fn(async () => { calls.push("finalize"); }),
  };
  const storage = { read: vi.fn(async (_pathname: string, signal?: AbortSignal) => {
    if (options.holdStorageUntilAbort) await new Promise<void>(resolve => signal?.addEventListener("abort", () => resolve(), { once: true }));
    return { bytes, mimeType, sizeBytes: bytes.byteLength };
  }) };
  const deps = {
    jobs, index, storage, provider,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.leaseMs ? { leaseMs: options.leaseMs } : {}),
    embeddingOptions: { sleep: async () => undefined, random: () => 0 },
  } as unknown as RagIndexWorkerDependencies;
  return { worker: createRagIndexWorker(deps), jobs, index, storage, failures, recordedWarnings, calls, persistedEmbeddingBatches, get providerCalls() { return providerCalls; } };
}

describe("US-19 Task185 indexing worker", () => {
  it("records a safe chunk persistence failure without leaking Prisma messages or making provider calls", async () => {
    const test = harness();
    test.index.persistChunks.mockRejectedValueOnce(Object.assign(new Error("PRIVATE_DOCUMENT_TEXT signed-url credential"), { code: "P2039" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "FAILED" });
      expect(test.failures[0]).toMatchObject({ status: "FAILED", code: "CHUNK_PERSISTENCE_FAILED" });
      expect(log).toHaveBeenCalledWith("RAG_INDEX_FAILURE", { phase: "PERSISTING_CHUNKS", failureCode: "CHUNK_PERSISTENCE_FAILED", prismaCode: "P2039" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_DOCUMENT_TEXT");
      expect(test.providerCalls).toBe(0);
      expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("runs the real extraction/chunking path with a fake provider and finalizes only after a complete generation", async () => {
    const test = harness();
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "COMPLETED" });
    expect(test.storage.read).toHaveBeenCalledWith("private/registered-path", expect.any(AbortSignal));
    expect(test.providerCalls).toBe(1);
    expect(test.index.persistEmbeddings).toHaveBeenCalledTimes(1);
    expect(test.calls.indexOf("persist:embeddings")).toBeLessThan(test.calls.indexOf("finalize"));
    expect(test.index.finalizeReadyGeneration).toHaveBeenCalledWith("doc-1", "generation-1", { jobId: "job-1", leaseToken: "lease-1" });
    expect(test.jobs.recordWarnings).toHaveBeenCalledWith(expect.anything(), []);
    expect(test.failures).toHaveLength(0);
  });

  it("indexes a text PDF with the informational reading-order warning and retains its provenance", async () => {
    const test = harness({ fileType: "PDF", bytes: syntheticPdf([{ text: "Synthetic Hà Giang source text." }]) });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "COMPLETED" });
    expect(test.jobs.recordWarnings).toHaveBeenCalledWith(expect.anything(), ["PDF_READING_ORDER_HEURISTIC"]);
    expect(test.providerCalls).toBe(1);
    expect(test.index.finalizeReadyGeneration).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a text PDF has a page without text", async () => {
    const test = harness({ fileType: "PDF", bytes: syntheticPdf([{ text: "Page one." }, {}, { text: "Page three." }]) });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "FAILED" });
    expect(test.failures).toEqual([{ status: "FAILED", code: "INCOMPLETE_COVERAGE", options: { warningCodes: ["PAGE_WITHOUT_TEXT", "PDF_READING_ORDER_HEURISTIC"] } }]);
    expect(test.providerCalls).toBe(0);
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });

  it("rejects image-only PDFs with no extractable text", async () => {
    const test = harness({ fileType: "PDF", bytes: syntheticPdf([{ image: true }]) });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "FAILED" });
    expect(test.jobs.recordWarnings).toHaveBeenCalledWith(expect.anything(), ["PAGE_WITHOUT_TEXT", "PDF_READING_ORDER_HEURISTIC"]);
    expect(test.failures[0]).toMatchObject({ status: "FAILED", code: "EXTRACTION_NO_EXTRACTABLE_TEXT" });
    expect(test.providerCalls).toBe(0);
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });

  it("fails closed on DOCX with unsupported content regions", async () => {
    const bytes = syntheticDocx(p("Readable body") + "<w:p><w:r><w:drawing><w:txbxContent>Omitted text</w:txbxContent></w:drawing></w:r></w:p>");
    const test = harness({ fileType: "DOCX", bytes });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "FAILED" });
    expect(test.failures).toEqual([{ status: "FAILED", code: "INCOMPLETE_COVERAGE", options: { warningCodes: ["UNSUPPORTED_DOCX_REGION"] } }]);
    expect(test.providerCalls).toBe(0);
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "corrupt", bytes: new TextEncoder().encode("%PDF-1.4\ninvalid\n%%EOF"), failureCode: "EXTRACTION_CORRUPT_DOCUMENT" },
    { kind: "password-protected", bytes: encryptedSyntheticPdf(), failureCode: "EXTRACTION_PASSWORD_REQUIRED" },
  ])("rejects $kind PDF files without embedding or publication", async ({ bytes, failureCode }) => {
    const test = harness({ fileType: "PDF", bytes });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "FAILED" });
    expect(test.providerCalls).toBe(0);
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
    expect(test.failures[0]).toMatchObject({ status: "FAILED", code: failureCode });
  });

  it("stops a document disabled before processing and does not read its private Blob", async () => {
    const test = harness({ status: "DISABLED" });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "CANCELLED" });
    expect(test.storage.read).not.toHaveBeenCalled();
    expect(test.failures[0]).toMatchObject({ status: "CANCELLED", code: "DOCUMENT_NOT_ELIGIBLE" });
  });

  it("honors an already-aborted worker runtime signal before reading Blob", async () => {
    const controller = new AbortController();
    controller.abort();
    const test = harness({ signal: controller.signal });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "TIMED_OUT" });
    expect(test.storage.read).not.toHaveBeenCalled();
    expect(test.failures[0]).toMatchObject({ status: "TIMED_OUT" });
  });

  it("keeps lease-renewal uncertainty as UNKNOWN instead of reporting cancellation", async () => {
    vi.useFakeTimers();
    try {
      const test = harness({ leaseMs: 10_000, renewFailure: true, holdStorageUntilAbort: true });
      const result = test.worker.runNext();
      for (let i = 0; i < 20 && !test.storage.read.mock.calls.length; i++) await Promise.resolve();
      expect(test.storage.read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_500);
      await expect(result).resolves.toEqual({ jobId: "job-1", status: "UNKNOWN" });
      expect(test.failures[0]).toMatchObject({ status: "UNKNOWN", code: "WORKER_LEASE_STATE_UNKNOWN" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not publish after the worker runtime aborts during generation verification", async () => {
    const controller = new AbortController();
    const test = harness({ signal: controller.signal, onVerifyGeneration: () => controller.abort() });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "TIMED_OUT" });
    expect(test.index.verifyGeneration).toHaveBeenCalledTimes(1);
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
    expect(test.failures[0]).toMatchObject({ status: "TIMED_OUT" });
  });

  it("preserves uncertainty and the pending batch after an embedding timeout", async () => {
    const test = harness({ providerFailure: new EmbeddingError("PROVIDER_TIMEOUT", true) });
    await expect(test.worker.runNext()).resolves.toEqual({ jobId: "job-1", status: "UNKNOWN" });
    expect(test.providerCalls).toBe(1);
    expect(test.failures[0]).toMatchObject({ status: "UNKNOWN", code: "EMBEDDING_OUTCOME_UNKNOWN", options: { preservePendingBatch: true } });
    expect(test.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });

  it("resumes only missing persisted vectors and maps sparse chunk indexes back to the generation", async () => {
    const test = harness({ content: `${"Hà Giang có đá và văn hóa. ".repeat(120)}` , persistedIndexes: [0] });
    await expect(test.worker.runNext()).resolves.toMatchObject({ status: "COMPLETED" });
    expect(test.index.verifyPersistedEmbeddingMetadata).toHaveBeenCalledWith("doc-1", "generation-1", [{ chunkIndex: 0, inputHash: expect.any(String), tokenCount: expect.any(Number) }], { jobId: "job-1", leaseToken: "lease-1" });
    expect(test.providerCalls).toBeGreaterThan(0);
    expect(test.persistedEmbeddingBatches.flat()).not.toContain(0);
    expect(test.index.finalizeReadyGeneration).toHaveBeenCalledTimes(1);
  });
});


describe("Task187 failure pipeline regressions",()=>{
 it("valid DOCX completes real extraction/chunking",async()=>{const t=harness({fileType:"DOCX",bytes:syntheticDocx(p("Synthetic valid document"))});expect(await t.worker.runNext()).toMatchObject({status:"COMPLETED"});expect(t.index.finalizeReadyGeneration).toHaveBeenCalledTimes(1);});
 it("missing Blob fails without provider or publication",async()=>{const t=harness();t.storage.read.mockRejectedValue(new Error("synthetic missing"));expect(await t.worker.runNext()).toMatchObject({status:"FAILED"});expect(t.providerCalls).toBe(0);expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();});
 it("untrusted extractor hash cannot publish",async()=>{const t=harness();const actual=await extractDocument({bytes:new TextEncoder().encode("Synthetic"),format:"TXT"});const replacement={...actual,...("document" in actual?{document:{...actual.document,originalBytesHash:"0".repeat(64)}}:{})};const test=createRagIndexWorker({jobs:t.jobs,index:t.index,storage:t.storage,provider:createFakeEmbeddingProvider().provider,extract:async()=>replacement} as unknown as RagIndexWorkerDependencies);expect(await test.runNext()).toMatchObject({status:"FAILED"});expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();});
 it("provider rejection fails instead of being automatically retried",async()=>{const t=harness({providerFailure:new EmbeddingError("PROVIDER_REJECTED",false)});expect(await t.worker.runNext()).toMatchObject({status:"FAILED"});expect(t.providerCalls).toBe(1);expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();});
 it("generation verification failure prevents publication",async()=>{const t=harness();t.index.verifyGeneration.mockRejectedValue(new Error("synthetic incomplete"));expect(await t.worker.runNext()).toMatchObject({status:"FAILED"});expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();});
});


describe("Task187 bounded provider/persistence failures",()=>{
  it("token ceiling rejects without calling provider",async()=>{
    const t=harness();const fake=createFakeEmbeddingProvider();
    const worker=createRagIndexWorker({jobs:t.jobs,index:t.index,storage:t.storage,provider:fake.provider,embeddingOptions:{maxJobTokens:1}} as unknown as RagIndexWorkerDependencies);
    expect(await worker.runNext()).toMatchObject({status:"FAILED"});expect(fake.calls).toHaveLength(0);expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });
  it("invalid vector dimensions remains UNKNOWN and never publishes or repeats provider",async()=>{
    const t=harness();const fake=createFakeEmbeddingProvider(input=>input.map((_,index)=>({index,embedding:[1]})));
    const worker=createRagIndexWorker({jobs:t.jobs,index:t.index,storage:t.storage,provider:fake.provider} as unknown as RagIndexWorkerDependencies);
    expect(await worker.runNext()).toMatchObject({status:"UNKNOWN"});expect(fake.calls).toHaveLength(1);expect(t.index.persistEmbeddings).not.toHaveBeenCalled();expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });
  it("vector persistence uncertainty does not publish or retry external call",async()=>{
    const t=harness();t.index.persistEmbeddings.mockRejectedValue(new Error("synthetic persistence uncertainty"));
    expect(await t.worker.runNext()).toMatchObject({status:"UNKNOWN"});expect(t.providerCalls).toBe(1);expect(t.index.finalizeReadyGeneration).not.toHaveBeenCalled();
  });
});
