-- CreateEnum
CREATE TYPE "DestinationVisibility" AS ENUM ('HIDDEN', 'VISIBLE');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "destination" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "area" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "suggestedDurationMinutes" INTEGER,
    "minimumDurationMinutes" INTEGER,
    "visibility" "DestinationVisibility" NOT NULL DEFAULT 'HIDDEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_day" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "status" "OpeningStatus" NOT NULL,

    CONSTRAINT "opening_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_interval" (
    "id" TEXT NOT NULL,
    "openingDayId" TEXT NOT NULL,
    "opensAtMinute" INTEGER NOT NULL,
    "closesAtMinute" INTEGER NOT NULL,

    CONSTRAINT "opening_interval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "destination_area_idx" ON "destination"("area");

-- CreateIndex
CREATE INDEX "destination_category_idx" ON "destination"("category");

-- CreateIndex
CREATE INDEX "destination_visibility_idx" ON "destination"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "opening_day_destinationId_dayOfWeek_key" ON "opening_day"("destinationId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "opening_interval_openingDayId_opensAtMinute_key" ON "opening_interval"("openingDayId", "opensAtMinute");

-- AddForeignKey
ALTER TABLE "opening_day" ADD CONSTRAINT "opening_day_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_interval" ADD CONSTRAINT "opening_interval_openingDayId_fkey" FOREIGN KEY ("openingDayId") REFERENCES "opening_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Scalar invariants; seven-day/status/overlap invariants are validated by the
-- canonical service before its atomic nested write (also used by future imports).
ALTER TABLE "destination" ADD CONSTRAINT "destination_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "destination" ADD CONSTRAINT "destination_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "destination" ADD CONSTRAINT "destination_suggested_duration_range" CHECK ("suggestedDurationMinutes" IS NULL OR "suggestedDurationMinutes" BETWEEN 1 AND 10080);
ALTER TABLE "destination" ADD CONSTRAINT "destination_minimum_duration_range" CHECK ("minimumDurationMinutes" IS NULL OR "minimumDurationMinutes" BETWEEN 1 AND 10080);
ALTER TABLE "opening_interval" ADD CONSTRAINT "opening_interval_time_range" CHECK ("opensAtMinute" BETWEEN 0 AND 1439 AND "closesAtMinute" BETWEEN 1 AND 1440 AND "opensAtMinute" < "closesAtMinute");
