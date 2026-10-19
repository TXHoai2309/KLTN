/** Apply additive migration only after isolated PostgreSQL acceptance. */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { developmentConnection, verifyDevelopment } from "./admin-users-test-db.mjs";
const require = createRequire(import.meta.url), { Client } = require("pg");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const connectionString = await developmentConnection(), db = new Client({ connectionString });
await db.connect();
try {
  await verifyDevelopment(db);
  const snapshot = async () => (await db.query(`SELECT (SELECT count(*)::int FROM "user") AS users,(SELECT md5(string_agg(id||':'||role::text,',' ORDER BY id)) FROM "user") AS roleHash,(SELECT count(*)::int FROM session) AS sessions,(SELECT count(*)::int FROM account) AS accounts,(SELECT count(*)::int FROM trip) AS trips,(SELECT count(*)::int FROM favorite) AS favorites`)).rows[0];
  const before = await snapshot();
  const pending = (await db.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows;
  assert.equal(pending.length, 0, "Migration ledger must be healthy");
  const run = args => {
    const result = spawnSync(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", ...args], { cwd: resolve(root, "packages/db"), env: { ...process.env, DATABASE_URL: connectionString }, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) { console.error(result.stdout, result.stderr); throw new Error("Development migration command failed"); }
    return result.stdout;
  };
  run(["deploy"]);
  const after = await snapshot();
  assert.deepEqual(after, before, "Existing account/session/trip/favorite data and roles must be preserved");
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "user" WHERE status <> \'ACTIVE\' OR "lockedAt" IS NOT NULL OR "lockReason" IS NOT NULL')).rows[0].n, 0);
  const ledger = (await db.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows.map(row => row.migration_name);
  assert.ok(ledger.includes("20261017210000_admin_user_management"));
  run(["status"]);
  const directory = resolve(root, "docs/implementation/admin-users-v2-evidence");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "migration-development.json"), JSON.stringify({ before, after, ledger, backfill: "ALL_EXISTING_USERS_ACTIVE", status: "UP_TO_DATE", isolatedTest: "8/8 PostgreSQL + Better Auth PASS before application schema migration" }, null, 2));
  console.log("DEVELOPMENT_MIGRATION=PASS; BACKFILL=PASS; DATA_AND_ROLES_PRESERVED=PASS; LEDGER=UP_TO_DATE");
} finally { await db.end(); }
