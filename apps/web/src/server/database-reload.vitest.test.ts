import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function services(mode: "development" | "production") {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../services.ts", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", logLevel: "silent",
    external: ["@KLTN/db", "@KLTN/auth", "./env.server"],
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
  });
  const scope = {};
  const factory = vi.fn(() => ({ marker: Symbol("database") }));
  const auth = vi.fn((_env: unknown, database: unknown) => ({ database }));
  const load = (databaseUrl = "postgresql://fixture.invalid/development") => {
    const module = { exports: {} as { db: unknown; auth: { database: unknown } } };
    const require = (id: string) => {
      if (id === "@KLTN/db") return { createPrismaClient: factory };
      if (id === "@KLTN/auth") return { createAuth: auth };
      if (id === "./env.server") return { ENV: { DATABASE_URL: databaseUrl } };
      throw Error(`Unexpected import ${id}`);
    };
    new Function("require", "module", "exports", "globalThis", bundle.outputFiles[0]!.text)(require, module, module.exports, scope);
    return module.exports;
  };
  return { load, factory };
}

describe("shared database connection lifecycle", () => {
  it("reuses the same development client across server module re-evaluations", async () => {
    const t = await services("development");
    const first = t.load();
    expect(t.load().db).toBe(first.db);
    expect(t.load().auth.database).toBe(first.db);
    expect(t.factory).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a connection after the configured database changes", async () => {
    const t = await services("development");
    const first = t.load();
    expect(t.load("postgresql://fixture.invalid/other").db).not.toBe(first.db);
    expect(t.factory).toHaveBeenCalledTimes(2);
  });

  it("leaves production lifetime owned by its module", async () => {
    const t = await services("production");
    expect(t.load().db).not.toBe(t.load().db);
    expect(t.factory).toHaveBeenCalledTimes(2);
  });
});
