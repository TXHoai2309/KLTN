import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import type { Database } from "@KLTN/db";
import { accountDtoSchema, accountNameSchema } from "./account-contract";
import { getAccount, updateAccount, type AccountDependencies } from "./account-service";
import { loadAccount, saveAccount } from "../../lib/account-client";
import { claimSubmission, releaseSubmission } from "../../lib/auth-submission-guard";

function fixture(role: "TRAVELER" | "ADMIN" = "TRAVELER") {
  const user = { id: "self", name: "Original Name", email: "fixture@example.com", role, emailVerified: false, createdAt: new Date("2026-10-01T00:00:00Z"), token: "never-return-this", password: "never-return-this" };
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  let writes = 0;
  let authenticated = true;
  const database = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, "self"); return user; },
      update: async ({ where, data }: { where: { id: string }; data: { name: string } }) => {
        assert.equal(where.id, "self"); assert.deepEqual(Object.keys(data), ["name"]); writes++; user.name = data.name; return user;
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => records.set(JSON.stringify({ scope: data.scope, key: data.key }), data),
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => Object.assign(records.get(JSON.stringify(where.scope_key))!, data),
    },
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) => execute(database),
  };
  const dependencies: AccountDependencies = { database: database as unknown as Database, resolveSession: async () => authenticated ? { user: { id: "self" } } : null };
  return { user, dependencies, writes: () => writes, revoke: () => { authenticated = false; } };
}
const headers = new Headers();

test("GET and PATCH require a trusted session, including a revoked session", async () => {
  const f = fixture(); f.revoke();
  await assert.rejects(getAccount(headers, f.dependencies), { code: "UNAUTHENTICATED" });
  await assert.rejects(updateAccount(headers, { name: "New Name" }, "key", f.dependencies), { code: "UNAUTHENTICATED" });
  assert.equal(f.writes(), 0);
});
test("GET returns exactly the public account DTO and excludes adapter secrets", async () => {
  const f = fixture(); const dto = await getAccount(headers, f.dependencies);
  assert.deepEqual(Object.keys(dto).sort(), ["createdAt", "email", "name", "role"]);
  assert.equal(dto.createdAt, "2026-10-01T00:00:00.000Z");
  assert.equal(accountDtoSchema.safeParse(dto).success, true);
});
for (const role of ["TRAVELER", "ADMIN"] as const) test(`${role} reads/updates only its own account; other fields remain unchanged`, async () => {
  const f = fixture(role);
  assert.equal((await getAccount(headers, f.dependencies)).role, role);
  const result = await updateAccount(headers, { name: "  Updated Name  " }, "key", f.dependencies);
  assert.equal(result.status, "SUCCESS");
  if (result.status === "SUCCESS") assert.deepEqual(result.data, { name: "Updated Name", email: f.user.email, role, createdAt: f.user.createdAt.toISOString() });
  assert.equal(f.user.id, "self"); assert.equal(f.user.role, role); assert.equal(f.user.emailVerified, false); assert.equal(f.user.email, "fixture@example.com"); assert.equal(f.writes(), 1);
});
for (const input of ["", " ", "A", "x".repeat(101), null, 12]) test(`invalid name (${String(input).slice(0, 8)}) cannot write`, async () => {
  const f = fixture();
  await assert.rejects(updateAccount(headers, { name: input }, "key", f.dependencies), { code: "INVALID_ACCOUNT_INPUT" });
  assert.equal(f.writes(), 0); assert.equal(f.user.name, "Original Name");
});
test("client name validation uses trimmed 2..100 character contract", () => {
  assert.equal(accountNameSchema.parse("  AB  "), "AB");
  assert.equal(accountNameSchema.safeParse("x".repeat(100)).success, true);
  assert.equal(accountNameSchema.safeParse(" x ").success, false);
});
test("crafted role/id/userId/email/emailVerified/provider fields are rejected before writing", async () => {
  for (const field of ["role", "id", "userId", "email", "emailVerified", "permissions", "session", "image", "account"]) {
    const f = fixture();
    await assert.rejects(updateAccount(headers, { name: "New Name", [field]: "other-user-or-admin" }, "key", f.dependencies), { code: "INVALID_ACCOUNT_INPUT" });
    assert.equal(f.writes(), 0); assert.equal(f.user.role, "TRAVELER"); assert.equal(f.user.emailVerified, false);
  }
});
test("retry identical key/payload replays confirmed success without another update; key reuse conflicts", async () => {
  const f = fixture();
  await updateAccount(headers, { name: "New Name" }, "key", f.dependencies);
  const replay = await updateAccount(headers, { name: "New Name" }, "key", f.dependencies);
  assert.equal(replay.status, "SUCCESS"); if (replay.status === "SUCCESS") assert.equal(replay.replayed, true);
  const conflict = await updateAccount(headers, { name: "Other Name" }, "key", f.dependencies);
  assert.equal(conflict.status, "FAILED"); if (conflict.status === "FAILED") assert.equal(conflict.httpStatus, 409);
  assert.equal(f.writes(), 1);
});
test("client accepts only confirmed persisted DTO; lost/invalid responses remain UNKNOWN", async () => {
  const dto = await getAccount(headers, fixture().dependencies);
  let submitted = 0;
  const transport: typeof fetch = async (_input, init) => { submitted++; assert.equal(init?.method, "PATCH"); assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "key"); assert.deepEqual(JSON.parse(String(init?.body)), { name: "Name" }); return Response.json({ success: true, operationStatus: "SUCCESS", data: dto }); };
  const result = await saveAccount("Name", "key", transport); assert.equal(result.status, "SUCCESS"); assert.equal(submitted, 1);
  assert.equal((await saveAccount("Name", "key", async () => { throw new Error("lost response"); })).status, "UNKNOWN");
  assert.equal((await saveAccount("Name", "key", async () => Response.json({ success: true, operationStatus: "SUCCESS", data: { ...dto, token: "secret" } }))).status, "UNKNOWN");
  assert.equal((await saveAccount("Name", "key", async () => new Response("not json"))).status, "UNKNOWN");
});
test("FAILED is not success; reread failure cannot confirm a save", async () => {
  const failed = await saveAccount("Name", "key", async () => Response.json({ success: false, operationStatus: "FAILED", error: { code: "INVALID_ACCOUNT_INPUT" } }, { status: 400 }));
  assert.equal(failed.status, "FAILED");
  await assert.rejects(loadAccount(async () => Response.json({ success: false }, { status: 401 })));
});
test("synchronous submission guard permits one click/Enter request until released", () => {
  const lock = { current: false }; let writes = 0;
  for (let i = 0; i < 3; i++) if (claimSubmission(lock)) writes++;
  assert.equal(writes, 1); releaseSubmission(lock); assert.equal(claimSubmission(lock), true);
});
test("product UI starts in view mode, cancel does not update, UNKNOWN rereads, and success refetches Better Auth", async () => {
  const ui = await readFile(new URL("../../app/account/account-profile.tsx", import.meta.url), "utf8");
  assert.match(ui, /\[editing, setEditing\] = useState\(false\)/);
  const cancel = ui.slice(ui.indexOf("async function cancel()"), ui.indexOf("async function logout()"));
  assert.doesNotMatch(cancel, /saveAccount|PATCH/); assert.match(cancel, /setDraft\(persisted.name\)/);
  assert.match(ui, /if \(uncertain\).*await loadAccount\(\)/);
  assert.match(ui, /if \(outcome.status === "SUCCESS"\)/);
  assert.match(ui, /void refreshSessionName\(\)/);
  assert.match(ui, /refetch\(\{ query: \{ disableCookieCache: true \} \}\)/);
  assert.match(ui, /value=\{account.email\} readOnly/); assert.match(ui, /value=\{role\} readOnly/);
  assert.match(ui, /method="post"/);
  assert.match(ui, /if \(!editing\) return;/);
  assert.match(ui, /key="edit".*event.preventDefault\(\)/);
  assert.match(ui, /key="save".*type="submit"/);
});
test("server page redirects guests with canonical account returnTo and API protects origin/private response", async () => {
  const page = await readFile(new URL("../../app/account/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../../app/api/account/route.ts", import.meta.url), "utf8");
  assert.match(page, /resolveSession\(await headers\(\)\)/); assert.match(page, /redirect\(buildAuthLoginHref\("\/account"\) as Route\)/);
  assert.match(route, /request.headers.get\("origin"\) !== new URL\(request.url\).origin/);
  assert.match(route, /private, no-store/); assert.doesNotMatch(route, /session.token|session.cookie|account.password/);
});
