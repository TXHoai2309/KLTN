import test from "node:test";
import assert from "node:assert/strict";
import { getRagDocument, listRagDocuments, transitionRagDocument } from "./rag-service";
import { confirmedRagDetail } from "./rag-review-state";

type Status = "UPLOADED" | "REVIEWING" | "APPROVED" | "DISABLED";

function setup(status: Status = "UPLOADED", role: "ADMIN" | "TRAVELER" | null = "ADMIN") {
  const row = {
    id: "rag-1", originalFileName: "ha-giang.pdf", fileType: "PDF", mimeType: "application/pdf",
    sizeBytes: 1024, storagePath: "rag/admin-1/file.pdf", sourceTitle: "Tài liệu Hà Giang",
    sourceUrl: "https://example.org/source", author: "Tác giả", topic: "Văn hóa", locality: "Đồng Văn",
    uploadedById: "admin-1", status, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"),
  };
  let fileExists = true;
  const idempotency = new Map<string, { requestHash: string; responseJson: string }>();
  const ragDocument = {
    findMany: async () => [row],
    findUnique: async ({ where }: { where: { id: string } }) => where.id === row.id ? { ...row } : null,
    updateMany: async ({ where, data }: { where: { id: string; status: Status }; data: { status: Status } }) => {
      if (where.id !== row.id || where.status !== row.status) return { count: 0 };
      row.status = data.status;
      return { count: 1 };
    },
  };
  const tx = {
    user: { findUnique: async () => role ? { id: "admin-1", role } : null },
    ragDocument,
    idempotencyRecord: {
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => { idempotency.set(`${data.scope}:${data.key}`, { requestHash: data.requestHash, responseJson: data.responseJson }); },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const key = `${where.scope_key.scope}:${where.scope_key.key}`;
        idempotency.set(key, { ...idempotency.get(key)!, responseJson: data.responseJson });
      },
    },
  };
  const deps = {
    resolveSession: async () => role ? { user: { id: "admin-1" } } : null,
    database: {
      ...tx,
      idempotencyRecord: { ...tx.idempotencyRecord, findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => idempotency.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null },
      $transaction: async (run: (value: typeof tx) => Promise<unknown>) => {
        const before = row.status;
        const beforeKeys = new Map(idempotency);
        try { return await run(tx); } catch (error) { row.status = before; idempotency.clear(); for (const [key, value] of beforeKeys) idempotency.set(key, value); throw error; }
      },
    },
    storage: { accessible: async () => fileExists },
  };
  return { row, deps, missingFile: () => { fileExists = false; } };
}

const headers = new Headers();

test("Admin list and detail contain metadata and server actions without storage path", async () => {
  const { deps } = setup();
  const list = await listRagDocuments(headers, deps as never);
  assert.equal(list.items[0].originalFileName, "ha-giang.pdf");
  assert.equal(list.items[0].retrievalEligible, false);
  assert.equal("storagePath" in list.items[0], false);
  const detail = await getRagDocument(headers, "rag-1", deps as never);
  assert.deepEqual(detail.document.allowedActions, ["START_REVIEW"]);
  assert.equal(detail.document.sourceUrl, "https://example.org/source");
  assert.equal("storagePath" in detail.document, false);
});

test("UPLOADED to REVIEWING succeeds and same key replays", async () => {
  const { deps, row } = setup();
  const first = await transitionRagDocument(headers, "rag-1", { action: "START_REVIEW" }, "key-1", deps as never);
  assert.equal(first.status, "SUCCESS");
  assert.equal(row.status, "REVIEWING");
  const replay = await transitionRagDocument(headers, "rag-1", { action: "START_REVIEW" }, "key-1", deps as never);
  assert.equal(replay.status, "SUCCESS");
  assert.equal(replay.replayed, true);
});

test("REVIEWING to APPROVED succeeds but is not retrieval eligible", async () => {
  const { deps, row } = setup("REVIEWING");
  const outcome = await transitionRagDocument(headers, "rag-1", { action: "APPROVE" }, "key-2", deps as never);
  assert.equal(outcome.status, "SUCCESS");
  assert.equal(row.status, "APPROVED");
  if (outcome.status === "SUCCESS") assert.equal(outcome.data.retrievalEligible, false);
  const detail = await getRagDocument(headers, "rag-1", deps as never);
  assert.deepEqual(detail.document.allowedActions, []);
  assert.equal(detail.document.retrievalEligible, false);
});

for (const [status, action] of [["UPLOADED", "APPROVE"], ["APPROVED", "START_REVIEW"], ["APPROVED", "APPROVE"], ["DISABLED", "START_REVIEW"]] as const) {
  test(`${status} with ${action} is rejected`, async () => {
    const { deps, row } = setup(status);
    const outcome = await transitionRagDocument(headers, "rag-1", { action }, `invalid-${status}-${action}`, deps as never);
    assert.equal(outcome.status, "FAILED");
    assert.equal(row.status, status);
  });
}

test("unavailable original prevents APPROVE and keeps REVIEWING", async () => {
  const { deps, row, missingFile } = setup("REVIEWING");
  missingFile();
  const outcome = await transitionRagDocument(headers, "rag-1", { action: "APPROVE" }, "missing", deps as never);
  assert.equal(outcome.status, "FAILED");
  assert.equal(row.status, "REVIEWING");
});

test("client cannot supply a target status or another action", async () => {
  for (const status of ["UPLOADED", "REVIEWING", "APPROVED"] as const) {
    const { deps, row } = setup(status);
    await assert.rejects(() => transitionRagDocument(headers, "rag-1", { status: "APPROVED" }, `invalid-${status}`, deps as never), { status: 400 });
    await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "APPROVE", status: "UPLOADED" }, `invalid-target-${status}`, deps as never), { status: 400 });
    assert.equal(row.status, status);
  }
});

test("Guest and Traveler cannot list, detail or mutate", async () => {
  for (const role of [null, "TRAVELER"] as const) {
    const { deps, row } = setup("UPLOADED", role);
    const expected = role ? 403 : 401;
    await assert.rejects(() => listRagDocuments(headers, deps as never), { status: expected });
    await assert.rejects(() => getRagDocument(headers, "rag-1", deps as never), { status: expected });
    await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "START_REVIEW" }, "key", deps as never), { status: expected });
    assert.equal(row.status, "UPLOADED");
  }
});

test("UNKNOWN and FAILED never produce a guessed UI status", () => {
  const previous: { id: string; status: "REVIEWING" | "APPROVED" } = { id: "rag-1", status: "REVIEWING" };
  assert.equal(confirmedRagDetail(previous, { status: "UNKNOWN", error: { code: "UNKNOWN", message: "?" }, retryWithSameKey: true }), previous);
  assert.equal(confirmedRagDetail(previous, { status: "FAILED", error: { code: "CONFLICT", message: "?" } }), previous);
  assert.equal(confirmedRagDetail(previous, { status: "SUCCESS", data: { id: "rag-1", status: "APPROVED" as const } }).status, "APPROVED");
});
