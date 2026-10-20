ALTER TABLE "rag_document" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "rag_document_deletedAt_idx" ON "rag_document"("deletedAt");
