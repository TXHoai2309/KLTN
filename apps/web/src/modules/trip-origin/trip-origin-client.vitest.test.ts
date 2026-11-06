import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateOriginOnServer } from "@/lib/trip-origin-client";
import { ORIGIN_FIXTURES } from "./trip-origin-fixtures";

describe("validateOriginOnServer client transport", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates valid Vietnam origin successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          revision: "origin-v1",
          origin: { ...ORIGIN_FIXTURES.confirmed, confirmed: true },
          coverage: { status: "SUPPORTED", name: "Vietnam", license: "CC BY 4.0" },
        },
      }),
    });

    const result = await validateOriginOnServer({
      label: "Hà Nội",
      latitude: 21.028511,
      longitude: 105.804817,
      source: "MANUAL",
      confirmed: true,
    });

    expect(result.kind).toBe("VALID");
    if (result.kind === "VALID") {
      expect(result.revision).toBe("origin-v1");
      expect(result.coverage.status).toBe("SUPPORTED");
      expect(result.origin.confirmed).toBe(true);
    }
  });

  it("returns OUTSIDE_VIETNAM when position is outside Vietnam", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: {
          code: "ORIGIN_OUTSIDE_VIETNAM",
          message: "Vị trí nằm ngoài phạm vi lãnh thổ Việt Nam.",
        },
      }),
    });

    const result = await validateOriginOnServer({
      label: "Ngoài Việt Nam",
      latitude: 20,
      longitude: 102,
      source: "MANUAL",
      confirmed: true,
    });

    expect(result.kind).toBe("OUTSIDE_VIETNAM");
    if (result.kind === "OUTSIDE_VIETNAM") {
      expect(result.message).toContain("ngoài phạm vi lãnh thổ");
    }
  });

  it("returns COVERAGE_UNKNOWN when position coverage is ambiguous", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: {
          code: "ORIGIN_COVERAGE_UNKNOWN",
          message: "Vị trí gần ranh giới lãnh thổ.",
        },
      }),
    });

    const result = await validateOriginOnServer({
      label: "Vùng biên giới",
      latitude: 22.0,
      longitude: 106.0,
      source: "MANUAL",
      confirmed: true,
    });

    expect(result.kind).toBe("COVERAGE_UNKNOWN");
  });

  it("handles 401 unauthenticated response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Yêu cầu đăng nhập.",
        },
      }),
    });

    const result = await validateOriginOnServer({
      label: "Hà Nội",
      latitude: 21.028511,
      longitude: 105.804817,
      source: "MANUAL",
      confirmed: true,
    });

    expect(result.kind).toBe("UNAUTHENTICATED");
  });

  it("handles client-side invalid schema input before network request", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await validateOriginOnServer({
      label: "",
      latitude: 999, // invalid
      longitude: 105,
      source: "MANUAL",
      confirmed: true,
    });

    expect(result.kind).toBe("INVALID_INPUT");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

