-- AlterTable
ALTER TABLE "qa_conversation" ADD COLUMN "knowledgeMode" VARCHAR(16) NOT NULL DEFAULT 'SOURCE_ONLY';

-- Add check constraint for valid knowledge modes
ALTER TABLE "qa_conversation" ADD CONSTRAINT "qa_conversation_knowledge_mode_check" CHECK ("knowledgeMode" IN ('SOURCE_ONLY', 'EXPANDED'));
