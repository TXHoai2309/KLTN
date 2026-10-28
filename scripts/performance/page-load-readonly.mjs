import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const [originInput = "http://localhost:3098", output, check] = process.argv.slice(2);
const origin = new URL(originInput);
assert(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Local benchmark only");
assert(output, "Supply an evidence JSON path");
const assets = new Map();
async function asset(path) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin);
  assert(url.pathname.startsWith("/_next/static/"));
  if (!assets.has(url.pathname)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200);
    assets.set(url.pathname, Buffer.from(await response.arrayBuffer()));
  }
  return assets.get(url.pathname);
}
const observations = [];
for (const route of ["/", "/explore", "/login"]) {
  const samples = [];
  let html = "";
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200);
    const headersMs = performance.now() - started;
    html = "";
    let heroMs = null;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      html += decoder.decode(chunk, { stream: true });
      if (route === "/" && heroMs === null && html.includes('id="home-title"')) heroMs = performance.now() - started;
    }
    html += decoder.decode();
    samples.push({ headersMs, heroMs, completeMs: performance.now() - started });
  }
  const scripts = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]))];
  const fonts = [...new Set([...html.matchAll(/<link\b[^>]*>/g)].filter(([tag]) => /\brel="preload"/.test(tag) && /\bas="font"/.test(tag)).map(([tag]) => /\bhref="([^"]+)"/.exec(tag)?.[1]).filter(Boolean))];
  let scriptBytes = 0, scriptGzipBytes = 0, fontPreloadBytes = 0;
  let assistantPanelInInitialScripts = false;
  for (const path of scripts) {
    const body = await asset(path);
    scriptBytes += body.length;
    scriptGzipBytes += gzipSync(body).length;
    // Use a panel-only marker, excluding the small Suspense loading header.
    assistantPanelInInitialScripts ||= body.includes("destination-assistant-backdrop");
  }
  for (const path of fonts) fontPreloadBytes += (await asset(path)).length;
  observations.push({ route, samples, scriptCount: scripts.length, scriptBytes, scriptGzipBytes, assistantPanelInInitialScripts, fontPreloadCount: fonts.length, fontPreloadBytes });
}
const report = { measuredAt: new Date().toISOString(), conditions: "Local production build, anonymous HTTP GETs, three sequential samples per route; no browser CPU/network throttling. Gzip bytes computed per emitted script; not observed network traffic or LCP/INP. Fonts count only HTML preloads. First sample retains connection warm-up.", observations };
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (check === "--assert") {
  for (const row of observations) assert.equal(row.assistantPanelInInitialScripts, false, `${row.route} eagerly includes the unopened assistant panel`);
}
