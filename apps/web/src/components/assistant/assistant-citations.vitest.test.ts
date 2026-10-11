import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantAnswer } from "./assistant-chat";
import { buildCitationIndex, citationSourceHref, isReadingCitation } from "./assistant-citation-utils";
import { citationFixture } from "../../../development/assistant-citation-fixtures";
import { DemoAssistantTransport } from "../../../development/assistant-demo-transport";
import { AssistantController } from "./assistant-controller";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, qaCompletedTurnSchema } from "../../modules/ai/qa-contract";

const render = (turn = citationFixture("MULTI")) => renderToStaticMarkup(createElement(AssistantAnswer, { turn }));
describe("Task 196 citation presentation", () => {
  it("numbers first occurrence across parts regardless of citation array order, without merging sources", () => {
    const turn = citationFixture("MULTI");
    const index = buildCitationIndex(turn)!;
    expect([...index.keys()]).toEqual(["fixture_c1", "fixture_c2", "fixture_c3"]);
    expect([...index.values()].map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(index.get("fixture_c1")!.citation.sourceId).toBe(index.get("fixture_c2")!.citation.sourceId);
    expect(render(turn).match(/\[1\] Nguồn tham khảo/g)).toHaveLength(2);
    turn.answerParts[0]!.citationIds.reverse();
    expect(buildCitationIndex(turn)!.get("fixture_c3")!.number).toBe(1);
    expect(buildCitationIndex(citationFixture("ONE"))!.get("fixture_c1")!.number).toBe(1);
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
  it.each([null, "javascript:alert(1)", "data:text/html,hi", "file:///secret", "https://user:pass@example.com/", "https://example.com/\n", "bad-url"])("never renders unsafe/null URL %s as an anchor", (url) => {
    const turn = citationFixture("ONE"); turn.citations[0]!.sourceUrl = url;
    expect(citationSourceHref(url)).toBeNull();
    expect(render(turn)).not.toContain("<a ");
    expect(render(turn)).toContain(turn.citations[0]!.title);
  });
  it("puts safe links outside summary and exposes title/locators without private aliases", () => {
    const html = render();
    expect(html).toContain('href="https://example.com/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Trang 3"); expect(html).toContain("Mục “Mục mô phỏng”"); expect(html).toContain("Trang 7");
    expect(html).toContain("Không có vị trí cụ thể");
    for (const summary of html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)) {
      expect(summary[1]).not.toMatch(/<(a|button|input)\b/);
      expect(summary[0]).toContain("aria-label=");
    }
    expect(html).not.toContain("source_fixture_only"); expect(html).not.toContain("fixture_c1");
    expect(html.match(/<details/g)).toHaveLength(5);
    expect(html).not.toContain(" open=");
  });
  it("escapes metadata and preserves long titles and large collections", () => {
    const turn = citationFixture("ONE");
    turn.citations[0]!.title = '<img src=x onerror="alert(1)">';
    turn.citations[0]!.locators = [{ section: "<script>bad()</script>" }];
    expect(render(turn)).not.toContain("<img"); expect(render(turn)).not.toContain("<script>");
    expect(render(turn)).toContain("&lt;img");
    expect(render(citationFixture("LONG"))).toContain(citationFixture("LONG").citations[0]!.title);
    expect(render(citationFixture("MANY")).match(/<details/g)).toHaveLength(52);
  });
  it("keeps custom slot association and null fallback compatible", () => {
    const turn = citationFixture("ONE");
    const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn, citationSlot: ({ part, citations, turn: received }) => {
      expect(received).toBe(turn); expect(part.citationIds).toEqual(["fixture_c1"]); expect(citations).toBe(turn.citations); return "CUSTOM_SLOT";
    } }));
    expect(html).toContain("CUSTOM_SLOT"); expect(html).not.toContain("<details");
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
});
