-- Approved US-30/31 extension. Existing trips retain calendar-derived status.
ALTER TABLE "trip" ADD COLUMN "manuallyCompletedAt" TIMESTAMP(3);
