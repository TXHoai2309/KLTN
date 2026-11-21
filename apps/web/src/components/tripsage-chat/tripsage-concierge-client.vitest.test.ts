import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readConversationState } from "./tripsage-conversation-state";
import { parseBlocks, TripsageMarkdown } from "./tripsage-markdown";
import { hubOrigin, TRIP_HUBS } from "@/modules/tripsage-chat/trip-hubs";
import { missingJourneyFields } from "@/modules/trip-origin/trip-origin-contract";

const isItinerary = (data: unknown) => (data as { ok?: boolean } | null)?.ok === true;
const assistant = (id: string, parts: { type: string; data?: unknown }[]) => ({ id, role: "assistant", parts });
const user = (id: string) => ({ id, role: "user", parts: [{ type: "text", text: "..." }] });
const info = (tripInfo: object) => ({ type: "data-trip-info", data: { tripInfo } });

describe("readConversationState", () => {
  it("keeps the latest valid trip info and ignores invalid parts", () => {
    const state = readConversationState([
      assistant("a1", [info({ transport: "CAR" })]), user("u1"),
      assistant("a2", [info({ transport: "CAR", durationDays: 4 }), info({ transport: "PLANE" })]),
    ], isItinerary);
    expect(state.tripInfo).toEqual({ transport: "CAR", durationDays: 4 });
  });

  it("marks the itinerary stale after a plan-affecting change, and current again after a new itinerary (B.3)", () => {
    const base = [assistant("a1", [info({ transport: "CAR", durationDays: 4 }), { type: "data-itinerary", data: { ok: true } }]), user("u1")];
    expect(readConversationState(base, isItinerary)).toMatchObject({ lastItineraryMessageId: "a1", itineraryStale: false });
    const changed = [...base, assistant("a2", [info({ transport: "CAR", durationDays: 5 })])];
    expect(readConversationState(changed, isItinerary).itineraryStale).toBe(true);
    const minor = [...base, assistant("a2", [info({ transport: "CAR", durationDays: 4, travelers: 3 })])];
    expect(readConversationState(minor, isItinerary).itineraryStale).toBe(false);
    const replanned = [...changed, user("u2"), assistant("a3", [{ type: "data-itinerary", data: { ok: true } }])];
    expect(readConversationState(replanned, isItinerary)).toMatchObject({ lastItineraryMessageId: "a3", itineraryStale: false });
  });

  it("shows the origin card and quick replies only on the last assistant message", () => {
    const parts = [{ type: "data-origin-request", data: { departureMinute: 420, returnDeadlineMinute: 1080 } }, { type: "data-quick-replies", data: { replies: ["4 ngày 3 đêm"] } }];
    const live = readConversationState([user("u1"), assistant("a1", parts)], isItinerary);
    expect(live.originRequest).toEqual({ messageId: "a1", departureMinute: 420, returnDeadlineMinute: 1080 });
    expect(live.quickReplies).toEqual({ messageId: "a1", replies: ["4 ngày 3 đêm"] });
    const answered = readConversationState([user("u1"), assistant("a1", parts), user("u2")], isItinerary);
    expect(answered.originRequest).toBeNull();
    expect(answered.quickReplies).toBeNull();
    const invalid = readConversationState([assistant("a1", [{ type: "data-quick-replies", data: { replies: ["x".repeat(41)] } }])], isItinerary);
    expect(invalid.quickReplies).toBeNull();
  });
});

describe("TripsageMarkdown", () => {
  it("parses headings, lists, tables and paragraphs", () => {
    expect(parseBlocks("### Ngày 1\n- Lũng Cú\n- Đồng Văn\n\n1. Một\n2. Hai\n\n| Khoản | Tiền |\n|---|---|\n| Xăng | 300k |\n\nĐoạn văn\ndòng hai").map(block => block.kind))
      .toEqual(["h", "ul", "ol", "table", "p"]);
  });

  it("renders React elements only: raw HTML stays text, images and links keep only their text", () => {
    const html = renderToStaticMarkup(createElement(TripsageMarkdown, { text: "**Đậm** <script>alert(1)</script> ![ảnh](https://x.test/a.png) [link](javascript:alert(1)) `mã`" }));
    expect(html).toContain("<strong>Đậm</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/<img|<a |href=|javascript:/);
    expect(html).toContain("ảnh");
    expect(html).toContain("<code>mã</code>");
  });

  it("renders a table with header cells", () => {
    const html = renderToStaticMarkup(createElement(TripsageMarkdown, { text: "| Khoản | Tiền |\n|---|---|\n| Xăng | **300k** |" }));
    expect(html).toContain('<th scope="col">Khoản</th>');
    expect(html).toContain("<td><strong>300k</strong></td>");
  });
});

describe("trip hubs", () => {
  it("a hub click is a confirmed origin that satisfies the journey once clocks exist", () => {
    for (const hub of TRIP_HUBS) {
      const origin = hubOrigin(hub.id);
      expect(origin).toMatchObject({ label: hub.name, confirmed: true, source: "MANUAL" });
      expect(missingJourneyFields({ origin, departureMinute: 420, returnDeadlineMinute: 1080, returnDepartureMinute: null })).toEqual([]);
    }
  });
});
