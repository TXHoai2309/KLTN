-- CreateTable
CREATE TABLE "trip_nearby_suggestion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "slot" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "placeId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_nearby_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_nearby_suggestion_tripId_dayIndex_sortOrder_idx" ON "trip_nearby_suggestion"("tripId", "dayIndex", "sortOrder");

-- AddForeignKey
ALTER TABLE "trip_nearby_suggestion" ADD CONSTRAINT "trip_nearby_suggestion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
