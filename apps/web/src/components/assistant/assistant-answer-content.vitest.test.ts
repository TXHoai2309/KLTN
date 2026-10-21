import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantAnswerContent } from "./assistant-answer-content";
import { assistantFollowupSuggestions } from "./assistant-followups";
import { AssistantAnswer } from "./assistant-chat";
import type { QaCompletedTurn } from "../../modules/ai/qa-contract";

const parts = [{ text: "Địa chất: Địa hình karst đá vôi hư cấu.", citationIds: ["c1"] }, { text: "Văn hóa: Truyền thống dân tộc và danh hiệu UNESCO hư cấu.", citationIds: ["c1"] }];
const turn: QaCompletedTurn = { conversationId: "conv", turnId: "turn", turnState: "COMPLETED", context: { type: "GENERAL" }, status: "ANSWERED", answerParts: parts, citations: [{ id: "c1", sourceId: "fixture", title: "Nguồn hư cấu", sourceUrl: null, locators: [] }], unansweredAspects: [] };
describe("verified answer presentation and follow-up projection", () => {
  it.each(["PARAGRAPHS", "LIST", "TABLE"] as const)("renders %s without inventing or dropping factual content", presentation => {
    const html = renderToStaticMarkup(createElement(AssistantAnswerContent, { parts, presentation, sources: () => createElement("span", null, "CITATION") }));
    for (const part of parts) expect(html.replace(/<[^>]+>/g, "")).toContain(part.text);
    expect(html.match(/CITATION/g)).toHaveLength(2);
    if (presentation === "LIST") expect(html).toContain("<li");
    if (presentation === "TABLE") { expect(html).toContain("<table"); expect(html.match(/scope="col"/g)).toHaveLength(2); expect(html).toContain('tabindex="0"'); }
    expect(html).toContain("<strong>Địa chất:</strong>");
  });
  it("escapes HTML and keeps untrusted Markdown/URLs as inert text", () => {
    const html = renderToStaticMarkup(createElement(AssistantAnswerContent, { parts: [{ text: '<img src=x onerror=alert(1)> [x](javascript:alert(1)) **literal**', citationIds: ["c1"] }], sources: () => null }));
    expect(html).not.toContain("<img"); expect(html).not.toContain("<a"); expect(html).toContain("&lt;img");
  });
  it("generates at most three relevant questions without factual premises", () => {
    const suggestions = assistantFollowupSuggestions("Giới thiệu về điểm đến", turn);
    expect(suggestions).toHaveLength(3); expect(new Set(suggestions).size).toBe(3);
    expect(suggestions.every(question => question.endsWith("?"))).toBe(true);
    expect(assistantFollowupSuggestions("Địa chất và văn hóa có gì?", turn)).toEqual(["Địa điểm này được UNESCO công nhận là gì?"]);
  });
  it("does not offer follow-ups for an unconfirmed or unsupported answer", () => {
    const missing: QaCompletedTurn = { ...turn, status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này." };
    expect(assistantFollowupSuggestions("Question", missing)).toEqual([]);
    expect(assistantFollowupSuggestions("Question", { ...turn, answerParts: [{ text: "Nội dung kiểm thử.", citationIds: ["c1"] }] })).toEqual([]);
  });
  it("distinguishes answer verification from an absence of retrieved sources without leaking internals", () => {
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: { ...turn, status: "INSUFFICIENT_SOURCE", reason: "ANSWER_VERIFICATION", message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.", answerParts: [], citations: [] } }));
    expect(html).toContain("đã tìm thấy tài liệu liên quan"); expect(html).toContain("chưa xác minh được câu trả lời"); expect(html).not.toContain("ANSWER_VERIFICATION"); expect(html).not.toContain("<details");
  });
  it("labels exact reviewed excerpts distinctly and keeps the source controls", () => {
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: { ...turn, answerMode: "SOURCE_EXCERPTS" } }));
    expect(html).toContain("trích nguyên văn từ tài liệu"); expect(html).toContain("<details");
    for (const part of parts) expect(html.replace(/<[^>]+>/g, "")).toContain(part.text);
  });

  it("keeps paragraph source mappings in one closed disclosure without changing factual text", () => {
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn }));
    expect(html.match(/class="assistant-answer-sources"/g)).toHaveLength(1);
    expect(html).toContain("Xem nguồn (1)");
    expect(html).not.toContain('class="assistant-answer-sources" open');
    expect(html.match(/aria-label="Nguồn tham khảo"/g)).toHaveLength(2);
    expect(html.indexOf('class="assistant-answer-sources"')).toBeGreaterThan(html.indexOf(parts[1]!.text.split(": ")[1]!));
  });

  it("does not confuse the place name Đồng Văn with a money amount", () => {
    expect(assistantFollowupSuggestions("Giới thiệu", { ...turn, answerParts: [{ text: "Đồng Văn có địa hình hư cấu.", citationIds: ["c1"] }] })).toEqual([]);
    expect(assistantFollowupSuggestions("Giới thiệu", { ...turn, answerParts: [{ text: "Giá hư cấu là 50.000 đồng.", citationIds: ["c1"] }] })).toEqual(["Ở đó có thu vé vào cửa chung không?"]);
  });
});
