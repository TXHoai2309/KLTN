// Existing migration SQL, isolated local container, fake Cloudinary only. Never reads .env.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const web = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(web, "../..");
const container = `kltn-images-test-${randomUUID().slice(0, 16)}`;
const label = "destination-cloudinary-v3-2-disposable";
let created = false;
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: web, encoding: "utf8", windowsHide: true, shell: false, ...options });
  if (result.error || result.status !== 0) throw Error(`Disposable test subprocess ${cmd} failed; configuration output suppressed.`);
  return result.stdout?.trim();
}
try {
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const password = randomUUID();
  run("docker", ["run", "--rm", "--detach", "--name", container, "--label", `org.kltn.task=${label}`, "--publish", "127.0.0.1::5432",
    "--env", "POSTGRES_USER=task184_test", "--env", "POSTGRES_DB=task184_test", "--env", `POSTGRES_PASSWORD=${password}`, "pgvector/pgvector:0.8.6-pg16"]);
  created = true;
  for (let i = 0; i < 60; i++) {
    const check = spawnSync("docker", ["exec", container, "pg_isready", "-U", "task184_test"], { windowsHide: true, encoding: "utf8" });
    if (check.status === 0) break;
    if (i === 59) throw Error("Disposable PostgreSQL not ready.");
    await new Promise(r => setTimeout(r, 500));
  }
  const database = run("docker", ["exec", container, "psql", "-At", "-U", "task184_test", "-d", "task184_test", "-c", "SELECT current_database()"]);
  if (database !== "task184_test") throw Error("Refusing unknown database.");
  const migrationRoot = resolve(root, "packages/db/prisma/migrations");
  const names = (await readdir(migrationRoot, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  // No domain schema uses PostGIS. This pgvector test image does not ship that optional extension.
  const sql = ["CREATE EXTENSION vector;"];
  const editorialMigration = "20261014120000_add_destination_editorial";
  for (const name of names.filter(n => n !== "20261001120226_enable_postgis_pgvector" && n !== editorialMigration)) sql.push(await readFile(resolve(migrationRoot, name, "migration.sql"), "utf8"));
  run("docker", ["exec", "--interactive", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "task184_test", "-d", "task184_test"], { input: sql.join("\n") });
  const query = sql => run("docker", ["exec", "--interactive", container, "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "task184_test", "-d", "task184_test"], { input: sql });
  query(`INSERT INTO destination (id,name,description,area,category,latitude,longitude,"updatedAt") VALUES ('migration-preservation-fixture','TEST preservation','Fixture only','area','category',23,105,CURRENT_TIMESTAMP);
    INSERT INTO content_media (id,"destinationId",url,alt) VALUES ('migration-preservation-media','migration-preservation-fixture','https://example.org/test.jpg','TEST preservation');`);
  const snapshot = () => query(`SELECT md5(string_agg(row_to_json(d)::text,'' ORDER BY id)) FROM destination d; SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY id)) FROM content_media m;`);
  const before = snapshot();
  const additive = await readFile(resolve(migrationRoot, editorialMigration, "migration.sql"), "utf8");
  assert(!/(?:^|;)\s*(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/i.test(additive.replace(/--[^\n]*/g,"")), "Editorial migration must remain create-only");
  query(additive);
  assert.equal(snapshot(), before, "Existing Destination and media rows changed during additive migration");
  assert.equal(query(`SELECT count(*) FROM pg_constraint WHERE conrelid='destination_editorial'::regclass AND contype IN ('p','f','c');`), "3");
  assert.equal(query(`SELECT count(*) FROM pg_indexes WHERE tablename='destination_editorial' AND indexname='destination_editorial_pkey';`), "1");
  query(`DO $$ BEGIN
    BEGIN INSERT INTO destination_editorial ("destinationId","updatedAt","updatedBy") VALUES ('foreign-fixture',CURRENT_TIMESTAMP,'test'); RAISE EXCEPTION 'FK accepted orphan'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    INSERT INTO destination_editorial ("destinationId","updatedAt","updatedBy") VALUES ('migration-preservation-fixture',CURRENT_TIMESTAMP,'test');
    BEGIN INSERT INTO destination_editorial ("destinationId","updatedAt","updatedBy") VALUES ('migration-preservation-fixture',CURRENT_TIMESTAMP,'test'); RAISE EXCEPTION 'PK accepted duplicate'; EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN UPDATE destination_editorial SET "draftRevision"=-1; RAISE EXCEPTION 'CHECK accepted negative revision'; EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN DELETE FROM destination WHERE id='migration-preservation-fixture'; RAISE EXCEPTION 'FK allowed parent deletion'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  END $$;`);
  assert.equal(snapshot(), before);
  console.log("EDITORIAL_ADDITIVE_MIGRATION_INTEGRITY=PASS (old rows identical; PK/FK/CHECK/index enforced)");
  const port = run("docker", ["port", container, "5432/tcp"]).match(/^127\.0\.0\.1:(\d+)$/m)?.[1];
  if (!port) throw Error("Refusing non-loopback test target.");
  const env = { ...process.env, US19_TASK184_TEST_DATABASE_URL: `postgresql://task184_test:${password}@127.0.0.1:${port}/task184_test?sslmode=disable`,
    US19_TASK184_TEST_DISPOSABLE: "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE" };
  const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts",
    "src/modules/destination/destination-images.postgres.integration.vitest.test.ts", "src/modules/destination/destination-v3.postgres.integration.vitest.test.ts", "src/modules/destination-editorial/editorial.postgres.integration.vitest.test.ts"], { cwd: web, env, stdio: "inherit", windowsHide: true, shell: false });
  if (result.error || result.status !== 0) process.exitCode = result.status || 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (created) {
    const owner = run("docker", ["inspect", "--format", '{{ index .Config.Labels "org.kltn.task" }}', container]);
    if (owner !== label) throw Error("Refusing cleanup of unowned container.");
    run("docker", ["stop", "--time", "3", container]);
    console.log("DISPOSABLE_CONTAINER_CLEANUP=PASS");
  }
}
