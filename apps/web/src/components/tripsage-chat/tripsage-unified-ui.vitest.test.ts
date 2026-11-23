import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scheduleSelection } from "@/modules/assistant-planning/planning-engine";
import { COMPLETE_JOURNEY_FIXTURE } from "@/modules/trip-origin/trip-origin-fixtures";
import { tripRequirementInputSchema } from "@/modules/trip-requirement/trip-requirement-contract";
import { fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { mergeUnifiedConversations, storedMessagesToUiMessages } from "./assistant-unified-history";
import { readConversationState } from "./tripsage-conversation-state";
import { parseItineraryPart, TripsageItineraryView } from "./tripsage-itinerary-view";

const WEB_ROOT = resolve(__dirname, "../../..");

async function sampleProposal() {
  const requirement = tripRequirementInputSchema.parse({
    startDate: "2026-12-04",
    durationDays: 1,
    transport: "CAR",
    interests: ["NATURE"],
    journey: COMPLETE_JOURNEY_FIXTURE,
  });
  const needs = { requirement, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} };
  return scheduleSelection(needs, { days: [["a", "b"]] }, [planningCandidate("a", 120), planningCandidate("b", 120)], {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }),
  }, planningNow);
}

describe("collapsed itinerary map (ticket 04 / Q30)", () => {
  it("starts closed with the toggle button and does not mount ItineraryMap until opened", async () => {
    const proposal = await sampleProposal();
    const html = renderToStaticMarkup(createElement(TripsageItineraryView, { proposal }));
    expect(html).toContain("Xem bản đồ lộ trình");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("planner-map-panel");
    expect(html).not.toContain("Đang mở bản đồ");
  });
});

describe("unified sidebar history and saved-card restoration (ticket 04)", () => {
  it("merges new assistant and legacy Q&A/V2 conversations newest-first", () => {
    const merged = mergeUnifiedConversations(
      [
        { id: "new-1", title: "Lịch Hà Giang 4 ngày", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z" },
      ],
      [
        { id: "old-1", title: "Hỏi về Cột cờ Lũng Cú", context: { type: "GENERAL" }, createdAt: "2026-11-21T07:00:00.000Z", lastActivityAt: "2026-11-21T09:00:00.000Z" },
        { id: "old-2", title: "Hội thoại mới nhất", context: { type: "GENERAL" }, createdAt: "2026-11-21T10:30:00.000Z", lastActivityAt: "2026-11-21T11:00:00.000Z" },
      ],
    );
    expect(merged.map(item => [item.id, item.source])).toEqual([
      ["old-2", "LEGACY"],
      ["new-1", "ASSISTANT"],
      ["old-1", "LEGACY"],
    ]);
  });

  it("restores saved itinerary, timeline, suggestions, cost, access leg, trip info and journey from stored messages", async () => {
    const proposal = await sampleProposal();
    const uiMessages = storedMessagesToUiMessages([
      { id: "m1", role: "user", parts: [{ type: "text", text: "Lên lịch Hà Giang" }], createdAt: "2026-11-21T10:00:00.000Z" },
      {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "text", text: "Đây là lịch trình của bạn." },
          { type: "data-trip-info", id: "trip-info", data: { tripInfo: { transport: "CAR", durationDays: 1, startDate: "2026-12-04" } } },
          { type: "data-itinerary", id: "itinerary", data: proposal },
          { type: "data-timeline", id: "timeline", data: { days: [{ day: 1, date: "2026-12-04", items: [{ slotId: "d1-visit-1", kind: "VISIT", startMinute: 480, endMinute: 600, label: "Điểm a" }] }] } },
          { type: "data-suggestions", id: "suggestions-1", data: { suggestions: [{ slotId: "d1-visit-1", kind: "TIP", title: "Mang áo khoác" }] } },
          { type: "data-cost", id: "cost", data: { currency: "VND", travelers: 2, days: 1, total: 500_000, perPersonPerDay: 250_000, budgetCap: null, withinCap: null, overBy: null, assumptions: ["Ước tính tham khảo"], priceReferenceDate: "2026-11-21", lines: [{ category: "food", label: "Ăn uống", amount: 500_000 }] } },
          { type: "data-sources", id: "sources", data: { sources: [{ kind: "DOCUMENT", title: "Cẩm nang Hà Giang" }] } },
        ],
        createdAt: "2026-11-21T10:00:05.000Z",
      },
    ]);
    const state = readConversationState(uiMessages, data => parseItineraryPart(data) !== null);
    expect(state.lastItineraryMessageId).toBe("m2");
    expect(state.tripInfo).toMatchObject({ transport: "CAR", durationDays: 1 });
    expect(state.journey?.origin?.confirmed).toBe(true);
    expect(state.timeline?.days).toHaveLength(1);
    expect(state.suggestions).toHaveLength(1);
    expect(state.cost?.data.total).toBe(500_000);
  });

  it("renders header overflow menu trigger without footer delete-all button when onDeleteAll is provided (A1)", () => {
    const html = renderToStaticMarkup(createElement(AssistantSidebar, {
      conversations: [{ id: "new-1", title: "Lịch Hà Giang", context: { type: "GENERAL" }, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }],
      activeConversationId: "new-1",
      loading: false,
      loadingMore: false,
      hasMore: false,
      isOpen: true,
      onClose: () => {},
      onNewChat: () => {},
      onSelectConversation: () => {},
      onRenameConversation: async () => false,
      onDeleteConversation: async () => true,
      onDeleteAll: async () => true,
      canRename: () => false,
      onLoadMore: () => {},
      searchQuery: "",
      onSearchChange: () => {},
    }));
    expect(html).toContain("Tùy chọn lịch sử");
    expect(html).not.toContain("assistant-sidebar-footer");
    expect(html).not.toContain("Xóa tất cả");
  });
});

describe("single assistant routing and mode-tab removal (ticket 04)", () => {
  it("removes AssistantModeTabs and the ?mode=plan rewrite, and redirects /assistant/plan and ?mode=plan to /assistant", () => {
    expect(existsSync(resolve(WEB_ROOT, "src/components/tripsage-chat/assistant-mode-tabs.tsx"))).toBe(false);
    const nextConfig = readFileSync(resolve(WEB_ROOT, "next.config.ts"), "utf8");
    expect(nextConfig).not.toContain('destination: "/assistant/plan"');
    const planPage = readFileSync(resolve(WEB_ROOT, "src/app/assistant/plan/page.tsx"), "utf8");
    expect(planPage).toContain('redirect("/assistant"');
    const contextPage = readFileSync(resolve(WEB_ROOT, "src/app/assistant/assistant-context-page.ts"), "utf8");
    expect(contextPage).toContain('mode === "plan"');
    const runtimeChat = readFileSync(resolve(WEB_ROOT, "src/components/assistant/assistant-runtime-chat.tsx"), "utf8");
    expect(runtimeChat).toContain('identity.startsWith("USER:") && tripsageChatEnabled');
  });

  it("A5: renders frameless thinking indicator with 6px --tv-accent dots on the left, 13px/400 --tv-ink-2 text, --tv-* tokens only, and aria-live='polite'", () => {
    const css = readFileSync(resolve(WEB_ROOT, "src/components/assistant/assistant.css"), "utf8");
    expect(css).toMatch(/\.tripsage-thinking\s*\{[^}]*background:\s*transparent[^}]*border:\s*0[^}]*color:\s*var\(--tv-ink-2\)[^}]*font-size:\s*13px[^}]*font-weight:\s*400/);
    expect(css).toMatch(/\.tripsage-thinking\s*\{[^}]*align-self:\s*flex-start[^}]*width:\s*fit-content/);
    expect(css).toMatch(/\.tripsage-thinking-dots\s+i\s*\{[^}]*width:\s*6px[^}]*height:\s*6px[^}]*background:\s*var\(--tv-accent\)/);
    expect(css).not.toMatch(/\.tripsage-thinking[^{]*\{[^}]*--assistant-/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.tripsage-thinking-dots\s+i/);

    const clientSource = readFileSync(resolve(WEB_ROOT, "src/components/tripsage-chat/tripsage-chat-client.tsx"), "utf8");
    const thinkingBlocks = [...clientSource.matchAll(/<div[^>]*className="tripsage-thinking"[\s\S]*?<\/div>/g)].map((m) => m[0]);
    expect(thinkingBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of thinkingBlocks) {
      expect(block).toContain('role="status"');
      expect(block).toContain('aria-live="polite"');
      const dotsIdx = block.indexOf("tripsage-thinking-dots");
      const textSpanIdx = block.indexOf("<span>");
      expect(dotsIdx).toBeGreaterThan(-1);
      expect(textSpanIdx).toBeGreaterThan(dotsIdx);
    }
  });
});
