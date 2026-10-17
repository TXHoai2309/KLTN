-- Additive; Prisma's migration ledger ensures this version runs exactly once.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED');
CREATE TYPE "AdminAuditEventType" AS ENUM ('ROLE_CHANGED', 'USER_LOCKED', 'USER_UNLOCKED', 'SESSION_REVOKED');
ALTER TABLE "user" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lockedAt" TIMESTAMP(3), ADD COLUMN "lockReason" VARCHAR(500);
CREATE INDEX "user_role_status_idx" ON "user"("role", "status");
CREATE TABLE "admin_audit_event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventType" "AdminAuditEventType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" VARCHAR(500), "details" JSONB,
  CONSTRAINT "admin_audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_audit_event_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "admin_audit_event_targetUserId_timestamp_id_idx" ON "admin_audit_event"("targetUserId", "timestamp" DESC, "id");
CREATE INDEX "admin_audit_event_actorId_timestamp_idx" ON "admin_audit_event"("actorId", "timestamp" DESC);

-- Close the session.create hook's check/insert race. FOR SHARE conflicts with
-- locking the User row and is held until the session insert/update commits.
-- Schema-qualified function/table binding also works in isolated test schemas.
CREATE FUNCTION "enforce_active_session_user"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE user_status "UserStatus";
BEGIN
  SELECT "status" INTO user_status FROM "user" WHERE "id" = NEW."userId" FOR SHARE;
  IF user_status IS DISTINCT FROM 'ACTIVE'::"UserStatus" THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "session_requires_active_user" BEFORE INSERT OR UPDATE ON "session"
FOR EACH ROW EXECUTE FUNCTION "enforce_active_session_user"();
