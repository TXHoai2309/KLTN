import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { ReactElement } from "react";
import { isQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";

type RuntimeEnvironment = {
  NODE_ENV: string;
  VERCEL_ENV: string;
  QA_RUNTIME_ENABLED: string;
  QA_PREVIEW_RUNTIME_ENABLED: string;
  QA_PRODUCTION_RUNTIME_ENABLED?: string;
  QA_ABUSE_PROTECTION_ACCEPTED: string;
  DATABASE_URL: string;
  QA_RUNTIME_ALLOWED_DATABASE_HOST: string;
  QA_RUNTIME_ALLOWED_DATABASE_NAME: string;
};

const baseEnvironment: RuntimeEnvironment = {
  NODE_ENV: "production",
  VERCEL_ENV: "preview",
  QA_RUNTIME_ENABLED: "false",
  QA_PREVIEW_RUNTIME_ENABLED: "true",
  QA_PRODUCTION_RUNTIME_ENABLED: "false",
  QA_ABUSE_PROTECTION_ACCEPTED: "true",
  DATABASE_URL: "postgresql://qa@dev.example/neondb?sslmode=require",
  QA_RUNTIME_ALLOWED_DATABASE_HOST: "dev.example",
  QA_RUNTIME_ALLOWED_DATABASE_NAME: "neondb",
};

function withEnvironment(overrides: Partial<RuntimeEnvironment>): RuntimeEnvironment {
  return { ...baseEnvironment, ...overrides };
}

const selectionCases = [
  { name: "enabled local runtime", env: withEnvironment({ NODE_ENV: "development", VERCEL_ENV: "", QA_RUNTIME_ENABLED: "true" }), expected: "REAL" },
  { name: "disabled local runtime retains its local demo", env: withEnvironment({ NODE_ENV: "development", VERCEL_ENV: "", QA_RUNTIME_ENABLED: "false" }), expected: "DEMO" },
  { name: "Preview uses the shared gate when explicitly enabled", env: withEnvironment({}), expected: "REAL" },
  { name: "disabled Preview remains unavailable", env: withEnvironment({ QA_PREVIEW_RUNTIME_ENABLED: "false" }), expected: "UNAVAILABLE" },
  { name: "Preview remains unavailable without abuse acceptance", env: withEnvironment({ QA_ABUSE_PROTECTION_ACCEPTED: "false" }), expected: "UNAVAILABLE" },
  { name: "Preview remains unavailable when the pinned database differs", env: withEnvironment({ QA_RUNTIME_ALLOWED_DATABASE_HOST: "other.example" }), expected: "UNAVAILABLE" },
  { name: "Preview remains unavailable without a database URL", env: withEnvironment({ DATABASE_URL: "" }), expected: "UNAVAILABLE" },
  { name: "a development NODE_ENV cannot enable a Preview demo", env: withEnvironment({ NODE_ENV: "development", VERCEL_ENV: "preview", QA_PREVIEW_RUNTIME_ENABLED: "false" }), expected: "UNAVAILABLE" },
  { name: "Production remains unavailable by default", env: withEnvironment({ VERCEL_ENV: "production" }), expected: "UNAVAILABLE" },
  { name: "Production remains unavailable even when QA_RUNTIME_ENABLED is true", env: withEnvironment({ VERCEL_ENV: "production", QA_RUNTIME_ENABLED: "true" }), expected: "UNAVAILABLE" },
  { name: "Production uses the shared gate when explicitly enabled", env: withEnvironment({ VERCEL_ENV: "production", QA_PRODUCTION_RUNTIME_ENABLED: "true" }), expected: "REAL" },
  { name: "Production remains unavailable when enabled but abuse protection is not accepted", env: withEnvironment({ VERCEL_ENV: "production", QA_PRODUCTION_RUNTIME_ENABLED: "true", QA_ABUSE_PROTECTION_ACCEPTED: "false" }), expected: "UNAVAILABLE" },
  { name: "Production remains unavailable when enabled but database host differs", env: withEnvironment({ VERCEL_ENV: "production", QA_PRODUCTION_RUNTIME_ENABLED: "true", QA_RUNTIME_ALLOWED_DATABASE_HOST: "other.example" }), expected: "UNAVAILABLE" },
] as const;

describe("/assistant runtime selection and fail-closed boundary", () => {
  it.each(selectionCases)("$name", async ({ env, expected }) => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../../app/assistant/page.tsx", import.meta.url))],
      bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", metafile: true,
      external: ["react", "react/*", "next", "./assistant-context-page"], loader: { ".css": "empty" }, logLevel: "silent",
      define: Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
    });
    const paths = Object.keys(bundle.metafile!.inputs);
    const localDevelopment = env.NODE_ENV === "development" && (!env.VERCEL_ENV || env.VERCEL_ENV === "development");
    const previewDeployment = env.NODE_ENV === "production" && env.VERCEL_ENV === "preview";
    const productionDeployment = env.NODE_ENV === "production" && env.VERCEL_ENV === "production" && env.QA_PRODUCTION_RUNTIME_ENABLED === "true";
    const realTransportExpected = localDevelopment || previewDeployment || productionDeployment;
    expect(paths.some(path => path.includes("assistant-runtime-chat.tsx"))).toBe(realTransportExpected);
    expect(paths.some(path => path.includes("assistant-http-transport.ts"))).toBe(realTransportExpected);
    expect(paths.some(path => path.includes("development/"))).toBe(localDevelopment);
    const module = { exports: {} as { default: (props: object) => Promise<ReactElement<{ children: ReactElement }>> } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    const page = await module.exports.default({});
    const component = { REAL: "AssistantRuntimeChat", DEMO: "AssistantDevelopmentChat", UNAVAILABLE: "AssistantChat" }[expected];
    expect(page.props.children.type).toHaveProperty("name", component);
    if (env.VERCEL_ENV === "production") {
      if (env.QA_PRODUCTION_RUNTIME_ENABLED !== "true") {
        expect(paths.some(path => path.includes("assistant-runtime-chat.tsx"))).toBe(false);
      }
      expect(paths.some(path => path.includes("development/"))).toBe(false);
      expect(paths.some(path => path.includes("assistant-citation-fixtures"))).toBe(false);
    }
  });
  it("requires the server security gate even when the page requests real transport", () => {
    const valid = { nodeEnv: "development", qaRuntimeEnabled: "true", qaAbuseProtectionAccepted: "true", databaseUrl: "postgresql://fixture.invalid/neondb", allowedDatabaseHost: "fixture.invalid", allowedDatabaseName: "neondb" };
    expect(isQaRuntimeEnabled(valid)).toBe(true);
    for (const override of [{ databaseUrl: undefined }, { allowedDatabaseHost: undefined }, { allowedDatabaseName: undefined }, { qaAbuseProtectionAccepted: "false" }, { allowedDatabaseHost: "wrong.invalid" }, { vercelEnv: "preview" }, { vercelEnv: "production" }]) {
      // Runtime bootstrap is unavailable, not a demo fallback. HTTP guard tests
      // separately assert that a closed gate never invokes auth/DB/providers.
      expect(isQaRuntimeEnabled({ ...valid, ...override })).toBe(false);
    }
    const preview = { ...valid, nodeEnv: "production", vercelEnv: "preview", qaPreviewRuntimeEnabled: "true" };
    expect(isQaRuntimeEnabled(preview)).toBe(true);
    expect(isQaRuntimeEnabled({ ...preview, vercelEnv: "production" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...preview, allowedDatabaseName: "production" })).toBe(false);
    const prod = { ...valid, nodeEnv: "production", vercelEnv: "production", qaProductionRuntimeEnabled: "true" };
    expect(isQaRuntimeEnabled(prod)).toBe(true);
    expect(isQaRuntimeEnabled({ ...prod, qaProductionRuntimeEnabled: "false" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prod, qaAbuseProtectionAccepted: "false" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prod, allowedDatabaseHost: "other.invalid" })).toBe(false);
    expect(isQaRuntimeEnabled({ ...prod, nodeEnv: "development" })).toBe(false);
  });
});
