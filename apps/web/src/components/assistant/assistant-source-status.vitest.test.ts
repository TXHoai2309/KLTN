import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantAnswer } from "./assistant-chat";
import { AssistantController, type AssistantAttempt } from "./assistant-controller";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, type QaCompletedTurn } from "../../modules/ai/qa-contract";
import { QA_CONVERSATION_MESSAGES } from "../../modules/ai/qa-conversation";

const turn: QaCompletedTurn = { conversationId: "conv", turnId: "turn", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: QA_INSUFFICIENT_SOURCE_MESSAGE };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
describe("US23 source status presentation and recovery", () => {
  it("renders social text without an insufficient-source notice or citation slot", () => {
    const social: QaCompletedTurn = { ...turn, status: "CONVERSATIONAL", message: QA_CONVERSATION_MESSAGES.greeting };
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: social, citationSlot: () => { throw new Error("no social citations"); } }));
    expect(html).toContain("Xin chào!");
    expect(html).not.toContain("Chưa đủ dữ liệu");
    expect(html).not.toContain("assistant-citation");
  });

  it("advances the completed conversation head after social replies", async () => {
    const calls: AssistantAttempt[] = [];
    const controller = new AssistantController({ send: async attempt => {
      calls.push(attempt);
      return { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: { ...turn, status: "CONVERSATIONAL", message: QA_CONVERSATION_MESSAGES.greeting } } };
    } }, "GUEST:fixture", () => `social_${calls.length}`);
    controller.setDraft("hi!"); controller.submit(); await tick();
    expect(controller.getSnapshot().turns[0]?.response.status).toBe("CONVERSATIONAL");
    controller.setDraft("Đồng Văn có gì?"); controller.submit(); await tick();
    expect(calls[1]?.payload).toMatchObject({ conversationId: "conv", parentTurnId: "turn" });
  });
  it("renders the required safe notice, adjustment guidance and no citation", () => {
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn }));
    expect(html).toContain("Chưa đủ dữ liệu được xác minh để trả lời chính xác câu hỏi này.");
    expect(html).toContain("điều chỉnh câu hỏi"); expect(html).not.toContain("<details"); expect(html).not.toContain("<a");
  });
  it("keeps supported partial facts and missing coverage visibly separate", () => {
    const partial: QaCompletedTurn = { ...turn, status: "PARTIAL", answerParts: [{ text: "Fictional supported fact.", citationIds: ["c1"] }], citations: [{ id: "c1", sourceId: "fixture", title: "Fictional source", sourceUrl: null, locators: [] }], unansweredAspects: ["Missing hours."] };
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: partial }));
    expect(html).toContain("chỉ những nội dung có nguồn hỗ trợ"); expect(html).toContain("Fictional supported fact."); expect(html).toContain("Phần chưa đủ dữ liệu"); expect(html).toContain("Missing hours.");
  });
  it("technical FAILED is retryable as a new intent; missing source is a completed follow-up head", async () => {
    const calls: AssistantAttempt[] = [];
    const controller = new AssistantController({ send: async attempt => {
      calls.push(attempt);
      return calls.length === 1 ? { kind: "response", httpStatus: 503, body: { success: false, operationStatus: "FAILED", error: { code: "AI_UNAVAILABLE", message: "Dịch vụ AI hiện không khả dụng." } } } : { kind: "response", httpStatus: 200, body: { success: true, operationStatus: "SUCCESS", data: turn } };
    } }, "GUEST:fixture", () => `key_${calls.length}`);
    controller.setDraft("Question"); controller.submit(); await tick();
    expect(controller.getSnapshot().pending?.phase).toBe("failed"); expect(controller.getSnapshot().turns).toEqual([]);
    expect(controller.getSnapshot().pending?.message).toContain("không khả dụng");
    controller.editFailed(); controller.submit(); await tick();
    expect(calls[1]!.key).not.toBe(calls[0]!.key); expect(controller.getSnapshot().pending).toBeNull();
    expect(controller.getSnapshot().turns[0]!.response.status).toBe("INSUFFICIENT_SOURCE");
    controller.setDraft("Adjusted question"); controller.submit();
    expect(calls[2]!.payload).toMatchObject({ conversationId: "conv", parentTurnId: "turn" });
  });
});
