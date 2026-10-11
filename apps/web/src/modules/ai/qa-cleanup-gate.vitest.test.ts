import { describe, expect, it } from "vitest";
import { isQaCleanupEnabled } from "./qa-cleanup-gate";

const base = {
  enabled: "true",
  databaseUrl: "postgresql://user:secret@ep-approved.neon.tech/qa_approved?sslmode=require",
  allowedDatabaseHost: "ep-approved.neon.tech",
  allowedDatabaseName: "qa_approved",
};

describe("QA cleanup deployment target gate", () => {
  it("requires explicit enablement and an exact PostgreSQL host/database match", () => {
    expect(isQaCleanupEnabled(base)).toBe(true);
    expect(isQaCleanupEnabled({ ...base, enabled: "false" })).toBe(false);
    expect(isQaCleanupEnabled({ ...base, allowedDatabaseHost: "ep-shared-development.neon.tech" })).toBe(false);
    expect(isQaCleanupEnabled({ ...base, allowedDatabaseName: "shared_development" })).toBe(false);
    expect(isQaCleanupEnabled({ ...base, databaseUrl: "https://ep-approved.neon.tech/qa_approved" })).toBe(false);
  });

  it.each([
    { allowedDatabaseHost: undefined },
    { allowedDatabaseName: undefined },
    { databaseUrl: undefined },
    { databaseUrl: "postgresql://user:secret@ep-approved.neon.tech/qa%2Fshared" },
    { allowedDatabaseName: "qa_approved/extra" },
  ])("fails closed when target configuration is incomplete or malformed %#", overrides => {
    expect(isQaCleanupEnabled({ ...base, ...overrides })).toBe(false);
  });
});
