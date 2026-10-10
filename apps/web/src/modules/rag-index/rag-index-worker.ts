import "server-only";

import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { validateRagFile } from "../rag-document/rag-file";
import { ragStorage } from "../rag-document/rag-storage";
import { chunkDocument, CHUNKER_VERSION, DEFAULT_CHUNK_OPTIONS } from "../rag-processing/chunk-document";
import { EmbeddingCheckpointError, embedChunks, type EmbeddingJobOptions } from "../rag-processing/embed-chunks";
import { EmbeddingError } from "../rag-processing/embedding-errors";
import { EMBEDDING_PROVENANCE, type EmbeddingProvider } from "../rag-processing/embedding-contract";
import { countEmbeddingTokens } from "../rag-processing/embedding-tokenizer";
import { extractDocument } from "../rag-processing/extract-document";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import { sha256 } from "../rag-processing/content-hash";
import { RagIndexError } from "./rag-index-errors";
import { createRagIndexJobStore, type RagIndexJobLease, type RagIndexJobRecord } from "./rag-index-job-store";
import { createRagIndexStore } from "./rag-index-store";
import type { ContentVersionInput, IndexGenerationInput } from "./rag-index-contract";
import type { DocumentChunk } from "../rag-processing/chunk-contract";
import type { ExtractedDocument, ExtractionWarning } from "../rag-processing/extraction-contract";

type StorageReader = { read(pathname: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string; sizeBytes: number }> };
type JobStore = ReturnType<typeof createRagIndexJobStore>;
type IndexStore = ReturnType<typeof createRagIndexStore>;

export type RagIndexWorkerDependencies = {
  jobs: JobStore;
  index: IndexStore;
  storage: StorageReader;
  provider: EmbeddingProvider;
  extract?: typeof extractDocument;
  chunk?: typeof chunkDocument;
  signal?: AbortSignal;
  leaseMs?: number;
  embeddingOptions?: Omit<EmbeddingJobOptions, "signal" | "onBatchStart" | "onBatchComplete">;
};

export type RagIndexWorkerOutcome =
  | { status: "IDLE" }
  | { jobId: string; status: "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN" };

function isAbort(error: unknown): boolean {
  return error instanceof EmbeddingError && error.code === "CANCELLED" ||
    error instanceof AppError && error.code === "RAG_READ_CANCELLED";
}

function sanitizedFailureCode(error: unknown): string {
  if (error instanceof EmbeddingCheckpointError) return sanitizedFailureCode(error.originalError);
  if (error instanceof EmbeddingError) return error.code;
  if (error instanceof RagIndexError) return error.code;
  if (error instanceof AppError) return error.code;
  return "INDEXING_FAILED";
}

function warningCodes(document: ExtractedDocument): ExtractionWarning["code"][] {
  return [...new Set(document.warnings.map(warning => warning.code))].sort();
}

function incompleteCoverageWarningCodes(codes: readonly string[]): string[] {
  // PDF.js line assembly is heuristic by design and is emitted for every PDF.
  // Keep it as job provenance, but only block on evidence of omitted content.
  return codes.filter(code => code !== "PDF_READING_ORDER_HEURISTIC");
}

function isKnownProviderRejection(error: unknown): boolean {
  const cause = error instanceof EmbeddingCheckpointError ? error.originalError : error;
  return cause instanceof EmbeddingError && [
    "CREDENTIALS_UNAVAILABLE", "PROVIDER_REJECTED", "PROVIDER_RATE_LIMITED", "INVALID_INPUT", "RESOURCE_LIMIT", "COST_LIMIT",
  ].includes(cause.code);
}

function isDocumentIneligible(error: unknown): boolean {
  return error instanceof RagIndexError && error.code === "DOCUMENT_NOT_ELIGIBLE" ||
    error instanceof AppError && error.code === "DOCUMENT_NOT_ELIGIBLE";
}

function makeGenerationInput(
  ragDocumentId: string,
  contentVersionId: string,
  chunks: readonly DocumentChunk[],
): IndexGenerationInput {
  // The Task184 generation identity records expected token totals, not provider
  // vectors. Unit vectors here are identity-only placeholders and are never saved.
  const embeddings = chunks.map(chunk => ({
    chunkIndex: chunk.index,
    inputHash: chunk.textHash,
    tokenCount: countEmbeddingTokens(chunk.text),
    vector: [1, ...Array<number>(EMBEDDING_PROVENANCE.dimensions - 1).fill(0)],
    provenance: EMBEDDING_PROVENANCE,
  }));
  return {
    ragDocumentId, contentVersionId, chunkerVersion: CHUNKER_VERSION,
    chunkOptions: { ...DEFAULT_CHUNK_OPTIONS }, provenance: EMBEDDING_PROVENANCE,
    chunks, embeddings,
  };
}

function startHeartbeat(
  jobs: JobStore,
  lease: RagIndexJobLease,
  leaseMs: number,
  internalController: AbortController,
  externalSignal?: AbortSignal,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reason: "CANCELLED" | "TIMED_OUT" | "UNKNOWN" | undefined;
  const abortFromExternal = () => { reason = "TIMED_OUT"; internalController.abort(); };
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const schedule = () => {
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const result = await jobs.renew(lease, leaseMs);
        if (result === "RENEWED") { schedule(); return; }
        reason = result === "CANCELLED" || result === "INELIGIBLE" ? "CANCELLED" : "UNKNOWN";
      } catch { reason = "UNKNOWN"; }
      internalController.abort();
    }, Math.max(2_000, Math.floor(leaseMs / 3)));
  };
  schedule();
  return {
    get reason() { return reason; },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function finishFailure(
  jobs: JobStore,
  lease: RagIndexJobLease,
  error: unknown,
  pendingProviderBatch: boolean,
  heartbeatReason?: "CANCELLED" | "TIMED_OUT" | "UNKNOWN",
): Promise<RagIndexWorkerOutcome["status"]> {
  if (error instanceof RagIndexError && error.code === "JOB_LEASE_LOST") return "UNKNOWN";
  const uncertain = pendingProviderBatch && !isKnownProviderRejection(error);
  const status = uncertain ? "UNKNOWN"
    : heartbeatReason === "UNKNOWN" ? "UNKNOWN"
    : heartbeatReason === "TIMED_OUT" ? "TIMED_OUT"
    : heartbeatReason === "CANCELLED" || error instanceof RagIndexError && error.code === "JOB_CANCELLED" || isAbort(error) || isDocumentIneligible(error) ? "CANCELLED"
    : "FAILED";
  const failureCode = uncertain
    ? (heartbeatReason === "CANCELLED" ? "CANCEL_DURING_PROVIDER_UNKNOWN" : heartbeatReason === "TIMED_OUT" ? "TIMEOUT_DURING_PROVIDER_UNKNOWN" : "EMBEDDING_OUTCOME_UNKNOWN")
    : heartbeatReason === "UNKNOWN" ? "WORKER_LEASE_STATE_UNKNOWN"
    : sanitizedFailureCode(error);
  try {
    await jobs.markFailure(lease, status, failureCode, { preservePendingBatch: uncertain });
    return status;
  } catch (markError) {
    if (markError instanceof RagIndexError && markError.code === "JOB_LEASE_LOST") return "UNKNOWN";
    return "UNKNOWN";
  }
}

async function runClaimed(job: RagIndexJobRecord, deps: RagIndexWorkerDependencies): Promise<RagIndexWorkerOutcome> {
  const lease: RagIndexJobLease = { jobId: job.id, leaseToken: job.leaseToken };
  const controller = new AbortController();
  const leaseMs = deps.leaseMs ?? 120_000;
  const heartbeat = startHeartbeat(deps.jobs, lease, leaseMs, controller, deps.signal);
  let pendingProviderBatch = job.pendingBatchIndexes !== null;
  try {
    const document = await deps.jobs.getDocumentForJob(job.id);
    if (!document) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
    if (document.status !== "APPROVED" && document.status !== "INDEXED") {
      throw new AppError("DOCUMENT_NOT_ELIGIBLE", "Tài liệu hiện không đủ điều kiện lập chỉ mục.", 409);
    }
    await deps.jobs.checkpoint(lease, "ACQUIRING", null);
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    const blob = await deps.storage.read(document.storagePath, controller.signal);
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    if (!(blob.bytes instanceof Uint8Array) || blob.sizeBytes !== document.sizeBytes || blob.bytes.byteLength !== document.sizeBytes || blob.mimeType !== document.mimeType) {
      throw new AppError("RAG_ORIGINAL_MISMATCH", "Tệp gốc không khớp metadata đã đăng ký.", 409);
    }
    const actualFileType = validateRagFile(document.originalFileName, blob.mimeType, blob.bytes);
    if (actualFileType !== document.fileType) throw new AppError("RAG_ORIGINAL_MISMATCH", "Loại tệp gốc không khớp tài liệu đã đăng ký.", 409);

    await deps.jobs.checkpoint(lease, "EXTRACTING", null);
    const extraction = await (deps.extract ?? extractDocument)({ bytes: blob.bytes, format: document.fileType });
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    const warnings = "document" in extraction ? warningCodes(extraction.document) : [];
    if (extraction.status !== "EXTRACTED") {
      if (warnings.length) await deps.jobs.recordWarnings(lease, warnings);
      throw new AppError(`EXTRACTION_${extraction.status}`, "Không thể trích xuất nội dung đầy đủ từ tài liệu.", 422);
    }
    if (extraction.document.originalBytesHash !== sha256(blob.bytes)) throw new AppError("RAG_ORIGINAL_MISMATCH", "Hash tệp gốc không khớp nội dung trích xuất.", 409);
    if (incompleteCoverageWarningCodes(warnings).length) {
      await deps.jobs.markFailure(lease, "FAILED", "INCOMPLETE_COVERAGE", { warningCodes: warnings });
      return { jobId: job.id, status: "FAILED" };
    }
    await deps.jobs.recordWarnings(lease, warnings);

    await deps.jobs.checkpoint(lease, "CHUNKING", null);
    const chunking = (deps.chunk ?? chunkDocument)(extraction.document);
    if (chunking.status !== "CHUNKED" || chunking.chunks.length === 0) {
      throw new AppError("CHUNKING_FAILED", "Không thể chia nội dung tài liệu thành các đoạn hợp lệ.", 422);
    }
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);

    const versionInput: ContentVersionInput = {
      ragDocumentId: document.id,
      originalBytesHash: extraction.document.originalBytesHash,
      normalizedContentHash: extraction.document.normalizedContentHash,
      extractorVersion: extraction.document.extractorVersion,
      normalizationVersion: extraction.document.normalizationVersion,
    };
    const version = await deps.index.createOrFindContentVersion(versionInput, lease);
    const generationInput = makeGenerationInput(document.id, version.id, chunking.chunks);
    const generation = await deps.index.createOrFindGeneration(generationInput, lease);
    await deps.jobs.setIdentities(lease, version.id, generation.id);

    await deps.jobs.checkpoint(lease, "PERSISTING_CHUNKS", null);
    await deps.index.persistChunks(document.id, generation.id, chunking.chunks, lease);
    const persisted = await deps.jobs.listPersistedEmbeddingIndexes(generation.id);
    const expectedIndexes = new Set(chunking.chunks.map(chunk => chunk.index));
    if (persisted.some(index => !expectedIndexes.has(index))) throw new RagIndexError("GENERATION_CONFLICT");
    const persistedSet = new Set(persisted);
    if (persisted.length) {
      await deps.index.verifyPersistedEmbeddingMetadata(document.id, generation.id,
        generationInput.embeddings.filter(item => persistedSet.has(item.chunkIndex)).map(({ chunkIndex, inputHash, tokenCount }) => ({ chunkIndex, inputHash, tokenCount })), lease);
    }
    const missing = chunking.chunks.filter(chunk => !persistedSet.has(chunk.index));
    if (missing.length) {
      const localToOriginal = new Map<number, number>();
      const providerChunks = missing.map((chunk, localIndex) => {
        localToOriginal.set(localIndex, chunk.index);
        return { ...chunk, index: localIndex };
      });
      await deps.jobs.checkpoint(lease, "EMBEDDING", null);
      await embedChunks(providerChunks, deps.provider, {
        ...deps.embeddingOptions,
        // Do not automatically repeat an ambiguous provider request. An Admin
        // retry is a separate idempotent action and repeats the budget preflight.
        maxProviderAttempts: 1,
        signal: controller.signal,
        onBatchStart: async batch => {
          const indexes = batch.map(chunk => localToOriginal.get(chunk.index)).filter((index): index is number => index !== undefined).sort((a, b) => a - b);
          if (indexes.length !== batch.length) throw new RagIndexError("INVALID_INDEX_INPUT");
          await deps.jobs.checkpoint(lease, "EMBEDDING", indexes);
          pendingProviderBatch = true;
        },
        onBatchComplete: async embeddings => {
          const mapped = embeddings.map(item => {
            const chunkIndex = localToOriginal.get(item.chunkIndex);
            if (chunkIndex === undefined) throw new RagIndexError("INVALID_INDEX_INPUT");
            return { ...item, chunkIndex };
          });
          await deps.index.persistEmbeddings(document.id, generation.id, mapped, lease);
          pendingProviderBatch = false;
        },
      });
    }
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    await deps.jobs.checkpoint(lease, "VERIFYING", null);
    const progress = await deps.index.verifyGeneration(document.id, generation.id, lease);
    if (!progress.complete || progress.state !== "READY") throw new RagIndexError("GENERATION_NOT_COMPLETE");
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    await deps.jobs.checkpoint(lease, "PUBLISHING", null);
    if (controller.signal.aborted) throw new EmbeddingError("CANCELLED", false);
    await deps.index.finalizeReadyGeneration(document.id, generation.id, lease);
    return { jobId: job.id, status: "COMPLETED" };
  } catch (error) {
    const cause = error instanceof EmbeddingCheckpointError ? error.originalError : error;
    const status = await finishFailure(deps.jobs, lease, cause, pendingProviderBatch, heartbeat.reason);
    return { jobId: job.id, status };
  } finally {
    heartbeat.stop();
  }
}

export function createRagIndexWorker(dependencies: RagIndexWorkerDependencies) {
  return {
    async runNext(): Promise<RagIndexWorkerOutcome> {
      const job = await dependencies.jobs.claimNext(dependencies.leaseMs);
      return job ? runClaimed(job, dependencies) : { status: "IDLE" };
    },
  };
}

/** Server-only entry point for a separately deployed durable worker process. */
export async function runNextRagIndexJob(database: Database, options: { signal?: AbortSignal } = {}): Promise<RagIndexWorkerOutcome> {
  const worker = createRagIndexWorker({
    jobs: createRagIndexJobStore(database),
    index: createRagIndexStore(database),
    storage: ragStorage,
    provider: createOpenAiEmbeddingProvider(),
    signal: options.signal,
  });
  return worker.runNext();
}
