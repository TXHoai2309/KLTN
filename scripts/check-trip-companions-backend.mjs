/** Strict source typecheck independent of concurrently generated Next/FE build artifacts. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "apps/web"), src = path.join(web, "src");
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const entries = [
  path.join(root, "node_modules/next/types/global.d.ts"),
  ...walk(path.join(src, "modules/trip-companions")).filter(file => file.endsWith(".ts") && !path.basename(file).includes("client")),
  ...walk(path.join(src, "app/api/trip-companions")).filter(file => file.endsWith("route.ts")),
  path.join(src, "modules/trip-read/trip-management-service.ts"),
  path.join(src, "modules/trip-edit/apply-edit.ts"), path.join(src, "services.ts"),
];
const output = path.join(root, ".cache/trip-companions-be"); fs.mkdirSync(output, { recursive: true });
const config = path.join(output, "tsconfig.backend.json");
fs.writeFileSync(config, JSON.stringify({ extends: path.join(web, "tsconfig.json"), compilerOptions: { incremental: false, plugins: [], paths: { "@/*": [path.join(src, "*")], "@KLTN/ui/*": [path.join(root, "packages/ui/src/*")] } }, files: entries, include: [] }, null, 2));
const result = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--project", config, "--noEmit"], { cwd: root, stdio: "inherit", windowsHide: true });
if (result.status === 0) console.log(`COMPANION_STRICT_BACKEND_TYPES=PASS; ENTRY_FILES=${entries.length}; TARGET=ES2017; NO_NEXT_GENERATED_ARTIFACTS`);
process.exitCode = result.status ?? 1;
