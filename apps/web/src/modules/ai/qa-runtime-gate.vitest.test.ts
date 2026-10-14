import { describe, expect, it } from "vitest";
import { isQaRuntimeEnabled } from "./qa-runtime-gate";

const base = {
  qaAbuseProtectionAccepted: "true",
  databaseUrl: "postgresql://user:pass@dev-branch.neon.tech/qa_dev?sslmode=require",
  allowedDatabaseHost: "dev-branch.neon.tech",
  allowedDatabaseName: "qa_dev",
};

describe("US21 non-production runtime gate", () => {
  it("requires explicit local opt-in and exact database target", () => {
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", allowedDatabaseName: undefined })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", qaAbuseProtectionAccepted: "false" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", allowedDatabaseName: "production" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true", databaseUrl: "https://dev-branch.neon.tech/qa_dev" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "development", qaRuntimeEnabled: "true" })).toBe(true);
  });
  it("permits explicitly opted-in Preview only and categorically denies Production", () => {
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "preview", qaPreviewRuntimeEnabled: "true" })).toBe(true);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "preview" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "production", vercelEnv: "production", qaRuntimeEnabled: "true", qaPreviewRuntimeEnabled: "true" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...base, nodeEnv: "test", qaRuntimeEnabled: "true", qaPreviewRuntimeEnabled: "true" })).toBe(false);
  });
});
