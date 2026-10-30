import { describe, expect, it, vi } from "vitest";
import { AssistantController } from "./assistant-controller";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { assistantRuntimeChatKey } from "./assistant-runtime-chat-key";

describe("Assistant runtime bootstrap identity boundary", () => {
  it("dispatches ask after bootstrap with the browser fetch receiver", async () => {
    const boundary = "USER:user_fixture";
    const fetcher = vi.fn<typeof fetch>(function (this: unknown, input) {
      // Browser native fetch rejects a class instance as its receiver.
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      if (input === "/api/ai/session") return Promise.resolve(Response.json({ data: { identity: boundary } }));
      return Promise.resolve(Response.json({ success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Fixture only" } }, { status: 503 }));
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const transport = new AssistantHttpTransport();
      const bootstrap = new AssistantController(null, boundary, () => "key_fixture");
      bootstrap.setDraft("fixture question");
      expect(bootstrap.submit()).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      const sessionResponse = await fetch("/api/ai/session", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const session = await sessionResponse.json() as { data: { identity: string } };
      expect(sessionResponse.status).toBe(200);
      expect(session.data.identity).toBe(boundary);
      expect(assistantRuntimeChatKey(boundary, null)).not.toBe(assistantRuntimeChatKey(boundary, session.data.identity));
      const ready = new AssistantController(transport, session.data.identity, () => "key_fixture");
      ready.setDraft("fixture question");
      expect(ready.submit()).toBe(true);
      await vi.waitFor(() => expect(ready.getSnapshot().pending?.phase).not.toBe("sending"));
      expect(fetcher).toHaveBeenCalledWith("/api/ai/ask", expect.objectContaining({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": "key_fixture" }, body: '{"question":"fixture question","context":{"type":"GENERAL"},"knowledgeMode":"SOURCE_ONLY"}' }));
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/ai/session", "/api/ai/ask"]);
      expect(fetcher.mock.contexts[1] === undefined || fetcher.mock.contexts[1] === globalThis).toBe(true);
      expect(ready.getSnapshot().pending?.phase).toBe("failed");
    } finally { vi.unstubAllGlobals(); }
  });
  it("replaces the transportless controller when authenticated bootstrap completes", () => {
    const boundary = "USER:user_fixture";
    const bootstrapKey = assistantRuntimeChatKey(boundary, null);
    const readyKey = assistantRuntimeChatKey(boundary, boundary);
    const transportless = new AssistantController(null, boundary, () => "unused");
    transportless.setDraft("fixture question");

    expect(transportless.submit()).toBe(false);
    expect(bootstrapKey).not.toBe(readyKey);
  });
});
