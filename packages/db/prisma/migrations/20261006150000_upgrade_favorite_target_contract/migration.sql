-- CreateEnum
CREATE TYPE "FavoriteTargetType" AS ENUM ('DESTINATION', 'CULTURE_CONTENT');

-- Preserve existing Favorite rows while moving the culture FK to the
-- contract name and adding an explicit target discriminator.
ALTER TABLE "favorite" DROP CONSTRAINT "favorite_cultureId_fkey";
ALTER TABLE "favorite" DROP CONSTRAINT "favorite_exactly_one_target_check";
DROP INDEX "favorite_userId_cultureId_key";
ALTER TABLE "favorite" RENAME COLUMN "cultureId" TO "cultureContentId";
ALTER TABLE "favorite" ADD COLUMN "targetType" "FavoriteTargetType";

UPDATE "favorite"
SET "targetType" = CASE
    WHEN "destinationId" IS NOT NULL THEN 'DESTINATION'::"FavoriteTargetType"
    WHEN "cultureContentId" IS NOT NULL THEN 'CULTURE_CONTENT'::"FavoriteTargetType"
END;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "favorite"
        WHERE "targetType" IS NULL
           OR ("targetType" = 'DESTINATION' AND ("destinationId" IS NULL OR "cultureContentId" IS NOT NULL))
           OR ("targetType" = 'CULTURE_CONTENT' AND ("cultureContentId" IS NULL OR "destinationId" IS NOT NULL))
    ) THEN
        RAISE EXCEPTION 'Existing favorite rows cannot satisfy the target contract';
    END IF;
END $$;

ALTER TABLE "favorite" ALTER COLUMN "targetType" SET NOT NULL;

ALTER TABLE "favorite" ADD CONSTRAINT "favorite_exactly_one_target_check"
CHECK (
    ("targetType" = 'DESTINATION' AND "destinationId" IS NOT NULL AND "cultureContentId" IS NULL)
    OR
    ("targetType" = 'CULTURE_CONTENT' AND "cultureContentId" IS NOT NULL AND "destinationId" IS NULL)
);

CREATE INDEX "favorite_userId_createdAt_idx" ON "favorite"("userId", "createdAt");
CREATE UNIQUE INDEX "favorite_userId_cultureContentId_key" ON "favorite"("userId", "cultureContentId");

ALTER TABLE "favorite" ADD CONSTRAINT "favorite_cultureContentId_fkey"
FOREIGN KEY ("cultureContentId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
