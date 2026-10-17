/** Explicit approved Development fallback. Test cleanup is scoped to random fixture IDs. */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url)), root = resolve(web, "../..");
const source = await readFile(resolve(web, ".env"), "utf8");
const connection = source.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
if (!connection) throw new Error("Development configuration required");
const target = new URL(connection);
if (target.hostname !== "ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech" || target.pathname !== "/neondb") throw new Error("Approved Development endpoint required");
console.log("RBAC_APPROVED_DEVELOPMENT=VERIFIED; RANDOM_FIXTURES_ONLY; NO_SCHEMA_CHANGES");
const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mts", "src/server/authorization/rbac-v2.postgres.integration.vitest.test.ts"], {
  cwd: web, env: { ...process.env, RBAC_TEST_DATABASE_URL: connection, RBAC_TEST_DEVELOPMENT: "APPROVED_OWNED_FIXTURES" }, stdio: "inherit", windowsHide: true,
});
process.exitCode = result.status ?? 1;
