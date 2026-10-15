/** Read-only readiness evidence. No connection URLs, credentials, provider calls or writes. */
import "varlock/auto-load";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const endpoint = "ep-purple-pond-b3xujb8o";
const url = process.env.DATABASE_URL;
if (!url) throw Error("Database configuration missing");
let target: URL;
try { target = new URL(url); }
catch { throw Error("Invalid database configuration (values suppressed)"); }
if (!new RegExp(`^${endpoint}(?:-pooler)?\\.`).test(target.hostname) || target.pathname !== "/neondb")
  throw Error("Refusing target outside the previously inspected endpoint");
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 10000");
    const identity = (await client.query("SELECT current_database() AS database, current_setting('neon.endpoint_id', true) AS endpoint, has_database_privilege(current_database(), 'CREATE') AS database_create, has_schema_privilege('public', 'CREATE') AS schema_create")).rows[0];
    if (identity.endpoint !== endpoint || identity.database !== "neondb") throw Error("Endpoint identity mismatch");
    const ledger = (await client.query('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at')).rows;
    const migrationRoot = resolve("../../packages/db/prisma/migrations");
    const local = (await readdir(migrationRoot, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
    const mismatches: string[] = [];
    for (const entry of ledger) {
      if (!local.includes(entry.migration_name)) { mismatches.push(`${entry.migration_name}:missing-local`); continue; }
      const sql = await readFile(resolve(migrationRoot, entry.migration_name, "migration.sql"), "utf8");
      const variants = [sql, sql.replace(/\r\n/g, "\n"), sql.replace(/\r?\n/g, "\r\n")];
      if (!variants.some(text => createHash("sha256").update(text).digest("hex") === entry.checksum)) mismatches.push(`${entry.migration_name}:checksum`);
      if (!entry.finished && !entry.rolled_back) mismatches.push(`${entry.migration_name}:unfinished`);
    }
    const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('destination','content_media','destination_editorial') ORDER BY table_name")).rows.map(r => r.table_name);
    const counts: Record<string, number> = {};
    for (const table of tables) counts[table] = Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    const indexes = tables.includes("destination_editorial") ? (await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='destination_editorial'")).rows : [];
    const evidence = {
      recordedAt: new Date().toISOString(), mode: "READ_ONLY", identity,
      projectBranchVerified: false, recoveryPointVerified: false,
      ledger, checksumMismatches: mismatches,
      pending: local.filter(name => !ledger.some(r => r.migration_name === name && r.finished && !r.rolled_back)),
      tables, counts, indexes,
      configuration: { cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET), openai: Boolean(process.env.OPENAI_API_KEY), editorialModel: Boolean(process.env.OPENAI_EDITORIAL_MODEL) },
    };
    await client.query("ROLLBACK");
    await mkdir(".cache/editorial-v3-3", { recursive: true });
    // Prisma documents migrate diff as read-only. Pass the same verified datasource,
    // never rely on a separate workspace's environment to select the target.
    const diff = spawnSync(process.execPath, [resolve("../../node_modules/prisma/build/index.js"), "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema", "--script"], { cwd: resolve("../../packages/db"), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", windowsHide: true, timeout: 60000 });
    if (diff.status === 0) {
      await writeFile(".cache/editorial-v3-3/database-schema-diff.sql", diff.stdout);
      console.log("READ_ONLY_PRISMA_SCHEMA_DIFF=RECORDED");
    } else console.log("READ_ONLY_PRISMA_SCHEMA_DIFF=UNVERIFIED (details suppressed)");
    await writeFile(".cache/editorial-v3-3/database-readiness.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { client.release(); }
} catch { console.error("READ_ONLY_DATABASE_AUDIT=FAILED (connection/query details suppressed)"); process.exitCode = 1; }
finally { await pool.end(); }
