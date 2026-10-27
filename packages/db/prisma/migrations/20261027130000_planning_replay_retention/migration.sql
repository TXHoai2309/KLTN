-- A confirmed-write replay remains recognizable, but deleted personal planning
-- needs must not survive indefinitely inside the shared replay response store.
CREATE OR REPLACE FUNCTION "erase_assistant_planning_history"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "assistant_planning_workspace" WHERE "conversationId" = NEW."id";
  UPDATE "idempotency_record"
  SET "responseJson" = ("responseJson"::jsonb - 'needs')::text
  WHERE "scope"::jsonb->>0 = NEW."principalId"
    AND "scope"::jsonb->>1 IN ('planning:start', 'planning:review', 'planning:proposal')
    AND "responseJson"::jsonb->>'conversationId' = NEW."id";
  RETURN NEW;
END;
$$;
