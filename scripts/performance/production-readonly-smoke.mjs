import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJson, summarize } from "./metrics.mjs";
const [phase, output] = process.argv.slice(2);
if (!["before", "after"].includes(phase) || !output) throw Error("before|after and output required");
const origin = "https://kltn-rho.vercel.app";
const paths = ["/api/destinations", "/", "/explore", "/destinations/cmv97lcrq0016z09ws0o74lqp", "/destinations/cmv9fcwo1000be89w3yxz3mqu", "/destinations/cmvanjc6p000f7w9wyuydna52", "/assistant"];
const observations = [];
for (const path of paths) for (let sample = 0; sample < 3; sample++) {
  const start = performance.now(), r = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(30000) }), ttfbMs = performance.now() - start;
  const body = await r.text(), totalMs = performance.now() - start;
  const json = r.headers.get("content-type")?.includes("application/json") ? JSON.parse(body) : null;
  const row = { path, sample, status: r.status, ttfbMs, totalMs, bytes: Buffer.byteLength(body), ...(json ? { dtoHash: createHash("sha256").update(canonicalJson(json)).digest("hex"), destinationCount: json.data?.items?.length } : {}) };
  observations.push(row);
  if (r.status !== 200 || (json && row.destinationCount !== 3)) throw Error("PRODUCTION_READ_ONLY_SMOKE_FAILED");
  await new Promise(resolve => setTimeout(resolve, 500));
}
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), phase, origin, method: "21 bounded sequential public GETs,3 samples/workload;500ms pause; no cookies, Auth writes, history GET, inference or routing", samplesAreSmall: true, productionWrites: 0, observations, summary: paths.map(path => ({ path, totalMs: summarize(observations.filter(o => o.path === path).map(o => o.totalMs)), ttfbMs: summarize(observations.filter(o => o.path === path).map(o => o.ttfbMs)) })) }, null, 2) + "\n");
console.log(JSON.stringify({ phase, observations: observations.length, errors: 0 }));
