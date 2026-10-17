-- AlterTable
ALTER TABLE "rag_document" ADD COLUMN "publicQaApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "rag_document_status_publicQaApproved_idx" ON "rag_document"("status", "publicQaApproved");

-- Backfill: ensure previously designated primary document is immediately publicQaApproved
UPDATE "rag_document"
SET "publicQaApproved" = true
WHERE "id" = 'cmvapg3l0001j7w9w61egpl01' AND "status" = 'INDEXED';
