import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import type { Database } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "./guard";
import { requirePermission, requireOwnership, readOwnedTravelerResource, type Actor, type Permission } from "./policy";
import { authorizationFeedback } from "../../lib/authorization-feedback";
import { getAccount, updateAccount } from "../../modules/account/account-service";
import { handleApiError, handleMutationApiError } from "../http/error-handler";

const traveler: Actor = { id: "traveler-a", role: "TRAVELER" };
const admin: Actor = { id: "admin", role: "ADMIN" };
for (const actor of [null, traveler, admin]) {
  for (const permission of ["public", "account:self", "traveler", "admin"] as const) {
    test(`matrix ${actor?.role ?? "GUEST"} / ${permission}`, () => {
      const allowed = permission === "public" || Boolean(actor && (permission === "account:self" ||
        permission === "traveler" && actor.role === "TRAVELER" || permission === "admin" && actor.role === "ADMIN"));
      if (allowed) requirePermission(actor, permission);
      else assert.throws(() => requirePermission(actor, permission), { status: actor ? 403 : 401 });
    });
  }
}

function fixture(id: string | null, role = "TRAVELER") {
  let lookups = 0;
  const database = { user: { findUnique: async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
    lookups++;
    assert.equal(where.id, id);
    assert.equal(select.role, true);
    return { id, role, name: "Own Name", email: "own@example.com", createdAt: new Date("2026-10-04T00:00:00Z") };
  } } } as unknown as Database;
  const dependencies = { database, resolveSession: async () => id ? { user: { id, role: "ADMIN" } } : null };
  return { dependencies, lookups: () => lookups };
}
test("trusted ID and persisted role win over forged headers/session role; every call rechecks", async () => {
  const f = fixture(traveler.id);
  const headers = new Headers({ "x-user-id": "victim", "x-role": "ADMIN" });
  assert.deepEqual(await requireActor(headers, f.dependencies, "traveler"), traveler);
  await assert.rejects(requireActor(headers, f.dependencies, "admin"), { status: 403 });
  assert.equal(f.lookups(), 2);
});
test("absent/revoked session and deleted user deny before returning protected data", async () => {
  const f = fixture(null);
  await assert.rejects(requireActor(new Headers(), f.dependencies), { status: 401 });
  assert.equal(f.lookups(), 0);
  const deps: AuthorizationDependencies = {
    database: { user: { findUnique: async () => null } } as unknown as Database,
    resolveSession: async () => ({ user: { id: "deleted" } }),
  };
  await assert.rejects(requireActor(new Headers(), deps), { status: 401 });
});
test("unknown persisted role fails closed for protected permissions", async () => {
  for (const permission of ["account:self", "traveler", "admin"] as const) {
    await assert.rejects(requireActor(new Headers(), fixture("unknown", "ROOT").dependencies, permission), { status: 403 });
  }
});
test("ownership has no Admin bypass and masks non-owned/missing resource", () => {
  requireOwnership(traveler, traveler.id);
  requireOwnership(admin, admin.id);
  for (const actor of [traveler, admin]) for (const owner of ["victim", null, undefined]) {
    assert.throws(() => requireOwnership(actor, owner), { status: 404, code: "NOT_FOUND" });
  }
});
test("Traveler lookup scopes URL ID by trusted user ID; wrong ID and missing ID return identical 404", async () => {
  const rows = [{ id: "trip-a", userId: traveler.id, secret: "own" }, { id: "trip-b", userId: "traveler-b", secret: "other" }];
  const findOwned = async (scope: { id: string; userId: string }) => rows.find(row => row.id === scope.id && row.userId === scope.userId) ?? null;
  assert.equal((await readOwnedTravelerResource(traveler, "trip-a", findOwned)).secret, "own");
  for (const id of ["trip-b", "absent", ""]) await assert.rejects(readOwnedTravelerResource(traveler, id, findOwned), { status: 404 });
  const b: Actor = { id: "traveler-b", role: "TRAVELER" };
  await assert.rejects(readOwnedTravelerResource(b, "trip-a", findOwned), { status: 404 });
});
test("Guest/Admin never invoke Traveler resource reader or mutation callback", async () => {
  let reads = 0; let writes = 0;
  for (const actor of [null, admin]) {
    await assert.rejects(async () => {
      await readOwnedTravelerResource(actor, "trip-a", async () => { reads++; return { id: "trip-a" }; });
      writes++;
    }, { status: actor ? 403 : 401 });
  }
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test("account remains self-only despite forged request identity; unknown role cannot update", async () => {
  const f = fixture(traveler.id);
  const result = await getAccount(new Headers({ "x-user-id": "traveler-b" }), f.dependencies);
  assert.equal(result.name, "Own Name");
  await assert.rejects(updateAccount(new Headers(), { name: "Change", userId: "traveler-b" }, "key", f.dependencies), { status: 400 });
  await assert.rejects(updateAccount(new Headers(), { name: "Change" }, "key", fixture("unknown", "ROOT").dependencies), { status: 403 });
});
test("API failures use 401/403/404 and writes are FAILED, with no resource data", async () => {
  for (const [actor, permission] of [[null, "account:self"], [traveler, "admin"], [admin, "traveler"]] as [Actor | null, Permission][]) {
    let error: unknown;
    try { requirePermission(actor, permission); } catch (caught) { error = caught; }
    const response = handleApiError(error);
    assert.equal(response.status, actor ? 403 : 401);
    assert.equal((await response.json()).success, false);
    const mutation = await handleMutationApiError(error).json();
    assert.equal(mutation.operationStatus, "FAILED"); assert.equal(mutation.data, undefined);
  }
  let error: unknown;
  try { requireOwnership(traveler, "other"); } catch (caught) { error = caught; }
  const response = handleApiError(error); assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});
test("UI feedback is explicit, and protected adapters retain independent server boundaries", async () => {
  for (const status of [401, 403, 404]) assert.ok(authorizationFeedback(status));
  assert.equal(authorizationFeedback(500), null);
  assert.equal(authorizationFeedback(undefined), null);
  const action = await readFile(new URL("../../app/auth-context-demo/actions.ts", import.meta.url), "utf8");
  assert.match(action, /requireActor\(await headers\(\), authorizationDependencies, "traveler"\)/);
  const account = await readFile(new URL("../../app/api/account/route.ts", import.meta.url), "utf8");
  assert.match(account, /new URL\(request.url\).search/);
  assert.match(account, /getAccount\(request.headers, accountDependencies\)/);
  assert.match(account, /updateAccount\(request.headers/);
  const adapter = await readFile(new URL("./server.ts", import.meta.url), "utf8");
  assert.match(adapter, /disableCookieCache: true, disableRefresh: true/);
});
