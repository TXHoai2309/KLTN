import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCompanionFormContext,
  fetchPublicCompanion,
  previewCompanionDraft,
  publishCompanionTrip,
  CompanionClientError,
} from "./companion-client";
import { companionDraftFixture, companionFormFixture, publicCompanionFixture } from "./companion-fixtures";

describe("Companion Client API", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchCompanionFormContext", () => {
    it("returns validated CompanionFormContext on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionFormFixture }),
      });

      const result = await fetchCompanionFormContext("trip-123");
      expect(result).toEqual(companionFormFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trips/trip-123/publication", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });

    it("throws CompanionClientError on 401 unauthenticated", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: "UNAUTHENTICATED", message: "Yêu cầu đăng nhập." } }),
      });

      await expect(fetchCompanionFormContext("trip-123")).rejects.toMatchObject({
        name: "CompanionClientError",
        code: "UNAUTHENTICATED",
        status: 401,
      });
    });

    it("throws CompanionClientError on invalid schema response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { invalid: "payload" } }),
      });

      await expect(fetchCompanionFormContext("trip-123")).rejects.toMatchObject({
        code: "INVALID_FORM_CONTEXT",
        status: 500,
      });
    });
  });

  describe("previewCompanionDraft", () => {
    it("sends draft and returns validated CompanionIntroduction", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { introduction: publicCompanionFixture.introduction } }),
      });

      const intro = await previewCompanionDraft("trip-123", companionDraftFixture);
      expect(intro).toEqual(publicCompanionFixture.introduction);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trips/trip-123/publication/preview",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify(companionDraftFixture),
        }),
      );
    });

    it("rejects client-side draft with invalid capacity or empty title", async () => {
      const invalidDraft = { ...companionDraftFixture, additionalCapacity: -1 };
      await expect(previewCompanionDraft("trip-123", invalidDraft)).rejects.toThrow();
    });

    it("maps server error response on 400", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: { code: "INVALID_COMPANION_INPUT", message: "Tiêu đề không hợp lệ." } }),
      });

      await expect(previewCompanionDraft("trip-123", companionDraftFixture)).rejects.toMatchObject({
        code: "INVALID_COMPANION_INPUT",
        status: 400,
      });
    });
  });

  describe("publishCompanionTrip", () => {
    it("returns SUCCESS outcome with confirmed publicationId and tripId", async () => {
      const outcomePayload = {
        success: true,
        operationStatus: "SUCCESS",
        data: { publicationId: "pub-789", tripId: "trip-123" },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Idempotency-Replayed": "false" }),
        json: async () => outcomePayload,
      });

      const result = await publishCompanionTrip("trip-123", companionDraftFixture, "key-456");
      expect(result).toEqual({
        status: "SUCCESS",
        data: { publicationId: "pub-789", tripId: "trip-123" },
        replayed: false,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trips/trip-123/publication",
        expect.objectContaining({
          method: "POST",
          headers: expect.any(Headers),
          body: JSON.stringify({ ...companionDraftFixture, confirm: true }),
        }),
      );
    });

    it("handles UNKNOWN outcome and signals retryWithSameKey", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network drop"));

      const result = await publishCompanionTrip("trip-123", companionDraftFixture, "key-456");
      expect(result).toMatchObject({
        status: "UNKNOWN",
        retryWithSameKey: true,
      });
    });

    it("treats mismatched tripId in success data as UNKNOWN to prevent corrupted state", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-789", tripId: "DIFFERENT_TRIP" },
        }),
      });

      const result = await publishCompanionTrip("trip-123", companionDraftFixture, "key-456");
      expect(result).toMatchObject({
        status: "UNKNOWN",
        retryWithSameKey: true,
      });
    });

    it("returns FAILED outcome on 409 conflict (already published or past date)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers(),
        json: async () => ({
          success: false,
          operationStatus: "FAILED",
          error: { code: "COMPANION_ALREADY_PUBLISHED", message: "Chuyến đi đã được công khai." },
        }),
      });

      const result = await publishCompanionTrip("trip-123", companionDraftFixture, "key-456");
      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.error.code).toBe("COMPANION_ALREADY_PUBLISHED");
      }
    });
  });

  describe("fetchPublicCompanion", () => {
    it("returns PublicCompanion for valid publicationId", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: publicCompanionFixture }),
      });

      const companion = await fetchPublicCompanion("pub-789");
      expect(companion).toEqual(publicCompanionFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-789", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });

    it("throws 404 CompanionClientError when companion not found", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: { code: "COMPANION_NOT_FOUND", message: "Không tìm thấy." } }),
      });

      await expect(fetchPublicCompanion("missing")).rejects.toMatchObject({
        code: "COMPANION_NOT_FOUND",
        status: 404,
      });
    });
  });
});
