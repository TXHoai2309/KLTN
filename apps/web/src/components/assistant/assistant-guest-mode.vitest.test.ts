import { describe, expect, it, vi } from "vitest";
import { AssistantController } from "./assistant-controller";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { submitGuestMessage } from "./assistant-guest-mode";

const GUEST = `GUEST:${"a".repeat(64)}`;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const answered = { success: true, operationStatus: "SUCCESS", data: {
  conversationId: "conv_1", turnId: "turn_1", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "CLARIFICATION_REQUIRED",
  answerParts: [], citations: [], clarificationQuestion: "Bạn muốn biết điểm nào?",
} };
/** Fake network boundary: every request that leaves the guest chat lands here. */
function harness() {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(answered));
  const retain = vi.fn();
  const controller = new AssistantController(new AssistantHttpTransport(fetcher), GUEST, () => "key_1");
  return { fetcher, retain, controller, submit: (text: string) => submitGuestMessage({ controller, text, context: { type: "GENERAL" }, retain }) };
}

describe("Guest mode in the V2 chat", () => {
  it("sends a guest question to the Q&A endpoint only and keeps the answer", async () => {
    const h = harness();
    expect(h.submit("Đồng Văn có gì đặc biệt?")).toBe("SENT");
    await tick(); await tick();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(h.fetcher.mock.calls[0]![0]).toBe("/api/ai/ask");
    expect(h.fetcher.mock.calls[0]![1]).toMatchObject({ credentials: "same-origin" });
    expect(JSON.parse(String(h.fetcher.mock.calls[0]![1]!.body))).toEqual({ question: "Đồng Văn có gì đặc biệt?", context: { type: "GENERAL" } });
    expect(h.controller.getSnapshot().turns).toHaveLength(1);
  });

  it("answers a planning request with a sign-in invitation, sends nothing and keeps the text", async () => {
    const h = harness();
    const text = "Giúp tôi lên lịch trình 3 ngày ở Hà Giang";
    expect(h.submit(text)).toBe("SIGN_IN");
    await tick();
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.retain).toHaveBeenCalledWith(text, { type: "GENERAL" });
    expect(h.controller.getSnapshot().pending).toBeNull();
  });

  it.each([
    "Lịch sử Đồng Văn như thế nào?",
    "Giá vé tham quan Dinh thự họ Vương là bao nhiêu, nếu tôi muốn lên kế hoạch đi sau?",
    "Chuyến đi đèo Mã Pí Lèng có gì đáng xem?",
  ])("still answers a factual question that mentions a plan: %s", async text => {
    const h = harness();
    expect(h.submit(text)).toBe("SENT");
    await tick();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(h.retain).not.toHaveBeenCalled();
  });
});

describe("V2 chat surface by principal", () => {
  async function renderChat(identity: string) {
    const { build } = await import("esbuild");
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-v2-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*", "next/*"], loader: { ".css": "local-css" }, outdir: "out", logLevel: "silent" });
    const module = { exports: {} as { AssistantV2Chat: (props: Record<string, unknown>) => unknown } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    return renderToStaticMarkup(createElement(module.exports.AssistantV2Chat as never, { identity, available: true }));
  }
  it("renders Guest mode for a guest without any network call", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    try {
      const markup = await renderChat(GUEST);
      expect(markup).toContain('data-mode="guest"');
      expect(markup).toContain("Hỏi về văn hóa, lịch sử");
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps the signed-in V2 flow for a traveler", async () => {
    const markup = await renderChat("USER:abc");
    expect(markup).toContain('data-runtime="v2"');
    expect(markup).not.toContain('data-mode="guest"');
  });
});
