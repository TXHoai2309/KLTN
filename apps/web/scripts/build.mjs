import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const env = { ...process.env };

// Windows builds exhausted native memory with the default CPU-wide loader pool.
// Set the limit here, after Turbo's strict environment filtering has run.
if (process.platform === "win32") env.RAYON_NUM_THREADS ||= "2";

const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build", ...process.argv.slice(2)],
  { env, stdio: "inherit", windowsHide: true },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
