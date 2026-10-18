import { writeFile, mkdir } from "node:fs/promises";
import { safeOrigin, sampleCount, summarize } from "./metrics.mjs";

const [originInput = "https://kltn-rho.vercel.app", output = "docs/performance/evidence/http-production-before.json", samplesInput] = process.argv.slice(2);
const origin = safeOrigin(originInput), samples = sampleCount(samplesInput);
const list = await fetch(`${origin}/api/destinations`, { signal: AbortSignal.timeout(20000) });
const data = await list.json();
const ids = (data.data?.items ?? []).map(d => d.id).filter(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)).slice(0, 3);
const routes = ["/", "/explore", "/explore?view=map", ...ids.map(id => `/destinations/${id}`), "/login", "/favorites", "/trips/new", "/trips", "/admin/destinations", "/admin/rag", "/assistant", "/api/health", "/api/destinations", "/api/ai/conversations", "/api/trips", "/api/favorites", "/api/admin/destinations"];
const observations = [];
for (const route of routes) {
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const response = await fetch(origin + route, { redirect: "manual", signal: AbortSignal.timeout(20000) });
      const headersMs = performance.now() - start;
      const body = await response.arrayBuffer();
      observations.push({ route, sample: i + 1, cacheCondition: i ? "repeat-client-connection" : "first-observed-not-proven-cold", status: response.status, headersMs: Math.round(headersMs), totalMs: Math.round(performance.now() - start), decodedBytes: body.byteLength, contentLength: Number(response.headers.get("content-length")) || null, contentEncoding: response.headers.get("content-encoding"), cacheControl: response.headers.get("cache-control"), vercelCache: response.headers.get("x-vercel-cache"), serverTiming: response.headers.get("server-timing") });
    } catch { observations.push({ route, sample: i + 1, status: null, failure: "TRANSPORT_OR_DEADLINE", totalMs: Math.round(performance.now() - start) }); }
    await new Promise(r => setTimeout(r, 500));
  }
}
const report = { measuredAt: new Date().toISOString(), origin, role: "GUEST_NO_COOKIES", method: "sequential GET only; 500ms pause; redirects not followed; 20s deadline; first request not a cold function guarantee", percentileMethod: "nearest-rank; n<=5 p95 is sample maximum, NOT production population p95", destinationCount: ids.length, discoveryRequests: 1, observations, summary: routes.map(route => { const rows = observations.filter(r => r.route === route); return { route, ttfbMs: summarize(rows.map(r => r.headersMs).filter(Number.isFinite)), totalMs: summarize(rows.map(r => r.totalMs)), statuses: rows.map(r => r.status), serverErrorRate: rows.filter(r => r.status === null || r.status >= 500).length / rows.length }; }) };
await mkdir(new URL(".", new URL(output, `file://${process.cwd().replaceAll("\\", "/")}/`)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, samples: observations.length, serverErrors: observations.filter(r => r.status === null || r.status >= 500).length, slowest: report.summary.sort((a,b) => b.totalMs.p50-a.totalMs.p50).slice(0,6) }, null, 2));
