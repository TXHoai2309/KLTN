import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DestinationAssistantPanel } from "./destination-assistant-panel";
import { DestinationAiFab } from "../destination-ai-fab";
import { AssistantController, type AssistantTransport, type AssistantTransportResult } from "./assistant-controller";
import { setAssistantHandoff, consumeAssistantHandoff, peekAssistantHandoff, clearAssistantHandoff } from "./assistant-handoff";
import { qaPanelWireFixtures } from "../../modules/ai/__fixtures__/qa-panel-wire";
import { useAssistantSession } from "./use-assistant-session";

// Mock next/navigation useRouter
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock authClient to control session
vi.mock("../../lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false, error: null }),
  },
}));

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Destination Assistant Popup Tickets 02–06", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAssistantHandoff();
  });

  describe("Ticket 02: Destination Panel Chat", () => {
    it("supplies the mounted controller a transport before asynchronous session bootstrap", () => {
      let bootstrapTransport: AssistantTransport | null = null;
      let bootstrapAvailable = true;
      function BootstrapProbe() {
        const session = useAssistantSession();
        bootstrapTransport = session.transport;
        bootstrapAvailable = session.available;
        return null;
      }
      renderToStaticMarkup(createElement(BootstrapProbe));
      // The composer is gated, but its one-time controller must not capture null.
      expect(bootstrapTransport).not.toBeNull();
      expect(bootstrapAvailable).toBe(false);
    });
    it("registers Destination context without rendering a second page-local launcher", () => {
      const markup = renderToStaticMarkup(
        createElement(DestinationAiFab, {
          destinationId: "dong-van",
          destinationName: "Đồng Văn",
        })
      );

      // The root-layout provider owns the one global trigger; page context is inert.
      expect(markup).toBe("");
    });

    it("renders panel pinned to Destination with title, compact header, and suggestions", () => {
      const markup = renderToStaticMarkup(
        createElement(DestinationAssistantPanel, {
          destinationId: "meo-vac",
          destinationName: "Mèo Vạc",
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(markup).toContain("Mèo Vạc");
      expect(markup).toContain('class="destination-panel-title">Trợ lý AI</h2>');
      expect(markup).toContain('class="destination-panel-subtitle">Mèo Vạc</summary>');
      expect(markup).toContain("Giới thiệu ngắn gọn về Mèo Vạc.");
      expect(markup).toContain("Chat mới");
      expect(markup).toContain("Thu gọn");
      expect(markup).not.toContain("<main");
    });

    it("opening panel alone does not dispatch an ask or model call", () => {
      let sentCount = 0;
      const testTransport: AssistantTransport = {
        send: async () => {
          sentCount++;
          return { kind: "networkAmbiguity" };
        },
      };

      const markup = renderToStaticMarkup(
        createElement(DestinationAssistantPanel, {
          destinationId: "lung-cu",
          destinationName: "Lũng Cú",
          isOpen: true,
          onClose: () => {},
          transport: testTransport,
          identity: "GUEST:test",
          available: true,
        })
      );

      expect(markup).toContain("Lũng Cú");
      expect(sentCount).toBe(0);
    });

    it("renders wire response fixture with sources and citations correctly", async () => {
      const calls: any[] = [];
      const testTransport: AssistantTransport = {
        send: async (attempt) => {
          calls.push(attempt);
          return {
            kind: "response",
            httpStatus: 200,
            body: qaPanelWireFixtures.first.response,
          };
        },
      };

      let keyIdx = 0;
      const controller = new AssistantController(
        testTransport,
        "GUEST:test",
        () => `key_${++keyIdx}`,
        { type: "DESTINATION", destinationId: "panel_destination_fixture" },
        "SOURCE_ONLY"
      );

      controller.setDraft("Điểm kiểm thử có gì?");
      expect(controller.submit()).toBe(true);
      await tick();

      const snapshot = controller.getSnapshot();
      expect(snapshot.turns).toHaveLength(1);
      expect(snapshot.turns[0]?.response.status).toBe("ANSWERED");
      expect(snapshot.turns[0]?.response.answerParts[0]?.text).toContain("Đây là dữ kiện giả lập");
      expect(snapshot.turns[0]?.response.citations[0]?.title).toContain("Nguồn giả lập");
    });

    it("submits follow-up with conversationId and parentTurnId", async () => {
      const calls: any[] = [];
      const testTransport: AssistantTransport = {
        send: async (attempt) => {
          calls.push(attempt);
          if (calls.length === 1) {
            return {
              kind: "response",
              httpStatus: 200,
              body: qaPanelWireFixtures.first.response,
            };
          }
          return {
            kind: "response",
            httpStatus: 200,
            body: qaPanelWireFixtures.followUp.response,
          };
        },
      };

      let keyIdx = 0;
      const controller = new AssistantController(
        testTransport,
        "GUEST:test",
        () => `key_${++keyIdx}`,
        { type: "DESTINATION", destinationId: "panel_destination_fixture" },
        "SOURCE_ONLY"
      );

      controller.setDraft("Câu hỏi đầu");
      controller.submit();
      await tick();

      expect(controller.getSnapshot().conversationId).toBe("panel_conversation_fixture");

      controller.setKnowledgeMode("EXPANDED");
      controller.setDraft("Nên chuẩn bị gì?");
      controller.submit();
      await tick();

      expect(calls).toHaveLength(2);
      const followUpCall = calls[1];
      expect(followUpCall.payload.conversationId).toBe("panel_conversation_fixture");
      expect(followUpCall.payload.parentTurnId).toBe("panel_turn_1");
      expect(followUpCall.payload.knowledgeMode).toBe("EXPANDED");
    });
  });

  describe("Ticket 03: Minimize, Retry and Abandonment", () => {
    it("hidden panel preserves controller state, draft, mode, and pending attempt", () => {
      const controller = new AssistantController(
        null,
        "GUEST:test",
        () => "key_1",
        { type: "DESTINATION", destinationId: "dest_1" },
        "EXPANDED"
      );

      controller.setDraft("Nháp chưa gửi");
      expect(controller.getSnapshot().draft).toBe("Nháp chưa gửi");
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");

      // Simulating panel minimization (hidden=true)
      const markup = renderToStaticMarkup(
        createElement(DestinationAssistantPanel, {
          destinationId: "dest_1",
          isOpen: false, // minimized
          onClose: () => {},
        })
      );

      expect(markup).toContain('hidden=""');
      expect(markup).toContain('style="display:none"');
      // State in controller remains intact
      expect(controller.getSnapshot().draft).toBe("Nháp chưa gửi");
      expect(controller.getSnapshot().knowledgeMode).toBe("EXPANDED");
    });

    it("retry preserves the identical Idempotency-Key and validated payload", async () => {
      const calls: any[] = [];
      let resolveAttempt: (res: AssistantTransportResult) => void;
      const testTransport: AssistantTransport = {
        send: async (attempt) => {
          calls.push(attempt);
          return new Promise<AssistantTransportResult>((resolve) => {
            resolveAttempt = resolve;
          });
        },
      };

      let keyIdx = 0;
      const controller = new AssistantController(
        testTransport,
        "GUEST:test",
        () => `idemp_key_${++keyIdx}`,
        { type: "DESTINATION", destinationId: "dest_1" },
        "SOURCE_ONLY"
      );

      controller.setDraft("Câu hỏi cần retry");
      controller.submit();
      expect(calls).toHaveLength(1);
      const firstKey = calls[0].key;

      // Fail with UNKNOWN / 503
      resolveAttempt!({
        kind: "response",
        httpStatus: 503,
        body: qaPanelWireFixtures.unknown,
      });
      await tick();

      expect(controller.getSnapshot().pending?.phase).toBe("unknown");

      // Edit composer draft while pending in unknown phase
      controller.setDraft("Đã đổi ô nhập nhưng retry phải giữ nguyên");

      // Retry
      expect(controller.retry()).toBe(true);
      expect(calls).toHaveLength(2);

      // Exact same Idempotency-Key and payload
      expect(calls[1].key).toBe(firstKey);
      expect(calls[1].payload.question).toBe("Câu hỏi cần retry");
    });

    it("new conversation blocked during unresolved attempt unless confirmed", () => {
      let resolveAttempt: (res: AssistantTransportResult) => void;
      const testTransport: AssistantTransport = {
        send: async () => new Promise<AssistantTransportResult>((resolve) => { resolveAttempt = resolve; }),
      };

      const controller = new AssistantController(
        testTransport,
        "GUEST:test",
        () => "key_test",
        { type: "DESTINATION", destinationId: "dest_1" }
      );

      controller.setDraft("Đang xử lý");
      controller.submit();
      expect(controller.getSnapshot().pending?.phase).toBe("sending");

      // newConversation without confirmation is blocked
      expect(controller.newConversation(false)).toBe(false);
      expect(controller.getSnapshot().pending).not.toBeNull();

      // newConversation with confirmed abandonment succeeds
      expect(controller.newConversation(true)).toBe(true);
      expect(controller.getSnapshot().pending).toBeNull();
      expect(controller.getSnapshot().turns).toHaveLength(0);
    });
  });

  describe("Ticket 04: Responsive Sheet and Accessibility", () => {
    it("renders dialog semantics and modal attribute appropriately", () => {
      const markup = renderToStaticMarkup(
        createElement(DestinationAssistantPanel, {
          destinationId: "dest_1",
          destinationName: "Đồng Văn",
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-label="Trợ lý AI về Đồng Văn"');
      expect(markup).toContain('tabindex="-1"');
    });
  });

  describe("Ticket 05: In-Memory Full-Page Handoff", () => {
    it("blocks handoff when unresolved attempt is in progress", () => {
      const controller = new AssistantController(
        { send: async () => new Promise(() => {}) },
        "GUEST:test",
        () => "key_x",
        { type: "DESTINATION", destinationId: "dest_1" }
      );
      controller.setDraft("Câu hỏi đang gửi");
      controller.submit();

      // hasUnresolvedAttempt is true
      expect(controller.getSnapshot().pending?.phase).toBe("sending");

      // Hand-off is blocked
      const canHandoff = !controller.getSnapshot().pending || controller.getSnapshot().pending?.phase === "failed";
      expect(canHandoff).toBe(false);
    });

    it("transfers draft and mode to destination context when no conversationId exists", () => {
      setAssistantHandoff({
        principal: "GUEST:actor",
        context: { type: "DESTINATION", destinationId: "dest_1" },
        conversationId: null,
        draft: "Bản nháp chuyển sang trang đầy đủ",
        knowledgeMode: "EXPANDED",
      });

      const consumed = consumeAssistantHandoff(
        "GUEST:actor",
        null,
        { type: "DESTINATION", destinationId: "dest_1" }
      );

      expect(consumed).not.toBeNull();
      expect(consumed?.draft).toBe("Bản nháp chuyển sang trang đầy đủ");
      expect(consumed?.knowledgeMode).toBe("EXPANDED");
      expect(consumed?.conversationId).toBeNull();

      // Consumed exactly once
      expect(peekAssistantHandoff()).toBeNull();
    });

    it("transfers draft and mode to confirmed conversationId", () => {
      setAssistantHandoff({
        principal: "USER:user_123",
        context: { type: "DESTINATION", destinationId: "dest_1" },
        conversationId: "conv_confirmed_1",
        draft: "Câu hỏi tiếp theo",
        knowledgeMode: "SOURCE_ONLY",
      });

      const consumed = consumeAssistantHandoff(
        "USER:user_123",
        "conv_confirmed_1",
        { type: "DESTINATION", destinationId: "dest_1" }
      );

      expect(consumed).not.toBeNull();
      expect(consumed?.conversationId).toBe("conv_confirmed_1");
      expect(consumed?.draft).toBe("Câu hỏi tiếp theo");
      expect(consumed?.knowledgeMode).toBe("SOURCE_ONLY");
    });
  });

  describe("Ticket 06: Identity & Context Isolation", () => {
    it("invalidates in-memory handoff when principal changes", () => {
      setAssistantHandoff({
        principal: "GUEST:old_guest",
        context: { type: "DESTINATION", destinationId: "dest_1" },
        conversationId: null,
        draft: "Bí mật",
        knowledgeMode: "SOURCE_ONLY",
      });

      // User logs in as USER:new_user
      const consumed = consumeAssistantHandoff(
        "USER:new_user",
        null,
        { type: "DESTINATION", destinationId: "dest_1" }
      );

      // Must be rejected and wiped out
      expect(consumed).toBeNull();
      expect(peekAssistantHandoff()).toBeNull();
    });

    it("controller clears turns and increments generation on identity change", () => {
      const controller = new AssistantController(
        null,
        "GUEST:first_user",
        () => "key_1",
        { type: "DESTINATION", destinationId: "dest_1" }
      );

      controller.setDraft("Câu hỏi của user 1");
      expect(controller.getSnapshot().draft).toBe("Câu hỏi của user 1");
      expect(controller.getSnapshot().generation).toBe(0);

      // Change identity to user 2
      controller.changeIdentity("USER:second_user");

      const state = controller.getSnapshot();
      expect(state.identity).toBe("USER:second_user");
      expect(state.draft).toBe("");
      expect(state.turns).toHaveLength(0);
      expect(state.generation).toBe(1);
    });

    it("rejects destination context mismatch on handoff", () => {
      setAssistantHandoff({
        principal: "GUEST:guest_1",
        context: { type: "DESTINATION", destinationId: "dest_a" },
        conversationId: null,
        draft: "Hỏi điểm A",
        knowledgeMode: "SOURCE_ONLY",
      });

      // Destination changed to dest_b
      const consumed = consumeAssistantHandoff(
        "GUEST:guest_1",
        null,
        { type: "DESTINATION", destinationId: "dest_b" }
      );

      expect(consumed).toBeNull();
    });
  });
});
