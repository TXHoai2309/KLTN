import assert from "node:assert/strict";
import { test } from "node:test";

import {
  strictLogout,
  type StrictLogoutDependencies,
} from "./strict-logout";

const SESSION_A = "session-a";
const SESSION_B = "session-b";

function providerResult() {
  const headers = new Headers();
  headers.append("set-cookie", "better-auth.session_token=; Max-Age=0; Path=/");
  return { headers, response: { success: true } };
}

function cookieHeaders(outcome: Awaited<ReturnType<typeof strictLogout>>) {
  return outcome.status === "SUCCESS"
    ? (outcome.headers as Headers & { getSetCookie(): string[] }).getSetCookie()
    : [];
}

test("T1: provider success plus absent DB session returns success and cookie clear", async () => {
  let sessionExists = true;
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => {
      sessionExists = false;
      return providerResult();
    },
    findSession: async (id) => (id === SESSION_A && sessionExists ? { id } : null),
    deleteSession: async () => {
      sessionExists = false;
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.equal(outcome.status, "SUCCESS");
  assert.equal(cookieHeaders(outcome).length, 1);
  assert.equal(sessionExists, false);
});

test("T2: provider success with a retained session uses scoped DB fallback before success", async () => {
  let sessionExists = true;
  const deletedIds: string[] = [];
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => providerResult(),
    findSession: async (id) => (id === SESSION_A && sessionExists ? { id } : null),
    deleteSession: async (id) => {
      deletedIds.push(id);
      sessionExists = false;
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.equal(outcome.status, "SUCCESS");
  assert.deepEqual(deletedIds, [SESSION_A]);
  assert.equal(cookieHeaders(outcome).length, 1);
  assert.equal(sessionExists, false);
});

test("T3: fallback delete failure returns unknown without forwarding cookie clear", async () => {
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => providerResult(),
    findSession: async (id) => ({ id }),
    deleteSession: async () => {
      throw new Error("database detail");
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.deepEqual(outcome, { status: "UNKNOWN" });
  assert.deepEqual(cookieHeaders(outcome), []);
});

test("T4: verification query failure returns unknown without cookie clear", async () => {
  let reads = 0;
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => providerResult(),
    findSession: async () => {
      reads += 1;
      if (reads === 1) throw new Error("database detail");
      return null;
    },
    deleteSession: async () => undefined,
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.deepEqual(outcome, { status: "UNKNOWN" });
  assert.deepEqual(cookieHeaders(outcome), []);
});

test("a successful fallback with a session still present is a confirmed failure", async () => {
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => providerResult(),
    findSession: async (id) => ({ id }),
    deleteSession: async () => undefined,
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.deepEqual(outcome, { status: "FAILED" });
  assert.deepEqual(cookieHeaders(outcome), []);
});

test("T5: logout revokes session A only and never queries by user", async () => {
  const sessions = new Set([SESSION_A, SESSION_B]);
  const readIds: string[] = [];
  const deletedIds: string[] = [];
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => {
      sessions.delete(SESSION_A);
      return providerResult();
    },
    findSession: async (id) => {
      readIds.push(id);
      return sessions.has(id) ? { id } : null;
    },
    deleteSession: async (id) => {
      deletedIds.push(id);
      sessions.delete(id);
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.equal(outcome.status, "SUCCESS");
  assert.deepEqual(readIds, [SESSION_A]);
  assert.deepEqual(deletedIds, []);
  assert.deepEqual([...sessions], [SESSION_B]);
});

test("T6: already unauthenticated logout is a successful no-op", async () => {
  let providerCalls = 0;
  let databaseCalls = 0;
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => null,
    signOut: async () => {
      providerCalls += 1;
      return providerResult();
    },
    findSession: async () => {
      databaseCalls += 1;
      return null;
    },
    deleteSession: async () => {
      databaseCalls += 1;
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.equal(outcome.status, "SUCCESS");
  assert.deepEqual(cookieHeaders(outcome), []);
  assert.equal(providerCalls, 0);
  assert.equal(databaseCalls, 0);
});

test("provider failure still attempts current-session fallback but stays unconfirmed", async () => {
  let sessionExists = true;
  const dependencies: StrictLogoutDependencies = {
    resolveSession: async () => ({ session: { id: SESSION_A } }),
    signOut: async () => {
      throw new Error("provider detail");
    },
    findSession: async (id) => (id === SESSION_A && sessionExists ? { id } : null),
    deleteSession: async () => {
      sessionExists = false;
    },
  };

  const outcome = await strictLogout(new Headers(), dependencies);

  assert.deepEqual(outcome, { status: "UNKNOWN" });
  assert.equal(sessionExists, false);
  assert.deepEqual(cookieHeaders(outcome), []);
});
