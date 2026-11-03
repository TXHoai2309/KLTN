/** Explicit Production rollout for reviewed companion migrations. No business-data writes. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Client } = require("pg");
const root = path.resolve(import.meta.dirname, "..");
const allowed = new Set([
  "20261028120000_trip_companion_publication",
  "20261028130000_companion_membership",
  "20261028131000_companion_leave",
  "20261028132000_companion_recruitment",
  "20261028133000_companion_ban",
  "20261028134000_companion_chat",
  "20261028135000_companion_read_marker",
  "20261028140000_companion_itinerary_revision",
  "20261028141000_companion_cancel",
]);
let client;
try {
  for (const name of [".env.local", "apps/web/.env", "packages/db/.env"]) {
    const f = path.join(root, name);
    if (fs.existsSync(f)) process.loadEnvFile(f);
  }
  const rawUrl = process.env.DATABASE_URL_PROD;
  if (!rawUrl) throw Error("MISSING_DATABASE_URL_PROD");
  const target = new URL(rawUrl);
  if (target.hostname.split(".")[0].replace(/-pooler$/, "") !== "ep-blue-art-b3v3vr4h" || target.pathname !== "/neondb") {
    throw Error("REFUSED_NON_PRODUCTION_TARGET");
  }
  target.hostname = target.hostname.replace("-pooler.", ".");
  const connectionString = target.toString();
  client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  const identity = (await client.query("SELECT current_database() AS db, current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  if (identity.db !== "neondb" || identity.endpoint !== "ep-blue-art-b3v3vr4h") {
    throw Error("PRODUCTION_IDENTITY_MISMATCH");
  }

  const migrationRoot = path.join(root, "packages/db/prisma/migrations");
  const names = fs.readdirSync(migrationRoot).filter(name => fs.existsSync(path.join(migrationRoot, name, "migration.sql")));
  const ledger = async () => (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC')).rows;
  const before = await ledger();
  if (before.some(row => !row.finished_at && !row.rolled_back_at)) throw Error("UNFINISHED_MIGRATION");

  const pending = names.filter(name => !before.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at));
  if (pending.some(name => !allowed.has(name))) throw Error("REFUSED_UNRELATED_PENDING_MIGRATIONS");

  const hashes = Object.fromEntries(names.filter(name => allowed.has(name)).map(name => [
    name,
    createHash("sha256").update(fs.readFileSync(path.join(migrationRoot, name, "migration.sql"))).digest("hex")
  ]));

  for (const row of before) {
    if (allowed.has(row.migration_name) && row.finished_at && !row.rolled_back_at && hashes[row.migration_name] !== row.checksum) {
      throw Error("SCOPED_MIGRATION_CHECKSUM_MISMATCH");
    }
  }

  const isApply = process.argv.includes("--apply");
  console.log(JSON.stringify({ target: "verified-production", endpoint: identity.endpoint, pending, unfinished: 0, mode: isApply ? "apply" : "preflight" }, null, 2));

  if (isApply && pending.length) {
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        cwd: path.join(root, "packages/db"),
        env: { ...process.env, DATABASE_URL: connectionString },
        encoding: "utf8",
        timeout: 60000,
        windowsHide: true,
      }
    );
    const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replaceAll(connectionString, "<REDACTED>").replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "<REDACTED>");
    fs.mkdirSync(path.join(root, ".cache/trip-companions-prod"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cache/trip-companions-prod/production-deploy-redacted.log"), log);
    if (result.status !== 0) {
      console.error(log);
      throw Error("PRISMA_MIGRATE_DEPLOY_FAILED");
    }
  }

  const after = await ledger();
  const stillPending = names.filter(name => !after.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at));
  const catalog = (await client.query("SELECT c.relname AS table_name, pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid WHERE c.relname LIKE 'trip_companion%' ORDER BY c.relname, p.conname")).rows;
  const indexes = (await client.query("SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'trip_companion%' ORDER BY tablename,indexname")).rows;
  const triggers = (await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%companion%' ORDER BY tgname")).rows;

  const receipt = {
    target: "verified-production",
    endpoint: identity.endpoint,
    at: new Date().toISOString(),
    appliedCount: after.filter(row => row.finished_at && !row.rolled_back_at).length,
    pending: stillPending,
    unfinished: after.filter(row => !row.finished_at && !row.rolled_back_at).length,
    appliedMigrations: pending.filter(name => !stillPending.includes(name)),
    hashes,
    catalog,
    indexes,
    triggers,
  };

  fs.mkdirSync(path.join(root, ".cache/trip-companions-prod"), { recursive: true });
  fs.writeFileSync(path.join(root, ".cache/trip-companions-prod/production-migration.json"), JSON.stringify(receipt, null, 2));

  if (isApply && (stillPending.length || receipt.unfinished)) throw Error("MIGRATION_NOT_CONFIRMED");
  console.log(JSON.stringify({
    target: receipt.target,
    endpoint: receipt.endpoint,
    appliedCount: receipt.appliedCount,
    pending: receipt.pending,
    unfinished: receipt.unfinished,
    appliedInRun: receipt.appliedMigrations,
    constraints: catalog.length,
    indexes: indexes.length,
    triggers: triggers.length,
  }, null, 2));
} catch (error) {
  const codes = new Set([
    "MISSING_DATABASE_URL_PROD",
    "REFUSED_NON_PRODUCTION_TARGET",
    "PRODUCTION_IDENTITY_MISMATCH",
    "UNFINISHED_MIGRATION",
    "REFUSED_UNRELATED_PENDING_MIGRATIONS",
    "SCOPED_MIGRATION_CHECKSUM_MISMATCH",
    "PRISMA_MIGRATE_DEPLOY_FAILED",
    "MIGRATION_NOT_CONFIRMED"
  ]);
  console.error(codes.has(error.message) ? error.message : `PRODUCTION_MIGRATION_UNAVAILABLE: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => undefined);
}
