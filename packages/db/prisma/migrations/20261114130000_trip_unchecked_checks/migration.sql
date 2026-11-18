-- Ticket 09 (Q21'a): additive, nullable. NULL means nothing was saved as unchecked (all legacy and all-PASS Trips).
-- AlterTable
ALTER TABLE "trip" ADD COLUMN     "uncheckedChecks" JSONB,
ADD COLUMN     "uncheckedConfirmedAt" TIMESTAMPTZ(3);
