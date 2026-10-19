import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
const [envFile, modulePath, output, mode] = process.argv.slice(2);
const token = mode === "production-only" ? undefined : parseEnv(await readFile(envFile, "utf8")).VERCEL_OIDC_TOKEN;
if (mode !== "production-only" && !token) throw Error("PREVIEW_OIDC_REQUIRED");
const productionOrigin = "https://kltn-rho.vercel.app";
const origins = mode === "production-only" ? [productionOrigin] : ["https://kltn-p2o4djrsz-to-xuan-hoai-s-projects.vercel.app", "https://kltn-mdr4di004-to-xuan-hoai-s-projects.vercel.app", productionOrigin];
const { chromium } = createRequire(import.meta.url)(modulePath);
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  for (const origin of origins) {
    const production = origin === productionOrigin;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    await context.route("**/*", route => {
      const req = route.request();
      if (!["GET", "HEAD"].includes(req.method())) return route.abort();
      const headers = { ...req.headers() };
      delete headers["x-vercel-trusted-oidc-idp-token"];
      if (!production && new URL(req.url()).origin === origin) headers["x-vercel-trusted-oidc-idp-token"] = token;
      return route.continue({ headers });
    });
    const page = await context.newPage(), styles = [], tiles = [];
    page.on("response", r => {
      const url = new URL(r.url());
      if (url.origin !== "https://tiles.stadiamaps.com") return;
      const row = { path: url.pathname, status: r.status() };
      if (url.pathname.includes("/styles/")) styles.push(row);
      if (url.pathname.startsWith("/data/openmaptiles/") && url.pathname.endsWith(".pbf")) tiles.push(row);
    });
    const r = await page.goto(origin + "/explore?view=map", { waitUntil: "load", timeout: 30000 });
    try { await page.waitForFunction(() => document.querySelectorAll(".maplibregl-marker").length > 0, undefined, { timeout: 15000 }); } catch {}
    // Markers precede successful style/tile loading. Wait for real responses;
    // zero observed requests is NOT a successful authorization check.
    const start = Date.now();
    while (!tiles.length && Date.now() - start < 15000) await page.waitForTimeout(250);
    await page.waitForTimeout(2500);
    const markers = await page.locator(".maplibregl-marker").count();
    const tileGate = tiles.length > 0 && tiles.every(t => t.status === 200) ? "PASS" : "FAIL";
    observations.push({ origin, scope: production ? "PRODUCTION_READ_ONLY_CONTROL" : "PREVIEW", status: r.status(), markers, styles, tiles, tileGate, expectedMarkers: production ? 3 : 9 });
    await context.close();
  }
} finally { await browser.close(); }
const preview = observations.filter(o => o.scope === "PREVIEW");
const report = { checkedAt: new Date().toISOString(), method: "Actual isolated Guest browser GETs. Native Origin/Referer untouched; exact-origin OIDC only for Preview. Wait for tile responses +2.5s. No origin spoofing, provider key, application write or paid routing.", productionWrites: 0, observations, previewGate: preview.length ? preview.every(o => o.tileGate === "PASS") ? "PASS" : "FAIL" : "NOT_RUN_OWNER_SINGLE_DOMAIN", productionControlGate: observations.find(o => o.scope === "PRODUCTION_READ_ONLY_CONTROL")?.tileGate ?? "NOT_RUN" };
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (report.previewGate === "FAIL" || report.productionControlGate !== "PASS") process.exitCode = 1;
