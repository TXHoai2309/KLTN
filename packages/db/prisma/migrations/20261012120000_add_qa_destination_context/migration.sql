ALTER TABLE "qa_conversation" ADD COLUMN "context" JSONB NOT NULL DEFAULT '{"type":"GENERAL"}'::jsonb;
ALTER TABLE "qa_conversation" ADD CONSTRAINT "qa_conversation_context_shape" CHECK (
  ("context" = '{"type":"GENERAL"}'::jsonb) OR
  (jsonb_typeof("context") = 'object' AND "context" ? 'type' AND "context"->'type' = '"DESTINATION"'::jsonb
    AND "context" ? 'destinationId'
    AND jsonb_typeof("context"->'destinationId') = 'string'
    AND "context"->>'destinationId' ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND ("context" - 'type' - 'destinationId') = '{}'::jsonb)
);
