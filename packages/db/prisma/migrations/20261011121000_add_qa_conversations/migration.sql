CREATE TABLE "qa_conversation" (
 "id" TEXT PRIMARY KEY, "principalKind" VARCHAR(5) NOT NULL,
 "principalId" TEXT NOT NULL, "headTurnId" TEXT, "activeTurnId" TEXT,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "deletedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "qa_conversation_principal_check" CHECK ("principalKind" IN ('GUEST','USER'))
);
CREATE TABLE "qa_turn" (
 "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL,
 "principalKind" VARCHAR(5) NOT NULL, "principalId" TEXT NOT NULL, "key" VARCHAR(200) NOT NULL,
 "requestHash" CHAR(64) NOT NULL, "parentTurnId" TEXT, "state" VARCHAR(12) NOT NULL,
 "fence" INTEGER NOT NULL DEFAULT 1, "leaseUntil" TIMESTAMPTZ(3) NOT NULL,
 "question" TEXT, "response" JSONB, "provenance" JSONB, "errorCode" VARCHAR(80),
 "contentExpiresAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMPTZ(3),
 CONSTRAINT "qa_turn_principal_check" CHECK ("principalKind" IN ('GUEST','USER')),
 CONSTRAINT "qa_turn_state_check" CHECK ("state" IN ('PROCESSING','COMPLETED','FAILED','TOMBSTONE')),
 CONSTRAINT "qa_turn_fence_check" CHECK ("fence" > 0),
 CONSTRAINT "qa_turn_result_check" CHECK (("state" = 'COMPLETED') = ("response" IS NOT NULL)),
 CONSTRAINT "qa_turn_tombstone_check" CHECK ("state" <> 'TOMBSTONE' OR ("question" IS NULL AND "response" IS NULL AND "provenance" IS NULL))
);
CREATE UNIQUE INDEX "qa_turn_principalKind_principalId_key_key" ON "qa_turn"("principalKind","principalId","key");
CREATE UNIQUE INDEX "qa_conversation_id_principalKind_principalId_key" ON "qa_conversation"("id","principalKind","principalId");
ALTER TABLE "qa_turn" ADD CONSTRAINT "qa_turn_conversationId_principalKind_principalId_fkey" FOREIGN KEY ("conversationId","principalKind","principalId") REFERENCES "qa_conversation"("id","principalKind","principalId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "qa_conversation_principalKind_principalId_idx" ON "qa_conversation"("principalKind","principalId");
CREATE INDEX "qa_conversation_expiresAt_idx" ON "qa_conversation"("expiresAt");
CREATE INDEX "qa_turn_conversationId_createdAt_idx" ON "qa_turn"("conversationId","createdAt");
CREATE INDEX "qa_turn_contentExpiresAt_idx" ON "qa_turn"("contentExpiresAt");
CREATE UNIQUE INDEX "qa_turn_one_processing_per_conversation" ON "qa_turn"("conversationId") WHERE "state" = 'PROCESSING';
