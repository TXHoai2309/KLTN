import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { dirname, resolve } from "node:path";
import { safeOrigin, resourceKind, safeResource } from "./metrics.mjs";

const [originInput = "https://kltn-rho.vercel.app", output = "docs/performance/evidence/browser-production-before.json", modulePath = "playwright", mode = "core", previewEnvFile] = process.argv.slice(2);
const { chromium } = createRequire(import.meta.url)(modulePath);
const origin = safeOrigin(originInput);
if (previewEnvFile && !/^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/.test(origin)) throw Error("OIDC is restricted to exact Preview origins");
const oidc = previewEnvFile ? parseEnv(await readFile(previewEnvFile, "utf8")).VERCEL_OIDC_TOKEN : undefined;
if (previewEnvFile && !oidc) throw Error("Preview OIDC required");
const discovery = await fetch(origin + "/api/destinations", { headers: oidc ? { "x-vercel-trusted-oidc-idp-token": oidc } : {}, redirect: "error", signal: AbortSignal.timeout(20000) });
if (!discovery.ok || !discovery.headers.get("content-type")?.includes("application/json")) throw Error("Application JSON discovery required");
const first = (await discovery.json()).data?.items?.[0]?.id;
const routes = mode === "home" ? ["/"] : ["/", "/explore", "/explore?view=map", ...(first && /^[a-zA-Z0-9_-]{1,128}$/.test(first) ? [`/destinations/${first}`] : []), "/assistant"];
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  for (const width of mode === "home" ? [390, 768, 1440] : [390, 1440]) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width === 390, hasTouch: width === 390, reducedMotion: "reduce", serviceWorkers: "block" });
      // No session creation, model, route calculation or business writes. This
      // independent browser has no owner credentials or existing profile.
      const blocked = [];
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      // Playwright context.route disables HTTP cache. Intercept using CDP Fetch
      // instead so the warm sample can actually reuse cached resources.
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
      cdp.on("Fetch.requestPaused", async e => {
        try {
          if (!["GET", "HEAD"].includes(e.request.method)) {
            blocked.push({method:e.request.method,...safeResource(e.request.url)});
            await cdp.send("Fetch.failRequest",{requestId:e.requestId,errorReason:"BlockedByClient"});
          } else {
            // Scope protection credentials to the exact app origin. Never send
            // them to Cloudinary, Stadia, fonts or other external resources.
            const headers = oidc && new URL(e.request.url).origin === origin
              ? [...Object.entries(e.request.headers).map(([name,value]) => ({name,value:String(value)})), {name:"x-vercel-trusted-oidc-idp-token",value:oidc}]
              : undefined;
            await cdp.send("Fetch.continueRequest",{requestId:e.requestId,...(headers ? {headers} : {})});
          }
        } catch { /* Target may close after a bounded sample. */ }
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: width === 390 ? 4 : 1 });
      // Fixed synthetic network, not a claim about real user mobile networks.
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: width === 390 ? 80 : 20, downloadThroughput: (width === 390 ? 4 : 20) * 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8 });
      await page.addInitScript(() => {
        window.__perf = { lcp: null, cls: 0, longTasks: [], interactions: [], resources: [] };
        for (const type of ["largest-contentful-paint", "layout-shift", "longtask", "event"]) try {
          new PerformanceObserver(list => { for (const e of list.getEntries()) {
            if (type === "largest-contentful-paint") window.__perf.lcp = { startTime: e.startTime, size: e.size, tag: e.element?.tagName ?? null };
            if (type === "layout-shift" && !e.hadRecentInput) window.__perf.cls += e.value;
            if (type === "longtask") window.__perf.longTasks.push(e.duration);
            if (type === "event" && e.interactionId) window.__perf.interactions.push({ interactionId: e.interactionId, duration: e.duration });
          } }).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
        } catch { /* unsupported metric is null, never invented */ }
      });
      for (const cache of ["browser-cold", "browser-warm"]) {
        // Network.setCacheDisabled does not bypass Vercel or Neon caches.
        if(cache === "browser-cold") await cdp.send("Network.clearBrowserCache");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
        let encodedBytes = 0, cacheHits = 0;
        const received = e => { encodedBytes += e.encodedDataLength; };
        const hit = () => { cacheHits++; };
        cdp.on("Network.loadingFinished", received);
        cdp.on("Network.requestServedFromCache", hit);
        const started = performance.now();
        let status = null, navigationFailure = false;
        try { status = (await page.goto(origin + route, { waitUntil: "load", timeout: 45000 }))?.status() ?? null; }
        catch { navigationFailure = true; }
        await page.waitForTimeout(2500);
        const metrics = await page.evaluate(() => {
          const n = performance.getEntriesByType("navigation")[0];
          return { ...window.__perf, navigation: n ? { ttfbMs: n.responseStart - n.startTime, domContentLoadedMs: n.domContentLoadedEventEnd, loadMs: n.loadEventEnd, encodedBodyBytes: n.encodedBodySize, decodedBodyBytes: n.decodedBodySize } : null, resources: performance.getEntriesByType("resource").map(r => ({ url: r.name, type: r.initiatorType, encodedBodyBytes: r.encodedBodySize, decodedBodyBytes: r.decodedBodySize, transferBytes: r.transferSize, durationMs: r.duration, status: r.responseStatus })), overflow: document.documentElement.scrollWidth > innerWidth + 1, mapMarkers: document.querySelectorAll(".maplibregl-marker").length, mapUnavailable: document.body.innerText.includes("Bản đồ hiện không khả dụng"), imageCount: document.images.length };
        });
        cdp.off("Network.loadingFinished", received);
        cdp.off("Network.requestServedFromCache", hit);
        const payload = {};
        const resources = metrics.resources.filter(r => /^https?:/.test(r.url)).map(r => {
          const kind = resourceKind(r.type, r.url);
          payload[kind] ??= { count: 0, encodedBodyBytes: 0, transferBytes: 0 };
          payload[kind].count++; payload[kind].encodedBodyBytes += r.encodedBodyBytes; payload[kind].transferBytes += r.transferBytes;
          return { ...safeResource(r.url), kind, encodedBodyBytes: r.encodedBodyBytes, transferBytes: r.transferBytes, durationMs: Math.round(r.durationMs), status: r.status };
        });
        delete metrics.resources;
        observations.push({ route, width, cache, cacheHits, status, navigationFailure, elapsedMs: Math.round(performance.now() - started), encodedNetworkBytes: encodedBytes, payload, resources, ...metrics, inp: null, inpReason: "No representative user interaction; field INP unavailable", blockedWriteRequests: [...blocked] });
        console.log(JSON.stringify({ route, width, cache, status, ttfb: metrics.navigation?.ttfbMs, lcp: metrics.lcp?.startTime, cls: metrics.cls, networkBytes: encodedBytes, overflow: metrics.overflow, mapMarkers: metrics.mapMarkers, mapUnavailable: metrics.mapUnavailable }));
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), origin, browser: "isolated Chromium; no credentials; all non-GET/HEAD blocked", conditions: { widths: mode === "home" ? [390,768,1440] : [390,1440], viewportHeight: 900, mobile: "4Mbps/80ms RTT/4x CPU", desktopTablet: "20Mbps/20ms RTT/1x CPU", reducedMotion: "reduce", observation: "load + 2500ms, viewport only; no interaction or scrolling", cache: "cold/warm browser only; server cold not forced", crossOriginBytes: "Resource Timing may be zero without TAO; encodedNetworkBytes from CDP includes completed cross-origin transfers", lcp: "synthetic observed candidate, not field p75", cls: "observation-window cumulative shifts, not full-session metric" }, observations }, null, 2) + "\n");
