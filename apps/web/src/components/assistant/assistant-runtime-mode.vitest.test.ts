import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { ReactElement } from "react";
import { isQaRuntimeEnabled } from "../../modules/ai/qa-runtime-gate";

describe("/assistant runtime selection and fail-closed boundary", () => {
  it.each([
    ["development", "true", "REAL"],
    ["development", "false", "DEMO"],
    ["production", "true", "UNAVAILABLE"],
    ["production", "false", "UNAVAILABLE"],
  ] as const)("NODE_ENV=%s QA_RUNTIME_ENABLED=%s selects %s component", async (nodeEnv, qaEnabled, expected) => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../../app/assistant/page.tsx", import.meta.url))],
      bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", metafile: true,
      external: ["react", "react/*", "next", "./assistant-context-page"], loader: { ".css": "empty" }, logLevel: "silent",
      define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv), "process.env.QA_RUNTIME_ENABLED": JSON.stringify(qaEnabled) },
    });
    const paths = Object.keys(bundle.metafile!.inputs);
    expect(paths.some(path => path.includes("assistant-runtime-chat.tsx"))).toBe(expected === "REAL");
    expect(paths.some(path => path.includes("assistant-http-transport.ts"))).toBe(expected === "REAL");
    const module = { exports: {} as { default: (props: object) => Promise<ReactElement<{ children: ReactElement }>> } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    const page = await module.exports.default({});
    const component = { REAL: "AssistantRuntimeChat", DEMO: "AssistantDevelopmentChat", UNAVAILABLE: "AssistantChat" }[expected];
    expect(page.props.children.type).toHaveProperty("name", component);
    if (expected === "UNAVAILABLE") {
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
  });
});
