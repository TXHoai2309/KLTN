-- Additive only: separate editorial draft/published snapshots. No existing data change.
CREATE TABLE "destination_editorial" (
  "destinationId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "draftRevision" INTEGER NOT NULL DEFAULT 0,
  "publishedRevision" INTEGER NOT NULL DEFAULT 0,
  "draft" JSONB,
  "published" JSONB,
  "previousPublished" JSONB,
  "contentFingerprint" VARCHAR(64),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "publishedAt" TIMESTAMPTZ(3),
  "updatedBy" TEXT NOT NULL,
  "publishedBy" TEXT,
  CONSTRAINT "destination_editorial_pkey" PRIMARY KEY ("destinationId"),
  CONSTRAINT "destination_editorial_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "destination_editorial_revisions_check" CHECK ("draftRevision" >= 0 AND "publishedRevision" >= 0 AND "schemaVersion" = 1)
);
