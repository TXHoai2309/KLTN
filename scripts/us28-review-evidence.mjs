import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
const env = parseEnv(await readFile("apps/web/.env", "utf8"));
const secretValues = Object.entries(env).filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|CLOUDINARY_URL/.test(name) && value?.length >= 12).map(([, value]) => value);
for (const [name, value] of Object.entries(env)) if (/DATABASE_URL/.test(name)) try {
  const password = decodeURIComponent(new URL(value).password); if (password.length >= 12) secretValues.push(password);
} catch { /* Missing optional inputs are not printed. */ }
const paths = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map(line => line.slice(3));
const leaks = [];
for (const path of paths) {
  if (/\.(png|webp)$/i.test(path)) continue;
  const content = await readFile(path, "utf8");
  if (secretValues.some(value => content.includes(value))) leaks.push(path);
}
if (leaks.length) { console.error(JSON.stringify({ status: "SECRET_SCAN_FAILED", paths: leaks })); process.exitCode = 1; }
else console.log(JSON.stringify({ status: "SECRET_SCAN_PASS", files: paths.length, valuesDisclosed: false }));
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
const logs = {};
for (const [name, path] of Object.entries({ baselineRed: "before-tests.txt", focused: "focused-tests-final.txt", vitest: "full-vitest-final.txt", legacy: "legacy-tests.txt", build: "build-final-private.txt", typecheck: "typecheck-final-private.txt" })) {
  const bytes = await readFile(".cache/us28-production-registry/" + path);
  const text = bytes.toString("utf8").replace(/\u001b\[[0-9;]*m/g, "");
  logs[name] = { sha256: createHash("sha256").update(bytes).digest("hex"),
    summary: name === "legacy" ? { passed: [...text.matchAll(/^# pass (\d+)/gm)].reduce((sum, match) => sum + Number(match[1]), 0), failed: [...text.matchAll(/^# fail (\d+)/gm)].reduce((sum, match) => sum + Number(match[1]), 0) }
      : name === "build" ? { compiled: text.includes("Compiled successfully"), typecheck: text.includes("Finished TypeScript"), staticGeneration: text.includes("45/45") }
      : name === "typecheck" ? { errorDiagnostics: /error TS\d+/.test(text) }
      : text.split(/\r?\n/).filter(line => /^\s*(Test Files|Tests|Duration)\s/.test(line)) };
}
await writeFile("docs/implementation/us28-production-registry-evidence/test-results.json", JSON.stringify({ measuredAt: new Date().toISOString(), logs,
  secretScan: { passed: leaks.length === 0, valuesDisclosed: false }, diffCheck: "PASS",
  rawLogLocation: "Ignored .cache/us28-production-registry on the owner workstation; only safe summaries and digests are committed."
}, null, 2) + "\n");
