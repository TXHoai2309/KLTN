import { describe, expect, it, vi } from "vitest";
import { AssistantController } from "./assistant-controller";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { openSavedConversation, savedConversationIdFromSearch } from "./assistant-saved-conversation";
import type { ConversationDetailResult } from "./assistant-conversation-client";

const GUEST = `GUEST:${"a".repeat(64)}`;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const response = (turnId: string) => ({
  conversationId: "conv_9", turnId, turnState: "COMPLETED", context: { type: "GENERAL" }, status: "CLARIFICATION_REQUIRED",
  answerParts: [], citations: [], clarificationQuestion: "Bạn muốn biết điểm nào?", knowledgeMode: "SOURCE_ONLY",
});
const detail = (): ConversationDetailResult => ({
  conversation: { id: "conv_9", headTurnId: "turn_2", context: { type: "GENERAL" }, knowledgeMode: "SOURCE_ONLY" } as never,
  turns: [{ question: "Đồng Văn có gì?", response: response("turn_1") as never }, { question: "Còn Lũng Cú?", response: response("turn_2") as never }],
});

describe("saved-conversation links", () => {
  it("reads the conversation id from the page query and ignores anything else", () => {
    expect(savedConversationIdFromSearch("?conversationId=conv_9&x=1")).toBe("conv_9");
    expect(savedConversationIdFromSearch("?destinationId=d1")).toBeNull();
    expect(savedConversationIdFromSearch("?conversationId=")).toBeNull();
  });
  it("reports a missing or foreign conversation as not found and changes nothing", async () => {
    const controller = new AssistantController(null, GUEST, () => "key_1");
    expect(await openSavedConversation(controller, "other", async () => { throw new Error("404"); })).toBe("NOT_FOUND");
    expect(controller.getSnapshot().conversationId).toBeNull();
  });
});

describe("V2 chat surface for a saved-conversation link", () => {
  async function renderChat(props: Record<string, unknown>) {
    const { build } = await import("esbuild");
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const bundle = await build({ entryPoints: [fileURLToPath(new URL("./assistant-v2-chat.tsx", import.meta.url))], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", external: ["react", "react/*", "next/*"], loader: { ".css": "local-css" }, outdir: "out", logLevel: "silent" });
    const module = { exports: {} as { AssistantV2Chat: unknown } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), module, module.exports);
    return renderToStaticMarkup(createElement(module.exports.AssistantV2Chat as never, { available: true, ...props }));
  }
  it.each([["a guest", GUEST], ["a signed-in user", "USER:abc"]])("opens the saved conversation in the V2 Q&A chat for %s", async (_name, identity) => {
    const markup = await renderChat({ identity, conversationId: "conv_9" });
    expect(markup).toContain('data-runtime="v2"');
    expect(markup).toContain("Đang mở cuộc trò chuyện");
    expect(markup).toContain(identity === GUEST ? 'data-mode="guest"' : 'data-mode="saved"');
  });
});

describe("opening a saved conversation in the V2 chat", () => {
  it("shows the stored history and lets the user keep asking in the same conversation", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, operationStatus: "SUCCESS", data: response("turn_3") }));
    const controller = new AssistantController(new AssistantHttpTransport(fetcher), GUEST, () => "key_1");
    expect(await openSavedConversation(controller, "conv_9", async () => detail())).toBe("LOADED");
    expect(controller.getSnapshot().turns.map(turn => turn.question)).toEqual(["Đồng Văn có gì?", "Còn Lũng Cú?"]);
    controller.setDraft("Giá vé bao nhiêu?");
    expect(controller.submit()).toBe(true);
    await tick();
    expect(fetcher.mock.calls[0]![0]).toBe("/api/ai/ask");
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({ question: "Giá vé bao nhiêu?", conversationId: "conv_9", parentTurnId: "turn_2" });
  });
});
