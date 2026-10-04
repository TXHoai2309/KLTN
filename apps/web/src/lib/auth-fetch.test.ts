import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthClient } from "better-auth/react";

import { createAuthFetch } from "./auth-fetch";
import { isSignOutConfirmed } from "./sign-out-confirmation";

test("a hanging session request settles the real Better Auth atom and can retry without reload", async () => {
  let offline = true;
  let requests = 0;
  const boundedFetch = createAuthFetch(async () => {
    requests++;
    if (offline) return new Promise<Response>(() => {});
    return Response.json(null);
  }, 20);
  const client = createAuthClient({
    baseURL: "http://localhost:3001",
    fetchOptions: { customFetchImpl: boundedFetch, retry: 0 },
  });
  const atom = client.$store.atoms.session;

  await atom.get().refetch();
  assert.equal(atom.get().isPending, false);
  assert.equal(atom.get().isRefetching, false);
  assert.ok(atom.get().error);
  assert.equal(requests, 1);

  offline = false;
  await atom.get().refetch();
  assert.equal(atom.get().isPending, false);
  assert.equal(atom.get().error, null);
  assert.equal(atom.get().data, null);
  assert.equal(requests, 2);
});

test("timeout aborts the transport without aborting Better Auth's caller signal", async () => {
  const caller = new AbortController();
  let transportSignal: AbortSignal | null | undefined;
  const boundedFetch = createAuthFetch(async (_input, init) => {
    transportSignal = init?.signal;
    return new Promise<Response>(() => {});
  }, 20);

  await assert.rejects(boundedFetch("http://localhost/api/auth/get-session", { signal: caller.signal }), { name: "TimeoutError" });
  assert.equal(caller.signal.aborted, false);
  assert.equal(transportSignal?.aborted, true);
});

test("logout timeout is unconfirmed and does not automatically retry", async () => {
  let requests = 0;
  const boundedFetch = createAuthFetch(async () => {
    requests++;
    return new Promise<Response>(() => {});
  }, 20);
  assert.equal(await isSignOutConfirmed(() => boundedFetch("http://localhost/api/session/logout", { method: "POST" })), false);
  assert.equal(requests, 1);
});

test("receiving headers with a hanging body also times out", async () => {
  const boundedFetch = createAuthFetch(async () => new Response(new ReadableStream({ start() {} })), 20);
  await assert.rejects(boundedFetch("http://localhost/api/auth/get-session"), { name: "TimeoutError" });
});

test("successful response keeps JSON and headers, and explicit caller cancellation is preserved", async () => {
  const boundedFetch = createAuthFetch(async () => Response.json({ success: true }, { headers: { "x-test": "ok" } }), 100);
  const response = await boundedFetch("http://localhost/api/session/logout");
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(response.headers.get("x-test"), "ok");

  const caller = new AbortController();
  caller.abort();
  await assert.rejects(boundedFetch("http://localhost/api/auth/get-session", { signal: caller.signal }), { name: "AbortError" });
});
