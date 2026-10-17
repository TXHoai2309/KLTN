/** Creates a labelled loopback-only database. Never reads .env or DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
const name = `kltn-rbac-v2-${randomUUID().slice(0, 12)}`, label = "rbac-v2-disposable";
const password = randomUUID();
let created = false;
function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: web, input, encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error("Disposable subprocess failed; output suppressed to protect connection details");
  return result.stdout.trim();
}
const docker = (...args) => run("docker", args);
try {
  docker("info", "--format", "{{.ServerVersion}}");
  docker("run", "--rm", "-d", "--name", name, "--label", `org.kltn.task=${label}`, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=rbac_v2_test", "-e", "POSTGRES_USER=rbac_v2_test", "-e", `POSTGRES_PASSWORD=${password}`, "pgvector/pgvector:0.8.6-pg16");
  created = true;
  const deadline = Date.now() + 30_000;
  while (true) {
    try { docker("exec", name, "pg_isready", "-U", "rbac_v2_test", "-d", "rbac_v2_test"); break; }
    catch { if (Date.now() >= deadline) throw new Error("Disposable readiness timeout"); await new Promise(r => setTimeout(r, 300)); }
  }
  const port = docker("port", name, "5432/tcp").match(/^127\.0\.0\.1:(\d+)$/m)?.[1];
  if (!port) throw new Error("Loopback target required");
  const migrationRoot = resolve(root, "packages/db/prisma/migrations");
  // PostGIS is unrelated to these tests and absent from the pgvector image.
  const migrations = (await readdir(migrationRoot, { withFileTypes: true })).filter(d => d.isDirectory() && d.name !== "20261001120226_enable_postgis_pgvector").map(d => d.name).sort();
  const sql = "CREATE EXTENSION vector;\n" + (await Promise.all(migrations.map(m => readFile(resolve(migrationRoot, m, "migration.sql"), "utf8")))).join("\n");
  run("docker", ["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "rbac_v2_test", "-d", "rbac_v2_test"], sql);
  console.log(`RBAC_DISPOSABLE=VERIFIED; ACTUAL_MIGRATION_FILES=${migrations.length}; NO_NEON_ACCESS`);
  const connection = new URL(`postgresql://rbac_v2_test:${password}@127.0.0.1:${port}/rbac_v2_test`);
  connection.searchParams.set("sslmode", "disable");
  const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/server/authorization/rbac-v2.postgres.integration.vitest.test.ts"], {
    cwd: web, env: { ...process.env, RBAC_TEST_DATABASE_URL: connection.toString(), RBAC_TEST_DISPOSABLE: "OWNED_LOOPBACK_CONTAINER" }, stdio: "inherit", windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (created) {
    if (docker("inspect", "--format", '{{ index .Config.Labels "org.kltn.task" }}', name) !== label) throw new Error("Cleanup ownership rejected");
    // --rm also removes the owned anonymous PostgreSQL data volume.
    docker("stop", "-t", "2", name);
    console.log("RBAC_OWNED_CONTAINER_CLEANUP=PASS");
  }
}
