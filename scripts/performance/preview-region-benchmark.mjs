import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { safeOrigin, summarize, canonicalJson } from "./metrics.mjs";

const [beforeInput, afterInput, envFile, output] = process.argv.slice(2);
const origins = [safeOrigin(beforeInput), safeOrigin(afterInput)];
if (origins.some(o => !/^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/.test(o))) throw Error("EXACT_PREVIEW_ORIGINS_REQUIRED");
const env = parseEnv(await readFile(envFile, "utf8"));
if (!env.VERCEL_OIDC_TOKEN) throw Error("LOCAL_DEVELOPMENT_OIDC_REQUIRED");
const headers = { "x-vercel-trusted-oidc-idp-token": env.VERCEL_OIDC_TOKEN };
const observations = [];
const report = { measuredAt: new Date().toISOString(), origins, method: "30 observations per variant/workload; alternating order; sequential; 750ms pause after each request; GET only; no paid model/routing calls", environment: "Preview; shared Development cohort, not Production", coldStart: "NOT_MEASURED: first observed request is recorded, compute idle not forced", functionDuration: "NOT_MEASURED", neonRoundtrip: "NOT_MEASURED", prismaDuration: "NOT_MEASURED", observations, summary: [] };
const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
const paths = ["/api/destinations", "/api/destinations?q=" + encodeURIComponent("Đồng Văn"), "/destinations/cmv97lcrq0016z09ws0o74lqp", "/"];
let errorCount = 0;
for (const path of paths) {
  for (let sample = 0; sample < 30; sample++) {
    for (const variant of sample % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now();
      const r = await fetch(origins[variant] + path, { headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
      const ttfbMs = performance.now() - start;
      const body = await r.text(), totalMs = performance.now() - start;
      const isJson = r.headers.get("content-type")?.includes("application/json");
      const placeholder = body.includes("instant-preview-site.vercel.app");
      const row = { variant: variant ? "sin1" : "iad1", path, sample, firstObserved: sample === 0, status: r.status, ttfbMs, totalMs, bodyBytes: Buffer.byteLength(body), cache: r.headers.get("x-vercel-cache"), contentType: r.headers.get("content-type"), placeholder, ...(isJson ? { dtoSha256: createHash("sha256").update(canonicalJson(JSON.parse(body))).digest("hex") } : {}) };
      observations.push(row);
      if (r.status !== 200 || placeholder) errorCount++;
      await save();
      if (errorCount >= 2) throw Error("STOPPED_AFTER_TWO_UNEXPECTED_RESPONSES");
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    if (sample % 5 === 4) console.log(JSON.stringify({ path, completedEachVariant: sample + 1, errorCount }));
  }
}
for (const path of paths) {
  const variants = ["iad1", "sin1"].map(variant => {
    const rows = observations.filter(row => row.path === path && row.variant === variant);
    return { variant, ttfbMs: summarize(rows.map(r => r.ttfbMs)), totalMs: summarize(rows.map(r => r.totalMs)), errors: rows.filter(r => r.status !== 200 || r.placeholder).length, dtoHashes: [...new Set(rows.map(r => r.dtoSha256).filter(Boolean))] };
  });
  report.summary.push({ path, variants, dtoEquality: path.startsWith("/api/") ? variants[0].dtoHashes.length === 1 && variants[1].dtoHashes.length === 1 && variants[0].dtoHashes[0] === variants[1].dtoHashes[0] : "NOT_APPLICABLE_HTML_BUILDS_DIFFER", improvementP50Percent: (variants[0].totalMs.p50 - variants[1].totalMs.p50) / variants[0].totalMs.p50 * 100 });
}
report.completedAt = new Date().toISOString();
await save();
console.log(JSON.stringify({ observations: observations.length, errors: errorCount, summary: report.summary }));
