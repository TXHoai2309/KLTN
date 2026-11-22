CREATE TABLE "origin_search_cache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "origin_search_cache_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "origin_search_cache_expiresAt_idx" ON "origin_search_cache"("expiresAt");

CREATE TABLE "origin_search_admission" (
    "id" TEXT NOT NULL,
    "nextAllowedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "origin_search_admission_pkey" PRIMARY KEY ("id")
);
INSERT INTO "origin_search_admission" ("id", "nextAllowedAt") VALUES ('nominatim', TIMESTAMP '1970-01-01');
