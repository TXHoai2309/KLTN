import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dist = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const target = new URL("../public/maplibre/", import.meta.url);
await mkdir(target, { recursive: true });
// v6's module worker imports a sibling shared module. Next rewrites application
// chunk paths; serve both official npm assets together from the same origin.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dist, file), new URL(file, target));
}
