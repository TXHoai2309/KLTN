import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readConversationState } from "./tripsage-conversation-state";
import { parseBlocks, TripsageMarkdown } from "./tripsage-markdown";
import { TripsageTimelineView } from "./tripsage-timeline-view";
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

  it("shows origin candidate buttons and quick replies only on the last assistant message, while carrying the signed token until confirmed", () => {
    const parts = [
      { type: "data-origin-candidates", data: { candidates: [{ candidateId: "oc-1-1", label: "Hà Nội (bến xe Mỹ Đình)" }], token: "v1.abc.sig" } },
      { type: "data-quick-replies", data: { replies: ["4 ngày 3 đêm"] } },
    ];
    const live = readConversationState([user("u1"), assistant("a1", parts)], isItinerary);
    expect(live.originCandidates).toEqual({ messageId: "a1", candidates: [{ candidateId: "oc-1-1", label: "Hà Nội (bến xe Mỹ Đình)" }] });
    expect(live.originCandidatesToken).toBe("v1.abc.sig");
    expect(live.quickReplies).toEqual({ messageId: "a1", replies: ["4 ngày 3 đêm"] });
    const answered = readConversationState([user("u1"), assistant("a1", parts), user("u2")], isItinerary);
    expect(answered.originCandidates).toBeNull();
    expect(answered.originCandidatesToken).toBe("v1.abc.sig");
    expect(answered.quickReplies).toBeNull();
    const confirmed = readConversationState([
      user("u1"),
      assistant("a1", parts),
      user("u2"),
      assistant("a2", [{ type: "data-journey", data: { journey: { origin: hubOrigin("HA_NOI"), departureMinute: 420, returnDeadlineMinute: 1080, returnDepartureMinute: null } } }]),
    ], isItinerary);
    expect(confirmed.journey?.origin?.confirmed).toBe(true);
    expect(confirmed.originCandidatesToken).toBeNull();
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

describe("timeline and suggestions in the client", () => {
  const timeline = { days: [{ day: 1, date: "2026-12-04", items: [
    { slotId: "d1-visit-1", kind: "VISIT", startMinute: 480, endMinute: 720, label: "Điểm a" },
    { slotId: "d1-lunch", kind: "LUNCH", startMinute: 720, endMinute: 780, label: "Nghỉ trưa 60 phút" },
    { slotId: "d1-overnight", kind: "OVERNIGHT", startMinute: 900, endMinute: null, label: "Nghỉ đêm khu vực Đồng Văn" },
  ] }] };
  const suggestion = { slotId: "d1-overnight", kind: "LODGING", title: "Homestay ấm cúng", place: { name: "Homestay Gần", distanceKm: 0.4 } };

  it("keeps suggestions for the newest itinerary only", () => {
    const first = [assistant("a1", [{ type: "data-itinerary", data: { ok: true } }, { type: "data-timeline", data: timeline }, { type: "data-suggestions", data: { suggestions: [suggestion] } }])];
    expect(readConversationState(first, isItinerary)).toMatchObject({ timeline, suggestions: [suggestion] });
    const replanned = [...first, user("u1"), assistant("a2", [{ type: "data-itinerary", data: { ok: true } }])];
    expect(readConversationState(replanned, isItinerary)).toMatchObject({ timeline: null, suggestions: [] });
  });

  it("renders planner times and labels suggestions as unchecked", () => {
    const html = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline: timeline as never, suggestions: [suggestion as never] }));
    expect(html).toContain("12:00–13:00");
    expect(html).toContain("Nghỉ đêm khu vực Đồng Văn");
    expect(html).toContain("Homestay ấm cúng");
    expect(html).toContain("cách khoảng 0.4 km");
    expect(html).toContain("chưa kiểm tra");
  });
});
