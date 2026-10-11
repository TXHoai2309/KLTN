import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { validateRagFile, retrievalEligible } from "./rag-file";
import { finalizeRagUpload, getRagOriginal } from "./rag-service";

const pdf = strToU8("%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF");
const txt = strToU8("Cao nguyên đá Đồng Văn\n");
const docx = zipSync({
  "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'),
});

const cases = [
  { name: "valid PDF", file: "guide.pdf", mime: "application/pdf", bytes: pdf, type: "PDF" },
  { name: "valid DOCX", file: "guide.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: docx, type: "DOCX" },
  { name: "valid TXT", file: "guide.txt", mime: "text/plain", bytes: txt, type: "TXT" },
] as const;

for (const item of cases) test(`${item.name} is accepted`, () => {
  assert.equal(validateRagFile(item.file, item.mime, item.bytes), item.type);
});

test("unsupported, oversized and spoofed files are rejected", () => {
  assert.throws(() => validateRagFile("photo.jpg", "image/jpeg", txt));
  assert.throws(() => validateRagFile("guide.pdf", "application/pdf", new Uint8Array(20 * 1024 * 1024 + 1)));
  assert.throws(() => validateRagFile("guide.pdf", "application/pdf", txt));
  assert.throws(() => validateRagFile("guide.docx", cases[1].mime, zipSync({ "fake.txt": txt })));
  assert.throws(() => validateRagFile("guide.pdf", "text/plain", pdf));
  assert.throws(() => validateRagFile("guide.txt", "text/plain", new Uint8Array([0, 1, 2])));
});

test("UPLOADED is not retrieval eligible", () => {
  assert.equal(retrievalEligible("UPLOADED"), false);
  assert.equal(retrievalEligible("INDEXED"), true);
});

function setup(role: "ADMIN" | "TRAVELER" | null = "ADMIN", item: typeof cases[number] = cases[0]) {
  const path = `rag/admin-1/123e4567-e89b-42d3-a456-426614174000.${item.type.toLowerCase()}`;
  const records: unknown[] = [];
  const idempotency = new Map<string, { requestHash: string; responseJson: string }>();
  let storageFails = false;
  let dbFails = false;
  const tx = {
    user: { findUnique: async () => role ? { id: "admin-1", role } : null },
    ragDocument: { findUnique: async ({ where }: { where: { storagePath?: string; id?: string } }) => records.find(row => (where.storagePath && (row as { storagePath: string }).storagePath === where.storagePath) || (where.id && (row as { id: string }).id === where.id)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
      if (dbFails) throw new Error("DB unavailable");
      const row = { id: "rag-1", ...data, createdAt: new Date(), updatedAt: new Date() };
      records.push(row);
      return row;
    } },
    idempotencyRecord: {
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => { idempotency.set(`${data.scope}:${data.key}`, { requestHash: data.requestHash, responseJson: data.responseJson }); },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const key = `${where.scope_key.scope}:${where.scope_key.key}`;
        const current = idempotency.get(key)!;
        idempotency.set(key, { ...current, responseJson: data.responseJson });
      },
    },
  };
  const deps = {
    resolveSession: async () => role ? { user: { id: "admin-1" } } : null,
    database: {
      user: tx.user,
      ragDocument: tx.ragDocument,
      idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => idempotency.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null },
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => {
        const before = new Map(idempotency);
        try { return await fn(tx); }
        catch (error) { idempotency.clear(); for (const [key, value] of before) idempotency.set(key, value); throw error; }
      },
    },
    storage: {
      read: async () => { if (storageFails) throw new Error("storage unavailable"); return { bytes: item.bytes, mimeType: item.mime, sizeBytes: item.bytes.length }; },
      stream: async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(item.bytes); controller.close(); } }),
    },
  };
  const input = { pathname: path, originalFileName: item.file, mimeType: item.mime, sizeBytes: item.bytes.length, sourceTitle: "Tài liệu địa phương" };
  return { deps, input, records, failStorage: () => { storageFails = true; }, failDb: () => { dbFails = true; }, restoreDb: () => { dbFails = false; } };
}

test("Admin finalizes a private blob once with UPLOADED status", async () => {
  const { deps, input, records } = setup();
  const first = await finalizeRagUpload(new Headers(), input, "key-1", deps as never);
  assert.equal(first.status, "SUCCESS");
  assert.equal(records.length, 1);
  assert.equal((records[0] as { status: string }).status, "UPLOADED");
  const replay = await finalizeRagUpload(new Headers(), input, "key-1", deps as never);
  assert.equal(replay.status, "SUCCESS");
  assert.equal(records.length, 1);
});

for (const item of cases) test(`${item.type} finalizes as UPLOADED`, async () => {
  const { deps, input, records } = setup("ADMIN", item);
  const outcome = await finalizeRagUpload(new Headers(), input, `key-${item.type}`, deps as never);
  assert.equal(outcome.status, "SUCCESS");
  assert.equal((records[0] as { fileType: string }).fileType, item.type);
  assert.equal((records[0] as { status: string }).status, "UPLOADED");
});

test("Guest and Traveler cannot finalize", async () => {
  for (const role of [null, "TRAVELER"] as const) {
    const { deps, input, records } = setup(role);
    await assert.rejects(() => finalizeRagUpload(new Headers(), input, "key", deps as never), { status: role ? 403 : 401 });
    assert.equal(records.length, 0);
  }
});

test("Storage or DB failure never returns success", async () => {
  const storage = setup(); storage.failStorage();
  await assert.rejects(() => finalizeRagUpload(new Headers(), storage.input, "key", storage.deps as never));
  assert.equal(storage.records.length, 0);
  const db = setup(); db.failDb();
  const result = await finalizeRagUpload(new Headers(), db.input, "key", db.deps as never);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(db.records.length, 0);
  db.restoreDb();
  const retry = await finalizeRagUpload(new Headers(), db.input, "key", db.deps as never);
  assert.equal(retry.status, "SUCCESS");
  assert.equal(db.records.length, 1);
});

test("Admin receives scoped upload path while Guest and Traveler are denied", async () => {
  const { createRagUploadUrl } = await import("./rag-service");
  for (const role of [null, "TRAVELER"] as const) {
    const { deps } = setup(role);
    await assert.rejects(() => createRagUploadUrl(new Headers(), { fileName: "guide.pdf", mimeType: "application/pdf", sizeBytes: 200 }, { ...deps, storage: { ...deps.storage, issue: async () => { throw new Error("Must not issue a token"); } } } as never), { status: role ? 403 : 401 });
  }
  const { deps } = setup();
  const result = await createRagUploadUrl(new Headers(), { fileName: "guide.pdf", mimeType: "application/pdf", sizeBytes: 200 }, { ...deps, storage: { ...deps.storage, issue: async (pathname: string, mimeType: string) => ({ pathname, uploadUrl: "https://private.example/upload", contentType: mimeType }) } } as never);
  assert.match(result.pathname, /^rag\/admin-1\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(result.contentType, "application/pdf");
});

test("Finalization rejects a blob with mismatched metadata and another Admin path", async () => {
  const { deps, input, records } = setup();
  await assert.rejects(() => finalizeRagUpload(new Headers(), { ...input, pathname: input.pathname.replace("admin-1", "admin-2") }, "key", deps as never), { status: 400 });
  await assert.rejects(() => finalizeRagUpload(new Headers(), { ...input, sizeBytes: input.sizeBytes + 1 }, "key", deps as never), { status: 400 });
  assert.equal(records.length, 0);
});

test("A different key cannot register an already recorded blob again", async () => {
  const { deps, input, records } = setup();
  assert.equal((await finalizeRagUpload(new Headers(), input, "one", deps as never)).status, "SUCCESS");
  const second = await finalizeRagUpload(new Headers(), input, "two", deps as never);
  assert.equal(second.status, "FAILED");
  assert.equal(records.length, 1);
});

test("Original file read requires Admin and an existing RagDocument", async () => {
  const guest = setup(null);
  await assert.rejects(() => getRagOriginal(new Headers(), "rag-1", guest.deps as never), { status: 401 });
  const traveler = setup("TRAVELER");
  await assert.rejects(() => getRagOriginal(new Headers(), "rag-1", traveler.deps as never), { status: 403 });
  const admin = setup();
  await assert.rejects(() => getRagOriginal(new Headers(), "rag-1", admin.deps as never), { status: 404 });
  assert.equal((await finalizeRagUpload(new Headers(), admin.input, "key", admin.deps as never)).status, "SUCCESS");
  const original = await getRagOriginal(new Headers(), "rag-1", admin.deps as never);
  assert.equal(original.row.storagePath, admin.input.pathname);
  assert.equal(new TextDecoder().decode(await new Response(original.stream).arrayBuffer()), new TextDecoder().decode(pdf));
});
