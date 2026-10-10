import { afterEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  BlobAccessError: class BlobAccessError extends Error {},
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  get: getMock,
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Task185 private Blob cancellation", () => {
  it("cancels an in-flight stream read when the worker signal aborts", async () => {
    // The suite uses isolate:false and the worker tests import ragStorage first.
    // Reload it after registering this test's Blob mock so module order is safe.
    vi.resetModules();
    const { ragStorage } = await import("../rag-document/rag-storage");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic-token");
    let pullCount = 0;
    let cancelCount = 0;
    let releasePendingPull = () => {};
    let notifyPendingRead = () => {};
    const pendingRead = new Promise<void>(resolve => { notifyPendingRead = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) controller.enqueue(new Uint8Array([0x41]));
        else {
          notifyPendingRead();
          return new Promise<void>(resolve => { releasePendingPull = resolve; });
        }
      },
      cancel() { cancelCount += 1; releasePendingPull(); },
    });
    getMock.mockResolvedValue({ stream, blob: { size: 2, contentType: "text/plain" } });

    const controller = new AbortController();
    const result = ragStorage.read("registered/private/path", controller.signal);
    await pendingRead;
    controller.abort();

    await expect(result).rejects.toMatchObject({ code: "RAG_READ_CANCELLED" });
    expect(cancelCount).toBe(1);
  });
});
