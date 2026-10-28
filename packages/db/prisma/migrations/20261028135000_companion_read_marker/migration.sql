CREATE TABLE "trip_companion_read_marker" (
  "publicationId" TEXT NOT NULL REFERENCES "trip_companion_publication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lastReadSequence" BIGINT NOT NULL DEFAULT 0 CHECK ("lastReadSequence" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("publicationId", "userId")
);
CREATE INDEX "trip_companion_read_marker_userId_publicationId_idx" ON "trip_companion_read_marker"("userId", "publicationId");
