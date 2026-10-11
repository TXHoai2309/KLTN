import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(webRoot, "../..");
const databaseName = "task184_test";
const databaseUser = "task184_test";
const disposableFlag = "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE";
const image = "pgvector/pgvector:0.8.6-pg16";
const ownershipLabel = "org.kltn.task=us19-task184-postgres-regression";
const containerName = `kltn-task184-pgtest-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
let containerCreated = false;
let ownedVolumeNames = [];
let reportDirectory;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? webRoot,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
  console.log(JSON.stringify({ subprocess: command, pid: result.pid, exitCode: result.status, signal: result.signal }));
  if (result.error) throw new Error(`${command} could not run: ${result.error.code ?? "unknown"}`);
  return result;
}

function requireSuccess(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? "unknown exit"}); output suppressed to avoid leaking test configuration.`);
  }
  return result.stdout.trim();
}

function assertTestTarget(connectionString) {
  const target = new URL(connectionString);
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    !localHosts.has(target.hostname) ||
    target.pathname.replace(/^\//u, "") !== databaseName ||
    target.username !== databaseUser ||
    target.searchParams.get("sslmode") !== "disable"
  ) {
    throw new Error("Refusing PostgreSQL test target: expected the isolated local Task184 database.");
  }
}

function docker(...args) {
  return run("docker", args);
}

async function waitUntilReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = docker("exec", containerName, "pg_isready", "-U", databaseUser, "-d", databaseName);
    if (ready.status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  }
  throw new Error("Isolated PostgreSQL did not become ready within 60 seconds.");
}

async function installTask184Schema() {
  const admissionMigrations = await Promise.all([
    "20261001115741_init_auth", "20261001130000_add_idempotency_record", "20261001143000_add_user_role",
  ].map(name => readFile(resolve(repoRoot, `packages/db/prisma/migrations/${name}/migration.sql`), "utf8")));
  const documentMigration = await readFile(
    resolve(repoRoot, "packages/db/prisma/migrations/20261008120000_add_rag_document/migration.sql"),
    "utf8",
  );
  const indexMigration = await readFile(
    resolve(repoRoot, "packages/db/prisma/migrations/20261009120000_add_rag_index_generations/migration.sql"),
    "utf8",
  );
  const jobMigration = await readFile(
    resolve(repoRoot, "packages/db/prisma/migrations/20261010120000_add_rag_index_jobs/migration.sql"),
    "utf8",
  );
  const setupSql = `CREATE EXTENSION vector;\n${admissionMigrations.join("\n")}\n${documentMigration}\n${indexMigration}\n${jobMigration}\n`;
  const result = run(
    "docker",
    [
      "exec",
      "--interactive",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      databaseUser,
      "-d",
      databaseName,
    ],
    { input: setupSql },
  );
  if (result.status !== 0) {
    throw new Error("Could not install the actual RagDocument and Task184/185 migrations into the isolated database.");
  }
}

async function cleanupOwnedContainer() {
  if (!containerCreated) return;
  const ownership = docker(
    "inspect",
    "--format",
    '{{ index .Config.Labels "org.kltn.task" }}',
    containerName,
  );
  if (ownership.status !== 0 || ownership.stdout.trim() !== "us19-task184-postgres-regression") {
    console.error("Container ownership could not be confirmed; leaving it untouched.");
    process.exitCode = 1;
    return;
  }
  const stopped = docker("stop", "--time", "3", containerName);
  if (stopped.status !== 0) {
    console.error("The owned test container could not be stopped automatically.");
    process.exitCode = 1;
    return;
  }
  const remaining = requireSuccess("docker", ["ps", "--all", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"]);
  const existingVolumes = new Set(requireSuccess("docker", ["volume", "ls", "--format", "{{.Name}}"])
    .split(/\r?\n/u).filter(Boolean));
  const remainingVolumes = ownedVolumeNames.filter(name => existingVolumes.has(name));
  if (remaining || remainingVolumes.length) {
    console.error("Owned test container or its anonymous database volume still exists after cleanup.");
    process.exitCode = 1;
  } else console.log(`CLEANUP=PASS: owned disposable container and ${ownedVolumeNames.length} database volume(s) removed.`);
}

async function main() {
  const info = docker("info", "--format", "{{.ServerVersion}}");
  if (info.status !== 0) {
    throw new Error("Docker Engine is unavailable; required PostgreSQL integration was not run.");
  }

  const password = randomUUID();
  const started = docker(
    "run",
    "--rm",
    "--detach",
    "--name",
    containerName,
    "--label",
    ownershipLabel,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    `POSTGRES_DB=${databaseName}`,
    "--env",
    `POSTGRES_USER=${databaseUser}`,
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    image,
  );
  if (started.status !== 0) throw new Error("A uniquely named Task184 PostgreSQL container could not be created; no existing container was changed.");
  containerCreated = true;
  const mounts = JSON.parse(requireSuccess("docker", ["inspect", "--format", "{{json .Mounts}}", containerName]));
  ownedVolumeNames = mounts.filter(mount => mount.Type === "volume").map(mount => mount.Name);

  await waitUntilReady();
  const portMapping = requireSuccess("docker", ["port", containerName, "5432/tcp"]);
  const hostPort = portMapping.match(/^127\.0\.0\.1:(\d+)$/mu)?.[1];
  if (!hostPort) throw new Error("The isolated database did not bind to a loopback-only ephemeral port.");

  const url = new URL(`postgresql://${databaseUser}:${password}@127.0.0.1:${hostPort}/${databaseName}`);
  url.searchParams.set("sslmode", "disable");
  const connectionString = url.toString();
  assertTestTarget(connectionString);

  const actualDatabase = requireSuccess("docker", [
    "exec", containerName, "psql", "-At", "-U", databaseUser, "-d", databaseName, "-c", "SELECT current_database()::text",
  ]);
  if (actualDatabase !== databaseName) {
    throw new Error("Refusing Task184 schema setup: the isolated container returned an unexpected database identity.");
  }

  await installTask184Schema();

  reportDirectory = await mkdtemp(resolve(tmpdir(), "kltn-postgres-report-"));
  const reportPath = resolve(reportDirectory, "results.json");
  // Avoid the nested npm.cmd/cmd.exe lifecycle on Windows. Run the same Vitest
  // CLI/config/suites with the current Node executable and preserve its status.
  const test = spawnSync(process.execPath, [resolve(repoRoot, "node_modules/vitest/vitest.mjs"),
    "run", "--config", "vitest.config.mts",
    "src/modules/rag-index/rag-index-store.postgres.integration.vitest.test.ts",
    "src/modules/rag-index/rag-index-job-store.postgres.integration.vitest.test.ts",
    "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`], {
    cwd: webRoot,
    env: {
      ...process.env,
      US19_TASK184_TEST_DATABASE_URL: connectionString,
      US19_TASK184_TEST_DISPOSABLE: disposableFlag,
      US19_POSTGRES_REQUIRED: "1",
    },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  console.log(JSON.stringify({ subprocess: "node/vitest", pid: test.pid, exitCode: test.status, signal: test.signal }));
  if (test.error) throw new Error(`Vitest could not run: ${test.error.code ?? "unknown"}`);
  if (test.status !== 0) process.exitCode = test.status ?? 1;
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const task185 = report.testResults?.find(suite => suite.name.endsWith("rag-index-job-store.postgres.integration.vitest.test.ts"));
  if (!task185?.assertionResults?.length || report.numPendingTests !== 0 || report.numTodoTests !== 0 || task185.assertionResults.some(testCase => testCase.status !== "passed")) {
    throw new Error("Required Task185 PostgreSQL suite did not fully execute and pass; skipped tests cannot count as PASS.");
  }
  console.log(`POSTGRES_TESTS=${report.numPassedTests}/${report.numTotalTests}; TASK185_TESTS=${task185.assertionResults.length}; SKIPPED=${report.numPendingTests}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Task184 PostgreSQL test failed.");
  process.exitCode = 1;
} finally {
  try { await cleanupOwnedContainer(); }
  finally {
    if (reportDirectory) {
      if (!reportDirectory.startsWith(resolve(tmpdir(), "kltn-postgres-report-"))) {
        throw new Error("Refusing cleanup outside the generated PostgreSQL report directory.");
      }
      await rm(reportDirectory, { recursive: true, force: true });
    }
  }
}
