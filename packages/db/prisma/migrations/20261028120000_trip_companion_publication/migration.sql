-- TC-01: publication only; no membership/chat/recruitment lifecycle tables.
CREATE TABLE "trip_companion_publication" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "introduction" VARCHAR(4000) NOT NULL,
    "additionalCapacity" INTEGER NOT NULL,
    "imageMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_companion_publication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_companion_publication_capacity_check" CHECK ("additionalCapacity" > 0),
    CONSTRAINT "trip_companion_publication_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "trip_companion_publication_introduction_check" CHECK (length(btrim("introduction")) > 0)
);

CREATE UNIQUE INDEX "trip_companion_publication_tripId_key" ON "trip_companion_publication"("tripId");
CREATE INDEX "trip_companion_publication_imageMediaId_idx" ON "trip_companion_publication"("imageMediaId");
ALTER TABLE "trip_companion_publication" ADD CONSTRAINT "trip_companion_publication_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_companion_publication" ADD CONSTRAINT "trip_companion_publication_imageMediaId_fkey"
    FOREIGN KEY ("imageMediaId") REFERENCES "content_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
