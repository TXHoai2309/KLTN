-- CreateEnum
CREATE TYPE "TripTransport" AS ENUM ('MOTORCYCLE', 'CAR');

-- CreateTable
CREATE TABLE "trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "transport" "TripTransport" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_day" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "localDate" DATE NOT NULL,
    CONSTRAINT "itinerary_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_visit" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "plannedDurationMinutes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "itinerary_visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_userId_createdAt_idx" ON "trip"("userId", "createdAt");
CREATE UNIQUE INDEX "itinerary_day_tripId_dayIndex_key" ON "itinerary_day"("tripId", "dayIndex");
CREATE INDEX "itinerary_visit_destinationId_idx" ON "itinerary_visit"("destinationId");
CREATE UNIQUE INDEX "itinerary_visit_dayId_order_key" ON "itinerary_visit"("dayId", "order");

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_day" ADD CONSTRAINT "itinerary_day_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_visit" ADD CONSTRAINT "itinerary_visit_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "itinerary_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_visit" ADD CONSTRAINT "itinerary_visit_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
