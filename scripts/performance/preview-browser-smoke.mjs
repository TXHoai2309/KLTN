import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { safeOrigin, summarize } from "./metrics.mjs";

const [originInput, envFile, modulePath, output] = process.argv.slice(2);
const origin = safeOrigin(originInput);
if (!/^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/.test(origin)) throw Error("PREVIEW_ONLY");
const token = parseEnv(await readFile(envFile, "utf8")).VERCEL_OIDC_TOKEN;
if (!token) throw Error("OIDC_REQUIRED");
const fixtures = JSON.parse(await readFile(".cache/performance-v3-test-accounts-private.json", "utf8"));
if (fixtures.branch !== "br-aged-hat-b3o6hg9p" || fixtures.cleanedAt) throw Error("DEVELOPMENT_FIXTURES_REQUIRED");
const { chromium } = createRequire(import.meta.url)(modulePath);
const browser = await chromium.launch({ headless: true });
const results = [], blockedWrites = [], networkFailures = [];
const report = { startedAt: new Date().toISOString(), origin, method: "Real Better Auth test accounts provisioned on pinned Development only. Read-only after sign-in. Origin-scoped Vercel OIDC. Playwright routing disables HTTP cache; no Web Vitals claim.", results, blockedWrites, networkFailures, paidRequests: 0, productionWrites: 0 };
try {
  for (const role of ["GUEST", "TRAVELER", "ADMIN"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    await context.route("**/*", async route => {
      const req = route.request(), u = new URL(req.url());
      const signIn = u.origin === origin && u.pathname === "/api/auth/sign-in/email" && req.method() === "POST";
      if (!["GET", "HEAD"].includes(req.method()) && !signIn) { blockedWrites.push({ role, path: u.pathname, method: req.method() }); return route.abort(); }
      return route.continue({ headers: u.origin === origin ? { ...req.headers(), "x-vercel-trusted-oidc-idp-token": token } : req.headers() });
    });
    const page = await context.newPage();
    page.on("response", r => { if (r.status() >= 400 && /stadia|style\.json|tiles/.test(r.url())) networkFailures.push({ role, origin: new URL(r.url()).origin, path: new URL(r.url()).pathname, status: r.status() }); });
    await page.goto(origin + "/login", { waitUntil: "load", timeout: 30000 });
    if (role !== "GUEST") {
      const account = fixtures.accounts.find(a => a.role === role);
      const signedIn = await page.evaluate(async account => {
        const r = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password: account.password }) });
        return { status: r.status };
      }, account);
      results.push({ role, check: "real-better-auth-sign-in", ...signedIn, pass: signedIn.status === 200 });
      if (signedIn.status !== 200) throw Error(`TEST_SIGN_IN_${role}_${signedIn.status}`);
    }
    const apiPaths = ["/api/favorites", "/api/trips", "/api/admin/destinations", "/api/ai/conversations"];
    for (const path of apiPaths) {
      const samples = [];
      const measuredRead = role !== "GUEST" && path !== "/api/ai/conversations" && (path !== "/api/admin/destinations" || role === "ADMIN");
      for (let i = 0; i < (measuredRead ? 30 : 1); i++) {
        const row = await page.evaluate(async path => {
          const start = performance.now(), r = await fetch(path), ttfbMs = performance.now() - start;
          const text = await r.text(); let data; try { data = JSON.parse(text); } catch {}
          return { status: r.status, ttfbMs, totalMs: performance.now() - start, bytes: new TextEncoder().encode(text).length, cacheControl: r.headers.get("cache-control"), code: data?.error?.code, emptyPersonalList: path === "/api/trips" ? data?.data?.items?.length === 0 || Array.isArray(data?.data) && data.data.length === 0 : path === "/api/favorites" ? data?.data?.destinations?.length === 0 && data?.data?.cultureContents?.length === 0 : undefined };
        }, path);
        samples.push(row);
        await page.waitForTimeout(500);
      }
      const expected = path === "/api/ai/conversations" ? 503 : role === "GUEST" ? 401 : path === "/api/admin/destinations" && role !== "ADMIN" ? 403 : 200;
      results.push({ role, path, samples, p50P95: summarize(samples.map(s => s.totalMs)), expected, status: path === "/api/ai/conversations" ? "BLOCKED_PREVIEW_RUNTIME_DISABLED" : samples.every(s => s.status === expected) ? "PASS" : "FAIL" });
    }
    for (const path of ["/dashboard", "/favorites", "/trips", "/trips/new", "/assistant", ...(role === "ADMIN" ? ["/admin/destinations", "/admin/rag"] : [])]) {
      const r = await page.goto(origin + path, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(200);
      const finalPath = new URL(page.url()).pathname;
      results.push({ role, path, check: "page", status: r.status(), finalPath, pass: r.status() < 500 && (role === "GUEST" || finalPath !== "/login") });
    }
    if (role === "GUEST") for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/explore?view=map", "/destinations/cmv97lcrq0016z09ws0o74lqp"]) {
        const r = await page.goto(origin + path, { waitUntil: "load", timeout: 30000 });
        if (path !== "/") try { await page.waitForFunction(() => document.querySelectorAll(".maplibregl-marker").length > 0, undefined, { timeout: 15000 }); } catch {}
        if (path !== "/") await page.waitForTimeout(2500);
        const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, markers: document.querySelectorAll(".maplibregl-marker").length, unavailable: document.body.innerText.includes("Bản đồ hiện không khả dụng") }));
        results.push({ role, path, width, check: "responsive-map", status: r.status(), ...state, pass: r.status() === 200 && !state.overflow && !state.unavailable && (path === "/" || state.markers > 0) });
      }
    }
    await context.close();
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ role, completed: true }));
  }
  report.failures = results.filter(r => r.pass === false || r.status === "FAIL").length + networkFailures.length;
  report.status = report.failures ? "FAIL" : "PASS_TESTED_SCOPE_HISTORY_BLOCKED";
  if (report.failures) process.exitCode = 1;
} catch (error) { report.status = "INCOMPLETE"; report.errorCode = error.message.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 160); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + "\n"); await browser.close(); }
