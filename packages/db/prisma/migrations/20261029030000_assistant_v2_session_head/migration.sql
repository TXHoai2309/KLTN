CREATE TABLE "assistant_v2_session_head" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "startHash" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "keyHash" CHAR(64),
  "requestHash" CHAR(64),
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assistant_v2_session_head_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_v2_session_head_version_check" CHECK ("version" >= 0),
  CONSTRAINT "assistant_v2_session_head_lease_check" CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL)),
  CONSTRAINT "assistant_v2_session_head_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assistant_v2_session_head_userId_expiresAt_idx" ON "assistant_v2_session_head"("userId", "expiresAt");
