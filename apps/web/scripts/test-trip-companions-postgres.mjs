/** TC-01 owns a loopback disposable PostgreSQL; never loads .env or DATABASE_URL. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
const name = `kltn-tc01-${randomUUID()}`, label = "tc01-disposable";
const password = randomUUID(), databaseName = "tc01_test";
let created = false, project;
// Actual, unchanged relevant migration files. Unrelated vector/PostGIS/AI history is excluded.
const migrations = [
  "20261001115741_init_auth", "20261001130000_add_idempotency_record", "20261001143000_add_user_role",
  "20261004070249_add_destination_domain", "20261005021531_add_culture_content_domain",
  "20261005120000_add_favorites", "20261006150000_upgrade_favorite_target_contract",
  "20261008120000_add_rag_document", "20261012150000_admin_content_profiles",
  "20261015000000_us30_trip_save", "20261015160000_us34_trip_favorite",
  "20261017210000_admin_user_management", "20261020044507_destination_soft_delete",
  "20261020170000_trip_manual_completion", "20261028120000_trip_companion_publication",
];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: web, encoding: "utf8", windowsHide: true, shell: false, ...options });
  if (result.error || result.status !== 0) throw new Error("Disposable subprocess failed; connection/output suppressed");
  return result.stdout?.trim();
}
const docker = (...args) => run("docker", args);
try {
  docker("info", "--format", "{{.ServerVersion}}");
  docker("run", "--rm", "-d", "--name", name, "--label", `org.kltn.task=${label}`, "-p", "127.0.0.1::5432",
    "-e", `POSTGRES_DB=${databaseName}`, "-e", `POSTGRES_USER=${databaseName}`, "-e", `POSTGRES_PASSWORD=${password}`, "postgres:16-alpine");
  created = true;
  const deadline = Date.now() + 30_000;
  while (true) {
    try { docker("exec", name, "psql", "-At", "-U", databaseName, "-d", databaseName, "-c", "SELECT 1"); break; }
    catch { if (Date.now() >= deadline) throw new Error("Disposable readiness timed out"); await new Promise(r => setTimeout(r, 300)); }
  }
  const port = docker("port", name, "5432/tcp").match(/^127\.0\.0\.1:(\d+)$/m)?.[1];
  if (!port || docker("exec", name, "psql", "-At", "-U", databaseName, "-d", databaseName, "-c", "SELECT current_database()") !== databaseName) {
    throw new Error("Disposable identity check failed");
  }
  const url = new URL(`postgresql://${databaseName}:${password}@127.0.0.1:${port}/${databaseName}`);
  url.searchParams.set("sslmode", "disable"); url.searchParams.set("application_name", "tc01_disposable");
  const env = { ...process.env, TC01_TEST_DATABASE_URL: url.toString(), TC01_TEST_DISPOSABLE: "OWNED_LOOPBACK_CONTAINER" };
  await mkdir(resolve(root, ".cache"), { recursive: true });
  project = await mkdtemp(resolve(root, ".cache/tc01-migrations-"));
  for (const migration of migrations) await cp(resolve(root, "packages/db/prisma/migrations", migration), resolve(project, "migrations", migration), { recursive: true });
  await cp(resolve(root, "packages/db/prisma/migrations/migration_lock.toml"), resolve(project, "migrations/migration_lock.toml"));
  const config = resolve(project, "prisma.config.ts");
  await writeFile(config, `import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:${JSON.stringify(resolve(root, "packages/db/prisma/schema"))},migrations:{path:${JSON.stringify(resolve(project, "migrations"))}},datasource:{url:process.env.TC01_TEST_DATABASE_URL!}});\n`);
  const prisma = resolve(root, "node_modules/prisma/build/index.js");
  run(process.execPath, [prisma, "migrate", "deploy", "--config", config], { env });
  const status = run(process.execPath, [prisma, "migrate", "status", "--config", config], { env });
  if (!status?.includes("Database schema is up to date")) throw new Error("Scoped migration status is not up to date");
  console.log(`TC01_DISPOSABLE=VERIFIED; PRISMA_MIGRATIONS=${migrations.length}; PENDING=0; NO_DEVELOPMENT_OR_PRODUCTION_ACCESS`);
  const test = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/modules/trip-companions/companion.postgres.integration.vitest.test.ts"], { cwd: web, env, stdio: "inherit", windowsHide: true, shell: false });
  process.exitCode = test.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : "TC01 disposable tests failed"); process.exitCode = 1; }
finally {
  if (created) {
    if (docker("inspect", "--format", '{{ index .Config.Labels "org.kltn.task" }}', name) !== label) throw new Error("Cleanup ownership rejected");
    docker("stop", "-t", "2", name);
    console.log("TC01_OWNED_CONTAINER_CLEANUP=PASS");
  }
  if (project) {
    const checked = resolve(project);
    if (!checked.startsWith(resolve(root, ".cache") + sep) || !checked.split(sep).at(-1)?.startsWith("tc01-migrations-")) throw new Error("Cleanup path rejected");
    await rm(checked, { recursive: true, force: true });
  }
}
