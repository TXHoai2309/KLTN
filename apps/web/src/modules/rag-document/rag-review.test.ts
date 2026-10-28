import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getRagDocument, listRagDocuments, transitionRagDocument, computeRagEligibility, bulkSetRagPublicQa } from "./rag-service";
import { confirmedRagDetail } from "./rag-review-state";
import { RagStatusBadge } from "../../app/admin/rag/rag-review-ui";
import { retrievalEligible } from "./rag-file";

type Status = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";

function setup(status: Status = "UPLOADED", role: "ADMIN" | "TRAVELER" | null = "ADMIN") {
  const row = {
    id: "rag-1", originalFileName: "ha-giang.pdf", fileType: "PDF", mimeType: "application/pdf",
    sizeBytes: 1024, storagePath: "rag/admin-1/file.pdf", sourceTitle: "Tài liệu Hà Giang",
    sourceUrl: "https://example.org/source", author: "Tác giả", topic: "Văn hóa", locality: "Đồng Văn",
    uploadedById: "admin-1", status, publicQaApproved: false, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"),
  };
  let fileExists = true;
  const idempotency = new Map<string, { requestHash: string; responseJson: string }>();
  const ragDocument = {
    findMany: async () => [row],
    findUnique: async ({ where }: { where: { id: string } }) => where.id === row.id ? { ...row } : null,
    update: async ({ data }: { data: { publicQaApproved?: boolean } }) => { Object.assign(row, data); return { ...row }; },
    updateMany: async ({ where, data }: { where: { id: string; status: Status }; data: { status: Status } }) => {
      if (where.id !== row.id || where.status !== row.status) return { count: 0 };
      row.status = data.status;
      return { count: 1 };
    },
  };
  const ragIndexPublication = {
    findMany: async () => [],
    findUnique: async () => status === "INDEXED" ? { generation: { state: "READY", embeddingProvider: "openai", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536 } } : null,
  };
  const tx = {
    user: { findUnique: async () => role ? { id: "admin-1", role } : null },
    ragDocument,
    ragIndexPublication,
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
      ragIndexPublication,
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
  assert.deepEqual(detail.document.allowedActions, ["DISABLE"]);
  assert.equal(detail.document.sourceUrl, "https://example.org/source");
  assert.equal("storagePath" in detail.document, false);
});

test("manual START_REVIEW is no longer accepted for new uploads", async () => {
  const { deps, row } = setup();
  await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "START_REVIEW" }, "key-1", deps as never), { code: "INVALID_RAG_INPUT" });
  assert.equal(row.status, "UPLOADED");
});

test("historical REVIEWING can index without manual APPROVE", async () => {
  const { deps, row } = setup("REVIEWING");
  await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "APPROVE" }, "key-2", deps as never), { code: "INVALID_RAG_INPUT" });
  assert.equal(row.status, "REVIEWING");
  const detail = await getRagDocument(headers, "rag-1", deps as never);
  assert.deepEqual(detail.document.allowedActions, ["DISABLE"]);
  assert.equal(detail.document.retrievalEligible, false);
});

for (const [status, action] of [["UPLOADED", "APPROVE"], ["APPROVED", "START_REVIEW"], ["APPROVED", "APPROVE"], ["DISABLED", "START_REVIEW"]] as const) {
  test(`${status} with ${action} is rejected`, async () => {
    const { deps, row } = setup(status);
    await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action }, `invalid-${status}-${action}`, deps as never), { code: "INVALID_RAG_INPUT" });
    assert.equal(row.status, status);
  });
}

test("unavailable original cannot be bypassed by obsolete APPROVE action", async () => {
  const { deps, row, missingFile } = setup("REVIEWING");
  missingFile();
  await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "APPROVE" }, "missing", deps as never), { code: "INVALID_RAG_INPUT" });
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

for (const status of ["UPLOADED", "REVIEWING", "APPROVED", "INDEXED"] as const) {
  test(`${status} can be disabled, remains in Admin reads and same key replays`, async () => {
    const { deps, row } = setup(status);
    const before = await getRagDocument(headers, "rag-1", deps as never);
    assert.ok(before.document.allowedActions.includes("DISABLE"));
    assert.equal(before.document.retrievalEligible, status === "INDEXED");
    const outcome = await transitionRagDocument(headers, "rag-1", { action: "DISABLE" }, `disable-${status}`, deps as never);
    assert.equal(outcome.status, "SUCCESS");
    assert.equal(row.status, "DISABLED");
    assert.equal(row.storagePath, "rag/admin-1/file.pdf");
    const replay = await transitionRagDocument(headers, "rag-1", { action: "DISABLE" }, `disable-${status}`, deps as never);
    assert.equal(replay.status, "SUCCESS");
    assert.equal(replay.replayed, true);
    const list = await listRagDocuments(headers, deps as never);
    assert.equal(list.items[0].status, "DISABLED");
    assert.equal(list.items[0].retrievalEligible, false);
    const detail = await getRagDocument(headers, "rag-1", deps as never);
    assert.equal(detail.document.status, "DISABLED");
    assert.deepEqual(detail.document.allowedActions, []);
    assert.equal(detail.document.sourceTitle, "Tài liệu Hà Giang");
  });
}

test("DISABLED is terminal and has no re-enable action", async () => {
  const { deps, row } = setup("DISABLED");
  for (const action of ["DISABLE", "START_REVIEW", "APPROVE"] as const) {
    if (action === "DISABLE") {
      const outcome = await transitionRagDocument(headers, "rag-1", { action }, `terminal-${action}`, deps as never);
      assert.equal(outcome.status, "FAILED");
    } else {
      await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action }, `terminal-${action}`, deps as never), { code: "INVALID_RAG_INPUT" });
    }
    assert.equal(row.status, "DISABLED");
  }
  const detail = await getRagDocument(headers, "rag-1", deps as never);
  assert.deepEqual(detail.document.allowedActions, []);
  const html = renderToStaticMarkup(createElement(RagStatusBadge, { item: { status: "DISABLED", retrievalEligible: false } }));
  assert.match(html, /Đã vô hiệu hóa/);
  assert.match(html, /Chưa dùng cho truy xuất/);
  const deletedHtml = renderToStaticMarkup(createElement(RagStatusBadge, { item: { status: "INDEXED", retrievalEligible: false, deletedAt: "2026-10-20T10:00:00.000Z" } }));
  assert.match(deletedHtml, /Đã xóa/);
  assert.match(deletedHtml, /Chưa dùng cho truy xuất/);
  assert.doesNotMatch(deletedHtml, /Sẵn sàng cho AI/);
});

test("Guest and Traveler cannot disable", async () => {
  for (const role of [null, "TRAVELER"] as const) {
    const { deps, row } = setup("INDEXED", role);
    await assert.rejects(() => transitionRagDocument(headers, "rag-1", { action: "DISABLE" }, "denied", deps as never), { status: role ? 403 : 401 });
    assert.equal(row.status, "INDEXED");
  }
});

test("only INDEXED is retrieval eligible", () => {
  for (const status of ["UPLOADED", "REVIEWING", "APPROVED", "INDEXED", "DISABLED"] as const) {
    assert.equal(retrievalEligible(status), status === "INDEXED");
  }
});

test("FAILED and UNKNOWN disable leave the confirmed UI status unchanged", () => {
  const previous: { id: string; status: Status; retrievalEligible: boolean } = { id: "rag-1", status: "INDEXED", retrievalEligible: true };
  assert.equal(confirmedRagDetail(previous, { status: "FAILED", error: { code: "CONFLICT", message: "?" } }), previous);
  assert.equal(confirmedRagDetail(previous, { status: "UNKNOWN", error: { code: "UNKNOWN", message: "?" }, retryWithSameKey: true }), previous);
  const next = confirmedRagDetail(previous, { status: "SUCCESS", data: { id: "rag-1", status: "DISABLED", retrievalEligible: false } });
  assert.equal(next.status, "DISABLED");
  assert.equal(next.retrievalEligible, false);
});

test("an older indexing completion read cannot replace confirmed DISABLED", () => {
  const previous: { id: string; status: Status; retrievalEligible: boolean; allowedActions: string[] } = {
    id: "rag-1", status: "DISABLED", retrievalEligible: false, allowedActions: [],
  };
  const stale = confirmedRagDetail(previous, { status: "SUCCESS", data: {
    id: "rag-1", status: "INDEXED", retrievalEligible: true, allowedActions: ["DISABLE"],
  } });
  assert.equal(stale, previous);
  const refreshed = confirmedRagDetail(previous, { status: "SUCCESS", data: { status: "DISABLED", retrievalEligible: false } });
  assert.equal(refreshed.status, "DISABLED");
  assert.equal(refreshed.retrievalEligible, false);
});

test("computeRagEligibility evaluates status, permission, and embedding readiness", () => {
  const readyGen = {
    state: "READY" as const,
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
  };
  // Eligible when INDEXED + publicQaApproved + readyGen
  assert.deepEqual(computeRagEligibility("INDEXED", true, readyGen), {
    publicQaEligible: true,
    ineligibilityReason: null,
  });
  // Not indexed
  assert.deepEqual(computeRagEligibility("APPROVED", true, readyGen), {
    publicQaEligible: false,
    ineligibilityReason: "STATUS_NOT_INDEXED",
  });
  // Not public approved
  assert.deepEqual(computeRagEligibility("INDEXED", false, readyGen), {
    publicQaEligible: false,
    ineligibilityReason: "NOT_PUBLIC_APPROVED",
  });
  // No generation or not READY
  assert.deepEqual(computeRagEligibility("INDEXED", true, null), {
    publicQaEligible: false,
    ineligibilityReason: "NO_READY_INDEX",
  });
  assert.deepEqual(computeRagEligibility("INDEXED", true, { ...readyGen, state: "BUILDING" }), {
    publicQaEligible: false,
    ineligibilityReason: "NO_READY_INDEX",
  });
  // Embedding mismatch
  assert.deepEqual(computeRagEligibility("INDEXED", true, { ...readyGen, embeddingDimensions: 768 }), {
    publicQaEligible: false,
    ineligibilityReason: "EMBEDDING_MISMATCH",
  });
});

test("ENABLE_PUBLIC_QA and DISABLE_PUBLIC_QA grant and revoke AI access for INDEXED documents", async () => {
  const { deps, row } = setup("INDEXED");
  assert.equal(row.publicQaApproved, false);

  // Enable public QA
  const enable = await transitionRagDocument(headers, "rag-1", { action: "ENABLE_PUBLIC_QA", confirmedSourceReview: true }, "key-qa-enable", deps as never);
  assert.equal(enable.status, "SUCCESS");
  assert.equal(row.publicQaApproved, true);
  if (enable.status === "SUCCESS") {
    assert.equal(enable.data.publicQaApproved, true);
    assert.deepEqual(enable.data.allowedActions, ["DISABLE", "DISABLE_PUBLIC_QA"]);
  }

  // Disable public QA
  const disable = await transitionRagDocument(headers, "rag-1", { action: "DISABLE_PUBLIC_QA" }, "key-qa-disable", deps as never);
  assert.equal(disable.status, "SUCCESS");
  assert.equal(row.publicQaApproved, false);
  if (disable.status === "SUCCESS") {
    assert.equal(disable.data.publicQaApproved, false);
    assert.deepEqual(disable.data.allowedActions, ["DISABLE", "ENABLE_PUBLIC_QA"]);
  }
});

test("ENABLE_PUBLIC_QA is rejected for DISABLED document", async () => {
  const { deps, row } = setup("DISABLED");
  const outcome = await transitionRagDocument(headers, "rag-1", { action: "ENABLE_PUBLIC_QA" }, "key-disabled-enable", deps as never);
  assert.equal(outcome.status, "FAILED");
  assert.equal(row.publicQaApproved, false);
});

test("public grant requires individual source confirmation and a READY indexed generation", async () => {
  const indexed = setup("INDEXED");
  const unconfirmed = await transitionRagDocument(headers, "rag-1", { action: "ENABLE_PUBLIC_QA" }, "missing-confirmation", indexed.deps as never);
  assert.equal(unconfirmed.status, "FAILED");
  assert.equal(indexed.row.publicQaApproved, false);
  const uploaded = setup("UPLOADED");
  const premature = await transitionRagDocument(headers, "rag-1", { action: "ENABLE_PUBLIC_QA", confirmedSourceReview: true }, "premature", uploaded.deps as never);
  assert.equal(premature.status, "FAILED");
  assert.equal(uploaded.row.publicQaApproved, false);
});

test("bulkSetRagPublicQa only revokes; bulk grants require individual source review", async () => {
  const docs = [
    { id: "doc-1", status: "INDEXED", publicQaApproved: false },
    { id: "doc-2", status: "INDEXED", publicQaApproved: false },
    { id: "doc-3", status: "UPLOADED", publicQaApproved: false },
  ];
  const deps = {
    resolveSession: async () => ({ user: { id: "admin-1" } }),
    database: {
      user: { findUnique: async () => ({ id: "admin-1", role: "ADMIN" }) },
      ragDocument: {
        findMany: async ({ where }: { where: { status?: string | { not: string }; publicQaApproved?: boolean; id?: { in: string[] } } }) => {
          return docs.filter(d => {
            if (where.status) {
              if (typeof where.status === "string" && d.status !== where.status) return false;
              if (typeof where.status === "object" && "not" in where.status && d.status === where.status.not) return false;
            }
            if (where.publicQaApproved !== undefined && d.publicQaApproved !== where.publicQaApproved) return false;
            if (where.id?.in && !where.id.in.includes(d.id)) return false;
            return true;
          });
        },
        updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: { publicQaApproved: boolean } }) => {
          let count = 0;
          for (const d of docs) {
            if (where.id.in.includes(d.id)) {
              d.publicQaApproved = data.publicQaApproved;
              count++;
            }
          }
          return { count };
        },
      },
    },
    storage: { accessible: async () => true },
  };

  await assert.rejects(() => bulkSetRagPublicQa(headers, { action: "ENABLE_ALL_INDEXED" }, deps as never), { code: "RAG_SOURCE_REVIEW_REQUIRED" });
  await assert.rejects(() => bulkSetRagPublicQa(headers, { action: "ENABLE_SELECTED", documentIds: ["doc-1"] }, deps as never), { code: "RAG_SOURCE_REVIEW_REQUIRED" });
  docs[0].publicQaApproved = true;

  // DISABLE_SELECTED
  const disableResult = await bulkSetRagPublicQa(headers, { action: "DISABLE_SELECTED", documentIds: ["doc-1"] }, deps as never);
  assert.equal(disableResult.updatedCount, 1);
  assert.equal(docs[0].publicQaApproved, false);

  assert.equal(docs[0].publicQaApproved, false);
});
