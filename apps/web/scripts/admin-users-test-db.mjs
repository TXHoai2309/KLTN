/** Approved Development fallback: a fresh isolated database, never the app schema. */
import { createRequire } from "node:module";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), { Client } = require("pg");
const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
export const markerPath = resolve(root, ".cms-test-db.json");
export async function developmentConnection() {
  const source = await readFile(resolve(web, ".env"), "utf8");
  const connection = source.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
  if (!connection) throw new Error("Development configuration required");
  const url = new URL(connection);
  if (url.hostname !== "ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") throw new Error("Development endpoint required");
  return connection;
}
export async function verifyDevelopment(client) {
  await client.query("SET search_path TO public");
  const row = (await client.query(`SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint`)).rows[0];
  if (row.database !== "neondb" || row.project !== "summer-unit-95870477" || row.branch !== "br-aged-hat-b3o6hg9p" || row.endpoint !== "ep-purple-pond-b3xujb8o") throw new Error("Development identity mismatch");
  console.log("VERIFIED_DEVELOPMENT_IDENTITY", JSON.stringify(row));
}
export async function testConnection() {
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (!/^cms_test_[a-f0-9]{24}$/.test(marker.database)) throw new Error("Owned test database required");
  const url = new URL(await developmentConnection());
  url.pathname = "/" + marker.database;
  return { url: url.toString(), database: marker.database };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const connectionString = await developmentConnection(), client = new Client({ connectionString });
  await client.connect();
  try {
    await verifyDevelopment(client);
    const mode = process.argv[2] ?? "setup";
    if (mode === "setup") {
      const database = `cms_test_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
      const extensions = (await client.query("SELECT extname FROM pg_extension WHERE extname IN ('postgis','vector')")).rows;
      if (extensions.length !== 2) throw new Error("Existing foundation extensions required");
      await client.query(`CREATE DATABASE "${database}"`);
      await writeFile(markerPath, JSON.stringify({ database }));
      const url = new URL(connectionString); url.pathname = "/" + database;
      for (let run = 1; run <= 2; run++) {
        const result = spawnSync(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: resolve(root, "packages/db"), env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", windowsHide: true });
        if (result.status !== 0) { console.error(result.stdout, result.stderr); throw new Error("Isolated migration deploy failed"); }
        console.log(`ISOLATED_MIGRATE_DEPLOY_${run}=PASS`);
      }
      console.log("OWNED_TEST_DATABASE_READY", database);
    } else if (mode === "test") {
      const target = await testConnection();
      const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/modules/admin-users/admin-users.postgres.integration.vitest.test.ts"], { cwd: web, env: { ...process.env, CMS_TEST_DATABASE_URL: target.url, CMS_TEST_DATABASE: target.database }, stdio: "inherit", windowsHide: true });
      process.exitCode = result.status ?? 1;
    } else if (mode === "cleanup") {
      const target = await testConnection();
      try { await client.query(`DROP DATABASE "${target.database}"`); }
      catch (error) {
        if (error.code !== "55006") throw error;
        // PgBouncer can retain idle backends after all test clients disconnect.
        // Only the exact random owned database, never neondb, can reach here.
        await client.query(`DROP DATABASE "${target.database}" WITH (FORCE)`);
      }
      await unlink(markerPath);
      console.log("OWNED_TEST_DATABASE_CLEANUP=PASS");
    } else throw new Error("Unsupported test operation");
  } finally { await client.end(); }
}
