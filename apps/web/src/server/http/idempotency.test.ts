import test from "node:test";
import assert from "node:assert/strict";
import { executeIdempotentWrite, preflightIdempotentReplay } from "./idempotency";

function fixture() {
  const rows = new Map<string, { requestHash: string; responseJson: string }>();
  const id = (where: { scope_key: { scope: string; key: string } }) => JSON.stringify(where.scope_key);
  let unavailable = false;
  const records = {
    findUnique: async ({ where }: { where: Parameters<typeof id>[0] }) => { if (unavailable) throw Error("offline"); return rows.get(id(where)) ?? null; },
    create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => rows.set(JSON.stringify({ scope: data.scope, key: data.key }), data),
    update: async ({ where, data }: { where: Parameters<typeof id>[0]; data: { responseJson: string } }) => rows.set(id(where), { ...rows.get(id(where))!, ...data }),
  };
  const database = { idempotencyRecord: records, $transaction: async (fn: (tx: unknown) => unknown) => fn({ idempotencyRecord: records }) };
  return { options: { database: database as never, actorId: "admin-1", operation: "test", key: "key", input: { b: 2, a: 1 } }, rows, offline: () => { unavailable = true; } };
}
test("preflight and existing writes share canonical scope/hash and confirmed replay", async () => {
  const f = fixture(); assert.equal((await preflightIdempotentReplay(f.options)).status, "ABSENT");
  const first = await executeIdempotentWrite({ ...f.options, execute: async () => ({ id: "saved" }) }); assert.equal(first.status, "SUCCESS");
  const replay = await preflightIdempotentReplay({ ...f.options, input: { a: 1, b: 2 } });
  assert.deepEqual(replay, { status: "SUCCESS", data: { id: "saved" }, replayed: true });
  assert.equal((await executeIdempotentWrite({ ...f.options, execute: async () => { throw Error("must not execute"); } })).status, "SUCCESS");
});
test("conflict, actor and operation isolation are preserved", async () => {
  const f = fixture(); await executeIdempotentWrite({ ...f.options, execute: async () => ({ id: "saved" }) });
  const conflict = await preflightIdempotentReplay({ ...f.options, input: { a: 2 } }); assert.equal(conflict.status, "FAILED");
  if (conflict.status === "FAILED") assert.equal(conflict.httpStatus, 409);
  assert.equal((await preflightIdempotentReplay({ ...f.options, actorId: "other" })).status, "ABSENT");
  assert.equal((await preflightIdempotentReplay({ ...f.options, operation: "other" })).status, "ABSENT");
});
test("database lookup errors and malformed stored responses fail closed", async () => {
  const f = fixture(); f.offline(); assert.equal((await preflightIdempotentReplay(f.options)).status, "UNKNOWN");
  const g = fixture(); await executeIdempotentWrite({ ...g.options, execute: async () => "saved" });
  for (const row of g.rows.values()) row.responseJson = "invalid-json";
  assert.equal((await preflightIdempotentReplay(g.options)).status, "UNKNOWN");
});
test("invalid keys/scopes and non-JSON input retain original known failures", async () => {
  const f = fixture(); for (const change of [{ key: "" }, { actorId: "" }, { operation: "" }, { input: { a: undefined } }]) {
    const preflight = await preflightIdempotentReplay({ ...f.options, ...change });
    const write = await executeIdempotentWrite({ ...f.options, ...change, execute: async () => "unexpected" });
    assert.deepEqual(preflight, write); assert.equal(preflight.status, "FAILED");
  }
});
