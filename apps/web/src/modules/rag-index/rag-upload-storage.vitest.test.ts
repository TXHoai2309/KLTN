import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const mocks = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn(), issue: vi.fn(), presign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", async importOriginal => ({
  ...await importOriginal<typeof import("@vercel/blob")>(),
  get: mocks.get, head: mocks.head, issueSignedToken: mocks.issue, presignUrl: mocks.presign,
}));
const bytes = new TextEncoder().encode("Synthetic Vietnamese reference: Hà Giang.\n");
const token = "vercel_blob_rw_syntheticstore_syntheticsecret";
function response(size = 0, content = bytes) {
  return { statusCode: 200, blob: { size, contentType: "text/plain" },
    stream: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(content); c.close(); } }) };
}
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("BLOB_READ_WRITE_TOKEN", token); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Private Blob upload/finalize response contract", () => {
  it("SDK 2.8.1 returns size zero with a real stream when Content-Length is absent", async () => {
    const sdk = await vi.importActual<typeof import("@vercel/blob")>("@vercel/blob");
    // The SDK imports undici.fetch, not global fetch. Disable all network access
    // on the SDK's own dispatcher so this contract test is entirely offline.
    const require = createRequire(import.meta.url);
    const undici = require(require.resolve("undici", { paths: [dirname(require.resolve("@vercel/blob"))] }));
    const previous = undici.getGlobalDispatcher();
    const agent = new undici.MockAgent(); agent.disableNetConnect();
    agent.get("https://syntheticstore.private.blob.vercel-storage.com").intercept({ path: "/rag/synthetic/reference.txt", method: "GET" })
      .reply(200, Buffer.from(bytes), { headers: { "content-type": "text/plain" } });
    undici.setGlobalDispatcher(agent);
    try {
      const result = await sdk.get("rag/synthetic/reference.txt", { access: "private", token });
      expect(result).toMatchObject({ statusCode: 200, blob: { size: 0 } });
      expect(result?.headers.get("content-length")).toBeNull();
      expect(await new Response(result?.stream).arrayBuffer()).toEqual(bytes.buffer);
    } finally { undici.setGlobalDispatcher(previous); await agent.close(); }
  });
  it("reads actual bytes when GET metadata has no Content-Length", async () => {
    mocks.get.mockResolvedValue(response());
    const { ragStorage } = await import("../rag-document/rag-storage");
    expect(await ragStorage.read("rag/synthetic/reference.txt")).toEqual({ bytes, mimeType: "text/plain", sizeBytes: bytes.length });
  });
  it("classifies a missing blob as NOT_FOUND", async () => {
    mocks.get.mockResolvedValue(null);
    const { ragStorage } = await import("../rag-document/rag-storage");
    await expect(ragStorage.read("missing")).rejects.toMatchObject({ code: "RAG_FILE_NOT_FOUND", status: 404 });
  });
  it("does not classify a 304 with no body as NOT_FOUND", async () => {
    mocks.get.mockResolvedValue({ statusCode: 304, stream: null, blob: { size: null } });
    const { ragStorage } = await import("../rag-document/rag-storage");
    await expect(ragStorage.read("existing")).rejects.toMatchObject({ code: "RAG_STORAGE_RESPONSE", status: 502 });
    await expect(ragStorage.stream("existing")).rejects.toMatchObject({ code: "RAG_STORAGE_RESPONSE" });
  });
  it("keeps access/network failures distinct from NOT_FOUND without exposing SDK details", async () => {
    mocks.get.mockRejectedValue(new Error("synthetic sensitive upstream details"));
    const { ragStorage } = await import("../rag-document/rag-storage");
    await expect(ragStorage.read("existing")).rejects.toMatchObject({ code: "RAG_STORAGE_UNAVAILABLE", status: 503 });
  });
  it("rejects an actually empty file as invalid size", async () => {
    mocks.get.mockResolvedValue(response(0, new Uint8Array()));
    const { ragStorage } = await import("../rag-document/rag-storage");
    await expect(ragStorage.read("empty")).rejects.toMatchObject({ code: "RAG_FILE_SIZE", status: 400 });
  });
  it("bounds real streamed bytes despite unknown or misleading metadata and cancels on overflow", async () => {
    const cancel = vi.fn(); let emitted = false;
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { size: 0, contentType: "text/plain" },
      stream: new ReadableStream({ pull(c) { if (!emitted) { emitted = true; c.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); } }, cancel }) });
    const { ragStorage } = await import("../rag-document/rag-storage");
    await expect(ragStorage.read("oversize")).rejects.toMatchObject({ code: "RAG_FILE_SIZE" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("upload ticket -> synthetic PUT -> finalize UPLOADED -> review and index read the same private pathname", async () => {
    const { ragStorage } = await import("../rag-document/rag-storage");
    const { createRagUploadUrl, finalizeRagUpload, getRagOriginal } = await import("../rag-document/rag-service");
    const stored = new Map<string, Uint8Array<ArrayBuffer>>();
    const documents: Record<string, unknown>[] = [];
    const records = new Map<string, Record<string, unknown>>();
    const recordKey = (x: { scope: string; key: string }) => JSON.stringify([x.scope, x.key]);
    const database = {
      user: { findUnique: async () => ({ id: "synthetic-admin", role: "ADMIN" }) },
      ragDocument: {
        findUnique: async ({ where }: { where: { id?: string; storagePath?: string } }) => documents.find(x => where.id ? x.id === where.id : x.storagePath === where.storagePath) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "synthetic-document", ...data }; documents.push(row); return row; },
      },
      idempotencyRecord: {
        findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.get(recordKey(where.scope_key)) ?? null,
        create: async ({ data }: { data: { scope: string; key: string } }) => { records.set(recordKey(data), { ...data }); },
        update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: Record<string, unknown> }) => records.set(recordKey(where.scope_key), { ...records.get(recordKey(where.scope_key)), ...data }),
      },
      $transaction: async (execute: (tx: unknown) => Promise<unknown>) => execute(database),
    };
    const deps = { database: database as unknown as Database, resolveSession: async () => ({ user: { id: "synthetic-admin" } }), storage: ragStorage };
    mocks.issue.mockResolvedValue("synthetic-signed-ticket");
    mocks.presign.mockResolvedValue({ presignedUrl: "https://synthetic.invalid/put" });
    const ticket = await createRagUploadUrl(new Headers(), { fileName: "sample.txt", mimeType: "text/plain", sizeBytes: bytes.length }, deps);
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ pathname: ticket.pathname, operations: ["put"], token }));
    expect(mocks.presign).toHaveBeenCalledWith("synthetic-signed-ticket", expect.objectContaining({ pathname: ticket.pathname, access: "private", addRandomSuffix: false }));
    // Simulated browser PUT stores bytes under the exact ticket pathname; no live I/O.
    stored.set(ticket.pathname, bytes);
    mocks.get.mockImplementation(async pathname => stored.has(pathname) ? response(0, stored.get(pathname)) : null);
    const result = await finalizeRagUpload(new Headers(), { pathname: ticket.pathname, originalFileName: "sample.txt", mimeType: "text/plain", sizeBytes: bytes.length, sourceTitle: "Synthetic source" }, "synthetic-key", deps);
    expect(result).toMatchObject({ status: "SUCCESS", data: { status: "UPLOADED", retrievalEligible: false } });
    expect(documents[0]).toMatchObject({ storagePath: ticket.pathname, sizeBytes: bytes.length, status: "UPLOADED" });
    const original = await getRagOriginal(new Headers(), "synthetic-document", deps);
    expect(new Uint8Array(await new Response(original.stream).arrayBuffer())).toEqual(bytes);
    expect(await ragStorage.read(documents[0].storagePath as string)).toEqual({ bytes, sizeBytes: bytes.length, mimeType: "text/plain" });
    expect(mocks.get.mock.calls.every(([pathname, opts]) => pathname === ticket.pathname && opts.access === "private" && opts.token === token)).toBe(true);
  });
});
