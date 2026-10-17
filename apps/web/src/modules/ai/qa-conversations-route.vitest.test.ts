import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockQaHttp = vi.hoisted(() => ({
  listConversations: vi.fn(),
  conversation: vi.fn(),
  renameConversation: vi.fn(),
  conversationTurns: vi.fn(),
}));

vi.mock("./qa-runtime", () => ({
  qaHttp: mockQaHttp,
}));

import { GET as getConversations } from "../../app/api/ai/conversations/route";
import {
  GET as getConversation,
  PATCH as renameConversation,
  DELETE as deleteConversation,
} from "../../app/api/ai/conversations/[id]/route";
import { GET as getTurns } from "../../app/api/ai/conversations/[id]/turns/route";

describe("Conversations API Routes", () => {
  beforeEach(() => {
    mockQaHttp.listConversations.mockReset();
    mockQaHttp.conversation.mockReset();
    mockQaHttp.renameConversation.mockReset();
    mockQaHttp.conversationTurns.mockReset();
  });

  describe("GET /api/ai/conversations", () => {
    it("calls qaHttp.listConversations and returns response", async () => {
      mockQaHttp.listConversations.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { items: [], nextCursor: null, hasMore: false },
          }),
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        )
      );

      const req = new Request("http://localhost/api/ai/conversations?limit=10&search=HaGiang");
      const res = await getConversations(req);
      expect(res.status).toBe(200);
      expect(mockQaHttp.listConversations).toHaveBeenCalledWith(req);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("GET /api/ai/conversations/:id", () => {
    it("calls qaHttp.conversation with id param and deleteAction=false", async () => {
      mockQaHttp.conversation.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            conversation: { id: "conv-1", title: "Test", context: { type: "GENERAL" } },
          }),
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        )
      );

      const req = new Request("http://localhost/api/ai/conversations/conv-1");
      const context = { params: Promise.resolve({ id: "conv-1" }) };
      const res = await getConversation(req, context);
      expect(res.status).toBe(200);
      expect(mockQaHttp.conversation).toHaveBeenCalledWith(req, "conv-1", false);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.conversation.id).toBe("conv-1");
    });
  });

  describe("PATCH /api/ai/conversations/:id", () => {
    it("calls qaHttp.renameConversation with id param", async () => {
      mockQaHttp.renameConversation.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: "conv-1", title: "Tên mới" },
          }),
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        )
      );

      const req = new Request("http://localhost/api/ai/conversations/conv-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        body: JSON.stringify({ title: "Tên mới" }),
      });
      const context = { params: Promise.resolve({ id: "conv-1" }) };
      const res = await renameConversation(req, context);
      expect(res.status).toBe(200);
      expect(mockQaHttp.renameConversation).toHaveBeenCalledWith(req, "conv-1");
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("Tên mới");
    });
  });

  describe("DELETE /api/ai/conversations/:id", () => {
    it("calls qaHttp.conversation with id param and deleteAction=true", async () => {
      mockQaHttp.conversation.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: "conv-1" },
          }),
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        )
      );

      const req = new Request("http://localhost/api/ai/conversations/conv-1", {
        method: "DELETE",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const context = { params: Promise.resolve({ id: "conv-1" }) };
      const res = await deleteConversation(req, context);
      expect(res.status).toBe(200);
      expect(mockQaHttp.conversation).toHaveBeenCalledWith(req, "conv-1", true);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("GET /api/ai/conversations/:id/turns", () => {
    it("calls qaHttp.conversationTurns with id param", async () => {
      mockQaHttp.conversationTurns.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { turns: [], nextCursor: null, hasMore: false },
          }),
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        )
      );

      const req = new Request("http://localhost/api/ai/conversations/conv-1/turns?limit=20");
      const context = { params: Promise.resolve({ id: "conv-1" }) };
      const res = await getTurns(req, context);
      expect(res.status).toBe(200);
      expect(mockQaHttp.conversationTurns).toHaveBeenCalledWith(req, "conv-1");
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
