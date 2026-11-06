import { spawn } from "node:child_process";
import { resolve } from "node:path";

// Guest-only production HTTP smoke: malformed input, no cookies and no writes.
const cwd = resolve("apps/web");
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3012"], { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
try {
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server readiness timeout")), 25_000);
    server.on("error", error => { clearTimeout(timer); reject(error); });
    server.on("exit", () => { clearTimeout(timer); reject(new Error("Local server exited")); });
    server.stdout.on("data", chunk => { if (chunk.toString().includes("Ready")) { clearTimeout(timer); done(); } });
  });
  for (const path of ["/api/trip-origins/validate", "/api/trip-origins/search", "/api/trips", "/api/trips/validate", "/api/trips/smoke/journey/preview", "/api/trips/smoke/journey/apply", "/api/ai/planning"]) {
    const response = await fetch(`http://127.0.0.1:3012${path}`, { method: "POST", signal: AbortSignal.timeout(15_000), headers: { origin: "http://127.0.0.1:3012", "content-type": "application/json", "Idempotency-Key": "origin-smoke-unauthenticated" }, body: "{malformed" });
    const data = await response.json();
    const result = { path, status: response.status, cache: response.headers.get("cache-control"), code: data.error?.code };
    console.log(JSON.stringify(result));
    if (result.status !== 401 || result.code !== "UNAUTHENTICATED" || result.cache !== "private, no-store") throw new Error("Guest HTTP contract failed");
  }
} finally {
  server.kill();
}
