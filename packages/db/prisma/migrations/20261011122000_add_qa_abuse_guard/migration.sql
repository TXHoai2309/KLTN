CREATE TABLE qa_abuse_bucket (
  scope VARCHAR(100) NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowSeconds" INTEGER NOT NULL CHECK ("windowSeconds" IN (600,3600,86400)),
  used INTEGER NOT NULL CHECK (used > 0),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY(scope,"windowStart","windowSeconds"),
  CHECK ("expiresAt">"windowStart")
);
CREATE INDEX "qa_abuse_bucket_expiresAt_idx" ON qa_abuse_bucket("expiresAt");
CREATE TABLE qa_abuse_lease (
  "turnId" TEXT PRIMARY KEY,
  fence INTEGER NOT NULL CHECK (fence>0),
  principal TEXT NOT NULL,
  "networkId" CHAR(64) NOT NULL CHECK ("networkId" ~ '^[a-f0-9]{64}$'),
  "leaseUntil" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "qa_abuse_lease_leaseUntil_idx" ON qa_abuse_lease("leaseUntil");
