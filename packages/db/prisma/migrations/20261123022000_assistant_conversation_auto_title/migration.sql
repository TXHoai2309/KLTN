-- AlterTable (Ticket 14 / ADR-50): distinguish user-renamed conversation titles from auto-titles and track saved trip link.
ALTER TABLE "assistant_conversation"
ADD COLUMN "titleCustomized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "savedTripId" TEXT;
