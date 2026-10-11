import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Database } from "@KLTN/db";
import { Prisma, PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import { createFakeEmbeddingProvider } from "../rag-processing/__fixtures__/fake-embedding-provider";
import { syntheticPdf } from "../rag-processing/__fixtures__/synthetic-documents";
import { createRagIndexJobStore } from "./rag-index-job-store";
import { createRagIndexStore } from "./rag-index-store";
import { createRagIndexWorker } from "./rag-index-worker";
import { processIndexRequest, readIndexProgress } from "./rag-index-request-service";
import { enqueueRagIndexJob, type RagIndexJobServiceDependencies } from "./rag-index-job-service";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.US19_TASK184_TEST_DATABASE_URL;
const disposableConfirmation = process.env.US19_TASK184_TEST_DISPOSABLE;
const expectedDisposableConfirmation = "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE";
const integrationDescribe = databaseUrl ? describe : describe.skip;
const databaseName = "task184_test";
if (process.env.US19_POSTGRES_REQUIRED === "1" && !databaseUrl) {
  throw new Error("Required Task185 PostgreSQL integration cannot run without its disposable database URL.");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(release => { resolve = release; });
  return { promise, resolve };
}

function assertSafeTestTarget(raw: string): void {
  let target: URL;
  try { target = new URL(raw); }
  catch { throw new Error("Refusing Task185 integration test: invalid test-only database URL."); }
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!localHosts.has(target.hostname) || target.pathname.replace(/^\//u, "") !== databaseName || target.username !== "task184_test" || target.searchParams.get("sslmode") !== "disable" || disposableConfirmation !== expectedDisposableConfirmation) {
    throw new Error("Refusing Task185 integration test: only the explicitly confirmed disposable loopback database is allowed.");
  }
}

integrationDescribe("US-19 Task185 durable job persistence (isolated PostgreSQL only)", () => {
  let prisma!: PrismaClient;
  let jobs!: ReturnType<typeof createRagIndexJobStore>;
  let index!: ReturnType<typeof createRagIndexStore>;
  const documentIds: string[] = [];
  const actorIds: string[] = [];

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("US19_TASK184_TEST_DATABASE_URL was not provided.");
    assertSafeTestTarget(databaseUrl);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const identity = await prisma.$queryRaw<Array<{ database: string }>>(Prisma.sql`SELECT current_database()::text AS "database"`);
    expect(identity[0]?.database).toBe(databaseName);
    jobs = createRagIndexJobStore(prisma as unknown as Database);
    index = createRagIndexStore(prisma as unknown as Database);
  }, 30_000);

  async function createDocument(id: string, status: "APPROVED" | "INDEXED" | "DISABLED" = "APPROVED") {
    documentIds.push(id);
    await prisma.ragDocument.create({ data: {
      id, originalFileName: "synthetic-task185.txt", fileType: "TXT", mimeType: "text/plain",
      sizeBytes: 40, storagePath: `synthetic/${id}`, sourceTitle: "Synthetic Task185 integration record",
      uploadedById: "synthetic-integration-user", status,
    } });
  }

  async function createJob(id: string, ragDocumentId: string, values: {
    status?: "QUEUED" | "RUNNING"; phase?: "QUEUED" | "ACQUIRING" | "EXTRACTING" | "CHUNKING" | "PERSISTING_CHUNKS" | "EMBEDDING" | "PERSISTING_EMBEDDINGS" | "VERIFYING" | "PUBLISHING";
    leaseToken?: string | null; leaseExpiresAt?: Date | null; pendingBatchIndexes?: number[] | null; attemptCount?: number;
  } = {}) {
    return prisma.ragIndexJob.create({ data: {
      id, ragDocumentId, requestedById: "synthetic-admin", idempotencyScope: `task185:${id}`,
      idempotencyKey: "integration-key", requestHash: "a".repeat(64), status: values.status ?? "QUEUED",
      phase: values.phase ?? "QUEUED", leaseToken: values.leaseToken ?? null,
      leaseExpiresAt: values.leaseExpiresAt ?? null, pendingBatchIndexes: values.pendingBatchIndexes ?? Prisma.DbNull,
      attemptCount: values.attemptCount ?? 0,
    } });
  }

  async function cleanup() {
    for (const documentId of documentIds.splice(0)) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_index_publication" WHERE "ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_chunk_embedding" e USING "rag_chunk" c WHERE e."chunkId" = c."id" AND c."ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_chunk" WHERE "ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_index_generation" WHERE "ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_content_version" WHERE "ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_index_job" WHERE "ragDocumentId" = ${documentId}`);
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "rag_document" WHERE "id" = ${documentId}`);
    }
    for (const actorId of actorIds.splice(0)) {
      await prisma.idempotencyRecord.deleteMany({ where: { scope: { startsWith: `["${actorId}",` } } });
      await prisma.user.delete({ where: { id: actorId } });
    }
  }

  afterEach(cleanup);

  async function prepareReady(documentId: string, text = "Synthetic Hà Giang test content for a fully verified generation.") {
    const bytes = new TextEncoder().encode(text);
    await prisma.ragDocument.update({ where: { id: documentId }, data: { sizeBytes: bytes.byteLength } });
    const jobId = `task185-ready-${randomUUID()}`;
    await createJob(jobId, documentId);
    const fake = createFakeEmbeddingProvider();
    // Simulate a process paused immediately before finalization. Everything
    // before this seam uses the real worker and PostgreSQL persistence.
    const worker = createRagIndexWorker({ jobs, index: { ...index, finalizeReadyGeneration: async () => undefined },
      storage: { read: async () => ({ bytes, sizeBytes: bytes.byteLength, mimeType: "text/plain" }) },
      provider: fake.provider, embeddingOptions: { sleep: async () => undefined },
    });
    await worker.runNext();
    const job = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: "RUNNING", phase: "PUBLISHING", pendingBatchIndexes: null });
    expect(job.generationId).toBeTruthy();
    expect(job.leaseToken).toBeTruthy();
    await expect(prisma.ragIndexGeneration.findUniqueOrThrow({ where: { id: job.generationId! } })).resolves.toMatchObject({ state: "READY" });
    return { jobId, generationId: job.generationId!, lease: { jobId, leaseToken: job.leaseToken! }, bytes };
  }

  afterAll(async () => {
    if (prisma) {
      await cleanup();
      await prisma.$disconnect();
    }
  });

  it("claims one queued job only once across concurrent PostgreSQL worker connections", async () => {
    const documentId = `task185-claim-${randomUUID()}`;
    await createDocument(documentId);
    const jobId = `task185-job-${randomUUID()}`;
    await createJob(jobId, documentId);

    const [left, right] = await Promise.all([jobs.claimNext(), jobs.claimNext()]);
    const claimed = [left, right].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: jobId, status: "RUNNING", phase: "ACQUIRING", attemptCount: 1 });
    expect(claimed[0]?.leaseToken).toMatch(/^[0-9a-f-]{36}$/u);
    const stored = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(stored.leaseToken).toBe(claimed[0]?.leaseToken);
    expect(stored.status).toBe("RUNNING");
  });

  it("validates the actual Task185 migration enums, indexes and CHECK/FK constraints", async () => {
    const enumValues = await prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`
      SELECT e.enumlabel::text AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      WHERE t.typname='RagIndexJobStatus' ORDER BY e.enumsortorder
    `);
    expect(enumValues.map(row => row.label)).toEqual(["QUEUED", "RUNNING", "COMPLETED", "REJECTED", "FAILED", "CANCELLED", "TIMED_OUT", "UNKNOWN"]);
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT conname::text AS name FROM pg_constraint WHERE conrelid='rag_index_job'::regclass
    `);
    expect(constraints.map(row => row.name)).toEqual(expect.arrayContaining([
      "rag_index_job_pkey", "rag_index_job_ragDocumentId_fkey", "rag_index_job_attemptCount_check",
      "rag_index_job_lease_check", "rag_index_job_warningCodes_check", "rag_index_job_pendingBatchIndexes_check",
    ]));
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT indexname::text AS name FROM pg_indexes WHERE tablename='rag_index_job'
    `);
    expect(indexes.map(row => row.name)).toEqual(expect.arrayContaining([
      "rag_index_job_idempotencyScope_idempotencyKey_key", "rag_index_job_leaseToken_key",
      "rag_index_job_status_createdAt_idx", "rag_index_job_status_leaseExpiresAt_idx",
    ]));
    const id = `task185-constraints-${randomUUID()}`;
    await createDocument(id);
    const jobId = `task185-job-${randomUUID()}`;
    await createJob(jobId, id);
    await expect(prisma.ragIndexJob.update({ where: { id: jobId }, data: { attemptCount: -1 } })).rejects.toThrow();
    await expect(prisma.ragIndexJob.update({ where: { id: jobId }, data: { status: "RUNNING" } })).rejects.toThrow();
    await expect(prisma.ragIndexJob.update({ where: { id: jobId }, data: { warningCodes: "not-an-array" } })).rejects.toThrow();
    await expect(prisma.ragIndexJob.update({ where: { id: jobId }, data: { ragDocumentId: "missing-synthetic-document" } })).rejects.toThrow();
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: jobId } })).resolves.toMatchObject({ status: "QUEUED", attemptCount: 0 });
  });

  it("SKIP LOCKED claims an unlocked job while an earlier job row is held by another transaction", async () => {
    const firstDoc = `task185-locked-${randomUUID()}`;
    const nextDoc = `task185-unlocked-${randomUUID()}`;
    await createDocument(firstDoc);
    await createDocument(nextDoc);
    const firstId = `task185-job-${randomUUID()}`;
    const nextId = `task185-job-${randomUUID()}`;
    await createJob(firstId, firstDoc);
    await prisma.ragIndexJob.update({ where: { id: firstId }, data: { createdAt: new Date(Date.now() - 10_000) } });
    await createJob(nextId, nextDoc);
    const held = deferred();
    const release = deferred();
    const lock = prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM rag_index_job WHERE id=${firstId} FOR UPDATE`);
      held.resolve();
      await release.promise;
    }, { timeout: 15_000 });
    await held.promise;
    try {
      await expect(jobs.claimNext()).resolves.toMatchObject({ id: nextId });
      await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: firstId } })).resolves.toMatchObject({ status: "QUEUED", leaseToken: null });
    } finally { release.resolve(); await lock; }
    await expect(jobs.claimNext()).resolves.toMatchObject({ id: firstId });
  }, 20_000);

  it("reclaims an expired lease with a new fencing token and rejects stale checkpoint/vector/publication writes", async () => {
    const documentId = `task185-fence-${randomUUID()}`;
    await createDocument(documentId);
    const ready = await prepareReady(documentId);
    expect(await jobs.renew(ready.lease)).toBe("RENEWED");
    await prisma.ragIndexJob.update({ where: { id: ready.jobId }, data: { leaseExpiresAt: new Date(Date.now() - 10_000) } });
    const replacement = await jobs.claimNext();
    expect(replacement).toMatchObject({ id: ready.jobId, attemptCount: 2 });
    expect(replacement?.leaseToken).not.toBe(ready.lease.leaseToken);
    expect(await jobs.renew(ready.lease)).toBe("LOST");
    await expect(jobs.checkpoint(ready.lease, "EXTRACTING")).rejects.toMatchObject({ code: "JOB_LEASE_LOST" });
    await expect(index.persistEmbeddings(documentId, ready.generationId, [{ chunkIndex: 0, inputHash: "a".repeat(64), tokenCount: 1,
      vector: [1, ...Array<number>(1535).fill(0)], provenance: EMBEDDING_PROVENANCE }], ready.lease)).rejects.toMatchObject({ code: "JOB_LEASE_LOST" });
    await expect(index.finalizeReadyGeneration(documentId, ready.generationId, ready.lease)).rejects.toMatchObject({ code: "JOB_LEASE_LOST" });
    expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(0);
    await index.finalizeReadyGeneration(documentId, ready.generationId, { jobId: ready.jobId, leaseToken: replacement!.leaseToken });
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "COMPLETED" });
  }, 60_000);

  it("concurrent same-key admission and replay commit exactly one logical job through the real service", async () => {
    const documentId = `task185-admit-${randomUUID()}`;
    const actorId = `task185-admin-${randomUUID()}`;
    await createDocument(documentId);
    actorIds.push(actorId);
    await prisma.user.create({ data: { id: actorId, name: "Synthetic Admin", email: `${actorId}@example.invalid`, role: "ADMIN", updatedAt: new Date() } });
    const deps: RagIndexJobServiceDependencies = { database: prisma as unknown as Database, resolveSession: async () => ({ user: { id: actorId } }) };
    const request = () => enqueueRagIndexJob(new Headers(), documentId, "same-synthetic-key", deps);
    const [left, right] = await Promise.all([request(), request()]);
    expect(left.status).toBe("SUCCESS");
    expect(right.status).toBe("SUCCESS");
    if (left.status !== "SUCCESS" || right.status !== "SUCCESS") throw new Error("Admission did not succeed");
    expect(left.data).toEqual(right.data);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    await expect(request()).resolves.toMatchObject({ status: "SUCCESS", replayed: true, data: left.data });
    expect(await prisma.ragIndexJob.count({ where: { ragDocumentId: documentId } })).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { scope: { startsWith: `["${actorId}",` } } })).toBe(1);
    await expect(enqueueRagIndexJob(new Headers(), documentId, "different-synthetic-key", deps)).resolves.toMatchObject({ status: "FAILED", error: { code: "RAG_INDEX_JOB_ACTIVE" } });
    await prisma.user.update({ where: { id: actorId }, data: { role: "TRAVELER" } });
    await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["cancel", "disable"] as const)("rejects finalization after a concurrently committed %s while it waits on a row lock", async action => {
    const documentId = `task185-race-${randomUUID()}`;
    await createDocument(documentId);
    const ready = await prepareReady(documentId);
    const held = deferred();
    const release = deferred();
    const change = prisma.$transaction(async tx => {
      if (action === "cancel") await jobs.requestCancellation(tx, ready.jobId);
      else await tx.ragDocument.update({ where: { id: documentId }, data: { status: "DISABLED" } });
      held.resolve();
      await release.promise;
    }, { timeout: 15_000 });
    await held.promise;
    const finishing = index.finalizeReadyGeneration(documentId, ready.generationId, ready.lease)
      .then(() => ({ code: "UNEXPECTED_SUCCESS" }), error => error as { code: string });
    try {
      // Observe the finalizer's real PostgreSQL lock wait before allowing the
      // cancellation/disable transaction to commit; this is not a timing guess.
      const deadline = Date.now() + 5_000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()
        `);
        blocked = (rows[0]?.count ?? 0) > 0;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
    } finally { release.resolve(); await change; }
    expect(await finishing).toMatchObject({ code: action === "cancel" ? "JOB_CANCELLED" : "DOCUMENT_NOT_ELIGIBLE" });
    expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(0);
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "RUNNING" });
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: action === "cancel" ? "APPROVED" : "DISABLED" });
  }, 60_000);

  function failingFinalizer() {
    const failing = prisma.$extends({ query: { ragIndexJob: { async updateMany() { throw new Error("SYNTHETIC_FINALIZATION_FAILURE"); } } } });
    return createRagIndexStore(failing as unknown as Database);
  }

  it("exposes publication, INDEXED and COMPLETED together only after the real finalization transaction commits", async () => {
    const documentId = `task185-atomic-${randomUUID()}`;
    await createDocument(documentId);
    const ready = await prepareReady(documentId);
    const reached = deferred();
    const release = deferred();
    const paused = prisma.$extends({ query: { ragIndexJob: { async updateMany({ args, query }) {
      reached.resolve();
      await release.promise;
      return query(args);
    } } } });
    const finalizer = createRagIndexStore(paused as unknown as Database);
    const finishing = finalizer.finalizeReadyGeneration(documentId, ready.generationId, ready.lease);
    await reached.promise;
    try {
      // A separate pooled connection cannot see either preceding write while
      // the transaction is paused immediately before marking the job complete.
      expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(0);
      await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: "APPROVED" });
      await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "RUNNING" });
    } finally { release.resolve(); await finishing; }
    await expect(prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } })).resolves.toMatchObject({ generationId: ready.generationId });
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: "INDEXED" });
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "COMPLETED", phase: "COMPLETED", leaseToken: null });
  }, 60_000);

  it("rolls back publication and INDEXED after an injected failure at the job COMPLETED update", async () => {
    const documentId = `task185-rollback-${randomUUID()}`;
    await createDocument(documentId);
    const ready = await prepareReady(documentId);
    await expect(failingFinalizer().finalizeReadyGeneration(documentId, ready.generationId, ready.lease)).rejects.toThrow("SYNTHETIC_FINALIZATION_FAILURE");
    expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(0);
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: "APPROVED" });
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "RUNNING", completedAt: null, leaseToken: ready.lease.leaseToken });
    await index.finalizeReadyGeneration(documentId, ready.generationId, ready.lease);
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "COMPLETED", leaseToken: null });
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: "INDEXED" });
    await expect(prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } })).resolves.toMatchObject({ generationId: ready.generationId });
  }, 60_000);

  it("preserves the old publication during reindex and rollback, switching only on successful atomic completion", async () => {
    const documentId = `task185-reindex-${randomUUID()}`;
    await createDocument(documentId);
    const old = await prepareReady(documentId, "Synthetic old published version with validated content.");
    await index.finalizeReadyGeneration(documentId, old.generationId, old.lease);
    const next = await prepareReady(documentId, "Synthetic new published version with different validated content.");
    expect(next.generationId).not.toBe(old.generationId);
    await expect(prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } })).resolves.toMatchObject({ generationId: old.generationId });
    await expect(failingFinalizer().finalizeReadyGeneration(documentId, next.generationId, next.lease)).rejects.toThrow("SYNTHETIC_FINALIZATION_FAILURE");
    await expect(prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } })).resolves.toMatchObject({ generationId: old.generationId });
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId } })).resolves.toMatchObject({ status: "INDEXED" });
    await index.finalizeReadyGeneration(documentId, next.generationId, next.lease);
    await expect(prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } })).resolves.toMatchObject({ generationId: next.generationId });
    expect(await prisma.ragIndexPublication.count({ where: { ragDocumentId: documentId } })).toBe(1);
    expect(await prisma.ragIndexGeneration.count({ where: { ragDocumentId: documentId } })).toBe(2);
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: next.jobId } })).resolves.toMatchObject({ status: "COMPLETED" });
  }, 60_000);

  it("recovers a crash before publication without re-requesting already persisted embedding results", async () => {
    const documentId = `task185-crash-${randomUUID()}`;
    await createDocument(documentId);
    const ready = await prepareReady(documentId);
    await prisma.ragIndexJob.update({ where: { id: ready.jobId }, data: { leaseExpiresAt: new Date(Date.now() - 10_000) } });
    const fake = createFakeEmbeddingProvider();
    const worker = createRagIndexWorker({ jobs, index, storage: { read: async () => ({ bytes: ready.bytes, sizeBytes: ready.bytes.byteLength, mimeType: "text/plain" }) }, provider: fake.provider });
    await expect(worker.runNext()).resolves.toEqual({ jobId: ready.jobId, status: "COMPLETED" });
    expect(fake.calls).toHaveLength(0);
    expect(await prisma.ragIndexGeneration.count({ where: { ragDocumentId: documentId } })).toBe(1);
    expect(await prisma.ragChunkEmbedding.count({ where: { chunk: { ragDocumentId: documentId } } })).toBe(1);
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: ready.jobId } })).resolves.toMatchObject({ status: "COMPLETED", attemptCount: 2 });
  }, 60_000);

  it("marks an expired in-flight embedding UNKNOWN but safely reclaims pre-embedding work", async () => {
    const uncertainDocumentId = `task185-unknown-${randomUUID()}`;
    await createDocument(uncertainDocumentId);
    const uncertainJobId = `task185-unknown-job-${randomUUID()}`;
    await createJob(uncertainJobId, uncertainDocumentId, {
      status: "RUNNING", phase: "EMBEDDING", leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 10_000), pendingBatchIndexes: [0], attemptCount: 1,
    });

    const uncertainClaim = await jobs.claimNext();
    expect(uncertainClaim).toBeNull();
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: uncertainJobId } })).resolves.toMatchObject({
      status: "UNKNOWN", failureCode: "EMBEDDING_OUTCOME_UNKNOWN", leaseToken: null,
    });

    const recoverableDocumentId = `task185-resume-${randomUUID()}`;
    await createDocument(recoverableDocumentId);
    const recoverableJobId = `task185-resume-job-${randomUUID()}`;
    await createJob(recoverableJobId, recoverableDocumentId, {
      status: "RUNNING", phase: "PERSISTING_CHUNKS", leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 10_000), pendingBatchIndexes: null, attemptCount: 1,
    });
    await expect(jobs.claimNext()).resolves.toMatchObject({ id: recoverableJobId, status: "RUNNING", phase: "PERSISTING_CHUNKS", attemptCount: 2 });
  });

  it("indexes a synthetic PDF with retained heuristic provenance through real PostgreSQL and atomically publishes INDEXED", async () => {
    const documentId = `task185-pipeline-${randomUUID()}`;
    const text = "Hà Giang có cao nguyên đá và các giá trị văn hóa được ghi nhận trong tài liệu kiểm thử.";
    const bytes = syntheticPdf([{ text }]);
    await createDocument(documentId);
    const document = await prisma.ragDocument.update({ where: { id: documentId }, data: {
      originalFileName: "synthetic-task185.pdf", fileType: "PDF", mimeType: "application/pdf", sizeBytes: bytes.byteLength,
    } });
    const jobId = `task185-pipeline-job-${randomUUID()}`;
    await createJob(jobId, documentId);
    const fake = createFakeEmbeddingProvider();
    const worker = createRagIndexWorker({
      jobs, index, storage: { read: async pathname => {
        expect(pathname).toBe(document.storagePath);
        return { bytes, sizeBytes: bytes.byteLength, mimeType: "application/pdf" };
      } }, provider: fake.provider, embeddingOptions: { sleep: async () => undefined },
    });

    await expect(worker.runNext()).resolves.toEqual({ jobId, status: "COMPLETED" });
    await expect(prisma.ragIndexJob.findUniqueOrThrow({ where: { id: jobId } })).resolves.toMatchObject({ status: "COMPLETED", phase: "COMPLETED", leaseToken: null, warningCodes: ["PDF_READING_ORDER_HEURISTIC"] });
    await expect(prisma.ragDocument.findUniqueOrThrow({ where: { id: documentId }, select: { status: true } })).resolves.toEqual({ status: "INDEXED" });
    const publication = await prisma.ragIndexPublication.findUniqueOrThrow({ where: { ragDocumentId: documentId } });
    const generation = await prisma.ragIndexGeneration.findUniqueOrThrow({ where: { id: publication.generationId } });
    expect(generation.state).toBe("READY");
    expect(await prisma.ragChunk.count({ where: { generationId: generation.id } })).toBe(generation.expectedChunkCount);
    expect(await prisma.ragChunkEmbedding.count({ where: { chunk: { generationId: generation.id } } })).toBe(generation.expectedChunkCount);
    expect(fake.calls).toHaveLength(1);
  }, 60_000);
  it("request recovery is document scoped, idempotent, and blocks UNKNOWN provider repetition",async()=>{
    const doc="task187-recovery-"+randomUUID(); const other="task187-other-"+randomUUID();
    await createDocument(doc);await createDocument(other);
    const actor="task187-admin-"+randomUUID();actorIds.push(actor);
    await prisma.user.create({data:{id:actor,name:"Synthetic",email:actor+"@example.invalid",role:"ADMIN",updatedAt:new Date()}});
    const deps={database:prisma as unknown as Database,resolveSession:async()=>({user:{id:actor}})};
    const run=vi.fn(async (_db, options)=>{const claimed=await jobs.claimNext(undefined,options?.jobId);return claimed?{status:"UNKNOWN" as const,jobId:claimed.id}:{status:"IDLE" as const};});
    const admitted=await processIndexRequest(new Headers(),doc,"lost-key",{action:"INDEX"},deps,{signal:AbortSignal.abort(),run});
    expect(admitted.status).toBe("SUCCESS");if(admitted.status!=="SUCCESS")throw Error("admission");
    const otherJob="task187-otherjob-"+randomUUID();await createJob(otherJob,other);
    await expect(processIndexRequest(new Headers(),doc,"resume-key",{action:"RESUME",jobId:admitted.data.jobId},deps,{run})).resolves.toMatchObject({status:"SUCCESS"});
    expect(run).toHaveBeenCalledTimes(1);
    await expect(prisma.ragIndexJob.findUniqueOrThrow({where:{id:otherJob}})).resolves.toMatchObject({status:"QUEUED",attemptCount:0});
    await expect(processIndexRequest(new Headers(),doc,"resume-key",{action:"RESUME",jobId:admitted.data.jobId},deps,{run})).resolves.toMatchObject({status:"SUCCESS",replayed:true});
    expect(run).toHaveBeenCalledTimes(1);
    await expect(processIndexRequest(new Headers(),doc,"resume-key",{action:"RETRY",jobId:admitted.data.jobId},deps,{run})).resolves.toMatchObject({status:"FAILED",error:{code:"IDEMPOTENCY_KEY_REUSED"}});
    await prisma.ragIndexJob.update({where:{id:admitted.data.jobId},data:{status:"UNKNOWN",leaseToken:null,leaseExpiresAt:null}});
    await expect(processIndexRequest(new Headers(),doc,"retry-unknown",{action:"RETRY",jobId:admitted.data.jobId},deps,{run})).resolves.toMatchObject({status:"FAILED",error:{code:"RAG_INDEX_JOB_NOT_RETRYABLE"}});
    await expect(processIndexRequest(new Headers(),doc,"foreign",{action:"RESUME",jobId:otherJob},deps,{run})).resolves.toMatchObject({status:"FAILED",error:{code:"RAG_INDEX_JOB_NOT_FOUND"}});
    expect(run).toHaveBeenCalledTimes(1);
    const progress=await readIndexProgress(new Headers(),doc,deps);
    expect(progress.job).toMatchObject({jobId:admitted.data.jobId,status:"UNKNOWN",chunksPersisted:0,embeddingsPersisted:0,totalChunks:null});
    expect(JSON.stringify(progress)).not.toMatch(/storagePath|leaseToken|requestedById|generationId/);
    await prisma.ragIndexJob.update({where:{id:admitted.data.jobId},data:{status:"FAILED"}});
    await expect(processIndexRequest(new Headers(),doc,"retry-known",{action:"RETRY",jobId:admitted.data.jobId},deps,{run})).resolves.toMatchObject({status:"SUCCESS"});
    expect(run).toHaveBeenCalledTimes(2);
  });

});
