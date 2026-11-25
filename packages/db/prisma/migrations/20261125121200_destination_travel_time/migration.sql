-- CreateTable
CREATE TABLE "destination_travel_time" (
    "fromDestinationId" TEXT NOT NULL,
    "toDestinationId" TEXT NOT NULL,
    "transport" "TripTransport" NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destination_travel_time_pkey" PRIMARY KEY ("fromDestinationId","toDestinationId","transport")
);

-- CreateIndex
CREATE INDEX "destination_travel_time_toDestinationId_idx" ON "destination_travel_time"("toDestinationId");

-- AddForeignKey
ALTER TABLE "destination_travel_time" ADD CONSTRAINT "destination_travel_time_fromDestinationId_fkey" FOREIGN KEY ("fromDestinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_travel_time" ADD CONSTRAINT "destination_travel_time_toDestinationId_fkey" FOREIGN KEY ("toDestinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
