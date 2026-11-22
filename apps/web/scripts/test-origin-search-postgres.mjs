/** Owns a new loopback container; never loads DATABASE_URL or project .env. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
const name = `kltn-origin02-${randomUUID()}`, label = "origin02-disposable";
const password = randomUUID(), databaseName = "origin02_test";
let created = false, project;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: web, encoding: "utf8", windowsHide: true, shell: false, ...options });
  if (result.error || result.status !== 0) throw new Error("Disposable subprocess failed; connection/output suppressed");
  return result.stdout?.trim();
}
const docker = (...args) => run("docker", args);
try {
  docker("info", "--format", "{{.ServerVersion}}");
  docker("run", "--rm", "-d", "--name", name, "--label", `org.kltn.task=${label}`, "-p", "127.0.0.1::5432", "-e", `POSTGRES_DB=${databaseName}`, "-e", `POSTGRES_USER=${databaseName}`, "-e", `POSTGRES_PASSWORD=${password}`, "postgres:16-alpine");
  created = true;
  const deadline = Date.now() + 30_000;
  while (true) {
    try { docker("exec", name, "psql", "-At", "-U", databaseName, "-d", databaseName, "-c", "SELECT 1"); break; }
    catch { if (Date.now() >= deadline) throw new Error("Disposable readiness timed out"); await new Promise(done => setTimeout(done, 300)); }
  }
  const port = docker("port", name, "5432/tcp").match(/^127\.0\.0\.1:(\d+)$/m)?.[1];
  if (!port || docker("exec", name, "psql", "-At", "-U", databaseName, "-d", databaseName, "-c", "SELECT current_database()") !== databaseName) throw new Error("Disposable identity rejected");
  const url = new URL(`postgresql://${databaseName}:${password}@127.0.0.1:${port}/${databaseName}`);
  url.searchParams.set("sslmode", "disable");
  const env = { ...process.env, ORIGIN_SEARCH_TEST_DATABASE_URL: url.toString(), ORIGIN_SEARCH_TEST_DISPOSABLE: "OWNED_LOOPBACK_CONTAINER" };
  await mkdir(resolve(root, ".cache"), { recursive: true });
  project = await mkdtemp(resolve(root, ".cache/origin02-migrations-"));
  const migration = "20261104110000_origin_search";
  await cp(resolve(root, "packages/db/prisma/migrations", migration), resolve(project, "migrations", migration), { recursive: true });
  await cp(resolve(root, "packages/db/prisma/migrations/migration_lock.toml"), resolve(project, "migrations/migration_lock.toml"));
  const config = resolve(project, "prisma.config.ts");
  await writeFile(config, `import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:${JSON.stringify(resolve(root, "packages/db/prisma/schema"))},migrations:{path:${JSON.stringify(resolve(project, "migrations"))}},datasource:{url:process.env.ORIGIN_SEARCH_TEST_DATABASE_URL!}});\n`);
  const prisma = resolve(root, "node_modules/prisma/build/index.js");
  run(process.execPath, [prisma, "migrate", "deploy", "--config", config], { env });
  if (!run(process.execPath, [prisma, "migrate", "status", "--config", config], { env })?.includes("Database schema is up to date")) throw new Error("Scoped migration status rejected");
  console.log("ORIGIN02_DISPOSABLE=VERIFIED; SCOPED_MIGRATIONS=1; PENDING=0; NO_SHARED_DATABASE_ACCESS");
  const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/modules/trip-origin/origin-search.postgres.integration.vitest.test.ts"], { cwd: web, env, windowsHide: true, shell: false, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : "Disposable test failed"); process.exitCode = 1; }
finally {
  if (created) {
    if (docker("inspect", "--format", '{{ index .Config.Labels "org.kltn.task" }}', name) !== label) throw new Error("Cleanup ownership rejected");
    docker("stop", "-t", "2", name);
    console.log("ORIGIN02_OWNED_CONTAINER_CLEANUP=PASS");
  }
  if (project) {
    const checked = resolve(project);
    if (!checked.startsWith(resolve(root, ".cache") + sep) || !checked.split(sep).at(-1)?.startsWith("origin02-migrations-")) throw new Error("Cleanup path rejected");
    await rm(checked, { recursive: true, force: true });
  }
}
