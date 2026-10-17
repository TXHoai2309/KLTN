/** Real Chromium + Better Auth + approved Neon Development. Cleans only owned fixtures. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url), { Client } = require("pg");
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const web = fileURLToPath(new URL("../", import.meta.url));
const base = "http://localhost:3010", prefix = `rbac-v2-${randomUUID()}`;
const output = resolve(web, "../../docs/implementation/rbac-v2-evidence");
const envText = await readFile(resolve(web, ".env"), "utf8");
const connectionString = envText.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert.ok(connectionString, "Development DB configuration required");
const dbUrl = new URL(connectionString);
assert.equal(dbUrl.hostname, "ep-purple-pond-b3xujb8o-pooler.c-4.ap-southeast-1.aws.neon.tech", "Only the approved Development endpoint is allowed");
assert.equal(dbUrl.pathname, "/neondb");
const db = new Client({ connectionString });
const users = [], destinations = [], result = { passed: [], failed: [], cleanup: false };
let browser;
function pass(name) { result.passed.push(name); console.log(`PASS ${name}`); }
async function check(name, fn) { try { await fn(); pass(name); } catch (error) { result.failed.push({ name, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const api = async (context, path, method = "GET", data, key = randomUUID()) => {
  const response = await context.request.fetch(base + path, { method, data, headers: { Origin: base, "Idempotency-Key": key }, timeout: 60_000 });
  return { status: response.status(), body: await response.json(), headers: response.headers() };
};

try {
  await db.connect();
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const contexts = {};
  for (const role of ["ADMIN", "TRAVELER"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "vi-VN" });
    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(60_000);
    const email = `${prefix}-${role.toLowerCase()}@example.invalid`, password = `Fixture-${randomUUID()}!`;
    const signup = await context.request.post(base + "/api/auth/sign-up/email", { data: { name: `TEST RBAC ${role}`, email, password }, headers: { Origin: base } });
    assert.equal(signup.status(), 200, "Fixture signup must succeed");
    const id = (await signup.json()).user.id; users.push(id);
    await db.query('UPDATE "user" SET role=$1::"UserRole" WHERE id=$2', [role, id]);
    await context.clearCookies();
    const page = await context.newPage();
    await page.goto(base + "/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => url.pathname !== "/login", { timeout: 60_000 });
    contexts[role] = { context, page, id };
    pass(`${role} real Better Auth UI login`);
  }
  const admin = contexts.ADMIN, traveler = contexts.TRAVELER;
  await check("Admin Home and shared menu retain personal/admin/logout links", async () => {
    await admin.page.goto(base + "/");
    await admin.page.locator(".user-menu-trigger").click();
    for (const text of ["Thông tin tài khoản", "Yêu thích", "Quản lý điểm đến", "Quản lý tài liệu RAG", "Đăng xuất"]) await admin.page.getByRole("menuitem", { name: text, exact: true }).waitFor();
    assert.equal(await admin.page.getByRole("menuitem", { name: /văn hóa/i }).count(), 0);
    await admin.page.screenshot({ path: resolve(output, "admin-menu.png") });
    await admin.page.keyboard.press("Escape");
  });
  const destination = `${prefix}-d`; destinations.push(destination);
  await db.query(`INSERT INTO destination(id,name,description,area,category,latitude,longitude,visibility,"minimumDurationMinutes","suggestedDurationMinutes","updatedAt") VALUES($1,$2,'Synthetic fixture only','Test','Test',23,105,'VISIBLE',30,60,CURRENT_TIMESTAMP)`, [destination, `TEST RBAC ${prefix}`]);
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  for (const day of weekdays) {
    const id = randomUUID();
    await db.query('INSERT INTO opening_day(id,"destinationId","dayOfWeek",status) VALUES($1,$2,$3::"Weekday",\'OPEN\')', [id, destination, day]);
    await db.query('INSERT INTO opening_interval(id,"openingDayId","opensAtMinute","closesAtMinute") VALUES($1,$2,0,1440)', [randomUUID(), id]);
  }
  await check("Admin Favorites browser add/list/remove confirmed by PostgreSQL", async () => {
    await admin.page.goto(base + `/destinations/${destination}`);
    const heart = admin.page.getByRole("button", { name: "Thêm vào yêu thích", exact: true });
    await heart.click();
    await admin.page.getByRole("button", { name: "Bỏ yêu thích", exact: true }).waitFor();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM favorite WHERE "userId"=$1 AND "destinationId"=$2', [admin.id, destination])).rows[0].n, 1);
    await admin.page.goto(base + "/favorites");
    await admin.page.getByText(`TEST RBAC ${prefix}`, { exact: true }).waitFor();
    await admin.page.getByRole("button", { name: /Bỏ yêu thích/ }).click();
    await admin.page.getByText(`TEST RBAC ${prefix}`, { exact: true }).waitFor({ state: "hidden" });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM favorite WHERE "userId"=$1 AND "destinationId"=$2', [admin.id, destination])).rows[0].n, 0);
  });
  for (const [role, actor] of Object.entries(contexts)) await check(`${role} Trip form, review, authoritative check and real planner endpoint`, async () => {
    await actor.page.goto(base + "/trips/new");
    await actor.page.locator("#trip-duration").fill("1");
    await actor.page.locator("#trip-start-date").fill("2027-01-01");
    await actor.page.getByLabel("Ô tô", { exact: false }).check();
    const [evaluated] = await Promise.all([
      actor.page.waitForResponse(r => r.url().endsWith("/api/trip-requirements/evaluate") && r.request().method() === "POST"),
      actor.page.locator(".trip-form button[type=submit]").click(),
    ]);
    assert.equal(evaluated.status(), 200);
    await actor.page.getByLabel("Tôi đã kiểm tra các thông tin trên").check();
    const [checked] = await Promise.all([
      actor.page.waitForResponse(r => r.url().endsWith("/api/trip-requirements/check") && r.request().method() === "POST"),
      actor.page.getByRole("button", { name: "Xác nhận nhu cầu", exact: true }).click(),
    ]);
    assert.equal(checked.status(), 200);
    await writeFile(resolve(output, `${role.toLowerCase()}-requirement-check.json`), JSON.stringify(await checked.json(), null, 2));
    await actor.page.screenshot({ path: resolve(output, `${role.toLowerCase()}-after-check.png`) });
    const [proposal] = await Promise.all([
      actor.page.waitForResponse(r => r.url().endsWith("/api/trip-proposals") && r.request().method() === "POST", { timeout: 60_000 }),
      actor.page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).click(),
    ]);
    assert.equal(proposal.status(), 200);
    await actor.page.locator(".planner-page").waitFor();
    await actor.page.screenshot({ path: resolve(output, `${role.toLowerCase()}-planner.png`) });
  });
  const savedTrips = {};
  for (const [role, actor] of Object.entries(contexts)) await check(`${role} API save/replay + browser own list/detail`, async () => {
    const payload = { confirm: true, proposal: { startDate: "2027-01-01", durationDays: 1, transport: "CAR", days: [{ dayIndex: 1, visits: [{ destinationId: destination, startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }] } };
    const key = randomUUID();
    const saved = await api(actor.context, "/api/trips", "POST", payload, key);
    assert.equal(saved.status, 200); assert.equal(saved.body.operationStatus, "SUCCESS");
    const id = saved.body.data.tripId; savedTrips[role] = id;
    assert.equal((await db.query('SELECT "userId" FROM trip WHERE id=$1', [id])).rows[0].userId, actor.id);
    const replay = await api(actor.context, "/api/trips", "POST", payload, key);
    assert.equal(replay.body.data.tripId, id); assert.equal(replay.headers["idempotency-replayed"], "true");
    const list = await api(actor.context, "/api/trips"); assert.deepEqual(list.body.data.items.map(t => t.id), [id]);
    await actor.page.goto(base + "/trips");
    await actor.page.locator(`a[href='/trips/${id}']`).first().click();
    await actor.page.getByText(`TEST RBAC ${prefix}`, { exact: true }).waitFor();
    await actor.page.getByRole("button", { name: "Thêm chuyến đi vào yêu thích", exact: true }).click();
    await actor.page.getByRole("button", { name: "Bỏ chuyến đi khỏi yêu thích", exact: true }).waitFor();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM favorite WHERE "userId"=$1 AND "tripId"=$2', [actor.id, id])).rows[0].n, 1);
    await actor.page.getByRole("button", { name: "Bỏ chuyến đi khỏi yêu thích", exact: true }).click();
    await actor.page.getByRole("button", { name: "Thêm chuyến đi vào yêu thích", exact: true }).waitFor();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM trip WHERE id=$1 AND "userId"=$2', [id, actor.id])).rows[0].n, 1);
  });
  await check("Admin and Traveler cross-Trip/Favorite IDs denied with no existence leak", async () => {
    for (const [role, actor] of Object.entries(contexts)) {
      const foreignTrip = savedTrips[role === "ADMIN" ? "TRAVELER" : "ADMIN"];
      const foreign = await api(actor.context, `/api/trips/${foreignTrip}`), missing = await api(actor.context, "/api/trips/missing");
      assert.equal(foreign.status, 404); assert.deepEqual(foreign.body, missing.body);
      for (const method of ["PUT", "DELETE"]) assert.equal((await api(actor.context, `/api/favorites/trips/${foreignTrip}`, method)).status, 404);
    }
    await api(traveler.context, `/api/favorites/destinations/${destination}`, "PUT");
    const favorite = (await db.query('SELECT id FROM favorite WHERE "userId"=$1 AND "destinationId"=$2', [traveler.id, destination])).rows[0];
    assert.equal((await api(admin.context, `/api/favorites/${favorite.id}`, "DELETE")).status, 404);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM favorite WHERE id=$1', [favorite.id])).rows[0].n, 1);
  });
  await check("Admin APIs/pages remain Admin-only; account remains self-only", async () => {
    for (const path of ["/admin/rag", "/admin/destinations", "/account", "/dashboard"]) {
      await admin.page.goto(base + path); assert.equal(await admin.page.getByText("Bạn không có quyền", { exact: false }).count(), 0);
    }
    for (const path of ["/api/admin/destinations", "/api/admin/rag-documents"]) {
      assert.equal((await api(admin.context, path)).status, 200);
      assert.equal((await api(traveler.context, path)).status, 403);
    }
    assert.equal((await api(admin.context, "/api/account")).body.data.role, "ADMIN");
    assert.equal((await db.query('SELECT role FROM "user" WHERE id=$1', [admin.id])).rows[0].role, "ADMIN");
  });
  await check("Admin AI turn, refresh, rename/delete and cross-user history isolation", async () => {
    await admin.page.goto(base + "/assistant");
    const composer = admin.page.getByPlaceholder("Nhập câu hỏi về Hà Giang…");
    await composer.waitFor();
    await composer.fill("Xin chào");
    const [response] = await Promise.all([
      admin.page.waitForResponse(r => r.url().endsWith("/api/ai/ask") && r.request().method() === "POST", { timeout: 120_000 }),
      admin.page.getByRole("button", { name: "Gửi", exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    const body = await response.json(), id = body.data.conversationId;
    assert.ok(id);
    assert.equal((await db.query('SELECT "principalId" FROM qa_conversation WHERE id=$1', [id])).rows[0].principalId, admin.id);
    await admin.page.reload();
    await admin.page.getByText("Xin chào", { exact: true }).first().waitFor();
    assert.equal((await api(traveler.context, `/api/ai/conversations/${id}`)).status, 404);
    assert.equal((await api(traveler.context, `/api/ai/conversations/${id}`, "PATCH", { title: "Foreign" })).status, 404);
    assert.equal((await api(traveler.context, `/api/ai/conversations/${id}`, "DELETE")).status, 404);
    assert.equal((await api(admin.context, `/api/ai/conversations/${id}`, "PATCH", { title: "TEST RBAC renamed" })).status, 200);
    assert.equal((await api(admin.context, `/api/ai/conversations/${id}`, "DELETE")).status, 200);
  });
  await check("Guest private APIs deny; narrow Admin menu keeps traveler/admin links", async () => {
    const guest = await browser.newContext();
    for (const path of ["/api/trips", "/api/favorites", "/api/admin/destinations"]) assert.equal((await api(guest, path)).status, 401);
    await guest.close();
    await admin.page.setViewportSize({ width: 390, height: 844 });
    await admin.page.goto(base + "/favorites");
    await admin.page.locator(".user-menu-trigger").click();
    await admin.page.getByRole("menuitem", { name: "Yêu thích", exact: true }).waitFor();
    await admin.page.getByRole("menuitem", { name: "Quản lý tài liệu RAG", exact: true }).waitFor();
    await admin.page.screenshot({ path: resolve(output, "admin-menu-mobile.png") });
  });
} catch (error) { process.exitCode = 1; if (!result.failed.length) result.failed.push({ name: "setup", error: error.message }); }
finally {
  await browser?.close();
  try {
    await db.query("BEGIN");
    await db.query('DELETE FROM qa_turn WHERE "principalKind"=\'USER\' AND "principalId"=ANY($1::text[])', [users]);
    await db.query('DELETE FROM qa_conversation WHERE "principalKind"=\'USER\' AND "principalId"=ANY($1::text[])', [users]);
    await db.query('DELETE FROM favorite WHERE "userId"=ANY($1::text[])', [users]);
    await db.query('DELETE FROM trip WHERE "userId"=ANY($1::text[])', [users]);
    const scopes = users.flatMap(id => ["favorite:add", "favorite:remove", "trip:create"].map(op => JSON.stringify([id, op])));
    await db.query('DELETE FROM idempotency_record WHERE scope=ANY($1::text[])', [scopes]);
    await db.query('DELETE FROM destination WHERE id=ANY($1::text[])', [destinations]);
    await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    await db.query("COMMIT"); result.cleanup = true; console.log("OWNED_FIXTURE_CLEANUP=PASS");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); result.failed.push({ name: "cleanup", error: error.message }); process.exitCode = 1; }
  await db.end();
  await writeFile(resolve(output, "browser-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed.length, failed: result.failed.length, cleanup: result.cleanup }));
}
