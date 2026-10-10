import { describe, expect, it, vi } from "vitest";
import { enqueueRagIndexJob, type RagIndexJobServiceDependencies } from "./rag-index-job-service";

vi.mock("server-only", () => ({}));

function fakeDatabase(role: string, documentStatus = "APPROVED") {
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const createdJobs: Array<Record<string, unknown>> = [];
  const db: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const recordSnapshot = new Map([...records].map(([key, value]) => [key, { ...value }]));
      const jobsLength = createdJobs.length;
      try { return await callback(db); }
      catch (error) {
        records.clear();
        for (const [key, value] of recordSnapshot) records.set(key, value);
        createdJobs.length = jobsLength;
        throw error;
      }
    },
    $queryRaw: async () => [{ status: documentStatus }],
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role }) },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null,
      create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => {
        records.set(`${data.scope}:${data.key}`, { requestHash: data.requestHash, responseJson: data.responseJson });
      },
      update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
        const record = records.get(`${where.scope_key.scope}:${where.scope_key.key}`)!;
        record.responseJson = data.responseJson;
      },
    },
    ragIndexJob: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `job-${createdJobs.length + 1}`, status: "QUEUED", phase: "QUEUED", ...data };
        createdJobs.push(row);
        return row;
      },
    },
  };
  return { database: db, createdJobs };
}

describe("US-19 Task185 job admission boundary", () => {
  it("requires the persisted Admin role and queues one job for an authorized request", async () => {
    const admin = fakeDatabase("ADMIN");
    const deps = { database: admin.database, resolveSession: async () => ({ user: { id: "admin-1", role: "admin" } }) };
    const result = await enqueueRagIndexJob(new Headers(), "doc-1", "request-key", deps as unknown as RagIndexJobServiceDependencies);
    expect(result).toMatchObject({ status: "SUCCESS", data: { jobId: "job-1", status: "QUEUED" } });
    expect(admin.createdJobs).toHaveLength(1);
    expect(admin.createdJobs[0]).toMatchObject({ ragDocumentId: "doc-1", requestedById: "admin-1", idempotencyKey: "request-key" });

    const replay = await enqueueRagIndexJob(new Headers(), "doc-1", "request-key", deps as unknown as RagIndexJobServiceDependencies);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: { jobId: "job-1" } });
    expect(admin.createdJobs).toHaveLength(1);
  });

  it("rejects non-Admin actors and ineligible documents before durable admission", async () => {
    const traveler = fakeDatabase("TRAVELER");
    const travelerDeps = { database: traveler.database, resolveSession: async () => ({ user: { id: "traveler-1" } }) };
    await expect(enqueueRagIndexJob(new Headers(), "doc-1", "request-key", travelerDeps as unknown as RagIndexJobServiceDependencies)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(traveler.createdJobs).toHaveLength(0);

    const uploaded = fakeDatabase("ADMIN", "UPLOADED");
    const adminDeps = { database: uploaded.database, resolveSession: async () => ({ user: { id: "admin-1" } }) };
    const result = await enqueueRagIndexJob(new Headers(), "doc-1", "request-key", adminDeps as unknown as RagIndexJobServiceDependencies);
    expect(result).toMatchObject({ status: "FAILED", error: { code: "RAG_DOCUMENT_NOT_ELIGIBLE" } });
    expect(uploaded.createdJobs).toHaveLength(0);
  });
});
