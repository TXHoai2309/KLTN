import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { RagIndexError } from "./rag-index-errors";
import type { ExtractionWarning } from "../rag-processing/extraction-contract";

export type RagIndexJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "REJECTED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN";
export type RagIndexJobPhase = "QUEUED" | "ACQUIRING" | "EXTRACTING" | "CHUNKING" | "PERSISTING_CHUNKS" | "EMBEDDING" | "PERSISTING_EMBEDDINGS" | "VERIFYING" | "PUBLISHING" | "COMPLETED";
export type RagIndexJobLease = { jobId: string; leaseToken: string };
export type RagIndexJobRecord = {
  id: string;
  ragDocumentId: string;
  requestedById: string;
  status: RagIndexJobStatus;
  phase: RagIndexJobPhase;
  leaseToken: string;
  attemptCount: number;
  cancelRequestedAt: Date | null;
  contentVersionId: string | null;
  generationId: string | null;
  pendingBatchIndexes: unknown;
};

type Transaction = Prisma.TransactionClient;
export const RAG_INDEX_JOB_LEASE_MS = 120_000;

function isJsonIndexList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(index => Number.isInteger(index) && index >= 0);
}

/** Lock order is document then job, matching all result-persistence paths. */
export async function lockAndAssertRagIndexJobLease(
  tx: Transaction,
  lease: RagIndexJobLease,
  options: { allowCancelRequested?: boolean; allowIneligibleDocument?: boolean } = {},
) {
  const identities = await tx.$queryRaw<Array<{ ragDocumentId: string }>>(Prisma.sql`
    SELECT "ragDocumentId" FROM "rag_index_job" WHERE "id" = ${lease.jobId}
  `);
  if (!identities[0]) throw new RagIndexError("JOB_LEASE_LOST");
  const documents = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status"::text AS "status" FROM "rag_document" WHERE "id" = ${identities[0].ragDocumentId} FOR UPDATE
  `);
  if (!documents[0]) throw new RagIndexError("RAG_DOCUMENT_NOT_FOUND");
  if (!options.allowIneligibleDocument && documents[0].status !== "APPROVED" && documents[0].status !== "INDEXED") {
    throw new RagIndexError("DOCUMENT_NOT_ELIGIBLE");
  }

  const jobs = await tx.$queryRaw<Array<{
    id: string;
    ragDocumentId: string;
    status: string;
    leaseToken: string | null;
    leaseValid: boolean;
    cancelRequestedAt: Date | null;
    pendingBatchIndexes: unknown;
  }>>(Prisma.sql`
    SELECT "id", "ragDocumentId", "status"::text AS "status", "leaseToken", "leaseExpiresAt" > now() AS "leaseValid",
      "cancelRequestedAt", "pendingBatchIndexes"
    FROM "rag_index_job" WHERE "id" = ${lease.jobId} FOR UPDATE
  `);
  const job = jobs[0];
  if (!job || job.status !== "RUNNING" || job.leaseToken !== lease.leaseToken || !job.leaseValid) {
    throw new RagIndexError("JOB_LEASE_LOST");
  }
  if (!options.allowCancelRequested && job.cancelRequestedAt) throw new RagIndexError("JOB_CANCELLED");
  return { documentStatus: documents[0].status, ragDocumentId: identities[0].ragDocumentId, job };
}

export function createRagIndexJobStore(database: Database) {
  return {
    async lockDocumentForAdmission(tx: Transaction, ragDocumentId: string) {
      const rows = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"::text AS "status" FROM "rag_document" WHERE "id" = ${ragDocumentId} FOR UPDATE
      `);
      return rows[0] ?? null;
    },

    async findBlockingJob(tx: Transaction, ragDocumentId: string) {
      return tx.ragIndexJob.findFirst({
        where: { ragDocumentId, status: { in: ["QUEUED", "RUNNING", "UNKNOWN"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true },
      });
    },

    async claimNext(leaseMs = RAG_INDEX_JOB_LEASE_MS, requestedJobId?: string): Promise<RagIndexJobRecord | null> {
      if (!Number.isInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 10 * 60_000) throw new RagIndexError("INVALID_INDEX_INPUT");
      const leaseToken = randomUUID();
      // A synchronous Admin request must claim only the job it admitted.
      // With no requestedJobId, retain the existing queue-worker behavior.
      const targetJobId = requestedJobId ?? null;
      return database.$transaction(async tx => {
        // A crash while an embedding request was in flight can leave a billable
        // provider result unpersisted. Keep that job UNKNOWN for manual review.
        await tx.$executeRaw(Prisma.sql`
          UPDATE "rag_index_job"
          SET "status" = 'UNKNOWN', "failureCode" = 'EMBEDDING_OUTCOME_UNKNOWN',
            "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = now()
          WHERE "status" = 'RUNNING' AND "leaseExpiresAt" <= now() AND "pendingBatchIndexes" IS NOT NULL
            AND (${targetJobId}::text IS NULL OR "id" = ${targetJobId})
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "rag_index_job"
          SET "status" = CASE WHEN "cancelRequestedAt" IS NULL THEN 'QUEUED'::"RagIndexJobStatus" ELSE 'CANCELLED'::"RagIndexJobStatus" END,
            "leaseToken" = NULL, "leaseExpiresAt" = NULL,
            "phase" = CASE WHEN "cancelRequestedAt" IS NULL THEN "phase" ELSE 'QUEUED'::"RagIndexJobPhase" END,
            "completedAt" = CASE WHEN "cancelRequestedAt" IS NULL THEN NULL ELSE now() END,
            "failureCode" = CASE WHEN "cancelRequestedAt" IS NULL THEN NULL ELSE 'CANCEL_REQUESTED' END,
            "updatedAt" = now()
          WHERE "status" = 'RUNNING' AND "leaseExpiresAt" <= now() AND "pendingBatchIndexes" IS NULL
            AND (${targetJobId}::text IS NULL OR "id" = ${targetJobId})
        `);
        const rows = await tx.$queryRaw<Array<{
          id: string; ragDocumentId: string; requestedById: string; status: string; phase: string;
          leaseToken: string; attemptCount: number; cancelRequestedAt: Date | null;
          contentVersionId: string | null; generationId: string | null; pendingBatchIndexes: unknown;
        }>>(Prisma.sql`
          WITH candidate AS (
            SELECT "id" FROM "rag_index_job"
            WHERE "status" = 'QUEUED'
              AND (${targetJobId}::text IS NULL OR "id" = ${targetJobId})
            ORDER BY "createdAt" ASC, "id" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE "rag_index_job" AS job
          SET "status" = 'RUNNING',
            "phase" = CASE WHEN job."phase" = 'QUEUED' THEN 'ACQUIRING'::"RagIndexJobPhase" ELSE job."phase" END,
            "leaseToken" = ${leaseToken},
            "leaseExpiresAt" = now() + (${leaseMs} * interval '1 millisecond'),
            "attemptCount" = job."attemptCount" + 1,
            "startedAt" = COALESCE(job."startedAt", now()),
            "updatedAt" = now()
          FROM candidate WHERE job."id" = candidate."id"
          RETURNING job."id", job."ragDocumentId", job."requestedById", job."status"::text AS "status",
            job."phase"::text AS "phase", job."leaseToken", job."attemptCount", job."cancelRequestedAt",
            job."contentVersionId", job."generationId", job."pendingBatchIndexes"
        `);
        const row = rows[0];
        return row ? { ...row, status: row.status as RagIndexJobStatus, phase: row.phase as RagIndexJobPhase } : null;
      });
    },

    async renew(lease: RagIndexJobLease, leaseMs = RAG_INDEX_JOB_LEASE_MS): Promise<"RENEWED" | "CANCELLED" | "LOST" | "INELIGIBLE"> {
      if (!Number.isInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 10 * 60_000) throw new RagIndexError("INVALID_INDEX_INPUT");
      return database.$transaction(async tx => {
        let locked: Awaited<ReturnType<typeof lockAndAssertRagIndexJobLease>>;
        try { locked = await lockAndAssertRagIndexJobLease(tx, lease, { allowCancelRequested: true, allowIneligibleDocument: true }); }
        catch (error) { if (error instanceof RagIndexError && error.code === "JOB_LEASE_LOST") return "LOST"; throw error; }
        if (locked.documentStatus !== "APPROVED" && locked.documentStatus !== "INDEXED") return "INELIGIBLE";
        if (locked.job.cancelRequestedAt) return "CANCELLED";
        await tx.$executeRaw(Prisma.sql`
          UPDATE "rag_index_job" SET "leaseExpiresAt" = now() + (${leaseMs} * interval '1 millisecond'), "updatedAt" = now()
          WHERE "id" = ${lease.jobId} AND "status" = 'RUNNING' AND "leaseToken" = ${lease.leaseToken}
        `);
        return "RENEWED";
      });
    },

    async getDocumentForJob(jobId: string) {
      return database.ragIndexJob.findUnique({
        where: { id: jobId },
        select: { ragDocument: { select: {
          id: true, status: true, originalFileName: true, fileType: true, mimeType: true,
          sizeBytes: true, storagePath: true,
        } } },
      }).then(row => row?.ragDocument ?? null);
    },

    async checkpoint(lease: RagIndexJobLease, phase: RagIndexJobPhase, pendingBatchIndexes?: number[] | null) {
      return database.$transaction(async tx => {
        const { job } = await lockAndAssertRagIndexJobLease(tx, lease);
        if (pendingBatchIndexes !== undefined && pendingBatchIndexes !== null && !isJsonIndexList(pendingBatchIndexes)) throw new RagIndexError("INVALID_INDEX_INPUT");
        const data = {
          phase,
          ...(pendingBatchIndexes !== undefined ? { pendingBatchIndexes: pendingBatchIndexes === null ? Prisma.DbNull : pendingBatchIndexes as Prisma.InputJsonValue } : {}),
        };
        return tx.ragIndexJob.update({ where: { id: job.id }, data, select: { id: true, phase: true } });
      });
    },

    async recordWarnings(lease: RagIndexJobLease, warningCodes: readonly ExtractionWarning["code"][]) {
      const allowed = new Set(["PAGE_WITHOUT_TEXT", "PDF_READING_ORDER_HEURISTIC", "UNSUPPORTED_DOCX_REGION"]);
      if (!Array.isArray(warningCodes) || warningCodes.some(code => !allowed.has(code))) throw new RagIndexError("INVALID_INDEX_INPUT");
      return database.$transaction(async tx => {
        const { job } = await lockAndAssertRagIndexJobLease(tx, lease);
        const codes = [...new Set(warningCodes)].sort();
        return tx.ragIndexJob.update({
          where: { id: job.id },
          data: { warningCodes: codes.length ? codes as Prisma.InputJsonValue : Prisma.DbNull },
          select: { id: true },
        });
      });
    },

    async setIdentities(lease: RagIndexJobLease, contentVersionId: string, generationId: string) {
      return database.$transaction(async tx => {
        const { job } = await lockAndAssertRagIndexJobLease(tx, lease);
        return tx.ragIndexJob.update({
          where: { id: job.id }, data: { contentVersionId, generationId }, select: { id: true },
        });
      });
    },

    async listPersistedEmbeddingIndexes(generationId: string): Promise<number[]> {
      const rows = await database.ragChunkEmbedding.findMany({
        where: { chunk: { generationId } }, select: { chunk: { select: { index: true } } },
      });
      return rows.map(row => row.chunk.index).sort((a, b) => a - b);
    },

    async markFailure(lease: RagIndexJobLease, status: "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN", failureCode: string, options: { preservePendingBatch?: boolean; warningCodes?: string[] } = {}) {
      return database.$transaction(async tx => {
        const { job } = await lockAndAssertRagIndexJobLease(tx, lease, { allowCancelRequested: true, allowIneligibleDocument: true });
        const safeCode = /^[A-Z0-9_]{1,80}$/u.test(failureCode) ? failureCode : "INDEXING_FAILED";
        return tx.ragIndexJob.update({
          where: { id: job.id },
          data: {
            status,
            leaseToken: null,
            leaseExpiresAt: null,
            failureCode: safeCode,
            completedAt: new Date(),
            ...(options.preservePendingBatch ? {} : { pendingBatchIndexes: Prisma.DbNull }),
            ...(options.warningCodes ? { warningCodes: options.warningCodes as Prisma.InputJsonValue } : {}),
          },
          select: { id: true, status: true, failureCode: true },
        });
      });
    },

    async getJob(jobId: string) {
      return database.ragIndexJob.findUnique({ where: { id: jobId } });
    },

    async requestCancellation(tx: Transaction, jobId: string) {
      const rows = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"::text AS "status" FROM "rag_index_job" WHERE "id" = ${jobId} FOR UPDATE
      `);
      const status = rows[0]?.status;
      if (!status) return null;
      if (status === "QUEUED") {
        return tx.ragIndexJob.update({ where: { id: jobId }, data: { status: "CANCELLED", completedAt: new Date(), failureCode: "CANCEL_REQUESTED" }, select: { id: true, status: true } });
      }
      if (status === "RUNNING") {
        return tx.ragIndexJob.update({ where: { id: jobId }, data: { cancelRequestedAt: new Date() }, select: { id: true, status: true } });
      }
      return { id: jobId, status };
    },

    async retryExplicitly(tx: Transaction, jobId: string) {
      const rows = await tx.$queryRaw<Array<{ status: string; pendingBatchIndexes: unknown }>>(Prisma.sql`
        SELECT "status"::text AS "status", "pendingBatchIndexes" FROM "rag_index_job" WHERE "id" = ${jobId} FOR UPDATE
      `);
      const row = rows[0];
      if (!row) return null;
      if (row.status !== "FAILED" && row.status !== "CANCELLED" && row.status !== "TIMED_OUT" && row.status !== "UNKNOWN") return { status: row.status };
      return tx.ragIndexJob.update({
        where: { id: jobId },
        // A new Idempotency-Key is required at the service boundary. For UNKNOWN,
        // this is an explicit cost-bearing retry; preserve failureCode as audit.
        data: { status: "QUEUED", phase: "QUEUED", pendingBatchIndexes: Prisma.DbNull, completedAt: null, cancelRequestedAt: null },
        select: { id: true, status: true },
      });
    },
  };
}
