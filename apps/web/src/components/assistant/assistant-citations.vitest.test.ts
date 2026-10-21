import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantAnswer, AssistantTurn } from "./assistant-chat";
import { buildCitationIndex, citationSourceHref, isReadingCitation } from "./assistant-citation-utils";
import { citationFixture } from "../../../development/assistant-citation-fixtures";
import { DemoAssistantTransport } from "../../../development/assistant-demo-transport";
import { AssistantController } from "./assistant-controller";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaCompletedTurnSchema } from "../../modules/ai/qa-contract";

const render = (turn = citationFixture("MULTI"), showSources = true) => renderToStaticMarkup(createElement(AssistantAnswer, { turn, showSources }));
describe("Task 196 citation presentation", () => {
  it("numbers first occurrence across parts regardless of citation array order, without merging sources", () => {
    const turn = citationFixture("MULTI");
    turn.citations.find(c=>c.id==="fixture_c1")!.sourceUrl="https://one.example/source";
    turn.citations.find(c=>c.id==="fixture_c3")!.sourceUrl="https://three.example/source";
    const index = buildCitationIndex(turn)!;
    expect([...index.keys()]).toEqual(["fixture_c1", "fixture_c2", "fixture_c3"]);
    expect([...index.values()].map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(index.get("fixture_c1")!.citation.sourceId).toBe(index.get("fixture_c2")!.citation.sourceId);
    expect(render(turn).match(/>\[1\]<\/a>/g)).toHaveLength(2);
    turn.answerParts[0]!.citationIds.reverse();
    expect(buildCitationIndex(turn)!.get("fixture_c3")!.number).toBe(1);
    const one=citationFixture("ONE");one.citations[0]!.sourceUrl="https://one.example/source";
    expect(buildCitationIndex(one)!.get("fixture_c1")!.number).toBe(1);
  });
  it.each(["missing", "duplicate", "unused", "duplicate-part"])("fails closed for %s references without resolving another turn", (kind) => {
    const turn = citationFixture("ONE");
    if (kind === "missing") turn.answerParts[0]!.citationIds = ["other_turn_id"];
    if (kind === "duplicate") turn.citations.push({ ...turn.citations[0]! });
    if (kind === "unused") turn.citations.push({ ...turn.citations[0]!, id: "unused" });
    if (kind === "duplicate-part") turn.answerParts[0]!.citationIds.push("fixture_c1");
    expect(buildCitationIndex(turn)).toBeNull();
    expect(render(turn)).not.toContain("<details");
    expect(render(turn)).toContain("Thông tin nguồn không khả dụng");
  });
  it.each([null, "javascript:alert(1)", "data:text/html,hi", "file:///secret", "https://user:pass@example.com/", "https://example.com/\n", "bad-url"])("hides citations without a safe public URL: %s", (url) => {
    const turn = citationFixture("ONE"); turn.citations[0]!.sourceUrl = url;
    expect(citationSourceHref(url)).toBeNull();
    expect(render(turn)).not.toContain('target="_blank"');
    expect(render(turn)).not.toContain('class="assistant-citation-ref"');
    expect(render(turn)).not.toContain('class="assistant-answer-sources"');
    expect(render(turn)).not.toContain(turn.citations[0]!.title);
    expect(render(turn)).not.toContain("Tài liệu đã tải lên");
    expect(render(turn)).not.toContain("Vị trí trong tài liệu RAG");
  });
  it("shows external sources and hides uploaded-file locations", () => {
    const html = render();
    expect(html).toContain('href="https://example.com/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("example.com");
    expect(html).not.toContain("Trang 3"); expect(html).not.toContain("Mục mô phỏng"); expect(html).not.toContain("Trang 7");
    expect(html).not.toContain("Tài liệu đã tải lên"); expect(html).not.toContain("Vị trí trong tài liệu RAG");
    for (const summary of html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)) {
      expect(summary[1]).not.toMatch(/<(a|button|input)\b/);
      expect(summary[0]).toContain("aria-label=");
    }
    expect(html).not.toContain("source_fixture_only"); expect(html).not.toContain("fixture_c1");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toContain(" open=");
  });
  it("omits citations without URLs and numbers only the visible external sources", () => {
    const turn=citationFixture("MULTI");
    const hidden=turn.citations.find(c=>c.id==="fixture_c1")!;
    const secondLink=turn.citations.find(c=>c.id==="fixture_c3")!;
    secondLink.sourceUrl="https://example.org/article";
    const index=buildCitationIndex(turn)!;
    const html=render(turn);
    expect(index.has(hidden.id)).toBe(false);
    expect(index.get("fixture_c2")!.number).toBe(1);
    expect(index.get(secondLink.id)!.number).toBe(2);
    expect(html).toContain('href="https://example.org/article"');
    expect(html).not.toContain(hidden.title);
    expect(html).not.toContain("Tài liệu đã tải lên");
    expect(html).not.toContain("Vị trí trong tài liệu RAG");
  });
  it("escapes metadata and preserves long titles and large collections", () => {
    const turn = citationFixture("ONE");
    turn.citations[0]!.sourceUrl="https://example.com/";
    turn.citations[0]!.title = '<img src=x onerror="alert(1)">';
    turn.citations[0]!.locators = [{ section: "<script>bad()</script>" }];
    expect(render(turn)).not.toContain("<img"); expect(render(turn)).not.toContain("<script>");
    expect(render(turn)).toContain("&lt;img");
    const long=citationFixture("LONG");long.citations.find(c=>c.id==="fixture_c1")!.sourceUrl="https://example.com/long";
    expect(render(long)).toContain(long.citations.find(c=>c.id==="fixture_c1")!.title);
    const many=citationFixture("MANY");many.citations.forEach((citation,index)=>{citation.sourceUrl=`https://example.com/source-${index+1}`;});
    const manyHtml=render(many);
    expect(manyHtml.match(/class="assistant-source-number"/g)).toHaveLength(50);
    expect(manyHtml.match(/<details/g)).toHaveLength(1);
  });
  it("keeps custom slot association and null fallback compatible when a public source exists", () => {
    const turn = citationFixture("ONE");
    turn.citations[0]!.sourceUrl="https://example.com/";
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn, citationSlot: ({ part, citations, turn: received }) => {
      expect(received).toBe(turn); expect(part.citationIds).toEqual(["fixture_c1"]); expect(citations).toBe(turn.citations); return "CUSTOM_SLOT";
    } }));
    expect(html).toContain("CUSTOM_SLOT"); expect(html.match(/<details/g)).toHaveLength(1); // Shared closed panel wraps a custom source slot too.
    expect(renderToStaticMarkup(createElement(AssistantAnswer, { turn, citationSlot: () => null }))).toContain("<details");
  });
  it("renders partial sources separately and gives no sources to insufficient/clarification", () => {
    const turn = citationFixture("ONE");
    const partial = qaCompletedTurnSchema.parse({ ...turn, status: "PARTIAL", unansweredAspects: ["Chưa có dữ liệu"] });
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: partial }));
    expect(html.split('class="assistant-unanswered"')[1]).not.toContain("<details");
    for (const status of ["INSUFFICIENT_SOURCE", "CLARIFICATION_REQUIRED"]) {
      const { unansweredAspects: _unanswered, ...identityAndContent } = turn;
      const data = qaCompletedTurnSchema.parse({ ...identityAndContent, status, answerParts: [], citations: [],
        ...(status === "INSUFFICIENT_SOURCE" ? { message: QA_INSUFFICIENT_SOURCE_MESSAGE } : { clarificationQuestion: "Bạn muốn thử gì?" }) });
      expect(renderToStaticMarkup(createElement(AssistantAnswer, { turn: data }))).not.toContain("<details");
    }
  });
  it.each(["ONE", "MULTI", "LONG", "MANY"] as const)("fixture %s obeys the real contract", (kind) => {
    expect(qaCompletedTurnSchema.safeParse(citationFixture(kind)).success).toBe(true);
  });
  it("preserves completed sources and exact intent through UNKNOWN replay after fixture controls change", async () => {
    const transport = new DemoAssistantTransport(); transport.delayMs = 0; transport.scenario = "UNKNOWN"; transport.citationScenario = "MULTI";
    const controller = new AssistantController(transport, "fixture", () => "fixture_key");
    controller.setDraft("Mô phỏng"); controller.submit(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.getSnapshot().turns).toHaveLength(0);
    transport.citationScenario = "ONE"; transport.scenario = "ANSWERED";
    controller.retry(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.getSnapshot().turns[0]!.response.citations).toHaveLength(3);
  });
  it("blocks following the tail for an open source or focused source, not for unrelated focus", () => {
    const viewport = (open: boolean, inside: boolean, citationFocus: boolean) => ({
      querySelector: () => open ? {} : null,
      contains: () => inside,
      ownerDocument: { activeElement: { closest: () => citationFocus ? {} : null } },
    }) as unknown as HTMLElement;
    expect(isReadingCitation(viewport(true, false, false))).toBe(true);
    expect(isReadingCitation(viewport(false, true, true))).toBe(true);
    expect(isReadingCitation(viewport(false, true, false))).toBe(false);
    expect(isReadingCitation(viewport(false, false, true))).toBe(false);
  });
  it("hides citations and source accordion by default on UI (ASSISTANT-01)", () => {
    const turn = citationFixture("MULTI");
    const turnHtml = renderToStaticMarkup(createElement(AssistantTurn, { turn: { question: "Hỏi", response: turn } }));
    expect(turnHtml).not.toContain("<details");
    expect(turnHtml).not.toContain("Xem nguồn");
    expect(turnHtml).not.toContain("assistant-citation-ref");
    expect(turnHtml).not.toContain("Thông tin nguồn không khả dụng");

    const answerHtml = renderToStaticMarkup(createElement(AssistantAnswer, { turn, showSources: false }));
    expect(answerHtml).not.toContain("<details");
    expect(answerHtml).not.toContain("Xem nguồn");
    expect(answerHtml).not.toContain("assistant-citation-ref");
  });
});
