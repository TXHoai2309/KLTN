-- CreateTable
CREATE TABLE "trip_pinned_item" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "payload" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_pinned_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_pinned_item_tripId_sortOrder_idx" ON "trip_pinned_item"("tripId", "sortOrder");

-- AddForeignKey
ALTER TABLE "trip_pinned_item" ADD CONSTRAINT "trip_pinned_item_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
