// Complements the proposal smoke without making any routing/model/Trip calls.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { join } from "node:path";
import { homedir } from "node:os";
import { secrets, open } from "../../../scripts/rag-sync-lib.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const origin = process.argv[2]; assert.match(origin, /^https:\/\/kltn-[a-z0-9]+-to-xuan-hoai-s-projects\.vercel\.app$/);
const fixture = JSON.parse(await readFile(".cache/us28-production-registry/fixtures-private.json", "utf8"));
assert.equal(fixture.branch, "br-aged-hat-b3o6hg9p"); assert.ok(!fixture.cleanedAt);
const account = fixture.accounts.find(a => a.role === "TRAVELER");
assert.ok(account.email.startsWith(fixture.prefix) && account.email.endsWith("@example.invalid"));
const token = parseEnv(await readFile(".cache/us28-production-registry/preview.env", "utf8")).VERCEL_OIDC_TOKEN; assert.ok(token);
const db = await open(await secrets("apps/web/.env"), "source", false);
const browser = await chromium.launch({ headless: true });
const report = { measuredAt: new Date().toISOString(), origin, passed: [], failed: [], productionWrites: 0, tripWrites: 0, providerCalls: 0 };
let locked = false;
try {
  assert.equal((await db.query("SELECT current_setting('neon.branch_id') branch")).rows[0].branch, fixture.branch);
  const ctx = await browser.newContext();
  await ctx.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (!["GET", "HEAD"].includes(req.method()) && !(url.origin === origin && ["/api/auth/sign-in/email", "/api/trip-requirements/evaluate", "/api/trip-requirements/check"].includes(url.pathname)) && !(locked && url.origin === origin && url.pathname === "/api/trip-proposals" && req.postData() === "{}")) return route.abort();
    await route.continue({ headers: url.origin === origin ? { ...req.headers(), "x-vercel-trusted-oidc-idp-token": token } : req.headers() });
  });
  const page = await ctx.newPage(); await page.goto(origin + "/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email); await page.getByLabel("Mật khẩu", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await page.waitForURL(u => u.pathname !== "/login");
  await page.goto(origin + "/trips/new"); await page.getByRole("button", { name: "Bỏ qua và nhập bằng biểu mẫu", exact: true }).click();
  await page.locator("#trip-duration").fill("1"); await page.locator("#trip-start-date").fill("2027-01-01");
  await page.getByLabel("Ô tô", { exact: false }).check(); await page.locator('.trip-form button[type=submit]').click();
  async function checkRequirement() {
    await page.getByLabel("Tôi đã kiểm tra các thông tin trên").check();
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/api/trip-requirements/check" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Xác nhận nhu cầu", exact: true }).click(); assert.equal((await pending).status(), 200);
    await page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).waitFor();
  }
  await checkRequirement(); await page.getByRole("button", { name: "Quay lại chỉnh nhu cầu", exact: true }).click();
  await page.getByRole("button", { name: "Sửa Thời lượng chuyến đi", exact: true }).click();
  await page.locator("#trip-review-field-durationDays #trip-duration").fill("2");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).count(), 0);
  await checkRequirement();
  report.passed.push("Back preserves review; edit duration from 1 to 2 invalidates confirmation and requires a new real server check; no automatic proposal");
  for (const width of [390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  report.passed.push("Confirmed Planner start has no horizontal overflow at 390/768/1440");
  const updated = await db.query(`UPDATE "user" SET status='LOCKED' WHERE id=$1 AND email=$2 AND name LIKE 'TEST US28 registry %' RETURNING id`, [account.id, account.email]);
  assert.equal(updated.rowCount, 1); locked = true;
  const status = await page.evaluate(async () => (await fetch("/api/trip-proposals", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "locked-us28-fixture" }, body: "{}" })).status);
  assert.equal(status, 403); report.passed.push("Real session of locked Development TEST user gets 403 before parsing/provider work");
} catch (error) { report.failed.push(error.message.slice(0, 600)); process.exitCode = 1; }
finally {
  if (locked) await db.query(`UPDATE "user" SET status='ACTIVE' WHERE id=$1 AND email=$2`, [account.id, account.email]);
  await db.end(); await browser.close();
  await writeFile("docs/implementation/us28-production-registry-evidence/preview-boundaries.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ pass: report.passed.length, fail: report.failed.length, providerCalls: 0 }));
}
