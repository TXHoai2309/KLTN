// Real Preview HTTP/UI, persisted Development-only TEST users, live bounded Stadia.
// No sign-up API, Production write, Trip save, model call or auth bypass.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { secrets, open } from "../../../scripts/rag-sync-lib.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const origin = process.argv[2];
assert.match(origin, /^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/);
const fixture = JSON.parse(await readFile(".cache/us28-production-registry/fixtures-private.json", "utf8"));
assert.equal(fixture.branch, "br-aged-hat-b3o6hg9p"); assert.ok(!fixture.cleanedAt);
const token = parseEnv(await readFile(".cache/us28-production-registry/preview.env", "utf8")).VERCEL_OIDC_TOKEN;
assert.ok(token);
const output = "docs/implementation/us28-production-registry-evidence";
const source = await open(await secrets("apps/web/.env"), "source");
let developmentIds;
try { developmentIds = (await source.query("SELECT id FROM destination WHERE visibility='VISIBLE'")).rows.map(r => r.id); }
finally { await source.query("ROLLBACK"); await source.end(); }
const result = { measuredAt: new Date().toISOString(), origin, passed: [], failed: [], proposals: [], tileStatuses: [], productionWrites: 0, tripWrites: 0,
  fixturePolicy: "TEST durations/hours on verified Development only, real source coordinates. Unique local Development-only credentials prove Preview account-store binding after real sign-in. Not factual Production tourism data." };
const browser = await chromium.launch({ headless: true });
async function check(name, fn) { try { await fn(); result.passed.push(name); console.log("PASS " + name); } catch (e) { result.failed.push({ name, error: e.message.slice(0, 350) }); process.exitCode = 1; console.log("FAIL " + name); } }
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const captures = new Map();
  await ctx.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin && !["GET", "HEAD"].includes(req.method()) && !["/api/auth/sign-in/email", "/api/trip-requirements/evaluate", "/api/trip-requirements/check", "/api/trip-proposals"].includes(url.pathname)) return route.abort();
    const headers = url.origin === origin ? { ...req.headers(), "x-vercel-trusted-oidc-idp-token": token } : req.headers();
    if (url.origin === origin && req.method() === "POST" && ["/api/trip-proposals", "/api/trip-requirements/check"].includes(url.pathname)) {
      const real = await route.fetch({ headers, timeout: 45000, maxRetries: 0 }); const bytes = await real.body();
      captures.set(url.pathname, JSON.parse(bytes.toString("utf8")));
      return route.fulfill({ response: real, body: bytes });
    }
    await route.continue({ headers });
  });
  const page = await ctx.newPage();
  page.us28Captures = captures;
  page.on("response", r => { const u = new URL(r.url()); if (u.hostname.endsWith("stadiamaps.com") && /\.pbf$/.test(u.pathname)) result.tileStatuses.push(r.status()); });
  return { ctx, page };
}
async function flow(page, transport) {
  await page.goto(origin + "/trips/new");
  await page.getByRole("button", { name: "Bỏ qua và nhập bằng biểu mẫu", exact: true }).click();
  await page.locator("#trip-duration").fill("1"); await page.locator("#trip-start-date").fill("2027-01-01");
  await page.getByLabel(transport === "CAR" ? "Ô tô" : "Xe máy", { exact: false }).check();
  await page.locator('input[type=radio][value=RELAXED]').check();
  await page.locator('.trip-form button[type=submit]').click();
  await page.getByLabel("Tôi đã kiểm tra các thông tin trên").check();
  const checked = page.waitForResponse(r => new URL(r.url()).pathname === "/api/trip-requirements/check" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Xác nhận nhu cầu", exact: true }).click();
  const checkResponse = await checked; assert.equal(checkResponse.status(), 200);
  const checkedBody = page.us28Captures.get("/api/trip-requirements/check");
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/api/trip-proposals" && r.request().method() === "POST", { timeout: 45000 });
  await page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).click();
  const response = await pending; assert.equal(response.status(), 200);
  const body = page.us28Captures.get("/api/trip-proposals"); const proposal = body.data;
  assert.equal(proposal.requirement.transport, transport);
  assert.deepEqual(proposal.requirement, response.request().postDataJSON().requirement);
  assert.ok(proposal.days.flatMap(d => d.stops).every(s => developmentIds.includes(s.destination.id)));
  const leg = proposal.days[0].stops[1]?.inbound;
  assert.equal(leg?.provider, "STADIA_MAPS"); assert.equal(leg.status, "VERIFIED");
  assert.ok(leg.durationSeconds >= 0 && leg.distanceMeters >= 0);
  const allPass = proposal.checks.every(c => c.status === "PASS");
  assert.equal(proposal.status, allPass ? "PROPOSAL_READY" : proposal.checks.some(c => c.status === "VIOLATION") ? "NO_FEASIBLE_ITINERARY" : "INSUFFICIENT_DATA");
  if (!allPass) assert.equal(proposal.eligibleForFinalConfirmation, false);
  await page.locator(".planner-timeline").waitFor();
  const key = response.request().headers()["idempotency-key"];
  result.proposals.push({ transport, status: proposal.status, checks: proposal.checks.map(c => ({ key: c.key, status: c.status })),
    stopCount: proposal.days.flatMap(d => d.stops).length, stopIds: proposal.days.flatMap(d => d.stops.map(s => s.destination.id)), usesOnlyOwnedTestDestinations: proposal.days.flatMap(d => d.stops).every(s => fixture.destinations.includes(s.destination.id)), routing: { provider: leg.provider, durationSeconds: leg.durationSeconds, distanceMeters: leg.distanceMeters },
    requirementSnapshotMatched: true, checkHttpStatus: checkResponse.status(), checkConfirmable: checkedBody.data?.confirmable });
  return { proposal, key, payload: response.request().postDataJSON() };
}
let traveler;
try {
  for (const role of ["TRAVELER", "ADMIN"]) {
    const actor = await context(), account = fixture.accounts.find(a => a.role === role);
    await check(role + " real persisted Development credentials sign in", async () => {
      await actor.page.goto(origin + "/login");
      await actor.page.getByLabel("Email", { exact: true }).fill(account.email);
      await actor.page.getByLabel("Mật khẩu", { exact: true }).fill(account.password);
      await actor.page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
      await actor.page.waitForURL(u => u.pathname !== "/login", { timeout: 30000 });
    });
    await check(role + " US24 form → review → check → proposal " + (role === "ADMIN" ? "MOTORCYCLE" : "CAR"), async () => {
      const first = await flow(actor.page, role === "ADMIN" ? "MOTORCYCLE" : "CAR");
      if (role === "TRAVELER") traveler = { ...actor, ...first };
      await actor.page.screenshot({ path: output + "/preview-" + role.toLowerCase() + ".png", fullPage: true });
    });
    await check(role + " persisted CMS authorization", async () => {
      const response = await actor.page.evaluate(async () => (await fetch("/api/admin/users", { cache: "no-store" })).status);
      assert.equal(response, role === "ADMIN" ? 200 : 403);
    });
    if (role === "ADMIN") { await actor.page.setViewportSize({ width: 390, height: 844 }); assert.ok(await actor.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  }
  if (traveler) {
    await check("MapLibre renders two proposal markers; tile authorization reported separately", async () => {
      await traveler.page.locator(".planner-stop-select").nth(1).click();
      await traveler.page.locator(".planner-map-marker").nth(1).waitFor({ state: "attached", timeout: 30000 });
      assert.equal(await traveler.page.locator(".maplibregl-map").count(), 1);
      assert.equal(await traveler.page.locator(".planner-map-marker").count(), 2);
    });
    await check("regenerate sends a new key and preserves requirement", async () => {
      const pending = traveler.page.waitForResponse(r => new URL(r.url()).pathname === "/api/trip-proposals" && r.request().method() === "POST", { timeout: 45000 });
      await traveler.page.getByRole("button", { name: "Tạo lại lịch trình", exact: true }).click();
      const response = await pending; assert.equal(response.status(), 200);
      assert.notEqual(response.request().headers()["idempotency-key"], traveler.key);
      assert.deepEqual(response.request().postDataJSON(), traveler.payload);
      result.proposals.push({ transport: "CAR", purpose: "regenerate", status: traveler.page.us28Captures.get("/api/trip-proposals").data.status, newIdempotencyKey: true });
    });
    await check("back preserves review; changing the form requires a fresh check", async () => {
      await traveler.page.getByRole("button", { name: "Quay lại chỉnh nhu cầu", exact: true }).click();
      await traveler.page.getByLabel("Tôi đã kiểm tra các thông tin trên").waitFor();
      assert.equal(await traveler.page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).count(), 0);
      assert.ok(await traveler.page.getByText("Ô tô", { exact: false }).count());
    });
  }
  await check("Guest planner rejects before requirement/provider processing", async () => {
    const guest = await context(); await guest.page.goto(origin + "/login");
    const status = await guest.page.evaluate(async () => (await fetch("/api/trip-proposals", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "guest-us28-registry" }, body: "{}" })).status);
    assert.equal(status, 401); await guest.ctx.close();
  });
} finally {
  result.tileStatuses = [...new Set(result.tileStatuses)];
  result.mapBasemapStatus = result.tileStatuses.includes(401) ? "BLOCKED_PREVIEW_HOSTNAME_AUTHORIZATION" : result.tileStatuses.includes(200) ? "TILES_200" : "NOT_OBSERVED";
  await browser.close();
  await writeFile(output + "/preview-browser.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ pass: result.passed.length, fail: result.failed.length, map: result.mapBasemapStatus }));
}
