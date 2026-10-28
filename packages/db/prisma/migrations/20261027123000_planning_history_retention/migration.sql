-- Existing QA cleanup tombstones expired conversations. Erase the associated
-- reviewed needs/save intent when that same lifecycle deletes the conversation.
CREATE FUNCTION "erase_assistant_planning_history"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "assistant_planning_workspace" WHERE "conversationId" = NEW."id";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "erase_assistant_planning_on_tombstone"
AFTER UPDATE OF "deletedAt" ON "qa_conversation"
FOR EACH ROW WHEN (NEW."deletedAt" IS NOT NULL)
EXECUTE FUNCTION "erase_assistant_planning_history"();
