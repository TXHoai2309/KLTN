-- AlterTable
ALTER TABLE "qa_conversation" ADD COLUMN "title" VARCHAR(120);
ALTER TABLE "qa_conversation" ADD COLUMN "titleCustomized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "qa_conversation" ADD COLUMN "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill lastActivityAt from the latest completed turn, or conversation createdAt
UPDATE "qa_conversation" c
SET "lastActivityAt" = COALESCE(
  (SELECT MAX(t."createdAt") FROM "qa_turn" t WHERE t."conversationId" = c.id AND t.state = 'COMPLETED'),
  c."createdAt"
);

-- Backfill title from the first question if available
UPDATE "qa_conversation" c
SET "title" = SUBSTRING(
  (SELECT t.question FROM "qa_turn" t WHERE t."conversationId" = c.id AND t.question IS NOT NULL ORDER BY t."createdAt" ASC LIMIT 1)
  FROM 1 FOR 100
)
WHERE c."title" IS NULL;

-- Fallback for conversations without questions
UPDATE "qa_conversation"
SET "title" = 'Cuộc hội thoại mới'
WHERE "title" IS NULL;

-- CreateIndex
CREATE INDEX "qa_conversation_principalKind_principalId_deletedAt_lastAct_idx" ON "qa_conversation"("principalKind", "principalId", "deletedAt", "lastActivityAt" DESC);
