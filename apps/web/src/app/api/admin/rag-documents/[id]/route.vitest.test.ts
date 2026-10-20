import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  softDelete: vi.fn(),
  restore: vi.fn(),
  dependencies: { database: {} },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/rag-document/rag-service", () => ({
  getRagDocument: vi.fn(),
  softDeleteRagDocument: mocks.softDelete,
  restoreRagDocument: mocks.restore,
}));
vi.mock("@/modules/rag-document/rag-server", () => ({ ragDependencies: mocks.dependencies }));

import { DELETE } from "./route";
import { POST as restore } from "./restore/route";

function request(path: string, init: {
  method: string;
  body?: string;
  origin?: string;
  contentType?: string;
  idempotencyKey?: string;
}): Request {
  const url = `http://localhost${path}`;
  const headers = new Headers();
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  if (init.contentType !== undefined) headers.set("Content-Type", init.contentType);
  if (init.idempotencyKey !== undefined) headers.set("Idempotency-Key", init.idempotencyKey);
  return new Request(url, { method: init.method, headers, body: init.body });
}

const context = { params: Promise.resolve({ id: "rag-1" }) };

describe("RAG document lifecycle routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("DELETE passes the same-origin JSON body and key into the Admin service and returns the mutation envelope", async () => {
    mocks.softDelete.mockResolvedValue({
      status: "SUCCESS",
      data: { id: "rag-1", deletedAt: "2026-10-20T10:00:00.000Z" },
      replayed: false,
    });
    const req = request("/api/admin/rag-documents/rag-1", {
      method: "DELETE", body: "{}", origin: "http://localhost", contentType: "application/json", idempotencyKey: "delete-key",
    });

    const response = await DELETE(req, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Idempotency-Replayed")).toBe("false");
    await expect(response.json()).resolves.toMatchObject({ success: true, operationStatus: "SUCCESS", data: { id: "rag-1" } });
    expect(mocks.softDelete).toHaveBeenCalledWith(req.headers, "rag-1", {}, "delete-key", mocks.dependencies);
  });

  it("POST restores and preserves UNKNOWN retry semantics in the API envelope", async () => {
    mocks.restore.mockResolvedValue({
      status: "UNKNOWN",
      retryWithSameKey: true,
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác định." },
    });
    const req = request("/api/admin/rag-documents/rag-1/restore", {
      method: "POST", body: "{}", origin: "http://localhost", contentType: "application/json", idempotencyKey: "restore-key",
    });

    const response = await restore(req, context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ success: false, operationStatus: "UNKNOWN", retryWithSameKey: true });
    expect(mocks.restore).toHaveBeenCalledWith(req.headers, "rag-1", {}, "restore-key", mocks.dependencies);
  });

  it.each([
    ["cross-origin", { origin: "http://attacker.example", contentType: "application/json", idempotencyKey: "key" }, 403, "INVALID_ORIGIN"],
    ["missing JSON content type", { origin: "http://localhost", contentType: "text/plain", idempotencyKey: "key" }, 415, "INVALID_CONTENT_TYPE"],
    ["missing idempotency key", { origin: "http://localhost", contentType: "application/json" }, 400, "IDEMPOTENCY_KEY_REQUIRED"],
  ] as const)("DELETE rejects %s before invoking the service", async (_label, headers, status, code) => {
    const req = request("/api/admin/rag-documents/rag-1", { method: "DELETE", body: "{}", ...headers });

    const response = await DELETE(req, context);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ success: false, operationStatus: "FAILED", error: { code } });
    expect(mocks.softDelete).not.toHaveBeenCalled();
  });
});
