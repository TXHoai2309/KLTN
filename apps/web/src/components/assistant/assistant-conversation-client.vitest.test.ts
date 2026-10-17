import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchConversations,
  fetchConversationDetail,
  renameConversation,
  deleteConversation,
  ConversationApiError,
} from "./assistant-conversation-client";

describe("assistant-conversation-client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchConversations calls GET with correct search params", async () => {
    const mockResponse = {
      success: true,
      data: {
        items: [
          {
            id: "conv-1",
            title: "Test",
            context: { type: "GENERAL" },
            createdAt: "2026-10-17T00:00:00Z",
            lastActivityAt: "2026-10-17T00:00:00Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
    };

    let requestedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify(mockResponse), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const result = await fetchConversations({ search: "Hà Giang", limit: 10 });
    expect(requestedUrl).toContain("/api/ai/conversations?search=H%C3%A0+Giang&limit=10");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("conv-1");
  });

  it("fetchConversationDetail returns metadata and turns", async () => {
    const mockDetail = {
      success: true,
      conversation: {
        id: "conv-1",
        title: "Test Conversation",
        context: { type: "GENERAL" },
        headTurnId: "turn-1",
        createdAt: "2026-10-17T00:00:00Z",
        lastActivityAt: "2026-10-17T00:00:00Z",
      },
      data: [
        {
          question: "Hà Giang có gì đẹp?",
          response: {
            conversationId: "conv-1",
            turnId: "turn-1",
            turnState: "COMPLETED",
            status: "CONVERSATIONAL",
            context: { type: "GENERAL" },
            answerParts: [],
            citations: [],
            message: "Hà Giang có nhiều cảnh đẹp như Mã Pí Lèng, Cột cờ Lũng Cú.",
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockDetail), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const result = await fetchConversationDetail("conv-1");
    expect(result.conversation.id).toBe("conv-1");
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.question).toBe("Hà Giang có gì đẹp?");
  });

  it("renameConversation sends PATCH with CSRF header and valid body", async () => {
    let capturedOptions: RequestInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ success: true, data: { id: "conv-1", title: "Tên mới" } }), { status: 200 });
    });

    const result = await renameConversation("conv-1", "Tên mới");
    expect(result.title).toBe("Tên mới");
    expect(capturedOptions?.method).toBe("PATCH");
    expect((capturedOptions?.headers as Record<string, string>)["x-requested-with"]).toBe("XMLHttpRequest");
    expect(JSON.parse(capturedOptions?.body as string)).toEqual({ title: "Tên mới" });
  });

  it("deleteConversation sends DELETE with CSRF header", async () => {
    let capturedOptions: RequestInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ success: true, data: { id: "conv-1" } }), { status: 200 });
    });

    const result = await deleteConversation("conv-1");
    expect(result.id).toBe("conv-1");
    expect(capturedOptions?.method).toBe("DELETE");
    expect((capturedOptions?.headers as Record<string, string>)["x-requested-with"]).toBe("XMLHttpRequest");
  });

  it("throws ConversationApiError on failure response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Không tìm thấy." } }), { status: 404 })
    );

    await expect(fetchConversationDetail("conv-404")).rejects.toThrow(ConversationApiError);
  });
});
