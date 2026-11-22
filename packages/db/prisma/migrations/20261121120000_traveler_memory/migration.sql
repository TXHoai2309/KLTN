-- pgvector was enabled by 20261001120226_enable_postgis_pgvector.
CREATE TYPE "TravelerMemoryKind" AS ENUM ('PREFERENCE', 'CONSTRAINT', 'NOTE');

CREATE TABLE "traveler_memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "normalizedHash" CHAR(64) NOT NULL,
    "kind" "TravelerMemoryKind" NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "traveler_memory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "traveler_memory_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "traveler_memory_userId_normalizedHash_key" ON "traveler_memory"("userId", "normalizedHash");
CREATE INDEX "traveler_memory_userId_createdAt_id_idx" ON "traveler_memory"("userId", "createdAt", "id");
