import { describe, expect, it, vi } from "vitest";
import { planningResponse } from "../../modules/assistant-planning/planning-http";
import { assistantV2Stream } from "./assistant-v2-client";
import {
  clearStoredAssistantPageSession,
  getLastSavedConversationId,
  getStoredAssistantPageSession,
  setLastSavedConversationId,
  setStoredAssistantPageSession,
} from "./assistant-page-session-store";
import type { AuthorizationDependencies } from "../../server/authorization/guard";

function makeAuth(userId: string): AuthorizationDependencies {
  return {
    resolveSession: vi.fn(async () => ({
      user: { id: userId, role: "TRAVELER" },
    })),
    database: {
      user: {
        findUnique: vi.fn(async () => ({
          id: userId,
          role: "TRAVELER" as const,
          status: "ACTIVE" as const,
        })),
      },
    },
  } as unknown as AuthorizationDependencies;
}

describe("assistant V2 SSE streaming & browser page session persistence", () => {
  it("streams step and delta events over SSE and resolves the final V2 reply", async () => {
    const sessionUuid = "11111111-1111-4111-8111-111111111111";
    const fakeReply = {
      runtimeVersion: "v2" as const,
      sessionId: sessionUuid,
      stateToken: "tok-1",
      mode: "PLANNING" as const,
      turn: {
        message: "Cao nguyên đá Đồng Văn là Công viên địa chất toàn cầu UNESCO.",
        responsePlan: {
          goal: "ANSWER_QA",
          qa: {
            answer: "Cao nguyên đá Đồng Văn là Công viên địa chất toàn cầu UNESCO.",
          },
        },
      },
    };

    const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", "https://kltn.test");
      const req = new Request("https://kltn.test/api/ai/planning", {
        method: "POST",
        headers,
        body: init?.body,
      });
      return planningResponse(req, {
        authorization: makeAuth("user-1"),
        v2: async () => fakeReply,
      });
    }) as typeof fetch;

    const steps: string[] = [];
    const deltas: string[] = [];

    const reply = await assistantV2Stream(
      { action: "ASSISTANT_V2", operation: "TURN", sessionId: sessionUuid, text: "Giới thiệu Đồng Văn" },
      "idem_key_12345678",
      {
        onStep: (label) => steps.push(label),
        onDelta: (chunk) => deltas.push(chunk),
      },
      { fetcher },
    );

    expect(reply.sessionId).toBe(sessionUuid);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(deltas.join("")).toBe("Cao nguyên đá Đồng Văn là Công viên địa chất toàn cầu UNESCO.");
  });

  it("retains and clears active page session and last saved conversation id per identity", () => {
    setStoredAssistantPageSession("USER:1", {
      sessionId: "sess-abc",
      stateToken: "secret-tok",
      messages: [],
      draft: "Hỏi tiếp",
      savedTripId: null,
      writeUnknown: false,
      updatedAt: 1000,
    });
    expect(getStoredAssistantPageSession("USER:1")?.sessionId).toBe("sess-abc");
    expect(getStoredAssistantPageSession("USER:2")).toBeNull();
    clearStoredAssistantPageSession("USER:1");
    expect(getStoredAssistantPageSession("USER:1")).toBeNull();

    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    setLastSavedConversationId("USER:1", "conv-99", store);
    expect(getLastSavedConversationId("USER:1", store)).toBe("conv-99");
    setLastSavedConversationId("USER:1", null, store);
    expect(getLastSavedConversationId("USER:1", store)).toBeNull();
  });
});
