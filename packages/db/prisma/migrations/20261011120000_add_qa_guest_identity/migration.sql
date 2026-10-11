-- Only token digests are stored. Fixed session expiry does not roll on requests.
CREATE TABLE "qa_guest_identity" (
  "id" CHAR(64) PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "qa_guest_identity_digest" CHECK ("id" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "qa_guest_identity_expiry" CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "qa_guest_identity_expiresAt_idx" ON "qa_guest_identity" ("expiresAt");
