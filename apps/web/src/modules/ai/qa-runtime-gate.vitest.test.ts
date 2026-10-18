import { describe, expect, it } from "vitest";
import { isQaRuntimeEnabled } from "./qa-runtime-gate";

const base = {
  qaAbuseProtectionAccepted: "true",
  databaseUrl: "postgresql://user:pass@dev-branch.neon.tech/qa_dev?sslmode=require",
  allowedDatabaseHost: "dev-branch.neon.tech",
  allowedDatabaseName: "qa_dev",
};

describe("Q&A environment runtime gate", () => {
  it("requires explicit local opt-in and exact database target", () => {
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", allowedDatabaseName: undefined })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", qaAbuseProtectionAccepted: "false" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", allowedDatabaseName: "production" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", databaseUrl: "https://dev-branch.neon.tech/qa_dev" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true" })).toBe(true);
  });
  it("permits explicitly opted-in Preview only and isolates from Production", () => {
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "preview", qaPreviewRuntimeEnabled: "true" })).toBe(true);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "preview" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "preview", qaRuntimeEnabled: "true", qaProductionRuntimeEnabled: "true" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "test", qaRuntimeEnabled: "true", qaPreviewRuntimeEnabled: "true" })).toBe(false);
  });
  it("governs Production with dedicated QA_PRODUCTION_RUNTIME_ENABLED and verified pin", () => {
    // Default / unconfigured Production is strictly false
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "production" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "production", qaRuntimeEnabled: "true", qaPreviewRuntimeEnabled: "true" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "production", qaProductionRuntimeEnabled: "false" })).toBe(false);

    // Explicitly enabled Production with matching DB pin and abuse acceptance
    const prodValid = {
      ...base,
      nodeEnv: "production",
      vercelEnv: "production",
      qaProductionRuntimeEnabled: "true",
      databaseUrl: "postgresql://user:pass@ep-blue-art-b3v3vr4h.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full",
      allowedDatabaseHost: "ep-blue-art-b3v3vr4h.c-4.ap-southeast-1.aws.neon.tech",
      allowedDatabaseName: "neondb",
    };
    expect(isQaRuntimeEnabled(prodValid)).toBe(true);

    // Fail-closed checks on Production
    expect(isQaRuntimeEnabled({ ...prodValid, qaAbuseProtectionAccepted: "false" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prodValid, allowedDatabaseHost: "wrong-host.neon.tech" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prodValid, allowedDatabaseName: "other_db" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prodValid, databaseUrl: undefined })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prodValid, vercelEnv: undefined })).toBe(false);
  });
});
