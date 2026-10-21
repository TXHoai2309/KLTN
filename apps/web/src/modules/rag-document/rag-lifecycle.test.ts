import test from "node:test";
import assert from "node:assert/strict";
import { getRagDocument, getRagOriginal, listRagDocuments, restoreRagDocument, softDeleteRagDocument, transitionRagDocument } from "./rag-service";

type Status = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";
type JobStatus = "QUEUED" | "RUNNING" | "UNKNOWN" | "COMPLETED";

function setup(status: Status = "INDEXED", role: "ADMIN" | "TRAVELER" | null = "ADMIN") {
  const row = {
    id: "rag-lifecycle-1", originalFileName: "ha-giang-source.pdf", fileType: "PDF" as const,
    mimeType: "application/pdf", sizeBytes: 1024, storagePath: "rag/admin-1/source.pdf",
    sourceTitle: "Tài liệu nguồn Hà Giang", sourceUrl: null, author: null, topic: null, locality: null,
    uploadedById: "admin-1", status, publicQaApproved: true, deletedAt: null as Date | null,
    createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"),
  };
  const jobs = (["QUEUED", "RUNNING", "UNKNOWN", "COMPLETED"] as JobStatus[]).map((jobStatus, index) => ({
    id: `job-${index}`, ragDocumentId: row.id, status: jobStatus, cancelRequestedAt: null as Date | null,
    completedAt: jobStatus === "COMPLETED" ? new Date("2026-10-03") : null,
    failureCode: null as string | null, leaseToken: jobStatus === "RUNNING" ? "running-lease" : null,
    leaseExpiresAt: jobStatus === "RUNNING" ? new Date(Date.now() + 60_000) : null, updatedAt: new Date("2026-10-03"),
  }));
  const idempotency = new Map<string, { requestHash: string; responseJson: string }>();
  const keyOf = (scope: string, key: string) => `${scope}:${key}`;
  const matchesDeletedAt = (condition: unknown) => condition === undefined ||
    condition === null && row.deletedAt === null ||
    typeof condition === "object" && condition !== null && "not" in condition && row.deletedAt !== null;
  const tx = {
    user: { findUnique: async () => role ? { id: "admin-1", role, status: "ACTIVE" } : null },
    ragDocument: {
      findMany: async ({ where }: { where?: { deletedAt?: unknown } } = {}) => matchesDeletedAt(where?.deletedAt) ? [{ ...row }] : [],
      findUnique: async ({ where }: { where: { id: string } }) => where.id === row.id ? { ...row } : null,
      updateMany: async ({ where, data }: { where: { id: string; deletedAt?: unknown }; data: Partial<typeof row> }) => {
        if (where.id !== row.id || !matchesDeletedAt(where.deletedAt)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Partial<typeof row> }) => { Object.assign(row, data); return { ...row }; },
    },
    ragIndexJob: {
      updateMany: async ({ where, data }: { where: { ragDocumentId: string; status: JobStatus | { in: JobStatus[] }; cancelRequestedAt?: null }; data: Partial<(typeof jobs)[number]> }) => {
        const statuses = typeof where.status === "string" ? [where.status] : where.status.in;
        let count = 0;
        for (const job of jobs) {
          if (job.ragDocumentId !== where.ragDocumentId || !statuses.includes(job.status) || where.cancelRequestedAt === null && job.cancelRequestedAt !== null) continue;
          Object.assign(job, data); count++;
        }
        return { count };
      },
    },
    ragIndexPublication: { findMany: async () => [], findUnique: async () => null },
    idempotencyRecord: {
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => { idempotency.set(keyOf(data.scope, data.key), { requestHash: data.requestHash, responseJson: data.responseJson }); },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const key = keyOf(where.scope_key.scope, where.scope_key.key);
        idempotency.set(key, { ...idempotency.get(key)!, responseJson: data.responseJson });
      },
    },
  };
  const deps = {
    resolveSession: async () => role ? { user: { id: "admin-1" } } : null,
    database: {
      ...tx,
      idempotencyRecord: { ...tx.idempotencyRecord, findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => idempotency.get(keyOf(where.scope_key.scope, where.scope_key.key)) ?? null },
      $transaction: async (run: (value: typeof tx) => Promise<unknown>) => {
        const beforeRow = { ...row }, beforeJobs = jobs.map(job => ({ ...job })), beforeKeys = new Map(idempotency);
        try { return await run(tx); }
        catch (error) {
          Object.assign(row, beforeRow);
          jobs.splice(0, jobs.length, ...beforeJobs);
          idempotency.clear(); for (const [key, value] of beforeKeys) idempotency.set(key, value);
          throw error;
        }
      },
    },
    storage: {
      issue: async () => ({}), read: async () => ({ bytes: new Uint8Array(), mimeType: "application/pdf", sizeBytes: 0 }),
      accessible: async () => true, stream: async () => new ReadableStream(),
    },
  };
  return { row, jobs, idempotency, deps };
}

const headers = new Headers();

for (const status of ["UPLOADED", "REVIEWING", "APPROVED", "INDEXED", "DISABLED"] as const) {
  test(`Admin can soft-delete ${status} without changing status or purging source/index history`, async () => {
    const { row, jobs, deps } = setup(status);
    const deleted = await softDeleteRagDocument(headers, row.id, {}, `delete-${status}`, deps as never);
    assert.equal(deleted.status, "SUCCESS");
    assert.equal(row.status, status);
    assert.ok(row.deletedAt instanceof Date);
    assert.equal(row.publicQaApproved, false);
    assert.equal(row.storagePath, "rag/admin-1/source.pdf");
    assert.deepEqual(jobs.map(job => job.status), ["CANCELLED", "RUNNING", "CANCELLED", "COMPLETED"]);
    assert.ok(jobs[1]!.cancelRequestedAt instanceof Date);
    assert.ok(jobs[0]!.completedAt instanceof Date);
    assert.equal(jobs[3]!.failureCode, null);
    assert.equal((await listRagDocuments(headers, deps as never)).items.length, 0);
    const deletedList = await listRagDocuments(headers, deps as never, "deleted");
    assert.equal(deletedList.items[0]?.id, row.id);
    assert.equal(deletedList.items[0]?.retrievalEligible, false);
    assert.equal(deletedList.items[0]?.ineligibilityReason, "DOCUMENT_DELETED");
    assert.deepEqual((await getRagDocument(headers, row.id, deps as never)).document.allowedActions, []);
    const transition = await transitionRagDocument(headers, row.id, { action: "START_REVIEW" }, `review-${status}`, deps as never);
    assert.equal(transition.status, "FAILED");
    if (transition.status === "FAILED") assert.equal(transition.error.code, "RAG_DOCUMENT_DELETED");
    assert.equal((await getRagOriginal(headers, row.id, deps as never)).row.storagePath, row.storagePath);
  });
}

test("restore clears deletion but returns to terminal DISABLED with public Q&A revoked", async () => {
  const { row, deps } = setup("INDEXED");
  const deletion = await softDeleteRagDocument(headers, row.id, {}, "delete-key", deps as never);
  assert.equal(deletion.status, "SUCCESS");
  const restored = await restoreRagDocument(headers, row.id, {}, "restore-key", deps as never);
  assert.equal(restored.status, "SUCCESS");
  assert.equal(row.deletedAt, null);
  assert.equal(row.status, "DISABLED");
  assert.equal(row.publicQaApproved, false);
  assert.equal((await listRagDocuments(headers, deps as never)).items[0]?.retrievalEligible, false);
  assert.equal((await listRagDocuments(headers, deps as never, "deleted")).items.length, 0);
  assert.deepEqual((await getRagDocument(headers, row.id, deps as never)).document.allowedActions, []);
});

test("delete replays SUCCESS with the original idempotency key and payload", async () => {
  const { row, deps } = setup();
  const first = await softDeleteRagDocument(headers, row.id, {}, "same-delete-key", deps as never);
  const replay = await softDeleteRagDocument(headers, row.id, {}, "same-delete-key", deps as never);
  assert.equal(first.status, "SUCCESS");
  assert.equal(replay.status, "SUCCESS");
  assert.equal(replay.replayed, true);
});

test("only Admin can list, delete, or restore RAG documents", async () => {
  for (const role of [null, "TRAVELER"] as const) {
    const { row, deps } = setup("INDEXED", role);
    const expected = role ? 403 : 401;
    await assert.rejects(() => listRagDocuments(headers, deps as never, "deleted"), { status: expected });
    await assert.rejects(() => softDeleteRagDocument(headers, row.id, {}, "delete-key", deps as never), { status: expected });
    await assert.rejects(() => restoreRagDocument(headers, row.id, {}, "restore-key", deps as never), { status: expected });
    assert.equal(row.deletedAt, null);
  }
});
