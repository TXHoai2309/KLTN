import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [originInput = "http://localhost:3010", output = ".cache/api-latency/latest.json", budgetInput = "1000"] = process.argv.slice(2);
const origin = new URL(originInput);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/") {
  throw Error("Explicit loopback origin required");
}
const budget = Number(budgetInput);
if (!Number.isFinite(budget) || budget <= 0) throw Error("Positive millisecond budget required");
const base = origin.origin;
const bootstrap = await fetch(`${base}/api/ai/session`, {
  method: "POST", headers: { origin: base }, signal: AbortSignal.timeout(20000), redirect: "error",
});
assert.equal(bootstrap.status, 200, "Guest bootstrap must succeed");
const cookie = bootstrap.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "Expected a new disposable Guest cookie");
const samples = [];
try {
  for (let i = 0; i < 4; i++) {
    const start = performance.now();
    const response = await fetch(`${base}/api/ai/conversations`, {
      headers: { cookie }, signal: AbortSignal.timeout(20000), redirect: "error",
    });
    const body = await response.json();
    samples.push({ sample: i + 1, status: response.status, ms: Math.round(performance.now() - start) });
    assert.equal(response.status, 200);
    assert.deepEqual(body.data, { items: [], nextCursor: null, hasMore: false });
  }
} finally {
  const response = await fetch(`${base}/api/ai/session`, {
    method: "DELETE", headers: { cookie, origin: base }, signal: AbortSignal.timeout(20000), redirect: "error",
  });
  assert.equal(response.status, 200, "Disposable Guest must be revoked");
}
const report = { measuredAt: new Date().toISOString(), scope: "four local empty Guest history reads; first sample includes route warmup; no model calls; Guest revoked", budgetMs: budget, samples };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
assert.ok(samples.slice(1).every(sample => sample.ms < budget), `Warm empty history exceeded ${budget}ms`);
