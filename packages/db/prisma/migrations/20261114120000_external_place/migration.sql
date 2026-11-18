-- CreateEnum
CREATE TYPE "ExternalPlaceProvider" AS ENUM ('GOOGLE_PLACES');

-- AlterTable
ALTER TABLE "itinerary_visit" ADD COLUMN     "externalPlaceId" TEXT,
ALTER COLUMN "destinationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "external_place" (
    "id" TEXT NOT NULL,
    "provider" "ExternalPlaceProvider" NOT NULL,
    "providerPlaceId" TEXT NOT NULL,
    "name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_place_fetchedAt_idx" ON "external_place"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_place_provider_providerPlaceId_key" ON "external_place"("provider", "providerPlaceId");

-- CreateIndex
CREATE INDEX "itinerary_visit_externalPlaceId_idx" ON "itinerary_visit"("externalPlaceId");

-- AddForeignKey
ALTER TABLE "itinerary_visit" ADD CONSTRAINT "itinerary_visit_externalPlaceId_fkey" FOREIGN KEY ("externalPlaceId") REFERENCES "external_place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Each visit references exactly one place: a KLTN destination or an external place.
-- Existing rows all have destinationId, so the constraint holds for legacy data.
ALTER TABLE "itinerary_visit" ADD CONSTRAINT "itinerary_visit_exactly_one_place"
  CHECK (num_nonnulls("destinationId", "externalPlaceId") = 1);
