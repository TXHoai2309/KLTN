import "server-only";
import type { Database } from "@KLTN/db";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { enqueueRagIndexJob, type RagIndexJobServiceDependencies } from "./rag-index-job-service";
import { createRagIndexJobStore } from "./rag-index-job-store";
import { runNextRagIndexJob } from "./rag-index-worker";

export type IndexAction = { action: "INDEX" } | { action: "RESUME" | "RETRY"; jobId: string };
const idPattern = /^[-\w]{1,100}$/u;
export const INDEX_REQUEST_BUDGET_MS = 240_000;
export function parseIndexAction(body: unknown): IndexAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("INVALID_RAG_INPUT", "Yêu cầu không hợp lệ.", 400);
  const v = body as Record<string, unknown>;
  if (!Object.keys(v).length || Object.keys(v).length === 1 && v.action === "INDEX") return { action: "INDEX" };
  if (Object.keys(v).length === 2 && ["RESUME", "RETRY"].includes(String(v.action)) && typeof v.jobId === "string" && idPattern.test(v.jobId)) return v as IndexAction;
  throw new AppError("INVALID_RAG_INPUT", "Yêu cầu lập chỉ mục không hợp lệ.", 400);
}
function validateDocumentId(id: string) {
  if (!idPattern.test(id)) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
}
export async function readIndexProgress(headers: Headers, id: string, deps: RagIndexJobServiceDependencies) {
  await requireActor(headers, deps, "admin"); validateDocumentId(id);
  return deps.database.$transaction(async tx => {
    if (!await tx.ragDocument.findUnique({ where: { id }, select: { id: true } })) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
    const job = await tx.ragIndexJob.findFirst({ where: { ragDocumentId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!job) return { job: null };
    const total = job.generationId ? await tx.ragIndexGeneration.findUnique({ where: { id: job.generationId }, select: { expectedChunkCount: true } }) : null;
    const chunksPersisted = job.generationId ? await tx.ragChunk.count({ where: { generationId: job.generationId } }) : 0;
    const embeddingsPersisted = job.generationId ? await tx.ragChunkEmbedding.count({ where: { chunk: { generationId: job.generationId } } }) : 0;
    return { job: { jobId: job.id, status: job.status, phase: job.phase, attemptCount: job.attemptCount,
      chunksPersisted, embeddingsPersisted, totalChunks: total?.expectedChunkCount ?? null,
      failureCode: job.failureCode, warningCodes: job.warningCodes, updatedAt: job.updatedAt, completedAt: job.completedAt,
      recoveryRequired: job.status === "QUEUED" || job.status === "RUNNING" && !!job.leaseExpiresAt && job.leaseExpiresAt <= new Date() } };
  }, { isolationLevel: "RepeatableRead" });
}
export async function processIndexRequest(headers: Headers, id: string, key: string, input: IndexAction,
  deps: RagIndexJobServiceDependencies, options: { signal?: AbortSignal; budgetMs?: number; run?: typeof runNextRagIndexJob } = {}) {
  validateDocumentId(id);
  const jobs = createRagIndexJobStore(deps.database);
  const admitted = input.action === "INDEX" ? await enqueueRagIndexJob(headers, id, key, deps) : await (async () => {
    const actor = await requireActor(headers, deps, "admin");
    return executeIdempotentWrite({ database: deps.database, actorId: actor.id,
      operation: `rag-document:${id}:index`, key, input: { documentId: id, ...input },
      execute: async tx => {
        await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
        const document = await jobs.lockDocumentForAdmission(tx, id);
        if (!document || !["APPROVED", "INDEXED"].includes(document.status)) throw new AppError("RAG_DOCUMENT_NOT_ELIGIBLE", "Tài liệu hiện không đủ điều kiện lập chỉ mục.", 409);
        const job = await tx.ragIndexJob.findUnique({ where: { id: input.jobId } });
        if (!job || job.ragDocumentId !== id) throw new AppError("RAG_INDEX_JOB_NOT_FOUND", "Không tìm thấy tác vụ của tài liệu này.", 404);
        const active = await jobs.findBlockingJob(tx, id);
        if (active && active.id !== job.id) throw new AppError("RAG_INDEX_JOB_ACTIVE", "Tài liệu đang có tác vụ khác.", 409);
        if (input.action === "RETRY") {
          if (!["FAILED", "TIMED_OUT", "CANCELLED"].includes(job.status)) throw new AppError("RAG_INDEX_JOB_NOT_RETRYABLE", "Kết quả chưa xác định cần được đối soát; không tự gọi lại nhà cung cấp.", 409);
          await jobs.retryExplicitly(tx, job.id);
        } else if (job.status !== "QUEUED" && !(job.status === "RUNNING" && job.leaseExpiresAt && job.leaseExpiresAt <= new Date())) {
          throw new AppError("RAG_INDEX_JOB_NOT_RESUMABLE", "Tác vụ chưa thể tiếp tục; hãy kiểm tra trạng thái.", 409);
        }
        return { jobId: job.id, status: "QUEUED" as const, phase: job.phase };
      } });
  })();
  if (admitted.status !== "SUCCESS" || admitted.replayed) return admitted;
  const controller = new AbortController(); const abort = () => controller.abort();
  if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.budgetMs ?? INDEX_REQUEST_BUDGET_MS);
  try {
    if (!controller.signal.aborted) await (options.run ?? runNextRagIndexJob)(deps.database, { jobId: admitted.data.jobId, signal: controller.signal });
    return admitted; // Admission SUCCESS is distinct from completion; GET is authoritative.
  } catch {
    return { status: "UNKNOWN" as const, retryWithSameKey: true as const,
      error: { code: "INDEX_EXECUTION_UNKNOWN", message: "Chưa xác định kết quả xử lý. Kiểm tra tiến độ trước khi tiếp tục." } };
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
