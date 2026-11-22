-- CreateTable
CREATE TABLE "trip_edit_chat_message" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(24),
    "text" TEXT NOT NULL,
    "steps" JSONB,
    "correctionNote" TEXT,
    "statusNotice" TEXT,
    "knowledgeParts" JSONB,
    "citations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_edit_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_edit_chat_message_tripId_createdAt_idx" ON "trip_edit_chat_message"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "trip_edit_chat_message" ADD CONSTRAINT "trip_edit_chat_message_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
