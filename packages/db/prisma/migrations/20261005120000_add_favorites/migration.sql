-- CreateTable
CREATE TABLE "favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT,
    "cultureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- Each favorite refers to exactly one real target; NULLs never mean a generic target.
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_exactly_one_target_check"
CHECK (("destinationId" IS NOT NULL)::integer + ("cultureId" IS NOT NULL)::integer = 1);

-- CreateIndex
CREATE UNIQUE INDEX "favorite_userId_destinationId_key" ON "favorite"("userId", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_userId_cultureId_key" ON "favorite"("userId", "cultureId");

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "culture_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
