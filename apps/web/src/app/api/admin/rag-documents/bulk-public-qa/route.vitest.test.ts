import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulk: vi.fn(),
  dependencies: { database: {} },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/rag-document/rag-service", () => ({
  bulkSetRagPublicQa: mocks.bulk,
}));
vi.mock("@/modules/rag-document/rag-server", () => ({
  ragDependencies: mocks.dependencies,
}));

import { POST } from "./route";

function request(key?: string) {
  const headers = new Headers({
    Origin: "http://localhost",
    "Content-Type": "application/json",
  });
  if (key) headers.set("Idempotency-Key", key);
  return new Request("http://localhost/api/admin/rag-documents/bulk-public-qa", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "ENABLE_ALL_INDEXED" }),
  });
}

describe("RAG bulk public QA mutation route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires and forwards the idempotency key using the shared SUCCESS envelope", async () => {
    mocks.bulk.mockResolvedValue({
      status: "SUCCESS",
      data: { updatedCount: 2, ids: ["rag-1", "rag-2"] },
      replayed: true,
    });
    const req = request("bulk-key");

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      operationStatus: "SUCCESS",
      data: { updatedCount: 2 },
    });
    expect(mocks.bulk).toHaveBeenCalledWith(
      req.headers,
      { action: "ENABLE_ALL_INDEXED" },
      "bulk-key",
      mocks.dependencies,
    );
  });

  it("returns UNKNOWN without claiming success", async () => {
    mocks.bulk.mockResolvedValue({
      status: "UNKNOWN",
      retryWithSameKey: true,
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác định." },
    });

    const response = await POST(request("bulk-key"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      operationStatus: "UNKNOWN",
      retryWithSameKey: true,
    });
  });

  it("rejects a missing key before calling the service", async () => {
    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      operationStatus: "FAILED",
      error: { code: "IDEMPOTENCY_KEY_REQUIRED" },
    });
    expect(mocks.bulk).not.toHaveBeenCalled();
  });
});
