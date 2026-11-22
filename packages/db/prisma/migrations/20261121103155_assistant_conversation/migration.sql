-- CreateTable
CREATE TABLE "assistant_conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "clientMessageId" VARCHAR(200) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversation_userId_updatedAt_id_idx" ON "assistant_conversation"("userId", "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "assistant_conversation_expiresAt_idx" ON "assistant_conversation"("expiresAt");

-- CreateIndex
CREATE INDEX "assistant_message_conversationId_createdAt_id_idx" ON "assistant_message"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_message_conversationId_role_clientMessageId_key" ON "assistant_message"("conversationId", "role", "clientMessageId");

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
