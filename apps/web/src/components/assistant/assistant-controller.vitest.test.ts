import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { AssistantController, shouldSendOnEnter, type AssistantAttempt, type AssistantTransport, type AssistantTransportResult } from "./assistant-controller";
import { AssistantAnswer, AssistantChat, AssistantShell } from "./assistant-chat";
import { DemoAssistantTransport, DEMO_FIXTURE_MARKER, type DemoScenario } from "../../../development/assistant-demo-transport";
import { qaCompletedTurnSchema } from "../../modules/ai/qa-contract";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function harness() {
  const calls: AssistantAttempt[] = [];
  const resolves: ((result: AssistantTransportResult) => void)[] = [];
  const transport: AssistantTransport = { send: async (attempt) => {
    calls.push(attempt);
    return new Promise((resolve) => resolves.push(resolve));
  } };
  let key = 0;
  const controller = new AssistantController(transport, "actor_a", () => `key_${++key}`);
  return { controller, calls, resolves };
}
function completed(conversationId = "conv_fixture", turnId = "turn_fixture_1"): Extract<AssistantTransportResult, { kind: "response" }> {
  return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: {
    conversationId, turnId, turnState: "COMPLETED", context: { type: "GENERAL" }, status: "CLARIFICATION_REQUIRED",
    answerParts: [], citations: [], clarificationQuestion: "Bạn muốn kiểm thử nhánh nào?",
  } } };
}
const unknown: Extract<AssistantTransportResult, { kind: "response" }> = { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "UNKNOWN", retryWithSameKey: true, error: { code: "OPERATION_STATUS_UNKNOWN", message: "Fixture unknown" } } };

describe("Task 195 controller (no persistence or HTTP endpoint)", () => {
  it("normalizes first-turn request and keeps pending separate", () => {
    const h = harness(); h.controller.setDraft("  Ha\u0300 Giang  ");
    expect(h.controller.submit()).toBe(true);
    expect(JSON.parse(h.calls[0]!.body)).toEqual({ question: "Hà Giang", context: { type: "GENERAL" } });
    expect(h.controller.getSnapshot().turns).toHaveLength(0);
    expect(h.controller.getSnapshot().conversationId).toBeNull();
    expect(h.controller.getSnapshot().pending?.phase).toBe("sending");
  });
  it.each(["", " \n ", "a".repeat(2001), "😀".repeat(1001)])("rejects invalid draft without an attempt", (draft) => {
    const h = harness(); h.controller.setDraft(draft);
    expect(h.controller.submit()).toBe(false); expect(h.calls).toHaveLength(0);
    expect(h.controller.getSnapshot().validation).toBeTruthy();
  });
  it("accepts the UTF-16 boundary and blocks rapid submits", () => {
    const h = harness(); h.controller.setDraft("😀".repeat(1000));
    expect(h.controller.submit()).toBe(true); h.controller.setDraft("next");
    expect(h.controller.submit()).toBe(false); expect(h.controller.submit()).toBe(false);
    expect(h.calls).toHaveLength(1);
  });
  it("advances only a confirmed head and builds strict follow-up", async () => {
    const h = harness(); h.controller.setDraft("fixture"); h.controller.submit();
    h.resolves[0]!(completed()); await tick();
    expect(h.controller.getSnapshot().turns).toHaveLength(1);
    h.controller.setDraft("follow up"); h.controller.submit();
    expect(JSON.parse(h.calls[1]!.body)).toEqual({ question: "follow up", conversationId: "conv_fixture", parentTurnId: "turn_fixture_1" });
    expect(h.calls[0]!.key).not.toBe(h.calls[1]!.key);
  });
  it.each<DemoScenario>(["ANSWERED", "PARTIAL", "INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"])("%s is completed and advances head", async (scenario) => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.scenario = scenario;
    const controller = new AssistantController(transport, "fixture_actor", () => "fixture_key");
    controller.setDraft("Fixture question"); controller.submit(); await tick();
    const state = controller.getSnapshot();
    expect(state.turns[0]!.response.status).toBe(scenario);
    expect(state.parentTurnId).toBe(state.turns[0]!.response.turnId);
    expect(state.pending).toBeNull();
  });
  it.each<DemoScenario>(["UNKNOWN", "NETWORK", "MALFORMED"])("%s preserves exact retry snapshot despite edited draft", async (scenario) => {
    const fake = new DemoAssistantTransport(); fake.delayMs = 0; fake.scenario = scenario;
    const attempts: AssistantAttempt[] = [];
    const transport: AssistantTransport = { send: (attempt, signal) => { attempts.push(attempt); return fake.send(attempt, signal); } };
    const controller = new AssistantController(transport, "fixture_actor", () => "same_key");
    controller.setDraft("Original fixture"); controller.submit(); await tick();
    expect(controller.getSnapshot().pending?.phase).toBe(scenario === "MALFORMED" ? "malformed" : "unknown");
    expect(controller.getSnapshot().parentTurnId).toBeNull();
    controller.setDraft("Edited later"); expect(controller.submit()).toBe(false);
    expect(controller.retry()).toBe(true); expect(controller.retry()).toBe(false); await tick();
    expect(attempts[1]).toBe(attempts[0]);
    expect(attempts[1]!.body).toBe(attempts[0]!.body); expect(attempts[1]!.key).toBe(attempts[0]!.key);
    expect(controller.getSnapshot().turns).toHaveLength(1);
    expect(controller.getSnapshot().draft).toBe("Edited later");
  });
  it("keeps FAILED outside confirmed history and supports editing", async () => {
    const h = harness(); h.controller.setDraft("failed fixture"); h.controller.submit();
    h.resolves[0]!({ kind: "response", httpStatus: 503, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Fixture error" } } }); await tick();
    expect(h.controller.getSnapshot().pending?.phase).toBe("failed");
    expect(h.controller.getSnapshot().turns).toHaveLength(0);
    h.controller.editFailed(); expect(h.controller.getSnapshot().draft).toBe("failed fixture");
    h.controller.submit(); expect(h.calls[1]!.key).not.toBe(h.calls[0]!.key);
  });
  it("deduplicates replay by conversation and turn IDs", async () => {
    const h = harness(); h.controller.setDraft("identical fixture"); h.controller.submit();
    h.resolves[0]!(completed()); await tick();
    h.controller.setDraft("identical fixture"); h.controller.submit();
    h.resolves[1]!(completed()); await tick();
    expect(h.controller.getSnapshot().turns).toHaveLength(1);
  });
  it.each([
    { kind: "response", httpStatus: 200, body: { answerText: "must not render" } },
    { ...completed(), httpStatus: 202 },
    { kind: "response", httpStatus: 200, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "fixture" } } },
    { ...unknown, httpStatus: 200 },
  ] satisfies AssistantTransportResult[])("does not commit malformed/protocol-invalid responses", async (result) => {
    const h = harness(); h.controller.setDraft("fixture"); h.controller.submit(); h.resolves[0]!(result); await tick();
    expect(h.controller.getSnapshot().pending?.phase).toBe("malformed");
    expect(h.controller.getSnapshot().turns).toHaveLength(0);
  });
  it("rejects a mismatched conversation response", async () => {
    const h = harness(); h.controller.setDraft("fixture"); h.controller.submit(); h.resolves[0]!(completed()); await tick();
    h.controller.setDraft("next"); h.controller.submit(); h.resolves[1]!(completed("other_conv", "turn_2")); await tick();
    expect(h.controller.getSnapshot().parentTurnId).toBe("turn_fixture_1");
    expect(h.controller.getSnapshot().pending?.phase).toBe("malformed");
  });
  it("requires confirmation to abandon and isolates late responses", async () => {
    const h = harness(); h.controller.setDraft("old"); h.controller.submit(); h.resolves[0]!(unknown); await tick();
    expect(h.controller.newConversation()).toBe(false);
    h.controller.retry();
    expect(h.controller.newConversation(true)).toBe(true);
    h.controller.setDraft("new"); h.controller.submit();
    h.resolves[1]!(completed("old_conv")); await tick();
    expect(h.controller.getSnapshot().turns).toHaveLength(0);
    h.resolves[2]!(completed("new_conv", "new_turn")); await tick();
    expect(h.controller.getSnapshot().conversationId).toBe("new_conv");
  });
  it("clears state across identity changes and never retries as the new actor", async () => {
    const h = harness(); h.controller.setDraft("actor_a fixture"); h.controller.submit();
    h.controller.changeIdentity("actor_b"); h.resolves[0]!(completed()); await tick();
    expect(h.controller.getSnapshot().turns).toHaveLength(0); expect(h.controller.retry()).toBe(false);
    h.controller.setDraft("new actor"); h.controller.submit(); expect(h.calls[1]!.identity).toBe("actor_b");
  });
  it("allows completed reset and rejects all sends without transport", async () => {
    const h = harness(); h.controller.setDraft("completed fixture"); h.controller.submit();
    h.resolves[0]!(completed()); await tick();
    expect(h.controller.newConversation()).toBe(true);
    expect(h.controller.getSnapshot().turns).toHaveLength(0);
    expect(h.controller.getSnapshot().parentTurnId).toBeNull();
    expect(h.controller.getSnapshot().generation).toBe(1);
    h.controller.setDraft("fresh fixture"); h.controller.submit();
    expect(JSON.parse(h.calls[1]!.body)).toEqual({ question: "fresh fixture", context: { type: "GENERAL" } });
    const controller = new AssistantController(null, "unavailable", () => "unused");
    controller.setDraft("question"); expect(controller.submit()).toBe(false); expect(controller.retry()).toBe(false);
    expect(controller.newConversation()).toBe(true); expect(controller.getSnapshot().draft).toBe("");
  });
  it.each([
    ["Enter", false, false, undefined, true], ["Enter", true, false, undefined, false],
    ["Enter", false, true, undefined, false], ["Enter", false, false, 229, false], ["a", false, false, undefined, false],
  ])("keyboard policy %s", (key, shiftKey, isComposing, keyCode, sends) => {
    expect(shouldSendOnEnter({ key: key as string, shiftKey: shiftKey as boolean, isComposing: isComposing as boolean, keyCode: keyCode as number | undefined })).toBe(sends);
  });
});

describe("Task 195 renderer and production graph", () => {
  it("escapes AI text and preserves citation associations for the slot", () => {
    const turn = qaCompletedTurnSchema.parse({ conversationId: "conv_fixture", turnId: "turn_fixture", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "ANSWERED", unansweredAspects: [],
      answerParts: [{ text: "<script>alert(1)</script>", citationIds: ["c1"] }],
      citations: [{ id: "c1", sourceId: "fixture_source", title: "Fixture", sourceUrl: null, locators: [] }] });
    let ids: string[] = [];
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn, citationSlot: ({ part }) => { ids = part.citationIds; return "slot"; } }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(ids).toEqual(["c1"]);
  });
  it("renders unavailable composer and explicit confirmation copy", () => {
    const html = renderToStaticMarkup(createElement(AssistantShell, null, createElement(AssistantChat)));
    expect(html).toContain("Trợ lý AI chưa khả dụng"); expect(html).toContain("disabled");
    expect(html).toContain("không có nghĩa server đã hủy"); expect(html).toContain("không xóa dữ liệu server");
    expect(html).not.toContain("source_fixture_only");
  });
  it("bundles production page without any demo/fixtures/fake transport imports", async () => {
    const result = await build({ entryPoints: [fileURLToPath(new URL("../../app/assistant/page.tsx", import.meta.url))], bundle: true, write: false, outdir: "in-memory-check", metafile: true, jsx: "automatic", external: ["next"], logLevel: "silent" });
    expect(Object.keys(result.metafile!.inputs).some((path) => path.includes("development/") || path.includes(".vitest.test"))).toBe(false);
    expect(result.outputFiles.map((file) => file.text).join("\n")).not.toContain(DEMO_FIXTURE_MARKER);
    expect(result.outputFiles.map((file) => file.text).join("\n")).not.toContain("source_fixture_only");
  });
});
