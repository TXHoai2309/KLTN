CREATE TABLE "runtime_config" (
  "scope" VARCHAR(20) NOT NULL,
  "service" VARCHAR(30) NOT NULL,
  "payload" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "runtime_config_pkey" PRIMARY KEY ("scope", "service"),
  CONSTRAINT "runtime_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "runtime_config_audit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" VARCHAR(20) NOT NULL,
  "service" VARCHAR(30) NOT NULL,
  "version" INTEGER NOT NULL,
  "changedKeys" VARCHAR(500) NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "runtime_config_audit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "runtime_config_audit_scope_createdAt_idx" ON "runtime_config_audit"("scope", "createdAt" DESC);
