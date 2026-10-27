CREATE TABLE "assistant_planning_workspace" (
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "needs" JSONB NOT NULL,
  "pendingSaveKey" VARCHAR(200),
  "pendingSaveHash" CHAR(64),
  "pendingSaveRequest" JSONB,
  "completedSaveKey" VARCHAR(200),
  "completedSaveHash" CHAR(64),
  "proposalHash" CHAR(64),
  "savedTripId" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assistant_planning_workspace_pkey" PRIMARY KEY ("conversationId"),
  CONSTRAINT "assistant_planning_version_nonnegative" CHECK ("version" >= 0),
  CONSTRAINT "assistant_planning_workspace_conversation_fkey" FOREIGN KEY ("conversationId") REFERENCES "qa_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assistant_planning_workspace_user_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "assistant_planning_workspace_userId_idx" ON "assistant_planning_workspace"("userId");
