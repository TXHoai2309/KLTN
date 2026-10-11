CREATE TYPE "RagIndexGenerationState" AS ENUM ('BUILDING', 'READY');

CREATE TABLE "rag_content_version" (
    "id" TEXT NOT NULL,
    "ragDocumentId" TEXT NOT NULL,
    "originalBytesHash" CHAR(64) NOT NULL,
    "normalizedContentHash" CHAR(64) NOT NULL,
    "extractorVersion" VARCHAR(200) NOT NULL,
    "normalizationVersion" VARCHAR(200) NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rag_content_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rag_content_version_ragDocumentId_fkey" FOREIGN KEY ("ragDocumentId") REFERENCES "rag_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "rag_content_version_ragDocumentId_identityHash_key" ON "rag_content_version"("ragDocumentId", "identityHash");
CREATE UNIQUE INDEX "rag_content_version_ragDocumentId_id_key" ON "rag_content_version"("ragDocumentId", "id");

CREATE TABLE "rag_index_generation" (
    "id" TEXT NOT NULL,
    "ragDocumentId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "generationKey" CHAR(64) NOT NULL,
    "chunkerVersion" VARCHAR(200) NOT NULL,
    "chunkOptions" JSONB NOT NULL,
    "embeddingProvider" VARCHAR(80) NOT NULL,
    "embeddingModel" VARCHAR(120) NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,
    "tokenizer" VARCHAR(100) NOT NULL,
    "tokenizerVersion" VARCHAR(100) NOT NULL,
    "expectedChunkCount" INTEGER NOT NULL,
    "expectedTokenCount" INTEGER NOT NULL,
    "state" "RagIndexGenerationState" NOT NULL DEFAULT 'BUILDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    CONSTRAINT "rag_index_generation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rag_index_generation_ragDocumentId_fkey" FOREIGN KEY ("ragDocumentId") REFERENCES "rag_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rag_index_generation_ragDocumentId_contentVersionId_fkey" FOREIGN KEY ("ragDocumentId", "contentVersionId") REFERENCES "rag_content_version"("ragDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rag_index_generation_dimensions_check" CHECK ("embeddingDimensions" = 1536),
    CONSTRAINT "rag_index_generation_chunk_count_check" CHECK ("expectedChunkCount" > 0),
    CONSTRAINT "rag_index_generation_token_count_check" CHECK ("expectedTokenCount" > 0),
    CONSTRAINT "rag_index_generation_ready_at_check" CHECK (("state" = 'BUILDING' AND "readyAt" IS NULL) OR ("state" = 'READY' AND "readyAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "rag_index_generation_ragDocumentId_generationKey_key" ON "rag_index_generation"("ragDocumentId", "generationKey");
CREATE UNIQUE INDEX "rag_index_generation_ragDocumentId_id_key" ON "rag_index_generation"("ragDocumentId", "id");
CREATE INDEX "rag_index_generation_state_createdAt_idx" ON "rag_index_generation"("state", "createdAt");

CREATE TABLE "rag_chunk" (
    "id" TEXT NOT NULL,
    "ragDocumentId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "refs" JSONB NOT NULL,
    "locators" JSONB NOT NULL,
    "textHash" CHAR(64) NOT NULL,
    "chunkHash" CHAR(64) NOT NULL,
    "chunkerVersion" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rag_chunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rag_chunk_ragDocumentId_generationId_fkey" FOREIGN KEY ("ragDocumentId", "generationId") REFERENCES "rag_index_generation"("ragDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rag_chunk_index_check" CHECK ("index" >= 0)
);
CREATE UNIQUE INDEX "rag_chunk_generationId_index_key" ON "rag_chunk"("generationId", "index");
CREATE UNIQUE INDEX "rag_chunk_generationId_chunkHash_key" ON "rag_chunk"("generationId", "chunkHash");

CREATE TABLE "rag_chunk_embedding" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "vectorHash" CHAR(64) NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rag_chunk_embedding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rag_chunk_embedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "rag_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rag_chunk_embedding_token_count_check" CHECK ("tokenCount" > 0)
);
CREATE UNIQUE INDEX "rag_chunk_embedding_chunkId_key" ON "rag_chunk_embedding"("chunkId");

CREATE TABLE "rag_index_publication" (
    "id" TEXT NOT NULL,
    "ragDocumentId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rag_index_publication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rag_index_publication_ragDocumentId_generationId_fkey" FOREIGN KEY ("ragDocumentId", "generationId") REFERENCES "rag_index_generation"("ragDocumentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "rag_index_publication_ragDocumentId_key" ON "rag_index_publication"("ragDocumentId");
CREATE UNIQUE INDEX "rag_index_publication_generationId_key" ON "rag_index_publication"("generationId");
CREATE UNIQUE INDEX "rag_index_publication_ragDocumentId_generationId_key" ON "rag_index_publication"("ragDocumentId", "generationId");
