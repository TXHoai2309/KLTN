-- CreateEnum
CREATE TYPE "ContentRightsStatus" AS ENUM ('UNKNOWN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentVerificationStatus" AS ENUM ('UNKNOWN', 'VERIFIED', 'DISPUTED');

-- AlterTable
ALTER TABLE "culture_content" ADD COLUMN     "category" VARCHAR(200),
ADD COLUMN     "contentRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "geographicScope" VARCHAR(2000),
ADD COLUMN     "shortDescription" VARCHAR(1000);

-- AlterTable
ALTER TABLE "destination" ADD COLUMN     "address" VARCHAR(1000),
ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bestVisitTime" VARCHAR(2000),
ADD COLUMN     "contentRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "googleMapsUrl" VARCHAR(2000),
ADD COLUMN     "locationEvidence" VARCHAR(2000),
ADD COLUMN     "locationVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shortDescription" VARCHAR(1000),
ADD COLUMN     "ticketEvidence" VARCHAR(2000),
ADD COLUMN     "ticketPrice" VARCHAR(300),
ADD COLUMN     "ticketVerification" "ContentVerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "visitNotes" VARCHAR(4000);

-- CreateTable
CREATE TABLE "content_area" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'LOCALITY',

    CONSTRAINT "content_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_community" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "content_community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_source" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT,
    "cultureId" TEXT,
    "title" VARCHAR(300) NOT NULL,
    "url" VARCHAR(2000),
    "author" VARCHAR(200),
    "publisher" VARCHAR(200),
    "publishedOn" VARCHAR(10),
    "claim" VARCHAR(2000),
    "websiteRights" "ContentRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "indexingRights" "ContentRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "openAiRights" "ContentRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rightsEvidence" VARCHAR(2000),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_media" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT,
    "cultureId" TEXT,
    "url" VARCHAR(2000) NOT NULL,
    "storageReference" VARCHAR(500),
    "alt" VARCHAR(300) NOT NULL,
    "caption" VARCHAR(1000),
    "author" VARCHAR(200),
    "sourceUrl" VARCHAR(2000),
    "websiteRights" "ContentRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rightsEvidence" VARCHAR(2000),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_domain_origin" (
    "id" TEXT NOT NULL,
    "ragDocumentId" TEXT NOT NULL,
    "destinationId" TEXT,
    "cultureId" TEXT,
    "revisionHash" CHAR(64) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "rag_domain_origin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AreaToCultureContent" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AreaToCultureContent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AreaToDestination" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AreaToDestination_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CommunityToCultureContent" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CommunityToCultureContent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_area_name_key" ON "content_area"("name");

-- CreateIndex
CREATE UNIQUE INDEX "content_community_name_key" ON "content_community"("name");

-- CreateIndex
CREATE INDEX "content_source_destinationId_position_idx" ON "content_source"("destinationId", "position");

-- CreateIndex
CREATE INDEX "content_source_cultureId_position_idx" ON "content_source"("cultureId", "position");

-- CreateIndex
CREATE INDEX "content_media_destinationId_position_idx" ON "content_media"("destinationId", "position");

-- CreateIndex
CREATE INDEX "content_media_cultureId_position_idx" ON "content_media"("cultureId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rag_domain_origin_ragDocumentId_key" ON "rag_domain_origin"("ragDocumentId");

-- CreateIndex
CREATE INDEX "_AreaToCultureContent_B_index" ON "_AreaToCultureContent"("B");

-- CreateIndex
CREATE INDEX "_AreaToDestination_B_index" ON "_AreaToDestination"("B");

-- CreateIndex
CREATE INDEX "_CommunityToCultureContent_B_index" ON "_CommunityToCultureContent"("B");

-- AddForeignKey
ALTER TABLE "content_source" ADD CONSTRAINT "content_source_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_source" ADD CONSTRAINT "content_source_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_domain_origin" ADD CONSTRAINT "rag_domain_origin_ragDocumentId_fkey" FOREIGN KEY ("ragDocumentId") REFERENCES "rag_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_domain_origin" ADD CONSTRAINT "rag_domain_origin_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_domain_origin" ADD CONSTRAINT "rag_domain_origin_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToCultureContent" ADD CONSTRAINT "_AreaToCultureContent_A_fkey" FOREIGN KEY ("A") REFERENCES "content_area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToCultureContent" ADD CONSTRAINT "_AreaToCultureContent_B_fkey" FOREIGN KEY ("B") REFERENCES "culture_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToDestination" ADD CONSTRAINT "_AreaToDestination_A_fkey" FOREIGN KEY ("A") REFERENCES "content_area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToDestination" ADD CONSTRAINT "_AreaToDestination_B_fkey" FOREIGN KEY ("B") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunityToCultureContent" ADD CONSTRAINT "_CommunityToCultureContent_A_fkey" FOREIGN KEY ("A") REFERENCES "content_community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunityToCultureContent" ADD CONSTRAINT "_CommunityToCultureContent_B_fkey" FOREIGN KEY ("B") REFERENCES "culture_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "content_source" ADD CONSTRAINT "content_source_one_owner" CHECK (num_nonnulls("destinationId", "cultureId") = 1);

ALTER TABLE "content_media" ADD CONSTRAINT "content_media_one_owner" CHECK (num_nonnulls("destinationId", "cultureId") = 1);

ALTER TABLE "rag_domain_origin" ADD CONSTRAINT "rag_domain_origin_one_owner" CHECK (num_nonnulls("destinationId", "cultureId") = 1);

ALTER TABLE "content_source" ADD CONSTRAINT "content_source_approved_evidence" CHECK (("websiteRights" <> 'APPROVED' AND "indexingRights" <> 'APPROVED' AND "openAiRights" <> 'APPROVED') OR (COALESCE(length(trim("rightsEvidence")), 0) > 0 AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL));
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_approved_evidence" CHECK ("websiteRights" <> 'APPROVED' OR (COALESCE(length(trim("rightsEvidence")), 0) > 0 AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL));
CREATE UNIQUE INDEX "content_media_destination_cover" ON "content_media" ("destinationId") WHERE "isCover";
CREATE UNIQUE INDEX "content_media_culture_cover" ON "content_media" ("cultureId") WHERE "isCover";
