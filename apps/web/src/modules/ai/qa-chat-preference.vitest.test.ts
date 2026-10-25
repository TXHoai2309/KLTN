import { describe, expect, it, vi } from "vitest";
import { createQaHttpHandlers } from "./qa-http";
import { createQaService } from "./qa-service";
import { AssistantController, type AssistantTransport, type AssistantTransportResult } from "../../components/assistant/assistant-controller";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaCompletedTurn, QaKnowledgeMode, QaRequest } from "./qa-contract";
import { QA_INSUFFICIENT_SOURCE_MESSAGE } from "./qa-contract";
import type { QaPrincipal } from "./qa-runtime-contract";
import { AppError } from "../../server/http/app-error";

vi.mock("server-only", () => ({}));

describe("Ticket 05: Per-Chat Knowledge Preference", () => {
  const principalA: QaPrincipal = { kind: "USER", id: "user-alpha" };
  const principalB: QaPrincipal = { kind: "USER", id: "user-bravo" };

  function createMockStore() {
    const conversations = new Map<string, {
      id: string;
      principal: QaPrincipal;
      title: string;
      context: any;
      knowledgeMode: QaKnowledgeMode;
      turns: any[];
    }>();

    const store: Partial<QaConversationStore> = {
      async reserve(p: QaPrincipal, _key: string, request: QaRequest) {
        if ("conversationId" in request && request.conversationId) {
          const conv = conversations.get(request.conversationId);
          if (!conv || conv.principal.id !== p.id) {
            throw new AppError("NOT_FOUND", "Conversation not found", 404);
          }
          return {
            kind: "RESERVED" as const,
            conversationId: conv.id,
            turnId: `turn-${conv.turns.length + 1}`,
            fence: 1,
            history: conv.turns.map(t => ({ question: t.question, response: t.response })),
            context: conv.context,
          };
        } else {
          const id = `conv-${conversations.size + 1}`;
          const mode = request.knowledgeMode ?? "SOURCE_ONLY";
          conversations.set(id, {
            id,
            principal: p,
            title: "Cuộc hội thoại",
            context: request.context,
            knowledgeMode: mode,
            turns: [],
          });
          return {
            kind: "RESERVED" as const,
            conversationId: id,
            turnId: "turn-1",
            fence: 1,
            history: [],
            context: request.context,
          };
        }
      },
      async complete(p: QaPrincipal, reservation: any, data: QaCompletedTurn) {
        const conv = conversations.get(reservation.conversationId);
        if (!conv || conv.principal.id !== p.id) {
          throw new AppError("NOT_FOUND", "Not found", 404);
        }
        conv.turns.push({ question: "Sample question", response: data });
        if (data.knowledgeMode) {
          conv.knowledgeMode = data.knowledgeMode;
        }
        return data;
      },
      async get(p: QaPrincipal, id: string) {
        const conv = conversations.get(id);
        if (!conv || conv.principal.id !== p.id) {
          throw new AppError("NOT_FOUND", "Not found", 404);
        }
        return {
          conversation: {
            id: conv.id,
            title: conv.title,
            context: conv.context,
            knowledgeMode: conv.knowledgeMode,
            headTurnId: conv.turns.length ? conv.turns[conv.turns.length - 1].response.turnId : null,
            createdAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
          },
          turns: conv.turns,
        };
      },
      async update(p: QaPrincipal, id: string, updates: { title?: string; knowledgeMode?: QaKnowledgeMode }) {
        const conv = conversations.get(id);
        if (!conv || conv.principal.id !== p.id) {
          throw new AppError("NOT_FOUND", "Not found", 404);
        }
        if (updates.title !== undefined) conv.title = updates.title;
        if (updates.knowledgeMode !== undefined) conv.knowledgeMode = updates.knowledgeMode;
        return { id, title: conv.title, knowledgeMode: conv.knowledgeMode };
      },
      async rename(p: QaPrincipal, id: string, title: string) {
        return this.update!(p, id, { title }) as Promise<{ id: string; title: string }>;
      },
    };

    return { store, conversations };
  }

  describe("API and Store Isolation", () => {
    it("stores knowledgeMode on conversation creation and restores it on get", async () => {
      const { store } = createMockStore();
      const service = createQaService({
        store: store as QaConversationStore,
        retriever: { retrieve: async () => [], recheck: async () => true },
        generator: { generate: async () => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE }) },
      });

      // 1. Create conv-1 with EXPANDED
      await store.reserve!(principalA, "key-1", {
        question: "Hỏi mở rộng",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      const detail1 = await service.get(principalA, "conv-1");
      expect(detail1.conversation.knowledgeMode).toBe("EXPANDED");

      // 2. Create conv-2 with default (SOURCE_ONLY)
      await store.reserve!(principalA, "key-2", {
        question: "Hỏi chuẩn",
        context: { type: "GENERAL" },
      });

      const detail2 = await service.get(principalA, "conv-2");
      expect(detail2.conversation.knowledgeMode).toBe("SOURCE_ONLY");

      // conv-1 remains EXPANDED
      const detail1Again = await service.get(principalA, "conv-1");
      expect(detail1Again.conversation.knowledgeMode).toBe("EXPANDED");
    });

    it("prevents foreign principal from reading or updating another user's preference", async () => {
      const { store } = createMockStore();
      await store.reserve!(principalA, "key-1", {
        question: "Chat riêng tư",
        context: { type: "GENERAL" },
        knowledgeMode: "EXPANDED",
      });

      const service = createQaService({
        store: store as QaConversationStore,
        retriever: { retrieve: async () => [], recheck: async () => true },
        generator: { generate: async () => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE }) },
      });

      // Principal B cannot read conv-1
      await expect(service.get(principalB, "conv-1")).rejects.toMatchObject({ code: "NOT_FOUND" });

      // Principal B cannot update conv-1
      await expect(service.update(principalB, "conv-1", { knowledgeMode: "SOURCE_ONLY" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("HTTP PATCH updates conversation knowledgeMode without changing context", async () => {
      const { store } = createMockStore();
      await store.reserve!(principalA, "key-1", {
        question: "Khởi tạo chat",
        context: { type: "GENERAL" },
        knowledgeMode: "SOURCE_ONLY",
      });

      const service = createQaService({
        store: store as QaConversationStore,
        retriever: { retrieve: async () => [], recheck: async () => true },
        generator: { generate: async () => ({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE }) },
      });

      const http = createQaHttpHandlers({
        enabled: () => true,
        resolve: async () => principalA,
        ask: service.ask,
        history: service.history,
        get: service.get,
        update: service.update,
        rename: service.rename,
        delete: async () => undefined,
      });

      const patchReq = new Request("http://localhost/api/ai/conversations/conv-1", {
        method: "PATCH",
        headers: {
          "Origin": "http://localhost",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify({ knowledgeMode: "EXPANDED" }),
      });

      const response = await http.renameConversation(patchReq, "conv-1");
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.knowledgeMode).toBe("EXPANDED");

      const detail = await service.get(principalA, "conv-1");
      expect(detail.conversation.knowledgeMode).toBe("EXPANDED");
      expect(detail.conversation.context).toEqual({ type: "GENERAL" });
    });
  });

  describe("AssistantController Client Preference Isolation", () => {
    it("newConversation resets knowledgeMode to SOURCE_ONLY", () => {
      const controller = new AssistantController(null, "identity-1", () => "key-1", { type: "GENERAL" }, "EXPANDED");
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");

      controller.newConversation();
      expect(controller.getSnapshot().knowledgeMode).toBe("SOURCE_ONLY");
      expect(controller.getSnapshot().conversationId).toBeNull();
    });

    it("loadConversation restores preferenceMode for existing chat", () => {
      const controller = new AssistantController(null, "identity-1", () => "key-1");
      expect(controller.getSnapshot().knowledgeMode).toBe("SOURCE_ONLY");

      controller.loadConversation("conv-42", [], null, { type: "GENERAL" }, false, "EXPANDED");
      expect(controller.getSnapshot().conversationId).toBe("conv-42");
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");
    });

    it("maintains in-flight request snapshot mode separate from concurrent controller mode toggle", async () => {
      let resolveTransport!: (val: AssistantTransportResult) => void;
      const transportPromise = new Promise<AssistantTransportResult>(res => { resolveTransport = res; });
      const sentAttempts: any[] = [];

      const transport: AssistantTransport = {
        send: async (attempt) => {
          sentAttempts.push(attempt);
          return transportPromise;
        },
      };

      const controller = new AssistantController(transport, "identity-1", () => "idemp-key-1");
      controller.setDraft("Câu hỏi lúc SOURCE_ONLY");
      controller.submit();

      // Request was submitted under SOURCE_ONLY mode
      expect(sentAttempts[0].payload.knowledgeMode).toBe("SOURCE_ONLY");

      // While in-flight, user switches toggle to EXPANDED
      controller.setKnowledgeMode("EXPANDED");
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");

      // Server completes the in-flight SOURCE_ONLY turn
      resolveTransport({
        kind: "response",
        httpStatus: 200,
        body: {
          success: true,
          operationStatus: "SUCCESS",
          data: {
            conversationId: "conv-100",
            turnId: "turn-1",
            turnState: "COMPLETED",
            status: "ANSWERED",
            context: { type: "GENERAL" },
            knowledgeMode: "SOURCE_ONLY",
            answerParts: [{ text: "Trả lời từ nguồn", citationIds: ["c1"], mode: "SOURCE" }],
            citations: [{ id: "c1", sourceId: "s1", title: "Doc", sourceUrl: null, locators: [] }],
            unansweredAspects: [],
          },
        },
      });

      await new Promise(res => setTimeout(res, 20));

      // User's current composer toggle stays EXPANDED (was not overwritten by response)
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");
      // But the historical turn in turns list retains its original SOURCE_ONLY mode
      expect(controller.getSnapshot().turns).toHaveLength(1);
      expect(controller.getSnapshot().turns[0].response.knowledgeMode).toBe("SOURCE_ONLY");
    });

    it("UNKNOWN retry preserves the original attempt mode and key even after user toggles mode", async () => {
      let sendCount = 0;
      const sentAttempts: any[] = [];
      const transport: AssistantTransport = {
        send: async (attempt) => {
          sentAttempts.push(attempt);
          sendCount++;
          if (sendCount === 1) {
            return {
              kind: "response",
              httpStatus: 503,
              body: {
                success: false,
                operationStatus: "UNKNOWN",
                retryWithSameKey: true,
                error: { code: "OPERATION_STATUS_UNKNOWN", message: "Timeout" },
              },
            };
          }
          return {
            kind: "response",
            httpStatus: 200,
            body: {
              success: true,
              operationStatus: "SUCCESS",
              data: {
                conversationId: "conv-retry",
                turnId: "turn-retry-1",
                turnState: "COMPLETED",
                status: "ANSWERED",
                context: { type: "GENERAL" },
                knowledgeMode: "SOURCE_ONLY",
                answerParts: [{ text: "Đã hoàn thành sau retry", citationIds: ["c1"], mode: "SOURCE" }],
                citations: [{ id: "c1", sourceId: "s1", title: "Doc", sourceUrl: null, locators: [] }],
                unansweredAspects: [],
              },
            },
          };
        },
      };

      const controller = new AssistantController(transport, "identity-retry", () => "fixed-retry-key");
      controller.setDraft("Câu hỏi retry");
      controller.submit();

      await new Promise(res => setTimeout(res, 20));
      expect(controller.getSnapshot().pending?.phase).toBe("unknown");

      // User flips the toggle to EXPANDED while attempt is pending retry
      controller.setKnowledgeMode("EXPANDED");

      // User clicks retry
      controller.retry();

      expect(sentAttempts).toHaveLength(2);
      // Both attempts must share the exact same key and original SOURCE_ONLY mode!
      expect(sentAttempts[1].key).toBe("fixed-retry-key");
      expect(sentAttempts[1].payload.knowledgeMode).toBe("SOURCE_ONLY");
    });
  });
});
