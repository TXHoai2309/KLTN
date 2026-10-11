CREATE TABLE qa_cleanup_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMPTZ(3),
  "lastStartedAt" TIMESTAMPTZ(3),
  "lastSucceededAt" TIMESTAMPTZ(3),
  "lastFailedAt" TIMESTAMPTZ(3),
  "eligibleBacklogCount" BIGINT NOT NULL DEFAULT 0 CHECK ("eligibleBacklogCount" >= 0),
  "oldestOverdueAt" TIMESTAMPTZ(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0 CHECK ("failureCount" >= 0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL))
);
CREATE INDEX "qa_conversation_deletedAt_idx" ON qa_conversation("deletedAt");
CREATE INDEX "qa_turn_state_contentExpiresAt_idx" ON qa_turn(state,"contentExpiresAt");
CREATE INDEX "qa_turn_state_leaseUntil_idx" ON qa_turn(state,"leaseUntil");
