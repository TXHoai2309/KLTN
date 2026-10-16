-- AlterEnum
ALTER TYPE "FavoriteTargetType" ADD VALUE 'TRIP';

-- AlterTable
ALTER TABLE "favorite" ADD COLUMN     "tripId" TEXT;

-- Preserve the existing targets and require exactly the FK matching the type.
-- Compare as text so the new enum value is safe even within one SQL transaction.
ALTER TABLE "favorite"
DROP CONSTRAINT "favorite_exactly_one_target_check",
ADD CONSTRAINT "favorite_exactly_one_target_check" CHECK (
    ("targetType"::text = 'DESTINATION' AND "destinationId" IS NOT NULL AND "cultureContentId" IS NULL AND "tripId" IS NULL)
    OR
    ("targetType"::text = 'CULTURE_CONTENT' AND "cultureContentId" IS NOT NULL AND "destinationId" IS NULL AND "tripId" IS NULL)
    OR
    ("targetType"::text = 'TRIP' AND "tripId" IS NOT NULL AND "destinationId" IS NULL AND "cultureContentId" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "favorite_userId_tripId_key" ON "favorite"("userId", "tripId");

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
