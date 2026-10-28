/** Development-only migration preflight. Never prints a connection string. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Client } = require("pg");
const root = path.resolve(import.meta.dirname, "..");
for (const candidate of ["apps/web/.env", "packages/db/.env"]) {
  const file = path.join(root, candidate);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
const migration = "20261027180000_planning_dialogue_history";
const configuredConnectionString = process.env.DATABASE_URL;
if (!configuredConnectionString) throw Error("DEVELOPMENT_DATABASE_NOT_CONFIGURED");
const target = new URL(configuredConnectionString);
if (target.hostname.split(".")[0].replace(/-pooler$/, "") !== "ep-purple-pond-b3xujb8o" || target.pathname !== "/neondb") throw Error("REFUSED_NON_DEVELOPMENT_TARGET");
// Session advisory locks used by Prisma Migrate require a direct connection.
// Keep the application's pooled URL unchanged and verify the same endpoint below.
target.hostname = target.hostname.replace("-pooler.", ".");
const connectionString = target.toString();
const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const identity = (await client.query("SELECT current_database() AS db, current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  if (identity.db !== "neondb" || identity.endpoint !== "ep-purple-pond-b3xujb8o") throw Error("DEVELOPMENT_IDENTITY_MISMATCH");
  const applied = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')).rows;
  const pending = fs.readdirSync(path.join(root, "packages/db/prisma/migrations")).filter(name => fs.existsSync(path.join(root, "packages/db/prisma/migrations", name, "migration.sql")) && !applied.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at));
  console.log(JSON.stringify({ target: "verified-development", pending, planningTablePresent: (await client.query("SELECT to_regclass('public.assistant_planning_workspace') IS NOT NULL AS present")).rows[0].present, qaRuntimeConfigured: process.env.QA_RUNTIME_ENABLED === "true", aiKeyConfigured: !!process.env.OPENAI_API_KEY }));
  if (process.argv.includes("--apply")) {
    if (pending.some(name => ![migration, "20261027120000_assistant_planning_workspace", "20261027123000_planning_history_retention", "20261027130000_planning_replay_retention"].includes(name))) throw Error("REFUSED_UNRELATED_PENDING_MIGRATIONS");
    const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], { cwd: path.join(root, "packages/db"), env: { ...process.env, DATABASE_URL: connectionString }, encoding: "utf8", timeout: 60_000, windowsHide: true });
    if (result.status !== 0) {
      const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      const redacted = raw.replaceAll(connectionString, "<REDACTED>").replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "<REDACTED>");
      fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
      fs.writeFileSync(path.join(root, ".cache/planning-migration-redacted.log"), redacted);
      console.error(JSON.stringify({ code: "PRISMA_MIGRATE_DEPLOY_FAILED", signal: result.signal, errorCode: result.error?.code, prismaCodes: [...new Set(raw.match(/P\d{4}/g) ?? [])] }));
      throw Error("PRISMA_MIGRATE_DEPLOY_FAILED");
    }
    const row = (await client.query('SELECT finished_at FROM "_prisma_migrations" WHERE migration_name=$1 AND rolled_back_at IS NULL', [migration])).rows[0];
    if (!row?.finished_at) throw Error("MIGRATION_NOT_CONFIRMED");
    console.log(JSON.stringify({ checkedMigration: migration, appliedMigrations: pending, status: "APPLIED_DEVELOPMENT", planningTablePresent: true }));
  }
} catch (error) {
  // Database driver messages can contain connection metadata. Expose fixed codes only.
  const allowed = /^(DEVELOPMENT_IDENTITY_MISMATCH|REFUSED_UNRELATED_PENDING_MIGRATIONS|PRISMA_MIGRATE_DEPLOY_FAILED|MIGRATION_NOT_CONFIRMED)$/;
  console.error(allowed.test(error.message) ? error.message : "DATABASE_PREFLIGHT_UNAVAILABLE");
  process.exitCode = 1;
} finally { await client.end().catch(() => undefined); }
