import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCompanionFormContext,
  fetchCompanionViewerContext,
  fetchPublicCompanion,
  fetchPublicCompanions,
  fetchMyCompanionPublications,
  fetchJoinedCompanions,
  fetchCompanionGroup,
  fetchCompanionManagement,
  updateCompanionManagement,
  fetchCompanionMembers,
  banCompanionMember,
  fetchCompanionMessages,
  sendCompanionMessage,
  fetchCompanionDelta,
  reconcileCompanionMessage,
  fetchCompanionUnread,
  markCompanionRead,
  cancelCompanionTrip,
  joinCompanionTrip,
  leaveCompanionTrip,
  previewCompanionDraft,
  publishCompanionTrip,
  CompanionClientError,
} from "./companion-client";
import {
  companionDraftFixture,
  companionFormFixture,
  publicCompanionFixture,
  companionHostViewerFixture,
  companionVisitorFixture,
  companionListFixture,
} from "./companion-fixtures";
import { companionGroupFixture } from "./companion-group-fixtures";
import { companionManageFixture } from "./companion-management-fixtures";
import { companionMembersFixture } from "./companion-members-fixtures";
import {
  companionDeltaFixture,
  companionHistoryFixture,
  companionMessageFixture,
} from "./companion-chat-fixtures";

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

  describe("fetchCompanionViewerContext", () => {
    it("returns HOST viewer context when user owns the trip", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionHostViewerFixture }),
      });

      const context = await fetchCompanionViewerContext("pub-123");
      expect(context).toEqual(companionHostViewerFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-123/viewer", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });

    it("returns VISITOR viewer context when user is an outsider", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionVisitorFixture }),
      });

      const context = await fetchCompanionViewerContext("pub-123");
      expect(context).toEqual(companionVisitorFixture);
    });

    it("gracefully returns VISITOR on 401 unauthenticated or 403 locked", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: "UNAUTHENTICATED" } }),
      });

      const context = await fetchCompanionViewerContext("pub-123");
      expect(context).toEqual({ relationship: "VISITOR" });
    });

    it("throws CompanionClientError on unexpected 500 error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Lỗi máy chủ." } }),
      });

      await expect(fetchCompanionViewerContext("pub-123")).rejects.toMatchObject({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  describe("fetchPublicCompanions", () => {
    it("serializes query parameters and returns validated CompanionList", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionListFixture }),
      });

      const result = await fetchPublicCompanions({
        q: "Hà Giang",
        transport: "MOTORCYCLE",
        availableOnly: true,
      });

      expect(result).toEqual(companionListFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions?q=H%C3%A0+Giang&transport=MOTORCYCLE&availableOnly=true",
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
    });

    it("handles error response properly", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: { code: "INVALID_COMPANION_QUERY", message: "Bộ lọc không hợp lệ." } }),
      });

      await expect(fetchPublicCompanions({ q: "test" })).rejects.toMatchObject({
        status: 400,
        code: "INVALID_COMPANION_QUERY",
      });
    });
  });

  describe("fetchMyCompanionPublications", () => {
    it("calls /api/trip-companions/mine and returns list", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionListFixture }),
      });

      const result = await fetchMyCompanionPublications({ limit: 10 });
      expect(result).toEqual(companionListFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/mine?limit=10", {
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

      await expect(fetchMyCompanionPublications()).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("fetchJoinedCompanions", () => {
    it("calls /api/trip-companions/joined and returns list", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionListFixture }),
      });

      const result = await fetchJoinedCompanions({ limit: 12 });
      expect(result).toEqual(companionListFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/joined?limit=12", {
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

      await expect(fetchJoinedCompanions()).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("joinCompanionTrip", () => {
    it("posts { confirm: true } with Idempotency-Key and returns SUCCESS", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123" },
        }),
      });

      const outcome = await joinCompanionTrip("pub-123", "idemp-key-join-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.publicationId).toBe("pub-123");
      }
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions/pub-123/join",
        expect.objectContaining({
          method: "POST",
          headers: expect.any(Headers),
          body: JSON.stringify({ confirm: true }),
        }),
      );
    });

    it("returns FAILED when server rejects with 409 COMPANION_FULL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "FAILED",
          error: { code: "COMPANION_FULL", message: "Chỗ tìm thêm vừa hết." },
        }),
      });

      const outcome = await joinCompanionTrip("pub-123", "idemp-key-join-2");
      expect(outcome.status).toBe("FAILED");
      if (outcome.status === "FAILED") {
        expect(outcome.error.code).toBe("COMPANION_FULL");
      }
    });
  });

  describe("leaveCompanionTrip", () => {
    it("posts { confirm: true } with Idempotency-Key and returns SUCCESS", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123" },
        }),
      });

      const outcome = await leaveCompanionTrip("pub-123", "idemp-key-leave-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.publicationId).toBe("pub-123");
      }
    });
  });

  describe("fetchCompanionGroup", () => {
    it("returns validated CompanionGroup on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionGroupFixture }),
      });

      const result = await fetchCompanionGroup(companionGroupFixture.publicationId);
      expect(result).toEqual(companionGroupFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/trip-companions/${companionGroupFixture.publicationId}/group`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
    });

    it("throws CompanionClientError on 403 COMPANION_GROUP_FORBIDDEN", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: "COMPANION_GROUP_FORBIDDEN", message: "Bạn không có quyền truy cập nhóm này." },
        }),
      });

      await expect(fetchCompanionGroup("pub-forbidden")).rejects.toMatchObject({
        status: 403,
        code: "COMPANION_GROUP_FORBIDDEN",
      });
    });
  });

  describe("fetchCompanionManagement", () => {
    it("returns CompanionManage on 200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionManageFixture }),
      });

      const res = await fetchCompanionManagement("pub-123");
      expect(res).toEqual(companionManageFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-123/management", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });
  });

  describe("updateCompanionManagement", () => {
    it("sends PATCH mutation and returns SUCCESS result", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123", managementRevision: 1 },
        }),
      });

      const outcome = await updateCompanionManagement(
        "pub-123",
        {
          ...companionManageFixture.draft,
          confirm: true,
          baseRevision: 0,
          visibility: "PUBLIC",
          recruitmentOpen: true,
        },
        "idemp-key-manage-1",
      );

      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.managementRevision).toBe(1);
      }
    });
  });

  describe("fetchCompanionMembers", () => {
    it("returns CompanionMembers for valid publicationId", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionMembersFixture }),
      });

      const res = await fetchCompanionMembers("pub-123");
      expect(res).toEqual(companionMembersFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-123/members", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });

    it("throws CompanionClientError when forbidden or invalid", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: "FORBIDDEN", message: "Không có quyền truy cập." },
        }),
      });

      await expect(fetchCompanionMembers("pub-123")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });
  });

  describe("banCompanionMember", () => {
    it("sends POST ban mutation and returns SUCCESS result", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123" },
        }),
      });

      const outcome = await banCompanionMember("pub-123", "user-bad-1", "idemp-key-ban-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.publicationId).toBe("pub-123");
      }
    });

    it("handles UNKNOWN outcome when server returns 503 retryWithSameKey", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "UNKNOWN",
          retryWithSameKey: true,
          error: { code: "OPERATION_STATUS_UNKNOWN", message: "Đang chờ cam kết." },
        }),
      });

      const outcome = await banCompanionMember("pub-123", "user-bad-1", "idemp-key-ban-1");
      expect(outcome.status).toBe("UNKNOWN");
      if (outcome.status === "UNKNOWN") {
        expect(outcome.retryWithSameKey).toBe(true);
      }
    });
  });

  describe("fetchCompanionMessages", () => {
    it("returns CompanionHistory for valid publicationId", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionHistoryFixture }),
      });

      const res = await fetchCompanionMessages("pub-123", { before: "10", limit: 20 });
      expect(res).toEqual(companionHistoryFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-123/messages?before=10&limit=20", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    });

    it("throws CompanionClientError when forbidden or invalid", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: { code: "FORBIDDEN", message: "Chỉ thành viên mới có quyền xem tin nhắn." },
        }),
      });

      await expect(fetchCompanionMessages("pub-123")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });
  });

  describe("sendCompanionMessage", () => {
    it("sends POST message mutation and returns SUCCESS result", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123", messageId: "msg-123", sequence: "1" },
        }),
      });

      const outcome = await sendCompanionMessage("pub-123", "Chào cả đoàn!", "idemp-key-msg-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.messageId).toBe("msg-123");
        expect(outcome.data.sequence).toBe("1");
      }
    });

    it("handles UNKNOWN outcome when server returns 503 retryWithSameKey", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "UNKNOWN",
          retryWithSameKey: true,
          error: { code: "OPERATION_STATUS_UNKNOWN", message: "Đang chờ cam kết." },
        }),
      });

      const outcome = await sendCompanionMessage("pub-123", "Chào cả đoàn!", "idemp-key-msg-1");
      expect(outcome.status).toBe("UNKNOWN");
      if (outcome.status === "UNKNOWN") {
        expect(outcome.retryWithSameKey).toBe(true);
      }
    });
  });

  describe("fetchCompanionDelta", () => {
    it("returns CompanionDelta for valid after query", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: companionDeltaFixture }),
      });

      const res = await fetchCompanionDelta("pub-123", "0", 50);
      expect(res).toEqual(companionDeltaFixture);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/trip-companions/pub-123/messages/delta?after=0&limit=50", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    });

    it("throws CompanionClientError when forbidden or invalid cursor", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: { code: "COMPANION_CURSOR_INVALID", message: "Cursor không hợp lệ." },
        }),
      });

      await expect(fetchCompanionDelta("pub-123", "99999")).rejects.toMatchObject({
        code: "COMPANION_CURSOR_INVALID",
        status: 400,
      });
    });
  });

  describe("reconcileCompanionMessage", () => {
    it("sends POST reconcile and returns confirmed SUCCESS result", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123", messageId: "msg-123", sequence: "1" },
        }),
      });

      const outcome = await reconcileCompanionMessage("pub-123", "Chào cả đoàn!", "idemp-key-msg-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.messageId).toBe("msg-123");
        expect(outcome.data.sequence).toBe("1");
      }
    });

    it("handles UNKNOWN outcome when server returns 503 retryWithSameKey", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "UNKNOWN",
          retryWithSameKey: true,
          error: { code: "OPERATION_STATUS_UNKNOWN", message: "Đang chờ cam kết." },
        }),
      });

      const outcome = await reconcileCompanionMessage("pub-123", "Chào cả đoàn!", "idemp-key-msg-1");
      expect(outcome.status).toBe("UNKNOWN");
      if (outcome.status === "UNKNOWN") {
        expect(outcome.retryWithSameKey).toBe(true);
      }
    });
  });

  describe("fetchCompanionUnread", () => {
    it("fetches unread summaries and validates envelope", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            items: [
              {
                publicationId: "pub-123",
                unreadCount: 3,
                lastReadCursor: "2",
                highWaterCursor: "5",
                canSend: true,
              },
            ],
            nextCursor: null,
          },
        }),
      });

      const result = await fetchCompanionUnread();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].publicationId).toBe("pub-123");
      expect(result.items[0].unreadCount).toBe(3);
      expect(result.items[0].lastReadCursor).toBe("2");
      expect(result.items[0].highWaterCursor).toBe("5");
      expect(result.items[0].canSend).toBe(true);
      expect(result.nextCursor).toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions/unread",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      );
    });

    it("appends query parameters after and limit when provided", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { items: [], nextCursor: null },
        }),
      });

      await fetchCompanionUnread({ after: "pub-099", limit: 20 });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions/unread?after=pub-099&limit=20",
        expect.anything(),
      );
    });

    it("throws CompanionClientError on server error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: { code: "INVALID_COMPANION_QUERY", message: "Tham số không hợp lệ." },
        }),
      });

      await expect(fetchCompanionUnread()).rejects.toMatchObject({
        code: "INVALID_COMPANION_QUERY",
        status: 400,
      });
    });
  });

  describe("markCompanionRead", () => {
    it("marks read cursor monotonically and returns SUCCESS", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123", sequence: "5" },
        }),
      });

      const outcome = await markCompanionRead("pub-123", "5", "idemp-key-read-5");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.publicationId).toBe("pub-123");
        expect(outcome.data.sequence).toBe("5");
      }
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions/pub-123/read",
        expect.objectContaining({
          method: "POST",
          headers: expect.any(Headers),
          body: JSON.stringify({ sequence: "5" }),
        }),
      );
    });

    it("handles UNKNOWN outcome when server returns 500 error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "UNKNOWN",
          retryWithSameKey: true,
          error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa rõ kết quả." },
        }),
      });

      const outcome = await markCompanionRead("pub-123", "5", "idemp-key-read-5");
      expect(outcome.status).toBe("UNKNOWN");
      if (outcome.status === "UNKNOWN") {
        expect(outcome.retryWithSameKey).toBe(true);
      }
    });
  });

  describe("cancelCompanionTrip", () => {
    it("posts { confirm: true } to /cancel and returns SUCCESS", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          operationStatus: "SUCCESS",
          data: { publicationId: "pub-123" },
        }),
      });

      const outcome = await cancelCompanionTrip("pub-123", "idemp-key-cancel-1");
      expect(outcome.status).toBe("SUCCESS");
      if (outcome.status === "SUCCESS") {
        expect(outcome.data.publicationId).toBe("pub-123");
      }
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/trip-companions/pub-123/cancel",
        expect.objectContaining({
          method: "POST",
          headers: expect.any(Headers),
          body: JSON.stringify({ confirm: true }),
        }),
      );
    });

    it("returns FAILED when server rejects cancellation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: false,
          operationStatus: "FAILED",
          error: { code: "FORBIDDEN", message: "Chỉ chủ chuyến mới có quyền hủy." },
        }),
      });

      const outcome = await cancelCompanionTrip("pub-123", "idemp-key-cancel-1");
      expect(outcome.status).toBe("FAILED");
      if (outcome.status === "FAILED") {
        expect(outcome.error.code).toBe("FORBIDDEN");
      }
    });
  });
});
