CREATE TYPE "CompanionMessageKind" AS ENUM ('USER');
ALTER TABLE "trip_companion_publication" ADD COLUMN "messageSequence" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "companion_message_sequence_nonnegative" CHECK ("messageSequence" >= 0);
CREATE TABLE "trip_companion_message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicationId" TEXT NOT NULL REFERENCES "trip_companion_publication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sequence" BIGINT NOT NULL CHECK ("sequence" > 0),
  "kind" "CompanionMessageKind" NOT NULL DEFAULT 'USER',
  "authorId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "text" VARCHAR(4000) NOT NULL CHECK (length(btrim("text")) > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "trip_companion_message_publicationId_sequence_key" ON "trip_companion_message"("publicationId", "sequence");
CREATE OR REPLACE FUNCTION protect_companion_trip_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_companion_publication" WHERE "tripId" = OLD.id AND ("everHadMembers" OR "messageSequence" > 0)) THEN
    RAISE EXCEPTION 'Trip has companion history' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
