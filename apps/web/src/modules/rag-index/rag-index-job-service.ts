import "server-only";

import { createHash } from "node:crypto";
import type { Database } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { createRagIndexJobStore } from "./rag-index-job-store";

export type RagIndexJobServiceDependencies = AuthorizationDependencies & { database: Database };
const jobIdPattern = /^[-\w]{1,100}$/u;

function validateJobId(jobId: string) {
  if (!jobIdPattern.test(jobId)) throw new AppError("RAG_INDEX_JOB_NOT_FOUND", "Không tìm thấy tác vụ lập chỉ mục.", 404);
}

function jobRequestHash(documentId: string): string {
  return createHash("sha256").update(JSON.stringify({ documentId })).digest("hex");
}

/** Admin-only durable admission. This does not execute the job in the web request. */
export async function enqueueRagIndexJob(headers: Headers, documentId: string, idempotencyKey: string, deps: RagIndexJobServiceDependencies) {
  if (!jobIdPattern.test(documentId)) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
  const actor = await requireActor(headers, deps, "admin");
  const operation = `rag-document:${documentId}:index`;
  const input = { documentId };
  const jobs = createRagIndexJobStore(deps.database);
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation, key: idempotencyKey, input,
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const document = await jobs.lockDocumentForAdmission(tx, documentId);
      if (!document) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
      if (document.status !== "APPROVED" && document.status !== "INDEXED") {
        throw new AppError("RAG_DOCUMENT_NOT_ELIGIBLE", "Chỉ tài liệu đã duyệt mới được lập chỉ mục.", 409);
      }
      const active = await jobs.findBlockingJob(tx, documentId);
      if (active) {
        throw new AppError(active.status === "UNKNOWN" ? "RAG_INDEX_OUTCOME_UNKNOWN" : "RAG_INDEX_JOB_ACTIVE",
          active.status === "UNKNOWN" ? "Kết quả tác vụ trước chưa xác định và cần được xem xét." : "Tài liệu đang có tác vụ lập chỉ mục.", 409);
      }
      const idempotencyScope = JSON.stringify([actor.id, operation]);
      const job = await tx.ragIndexJob.create({
        data: {
          ragDocumentId: documentId, requestedById: actor.id, idempotencyScope,
          idempotencyKey, requestHash: jobRequestHash(documentId), status: "QUEUED", phase: "QUEUED",
        },
        select: { id: true, status: true, phase: true },
      });
      return { jobId: job.id, status: job.status, phase: job.phase };
    },
  });
}

export async function cancelRagIndexJob(headers: Headers, jobId: string, idempotencyKey: string, deps: RagIndexJobServiceDependencies) {
  validateJobId(jobId);
  const actor = await requireActor(headers, deps, "admin");
  const jobs = createRagIndexJobStore(deps.database);
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: `rag-index-job:${jobId}:cancel`, key: idempotencyKey, input: { jobId },
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const result = await jobs.requestCancellation(tx, jobId);
      if (!result) throw new AppError("RAG_INDEX_JOB_NOT_FOUND", "Không tìm thấy tác vụ lập chỉ mục.", 404);
      if (result.status !== "CANCELLED" && result.status !== "RUNNING") throw new AppError("RAG_INDEX_JOB_NOT_CANCELLABLE", "Tác vụ đã kết thúc và không thể hủy.", 409);
      return { jobId, status: result.status, cancellationRequested: result.status === "RUNNING" };
    },
  });
}

/** Retries are explicit Admin writes; UNKNOWN is never retried by worker recovery. */
export async function retryRagIndexJob(headers: Headers, jobId: string, idempotencyKey: string, deps: RagIndexJobServiceDependencies) {
  validateJobId(jobId);
  const actor = await requireActor(headers, deps, "admin");
  const jobs = createRagIndexJobStore(deps.database);
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: `rag-index-job:${jobId}:retry`, key: idempotencyKey, input: { jobId },
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const identity = await tx.ragIndexJob.findUnique({ where: { id: jobId }, select: { ragDocumentId: true } });
      if (!identity) throw new AppError("RAG_INDEX_JOB_NOT_FOUND", "Không tìm thấy tác vụ lập chỉ mục.", 404);
      const document = await jobs.lockDocumentForAdmission(tx, identity.ragDocumentId);
      if (!document) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
      if (document.status !== "APPROVED" && document.status !== "INDEXED") throw new AppError("RAG_DOCUMENT_NOT_ELIGIBLE", "Tài liệu hiện không đủ điều kiện lập chỉ mục.", 409);
      const otherActive = await tx.ragIndexJob.findFirst({
        where: { ragDocumentId: identity.ragDocumentId, id: { not: jobId }, status: { in: ["QUEUED", "RUNNING", "UNKNOWN"] } },
        select: { id: true },
      });
      if (otherActive) throw new AppError("RAG_INDEX_JOB_ACTIVE", "Tài liệu đang có tác vụ lập chỉ mục.", 409);
      const result = await jobs.retryExplicitly(tx, jobId);
      if (!result) throw new AppError("RAG_INDEX_JOB_NOT_FOUND", "Không tìm thấy tác vụ lập chỉ mục.", 404);
      if (result.status !== "QUEUED") throw new AppError("RAG_INDEX_JOB_NOT_RETRYABLE", "Tác vụ không ở trạng thái có thể thử lại an toàn.", 409);
      return { jobId, status: result.status };
    },
  });
}
