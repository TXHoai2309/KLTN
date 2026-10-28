ALTER TYPE "CompanionMessageKind" ADD VALUE 'SYSTEM';
ALTER TABLE "trip_companion_publication" ADD COLUMN "itineraryRevision" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "companion_itinerary_revision_nonnegative" CHECK ("itineraryRevision" >= 0);
ALTER TABLE "trip_companion_message" ALTER COLUMN "authorId" DROP NOT NULL, ADD COLUMN "notice" JSONB,
  ADD CONSTRAINT "companion_message_authorship" CHECK (
    ("kind"::text = 'USER' AND "authorId" IS NOT NULL AND "notice" IS NULL) OR
    ("kind"::text = 'SYSTEM' AND "authorId" IS NULL AND "notice" IS NOT NULL)
  );
