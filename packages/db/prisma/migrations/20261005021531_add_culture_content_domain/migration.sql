-- CreateEnum
CREATE TYPE "CultureVisibility" AS ENUM ('HIDDEN', 'VISIBLE');

-- CreateTable
CREATE TABLE "culture_content" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "sourceTitle" VARCHAR(300),
    "sourceUrl" VARCHAR(2000),
    "visibility" "CultureVisibility" NOT NULL DEFAULT 'HIDDEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "culture_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "culture_destination" (
    "cultureId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,

    CONSTRAINT "culture_destination_pkey" PRIMARY KEY ("cultureId","destinationId")
);

-- CreateIndex
CREATE INDEX "culture_content_visibility_title_id_idx" ON "culture_content"("visibility", "title", "id");

-- CreateIndex
CREATE INDEX "culture_destination_destinationId_cultureId_idx" ON "culture_destination"("destinationId", "cultureId");

-- AddForeignKey
ALTER TABLE "culture_destination" ADD CONSTRAINT "culture_destination_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "culture_destination" ADD CONSTRAINT "culture_destination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
