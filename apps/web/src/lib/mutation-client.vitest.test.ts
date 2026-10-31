import { afterEach, describe, expect, it, vi } from "vitest";

import { sendIdempotentMutation } from "./mutation-client";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

describe("shared mutation client reliability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts confirmed SUCCESS and exposes replay evidence", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(
        { success: true, operationStatus: "SUCCESS", data: { id: "saved" } },
        200,
        { "Idempotency-Replayed": "true" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendIdempotentMutation<{ id: string }>("/write", {
        idempotencyKey: "stable-key",
        init: { method: "POST", body: '{"name":"Ha Giang"}' },
      }),
    ).resolves.toEqual({
      status: "SUCCESS",
      data: { id: "saved" },
      replayed: true,
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe(
      "stable-key",
    );
  });

  it("keeps known validation and idempotency conflicts as FAILED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            success: false,
            operationStatus: "FAILED",
            error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ." },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        response(
          {
            success: false,
            operationStatus: "FAILED",
            error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Request khác payload." },
          },
          409,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendIdempotentMutation("/write", { idempotencyKey: "key", init: { method: "POST" } }),
    ).resolves.toMatchObject({ status: "FAILED", httpStatus: 400 });
    await expect(
      sendIdempotentMutation("/write", { idempotencyKey: "key", init: { method: "POST" } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      httpStatus: 409,
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
  });

  it.each([
    ["network loss", async () => { throw new TypeError("connection reset"); }],
    ["truncated JSON", async () => new Response("{", { status: 200 })],
    ["malformed envelope", async () => response({ success: true, data: { id: "saved" } })],
    [
      "non-success HTTP carrying a SUCCESS body",
      async () => response({ success: true, operationStatus: "SUCCESS", data: { id: "saved" } }, 503),
    ],
    [
      "blank error contract",
      async () => response({ success: false, operationStatus: "FAILED", error: { code: "", message: "" } }, 400),
    ],
  ])("maps %s to UNKNOWN instead of claiming a confirmed outcome", async (_label, transport) => {
    vi.stubGlobal("fetch", vi.fn(transport));

    await expect(
      sendIdempotentMutation("/write", { idempotencyKey: "same-key", init: { method: "POST" } }),
    ).resolves.toMatchObject({
      status: "UNKNOWN",
      retryWithSameKey: true,
      error: { code: "OPERATION_STATUS_UNKNOWN" },
    });
  });

  it("preserves an explicit UNKNOWN response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          {
            success: false,
            operationStatus: "UNKNOWN",
            error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác định." },
            retryWithSameKey: true,
          },
          503,
        ),
      ),
    );

    await expect(
      sendIdempotentMutation("/write", { idempotencyKey: "same-key", init: { method: "POST" } }),
    ).resolves.toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
  });
});
