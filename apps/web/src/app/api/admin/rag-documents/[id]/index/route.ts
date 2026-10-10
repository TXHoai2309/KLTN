import { apiMutationResult, apiSuccess } from "@/server/http/api-response";
import { handleApiError, handleMutationApiError } from "@/server/http/error-handler";
import { requireIdempotencyKey } from "@/server/http/idempotency";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { db } from "@/services";
import { enqueueRagIndexJob } from "@/modules/rag-index/rag-index-job-service";
import { createRagIndexJobStore } from "@/modules/rag-index/rag-index-job-store";
import { runNextRagIndexJob } from "@/modules/rag-index/rag-index-worker";
import { privateRagResponse, ragJson } from "@/modules/rag-document/rag-http";
import { AppError } from "@/server/http/app-error";

export const runtime = "nodejs";
// This is a bounded, request-scoped MVP, NOT a durable background worker.
// Set only within the deployment plan's supported function limits.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };
const jobs = createRagIndexJobStore(db);

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    // Enforce same-origin JSON and reject unexpected bodies.
    const body = await ragJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0)
      throw new AppError("INVALID_RAG_INPUT", "Yêu cầu lập chỉ mục không hợp lệ.", 400);
    const admitted = await enqueueRagIndexJob(request.headers, id, requireIdempotencyKey(request), {
      ...authorizationDependencies, database: db,
    });
    if (admitted.status !== "SUCCESS") return privateRagResponse(apiMutationResult(admitted));
    // Replay never re-executes external work. Poll the persisted job instead.
    if (!admitted.replayed) {
      const outcome = await runNextRagIndexJob(db, { signal: request.signal, jobId: admitted.data.jobId });
      if (outcome.status === "IDLE") {
        // Another request may have claimed it, or admission committed but the claim failed.
        return privateRagResponse(apiSuccess({ jobId: admitted.data.jobId, status: "QUEUED" }, 202));
      }
    }
    const job = await jobs.getJob(admitted.data.jobId);
    return privateRagResponse(apiSuccess({
      jobId: admitted.data.jobId, status: job?.status ?? "UNKNOWN", phase: job?.phase ?? "QUEUED",
    }));
  } catch (error) { return privateRagResponse(handleMutationApiError(error)); }
}

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await requireActor(request.headers, { ...authorizationDependencies, database: db }, "admin");
    if (!/^[-\w]{1,100}$/.test(id)) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
    const document = await db.ragDocument.findUnique({ where: { id }, select: { id: true } });
    if (!document) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
    const job = await db.ragIndexJob.findFirst({
      where: { ragDocumentId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, phase: true, attemptCount: true, failureCode: true,
        warningCodes: true, generationId: true, createdAt: true, updatedAt: true, completedAt: true },
    });
    if (!job) return privateRagResponse(apiSuccess({ job: null }));
    const [chunks, embeddings] = job.generationId ? await Promise.all([
      db.ragChunk.count({ where: { generationId: job.generationId } }),
      db.ragChunkEmbedding.count({ where: { chunk: { generationId: job.generationId } } }),
    ]) : [0, 0];
    const generation = job.generationId ? await db.ragIndexGeneration.findUnique({
      where: { id: job.generationId }, select: { expectedChunkCount: true },
    }) : null;
    const total = generation?.expectedChunkCount ?? null;
    return privateRagResponse(apiSuccess({ job: {
      id: job.id, status: job.status, phase: job.phase, attemptCount: job.attemptCount,
      failureCode: job.failureCode, warningCodes: job.warningCodes,
      chunks, embeddings, totalChunks: total, updatedAt: job.updatedAt, completedAt: job.completedAt,
    }}));
  } catch (error) { return privateRagResponse(handleApiError(error)); }
}
