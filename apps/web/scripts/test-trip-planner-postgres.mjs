/** Owns a new loopback-only disposable container. Never reads DATABASE_URL/.env. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
const name = `kltn-us28-test-${randomUUID().slice(0, 12)}`, label = "us28-disposable";
const password = randomUUID(); let created = false;
function run(command, args, input) { const r = spawnSync(command, args, { cwd: web, input, encoding: "utf8", windowsHide: true, shell: false }); if (r.error || r.status !== 0) throw new Error("Disposable subprocess failed; configuration/output suppressed"); return r.stdout.trim(); }
const docker = (...args) => run("docker", args);
try {
  docker("info", "--format", "{{.ServerVersion}}");
  docker("run", "--rm", "-d", "--name", name, "--label", `org.kltn.task=${label}`, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=us28_test", "-e", "POSTGRES_USER=us28_test", "-e", `POSTGRES_PASSWORD=${password}`, "pgvector/pgvector:0.8.6-pg16"); created = true;
  const deadline = Date.now() + 30_000;
  while (true) { try { docker("exec", name, "pg_isready", "-U", "us28_test", "-d", "us28_test"); break; } catch { if (Date.now() >= deadline) throw new Error("Disposable database readiness timeout"); await new Promise(r => setTimeout(r, 300)); } }
  const port = docker("port", name, "5432/tcp").match(/^127\.0\.0\.1:(\d+)$/m)?.[1]; if (!port) throw new Error("Non-loopback disposable target rejected");
  if (docker("exec", name, "psql", "-At", "-U", "us28_test", "-d", "us28_test", "-c", "SELECT current_database()") !== "us28_test") throw new Error("Database identity rejected");
  const migrations = ["20261004070249_add_destination_domain", "20261005021531_add_culture_content_domain", "20261008120000_add_rag_document", "20261012150000_admin_content_profiles"];
  const sql = (await Promise.all(migrations.map(m => readFile(resolve(root, `packages/db/prisma/migrations/${m}/migration.sql`), "utf8")))).join("\n");
  run("docker", ["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "us28_test", "-d", "us28_test"], sql);
  console.log("US28_DISPOSABLE_TARGET=VERIFIED; ACTUAL_RELEVANT_MIGRATIONS=4; NO_NEON_ACCESS");
  const url = new URL(`postgresql://us28_test:${password}@127.0.0.1:${port}/us28_test`); url.searchParams.set("sslmode", "disable");
  const test = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/modules/trip-planner/planner-candidates.postgres.integration.vitest.test.ts"], { cwd: web, env: { ...process.env, US28_TEST_DATABASE_URL: url.toString(), US28_TEST_DISPOSABLE: "OWNED_LOOPBACK_CONTAINER" }, stdio: "inherit", windowsHide: true, shell: false });
  process.exitCode = test.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : "Disposable test failed"); process.exitCode = 1; }
finally { if (created) { if (docker("inspect", "--format", '{{ index .Config.Labels "org.kltn.task" }}', name) !== label) throw new Error("Cleanup ownership rejected"); docker("stop", "-t", "2", name); console.log("US28_OWNED_CONTAINER_CLEANUP=PASS"); } }
