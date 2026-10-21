CREATE TABLE "rag_citation_bundle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ragDocumentId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "contentVersionId" TEXT NOT NULL,
  "parserVersion" VARCHAR(100) NOT NULL,
  "metadata" JSONB NOT NULL,
  "metadataHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rag_citation_bundle_generation_fkey" FOREIGN KEY ("ragDocumentId", "generationId") REFERENCES "rag_index_generation"("ragDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rag_citation_bundle_contentVersion_fkey" FOREIGN KEY ("ragDocumentId", "contentVersionId") REFERENCES "rag_content_version"("ragDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "rag_citation_bundle_generationId_parserVersion_key" ON "rag_citation_bundle"("generationId", "parserVersion");
