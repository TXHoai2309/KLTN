/** Real UI, Better Auth and PostgreSQL Development. No component/data mocks. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { developmentConnection, verifyDevelopment } from "./admin-users-test-db.mjs";
const require = createRequire(import.meta.url), { Client } = require("pg");
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(root, "docs/implementation/admin-users-v2-evidence"), base = "http://localhost:3010";
const prefix = `cms-e2e-${randomUUID()}`, label = `CMS E2E ${prefix.slice(8, 16)}`, users = [];
const password = `Fixture-${randomUUID()}!`;
const db = new Client({ connectionString: await developmentConnection() });
const report = { passed: [], failed: [], cleanup: false };
let browser, admin, target, page;
async function check(name, fn) { try { await fn(); report.passed.push(name); console.log(`PASS ${name}`); } catch (error) { report.failed.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; if (page) { await page.screenshot({ path: resolve(output, `failure-${report.failed.length}.png`) }).catch(() => {}); await page.keyboard.press("Escape").catch(() => {}); } } }
const api = async (context, path, method = "GET", data) => {
  const response = await context.request.fetch(base + path, { method, data, headers: { Origin: base, "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, timeout: 60_000 });
  return { status: response.status(), body: await response.json() };
};
async function login(context, address) {
  const tab = await context.newPage();
  await tab.goto(base + "/login");
  await tab.getByLabel("Email", { exact: true }).fill(address);
  await tab.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await tab.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await tab.waitForURL(url => url.pathname !== "/login", { timeout: 60_000 });
  return tab;
}
async function roleChange(role, loseResponse = false) {
  await page.getByRole("button", { name: /Thay đổi vai trò \(/ }).click();
  const dialog = page.getByRole("dialog", { name: "Thay đổi vai trò người dùng", exact: true });
  await dialog.locator(`input[value='${role}']`).check();
  const pattern = `**/api/admin/users/${target.id}/role`;
  if (loseResponse) await page.route(pattern, async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await response.body(); await route.abort("failed"); await page.unroute(pattern); });
  await dialog.getByRole("button", { name: "Lưu vai trò mới", exact: true }).click();
  if (loseResponse) {
    await dialog.getByRole("button", { name: "Kiểm tra lại cùng yêu cầu", exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Hủy bỏ", exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Kiểm tra lại cùng yêu cầu", exact: true }).click();
  }
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: `Thay đổi vai trò (${role})`, exact: true }).waitFor();
}
try {
  await db.connect(); await verifyDevelopment(db); await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "vi-VN" });
  admin.setDefaultTimeout(25_000); admin.setDefaultNavigationTimeout(60_000);
  const setup = await browser.newContext();
  for (let index = 0; index < 8; index++) {
    const address = `${prefix}-${index}@example.invalid`, name = `${label} ${index === 0 ? "Admin" : `Nguyễn ${index}`}`;
    const result = await api(setup, "/api/auth/sign-up/email", "POST", { email: address, password, name });
    assert.equal(result.status, 200, "Fixture signup must succeed");
    const user = { id: result.body.user.id, email: address, name }; users.push(user);
    if (index === 0) await db.query('UPDATE "user" SET role=\'ADMIN\' WHERE id=$1', [user.id]);
  }
  await setup.close(); target = users[1];
  page = await login(admin, users[0].email);
  await check("Admin Better Auth login + real list/statistics + no fixture/banner", async () => {
    await page.goto(base + "/admin/users");
    await page.getByRole("heading", { name: "Quản lý người dùng", exact: true }).waitFor();
    const search = page.getByRole("textbox", { name: "Tìm kiếm người dùng" });
    await search.fill(label); await page.getByRole("link", { name: users[7].name, exact: true }).first().waitFor();
    assert.equal(await page.getByText("Phase 1 — Frontend Only:").count(), 0);
    const stats = await api(admin, "/api/admin/users/statistics");
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.totalUsers, (await db.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n);
    assert.equal((await api(admin, "/api/admin/users?search=" + encodeURIComponent(label))).body.data.total, 8);
    await page.screenshot({ path: resolve(output, "desktop-list-light.png") });
  });
  await check("Search/filter/sort/page are real server queries and stable pages", async () => {
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await page.getByText("Trang 2 / 2", { exact: true }).waitFor();
    await page.getByLabel("Lọc theo vai trò").selectOption("ADMIN");
    await page.getByText("Trang 1 / 1", { exact: true }).waitFor();
    await page.getByRole("link", { name: users[0].name, exact: true }).first().waitFor();
    await page.getByLabel("Lọc theo vai trò").selectOption("ALL");
    await page.getByLabel("Tìm kiếm người dùng").fill(target.email);
    await page.getByRole("link", { name: target.name, exact: true }).first().waitFor();
    await page.getByRole("link", { name: target.name, exact: true }).first().click();
    await page.getByRole("button", { name: "Thay đổi vai trò (TRAVELER)", exact: true }).waitFor();
  });
  await check("Promote/demote via real dialogs, DB audit and existing cookie DB authority", async () => {
    const traveler = await browser.newContext(); traveler.setDefaultTimeout(25_000);
    const travelerPage = await login(traveler, target.email);
    assert.equal((await api(traveler, "/api/admin/users")).status, 403);
    await roleChange("ADMIN"); assert.equal((await api(traveler, "/api/admin/users")).status, 200);
    await roleChange("TRAVELER"); assert.equal((await api(traveler, "/api/admin/users")).status, 403);
    assert.equal((await api(traveler, "/api/account")).status, 200);
    await travelerPage.goto(base + "/admin/users");
    assert.equal(await travelerPage.getByRole("heading", { name: "Quản lý người dùng", exact: true }).count(), 0);
    await traveler.close();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_audit_event WHERE "targetUserId"=$1 AND "eventType"=\'ROLE_CHANGED\'', [target.id])).rows[0].n, 2);
  });
  await check("Lost mutation acknowledgement stays UNKNOWN then same-key retry produces only one audit", async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM admin_audit_event WHERE "targetUserId"=$1', [target.id])).rows[0].n;
    await roleChange("ADMIN", true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_audit_event WHERE "targetUserId"=$1', [target.id])).rows[0].n, before + 1);
  });
  await check("Lock revokes devices and blocks real login; unlock permits fresh login only", async () => {
    const device = await browser.newContext(); device.setDefaultTimeout(25_000); await login(device, target.email);
    await page.getByRole("button", { name: "Khóa tài khoản này", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Khóa tài khoản người dùng", exact: true });
    await dialog.getByLabel(/Lý do khóa tài khoản/).fill("Kiểm thử CMS E2E");
    await dialog.getByRole("button", { name: "Xác nhận khóa", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Mở khóa tài khoản", exact: true }).waitFor();
    assert.equal((await api(device, "/api/account")).status, 401);
    const denied = await api(device, "/api/auth/sign-in/email", "POST", { email: target.email, password }); assert.equal(denied.status, 403);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [target.id])).rows[0].n, 0);
    await page.getByRole("button", { name: "Mở khóa tài khoản", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Mở khóa tài khoản người dùng", exact: true });
    await dialog.getByRole("button", { name: "Xác nhận mở khóa", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    assert.equal((await api(device, "/api/account")).status, 401);
    await device.clearCookies(); await login(device, target.email); assert.equal((await api(device, "/api/account")).status, 200);
    await device.close();
  });
  await check("Revoke confirmation invalidates real cookie; audit timeline and session counts refresh", async () => {
    const device = await browser.newContext(); device.setDefaultTimeout(25_000); await login(device, target.email);
    await page.reload(); await page.getByRole("button", { name: "Thu hồi tất cả phiên", exact: true }).waitFor();
    await page.getByRole("button", { name: "Thu hồi tất cả phiên", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Thu hồi phiên đăng nhập", exact: true });
    await dialog.getByRole("button", { name: "Xác nhận thu hồi", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    assert.equal((await api(device, "/api/account")).status, 401);
    await page.getByText("0 phiên hoạt động", { exact: true }).waitFor();
    await page.locator(".admin-timeline-title").filter({ hasText: "Thu hồi phiên đăng nhập" }).waitFor();
    const audit = await api(admin, `/api/admin/users/${target.id}/audit-logs?pageSize=1`); assert.equal(audit.body.data.items.length, 1); assert.equal(audit.body.data.hasMore, true);
    await device.close();
  });
  await check("Self protection keeps failed dialog open; keyboard trap, Escape/focus restoration", async () => {
    await page.goto(base + `/admin/users/${users[0].id}`);
    const trigger = page.getByRole("button", { name: "Khóa tài khoản này", exact: true }); await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Khóa tài khoản người dùng", exact: true });
    await dialog.getByRole("button", { name: "Xác nhận khóa", exact: true }).click();
    await dialog.getByRole("alert").waitFor(); assert.equal(await dialog.isVisible(), true);
    for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))), true, `Tab focus escaped at ${i}`); }
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" }); assert.equal(await trigger.evaluate(el => el === document.activeElement), true, "Cancel must restore trigger focus");
  });
  await check("Mobile 390px, desktop dark theme and real empty/error recovery", async () => {
    await page.goto(base + "/admin/users"); await page.getByLabel("Tìm kiếm người dùng").fill(label);
    await page.getByRole("link", { name: users[7].name, exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Chuyển giao diện sáng/tối", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tối", exact: true }).click();
    await page.screenshot({ path: resolve(output, "desktop-list-dark.png") });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: resolve(output, "mobile-list-dark.png") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "Mobile document overflow");
    await page.getByLabel("Tìm kiếm người dùng").fill("NO MATCH " + prefix); await page.getByText("Không tìm thấy người dùng phù hợp", { exact: true }).waitFor();
    await page.getByLabel("Tìm kiếm người dùng").fill(label); await page.getByRole("link", { name: users[7].name, exact: true }).last().waitFor();
  });
  await check("Guest and Traveler CMS APIs deny, details contain no session tokens/IP/hash", async () => {
    const guest = await browser.newContext(); assert.equal((await api(guest, "/api/admin/users")).status, 401); await guest.close();
    const detail = await api(admin, `/api/admin/users/${target.id}`); assert.equal(detail.status, 200);
    assert.equal(/"token"|password|accessToken|refreshToken|ipAddress/.test(JSON.stringify(detail.body)), false);
    assert.equal((await db.query('SELECT role,status FROM "user" WHERE id=$1', [users[0].id])).rows[0].role, "ADMIN");
  });
} catch (error) { process.exitCode = 1; report.failed.push({ name: "setup", message: error.message }); console.error("SETUP FAILED", error.message); }
finally {
  await browser?.close();
  try {
    const ids = users.map(user => user.id);
    await db.query("BEGIN");
    await db.query('DELETE FROM admin_audit_event WHERE "actorId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])', [ids]);
    await db.query('DELETE FROM idempotency_record WHERE scope=ANY($1::text[])', [ids.flatMap(id => ["role", "lock", "unlock", "revoke-sessions"].map(action => JSON.stringify([id, `admin-user:${action}`])))]);
    await db.query('DELETE FROM "user" WHERE id=ANY($1::text[]) AND email LIKE $2', [ids, prefix + "-%@example.invalid"]);
    await db.query("COMMIT");
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "user" WHERE id=ANY($1::text[])', [ids])).rows[0].n, 0);
    report.cleanup = true; console.log("OWNED_CMS_BROWSER_FIXTURE_CLEANUP=PASS");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); process.exitCode = 1; report.failed.push({ name: "cleanup", message: error.message }); }
  await db.end(); await mkdir(output, { recursive: true }); await writeFile(resolve(output, "browser-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed.length, failed: report.failed.length, cleanup: report.cleanup }));
}
