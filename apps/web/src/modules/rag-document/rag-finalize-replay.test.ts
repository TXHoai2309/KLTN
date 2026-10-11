import test from "node:test";
import assert from "node:assert/strict";
import { finalizeRagUpload, createRagUploadUrl } from "./rag-service";
import { AppError } from "@/server/http/app-error";

function fixture() {
  const bytes = new TextEncoder().encode("Tài liệu kiểm thử tổng hợp\n");
  const input = { pathname: "rag/admin-1/123e4567-e89b-42d3-a456-426614174000.txt", originalFileName: "sample.txt", mimeType: "text/plain", sizeBytes: bytes.length, sourceTitle: "Nguồn thử" };
  let actorId = "admin-1", role: "ADMIN" | "TRAVELER" | null = "ADMIN", unavailable = false, lookupFails = false, lostCommit = false;
  let reads = 0;
  const documents: Record<string, unknown>[] = [];
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const recordKey = (scope: string, key: string) => JSON.stringify([scope, key]);
  const database = {
    user: { findUnique: async () => role ? { id: actorId, role } : null },
    ragDocument: {
      findUnique: async ({ where }: { where: { storagePath: string } }) => documents.find(d => d.storagePath === where.storagePath) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (documents.some(d => d.storagePath === data.storagePath)) throw new AppError("RAG_FILE_ALREADY_REGISTERED", "Duplicate", 409);
        const row = { id: "rag-" + (documents.length + 1), ...data }; documents.push(row); return row;
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => { if (lookupFails) throw Error("lookup unavailable"); return records.get(recordKey(where.scope_key.scope, where.scope_key.key)) ?? null; },
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
        const key = recordKey(data.scope, data.key); if (records.has(key)) throw Error("Unique constraint"); records.set(key, data);
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const key = recordKey(where.scope_key.scope, where.scope_key.key); records.set(key, { ...records.get(key)!, ...data });
      },
    },
  };
  let tail = Promise.resolve();
  const db = { ...database, $transaction: async (execute: (tx: typeof database) => Promise<unknown>) => {
    const previous = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    const snapshot = new Map(records), before = documents.length;
    let result: unknown;
    try { result = await execute(database); }
    catch (error) { documents.length = before; records.clear(); for (const [k, v] of snapshot) records.set(k, v); throw error; }
    finally { release(); }
    if (lostCommit) { lostCommit = false; lookupFails = true; throw Error("Commit acknowledged too late"); }
    return result;
  } };
  const deps = {
    database: db as never, resolveSession: async () => role ? { user: { id: actorId } } : null,
    storage: {
      read: async () => { reads++; if (unavailable) throw Error("Blob unavailable"); return { bytes, mimeType: "text/plain", sizeBytes: bytes.length }; },
      issue: async () => ({ pathname: "synthetic", uploadUrl: "synthetic", contentType: "text/plain" }),
    },
  };
  return { deps, input, documents, records, reads: () => reads, offlineBlob: () => { unavailable = true; }, offlineLookup: () => { lookupFails = true; }, restoreLookup: () => { lookupFails = false; }, loseCommit: () => { lostCommit = true; }, setActor: (id: string) => { actorId = id; }, setRole: (r: typeof role) => { role = r; } };
}
const headers = new Headers();
test("A: committed finalize replays SUCCESS without reading unavailable Blob", async () => {
  const f = fixture(); assert.equal((await finalizeRagUpload(headers, f.input, "key", f.deps as never)).status, "SUCCESS");
  f.offlineBlob(); const result = await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  assert.equal(result.status, "SUCCESS"); if (result.status === "SUCCESS") assert.equal(result.replayed, true);
  assert.equal(f.reads(), 1); assert.equal(f.documents.length, 1);
});
test("B: same-key changed payload conflicts before Blob read", async () => {
  const f = fixture(); await finalizeRagUpload(headers, f.input, "key", f.deps as never); f.offlineBlob();
  const result = await finalizeRagUpload(headers, { ...f.input, sourceTitle: "Other" }, "key", f.deps as never);
  assert.equal(result.status, "FAILED"); if (result.status === "FAILED") assert.equal(result.httpStatus, 409); assert.equal(f.reads(), 1);
});
test("C: current role and pathname ownership are checked before replay", async () => {
  const f = fixture(); await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  f.setRole("TRAVELER"); await assert.rejects(() => finalizeRagUpload(headers, f.input, "key", f.deps as never), { status: 403 });
  f.setRole(null); await assert.rejects(() => finalizeRagUpload(headers, f.input, "key", f.deps as never), { status: 401 });
  f.setRole("ADMIN"); f.setActor("admin-2"); await assert.rejects(() => finalizeRagUpload(headers, f.input, "key", f.deps as never), { code: "INVALID_RAG_PATH" });
  f.offlineBlob(); await assert.rejects(() => finalizeRagUpload(headers, { ...f.input, pathname: f.input.pathname.replace("admin-1", "admin-2") }, "key", f.deps as never));
  assert.equal(f.documents.length, 1);
});
test("D: absent commit and unavailable Blob cannot fabricate success", async () => {
  const f = fixture(); f.offlineBlob(); await assert.rejects(() => finalizeRagUpload(headers, f.input, "key", f.deps as never)); assert.equal(f.documents.length, 0); assert.equal(f.records.size, 0);
});
test("E: failed preflight lookup yields UNKNOWN without Blob read or write", async () => {
  const f = fixture(); f.offlineLookup(); const r = await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  assert.equal(r.status, "UNKNOWN"); assert.equal(f.reads(), 0); assert.equal(f.documents.length, 0);
});
test("F: concurrent same-key writes register one document and replay", async () => {
  const f = fixture(); const results = await Promise.all(Array.from({ length: 5 }, () => finalizeRagUpload(headers, f.input, "key", f.deps as never)));
  assert.ok(results.every(r => r.status === "SUCCESS")); assert.equal(f.documents.length, 1); assert.equal(f.records.size, 1);
});
test("G: UNKNOWN acknowledgement after commit resolves on identical retry", async () => {
  const f = fixture(); f.loseCommit(); const first = await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  assert.equal(first.status, "UNKNOWN"); assert.equal(f.documents.length, 1);
  f.restoreLookup(); f.offlineBlob(); const replay = await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  assert.equal(replay.status, "SUCCESS"); assert.equal(f.reads(), 1); assert.equal(f.documents.length, 1);
});
test("H: different keys sharing a path cannot create duplicate records", async () => {
  const f = fixture(); const results = await Promise.all(["one", "two"].map(key => finalizeRagUpload(headers, f.input, key, f.deps as never)));
  assert.equal(f.documents.length, 1); assert.equal(results.filter(r => r.status === "SUCCESS").length, 1); assert.equal(results.filter(r => r.status === "FAILED").length, 1);
});
test("syntax and source URL validation precede replay; ticket requires Admin", async () => {
  const f = fixture(); await finalizeRagUpload(headers, f.input, "key", f.deps as never);
  await assert.rejects(() => finalizeRagUpload(headers, { ...f.input, sourceUrl: "javascript:alert(1)" }, "key", f.deps as never), { code: "INVALID_RAG_SOURCE" });
  await assert.rejects(() => finalizeRagUpload(headers, { ...f.input, extra: true }, "key", f.deps as never), { code: "INVALID_RAG_INPUT" });
  f.setRole("TRAVELER"); await assert.rejects(() => createRagUploadUrl(headers, { fileName: "test.txt", mimeType: "text/plain", sizeBytes: 1 }, f.deps as never), { status: 403 });
  assert.equal(f.reads(), 1);
});
