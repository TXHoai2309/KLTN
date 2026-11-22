-- CreateTable
CREATE TABLE "trip_chosen_lodging" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "nightIndex" INTEGER NOT NULL,
    "externalPlaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_chosen_lodging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_chosen_lodging_externalPlaceId_idx" ON "trip_chosen_lodging"("externalPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_chosen_lodging_tripId_nightIndex_key" ON "trip_chosen_lodging"("tripId", "nightIndex");

-- AddForeignKey
ALTER TABLE "trip_chosen_lodging" ADD CONSTRAINT "trip_chosen_lodging_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_chosen_lodging" ADD CONSTRAINT "trip_chosen_lodging_externalPlaceId_fkey" FOREIGN KEY ("externalPlaceId") REFERENCES "external_place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
