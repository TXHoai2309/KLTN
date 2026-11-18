import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { tripsageChatResponse } from "./tripsage-chat-http";
import { createBoundedOpenAiFetch, resolveTripsageChatModel } from "./tripsage-chat-provider";

const ON = { TRIPSAGE_CHAT_ENABLED: "true" };
const SECRET = "sk-test-secret-key-do-not-leak";
let seq = 0;
function auth(identity: string | null = `chat-user-${++seq}`) {
  return { database: { user: { findUnique: async () => ({ id: identity, role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => (identity ? { user: { id: identity } } : null) } as unknown as AuthorizationDependencies;
}
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } };
function mockModel(text = "Xin chào, bạn muốn đi Hà Giang mấy ngày?") {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: text },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ],
      }),
    }),
  });
}
const userMessage = (text: string) => ({ id: "m1", role: "user", parts: [{ type: "text", text }] });
const req = (body: unknown, headers: Record<string, string> = {}) => new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const deps = (over: Record<string, unknown> = {}) => ({ authorization: auth(), model: async () => mockModel(), env: ON, admit: createPlanningAdmission(), ...over });

describe("Tripsage chat stream route", () => {
  it("is not found when the flag is off, before auth or provider work", async () => {
    const model = vi.fn(async () => mockModel());
    for (const env of [{}, { TRIPSAGE_CHAT_ENABLED: "false" }]) {
      const response = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), deps({ env, model }));
      expect(response.status).toBe(404);
    }
    expect(model).not.toHaveBeenCalled();
  });

  it("rejects Guests without reading the body or calling the provider", async () => {
    const model = vi.fn(async () => mockModel());
    const request = req({ messages: [userMessage("chào")] });
    const read = vi.spyOn(request, "body", "get");
    const response = await tripsageChatResponse(request, deps({ authorization: auth(null), model }));
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });

  it("keeps same-origin, JSON and body boundaries", async () => {
    const model = vi.fn(async () => mockModel());
    expect((await tripsageChatResponse(req({ messages: [userMessage("a")] }, { origin: "https://evil.test" }), deps({ model }))).status).toBe(403);
    expect((await tripsageChatResponse(req({ messages: [userMessage("a")] }, { "content-type": "text/plain" }), deps({ model }))).status).toBe(415);
    expect((await tripsageChatResponse(req({ messages: [] }), deps({ model }))).status).toBe(400);
    expect((await tripsageChatResponse(req({ messages: [userMessage("a".repeat(2001))] }), deps({ model }))).status).toBe(400);
    expect(model).not.toHaveBeenCalled();
  });

  it("streams Vietnamese progress and prose for a signed-in Traveler", async () => {
    const response = await tripsageChatResponse(req({ messages: [userMessage("Mình muốn đi Hà Giang")] }), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain('"type":"data-status"');
    expect(text).toContain("Đang đọc yêu cầu của bạn");
    expect(text).toContain("Đang soạn câu trả lời");
    expect(text).toContain("Hà Giang mấy ngày");
    expect(text).not.toContain("data-itinerary");
  });

  it("sends only text parts and a Vietnamese instruction to the model", async () => {
    const model = mockModel();
    const body = { messages: [{ id: "m", role: "user", parts: [{ type: "tool-hack", toolCallId: "x", input: {} }, { type: "text", text: "chào" }] }] };
    await (await tripsageChatResponse(req(body), deps({ model: async () => model }))).text();
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain("tiếng Việt");
    expect(prompt).not.toContain("tool-hack");
  });

  it("applies the planning admission: 429 after 8 requests per minute", async () => {
    const d = deps({ authorization: auth("same-user") });
    for (let i = 0; i < 8; i++) {
      const ok = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), d);
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const limited = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), d);
    expect(limited.status).toBe(429);
  });

  it("holds an admission slot while streaming: 429 on the 4th concurrent stream", async () => {
    const d = deps();
    const open: Response[] = [];
    for (let i = 0; i < 3; i++) {
      const stalled = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream({ start() { /* never ends */ } }) }) });
      open.push(await tripsageChatResponse(req({ messages: [userMessage("chào")] }), { ...d, authorization: auth(), model: async () => stalled }));
    }
    expect(open.map(r => r.status)).toEqual([200, 200, 200]);
    const fourth = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), { ...d, authorization: auth() });
    expect(fourth.status).toBe(429);
    await Promise.all(open.map(r => r.body?.cancel()));
  });

  it("maps a missing provider key to a Vietnamese 503 without secrets", async () => {
    const response = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), deps({ model: () => resolveTripsageChatModel({ apiKey: () => undefined }) }));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Dịch vụ AI");
  });

  it("never leaks provider failure details or the key in the stream", async () => {
    const failing = new MockLanguageModelV4({ doStream: async () => { throw new Error(`upstream rejected ${SECRET}`); } });
    const response = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), deps({ model: async () => failing }));
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("upstream rejected");
  });
});

describe("Tripsage OpenAI provider", () => {
  it("forces store:false, caps tokens, never redirects, and sends the key only upstream", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(`data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }));
    const model = await resolveTripsageChatModel({ apiKey: () => SECRET, model: "gpt-test", fetcher: fetcher as unknown as typeof fetch });
    const response = await tripsageChatResponse(req({ messages: [userMessage("chào")] }), deps({ model: async () => model }));
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    const [url, init] = fetcher.mock.calls[0]! as [unknown, RequestInit];
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
    const payload = JSON.parse(init.body as string);
    expect(payload.store).toBe(false);
    expect(payload.max_completion_tokens ?? payload.max_tokens).toBeLessThanOrEqual(8000);
    expect(init.redirect).toBe("error");
    expect(JSON.stringify(init.headers)).toContain(SECRET);
  });

  it("caps an oversized token request and errors on an oversized response", async () => {
    const big = new Uint8Array(600 * 1024);
    const inner = vi.fn(async () => new Response(big));
    const bounded = createBoundedOpenAiFetch(inner as unknown as typeof fetch);
    const response = await bounded("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ max_tokens: 99999 }) });
    expect(JSON.parse((inner.mock.calls[0] as unknown as [unknown, RequestInit])[1].body as string).max_tokens).toBe(8000);
    await expect(response.arrayBuffer()).rejects.toBeTruthy();
  });
});
