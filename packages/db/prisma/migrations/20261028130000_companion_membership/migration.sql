ALTER TABLE "trip_companion_publication" ADD COLUMN "everHadMembers" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "CompanionMembershipState" AS ENUM ('ACTIVE');
CREATE TABLE "trip_companion_membership" (
  "publicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "state" "CompanionMembershipState" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trip_companion_membership_pkey" PRIMARY KEY ("publicationId", "userId"),
  CONSTRAINT "trip_companion_membership_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "trip_companion_publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "trip_companion_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "trip_companion_membership_userId_state_publicationId_idx" ON "trip_companion_membership"("userId", "state", "publicationId");
CREATE FUNCTION protect_companion_trip_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_companion_publication" WHERE "tripId" = OLD.id AND "everHadMembers") THEN
    RAISE EXCEPTION 'Trip has companion history' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "trip_companion_history_delete_guard" BEFORE DELETE ON "trip"
FOR EACH ROW EXECUTE FUNCTION protect_companion_trip_history();
