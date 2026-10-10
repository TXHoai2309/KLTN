CREATE TYPE "RagIndexJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
  'UNKNOWN'
);

CREATE TYPE "RagIndexJobPhase" AS ENUM (
  'QUEUED',
  'ACQUIRING',
  'EXTRACTING',
  'CHUNKING',
  'PERSISTING_CHUNKS',
  'EMBEDDING',
  'PERSISTING_EMBEDDINGS',
  'VERIFYING',
  'PUBLISHING',
  'COMPLETED'
);

CREATE TABLE "rag_index_job" (
  "id" TEXT NOT NULL,
  "ragDocumentId" TEXT NOT NULL,
  "requestedById" VARCHAR(128) NOT NULL,
  "idempotencyScope" VARCHAR(300) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" "RagIndexJobStatus" NOT NULL DEFAULT 'QUEUED',
  "phase" "RagIndexJobPhase" NOT NULL DEFAULT 'QUEUED',
  "leaseToken" VARCHAR(36),
  "leaseExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "cancelRequestedAt" TIMESTAMP(3),
  "contentVersionId" VARCHAR(30),
  "generationId" VARCHAR(30),
  "pendingBatchIndexes" JSONB,
  "warningCodes" JSONB,
  "failureCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "rag_index_job_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rag_index_job_ragDocumentId_fkey"
    FOREIGN KEY ("ragDocumentId") REFERENCES "rag_document"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rag_index_job_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "rag_index_job_lease_check" CHECK (
    ("status" = 'RUNNING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR ("status" <> 'RUNNING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "rag_index_job_warningCodes_check" CHECK (
    "warningCodes" IS NULL OR jsonb_typeof("warningCodes") = 'array'
  ),
  CONSTRAINT "rag_index_job_pendingBatchIndexes_check" CHECK (
    "pendingBatchIndexes" IS NULL OR jsonb_typeof("pendingBatchIndexes") = 'array'
  )
);

CREATE UNIQUE INDEX "rag_index_job_idempotencyScope_idempotencyKey_key"
  ON "rag_index_job"("idempotencyScope", "idempotencyKey");
CREATE UNIQUE INDEX "rag_index_job_leaseToken_key"
  ON "rag_index_job"("leaseToken");
CREATE INDEX "rag_index_job_status_createdAt_idx"
  ON "rag_index_job"("status", "createdAt");
CREATE INDEX "rag_index_job_status_leaseExpiresAt_idx"
  ON "rag_index_job"("status", "leaseExpiresAt");
CREATE INDEX "rag_index_job_ragDocumentId_status_createdAt_idx"
  ON "rag_index_job"("ragDocumentId", "status", "createdAt");
