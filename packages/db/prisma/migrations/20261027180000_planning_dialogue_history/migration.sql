ALTER TABLE "assistant_planning_workspace"
  ADD COLUMN "dialogueRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dialogueCheckpoint" JSONB;

CREATE TABLE "assistant_planning_turn" (
  "id" TEXT NOT NULL,
  "sequence" SERIAL NOT NULL,
  "conversationId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "reply" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "afterQaTurnId" TEXT,
  CONSTRAINT "assistant_planning_turn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_planning_turn_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "assistant_planning_workspace"("conversationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assistant_planning_turn_sequence_key" ON "assistant_planning_turn"("sequence");
CREATE INDEX "assistant_planning_turn_conversationId_sequence_idx" ON "assistant_planning_turn"("conversationId", "sequence");
