import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { fixtureRoutes, planningNow } from "@/test/planning-fixtures";
import {
  buildTripsageContext,
  detectReplyLanguage,
  expandedKnowledgeLabel,
  resolveFallbackQuickReplies,
  streamTripsageChat,
  TRIPSAGE_CHAT_INSTRUCTIONS,
} from "./tripsage-chat-service";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { sourcesPartSchema } from "./tripsage-chat-context";
import { createInlineSourceStreamFilter, stripRedundantInlineSourceLines } from "./tripsage-knowledge-sources";

describe("Point 8 — reply in user's latest message language (L12)", () => {
  it("persona instructs matching the user's language (default Vietnamese) and keeping Vietnamese place names with diacritics", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).not.toContain("Luôn trả lời bằng tiếng Việt");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/ngôn ngữ.*tin nhắn mới nhất|theo ngôn ngữ/iu);
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/tiếng Việt/iu);
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/tiếng Anh/iu);
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/địa danh.*có dấu/iu);
  });

  it("detectReplyLanguage distinguishes English queries (even with accented Hà Giang place names) from Vietnamese", () => {
    // Exact L12 query from prod trace 66a36527
    expect(
      detectReplyLanguage("Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?"),
    ).toBe("en");
    expect(detectReplyLanguage("Can we visit Đồng Văn and Sông Nho Quế in 2 days?")).toBe("en");
    expect(detectReplyLanguage("What is the weather like in Ha Giang in December?")).toBe("en");

    // Vietnamese accented, unaccented, and ambiguous greetings stay Vietnamese
    expect(detectReplyLanguage("chào bạn, hà giang tháng 12 có lạnh không, có cần mang gì đặc biệt không?")).toBe("vi");
    expect(detectReplyLanguage("ok lên lịch giúp mk: 2 vợ chồng ở hải phòng, đi xe máy 3 ngày 2 đêm")).toBe("vi");
    expect(detectReplyLanguage("di xe may 3 ngay 2 dem ha giang")).toBe("vi");
    expect(detectReplyLanguage("check in homestay ở Đồng Văn mấy giờ?")).toBe("vi");
    expect(detectReplyLanguage("hello")).toBe("vi");
    expect(detectReplyLanguage("")).toBe("vi");
  });

  it("buildTripsageContext adds an explicit English-turn directive for English messages and omits it for Vietnamese", () => {
    const enCtx = buildTripsageContext({
      now: planningNow,
      latestUserText: "Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?",
    });
    expect(enCtx).toMatch(/tiếng Anh|English/iu);
    expect(enCtx).toMatch(/suggestReplies/iu);
    expect(enCtx).toMatch(/Đồng Văn|Đèo Mã Pì Lèng|Sông Nho Quế/u);

    const viCtx = buildTripsageContext({
      now: planningNow,
      latestUserText: "chào bạn, hà giang tháng 12 có lạnh không?",
    });
    expect(viCtx).not.toMatch(/Ngôn ngữ tin nhắn mới nhất:\s*tiếng Anh/iu);
  });

  it("resolveFallbackQuickReplies emits English chips on English turns while keeping Vietnamese place names with diacritics", () => {
    const replies = resolveFallbackQuickReplies({
      text: "The mountain passes can be tiring if you drive straight from Hải Phòng. How would you like to reach the hub?",
      latestUserText: "How should we get from Hai Phong to Ha Giang?",
      hasEmittedQuickReplies: false,
      hasOriginCandidates: false,
      itinerary: null,
      cost: null,
      accessLeg: null,
      tripInfo: { homeCity: "Hải Phòng" },
    });
    expect(replies).toBeTruthy();
    expect(replies!.every(r => !/Đi xe khách|Đi máy bay|Tự lái từ/u.test(r))).toBe(true);
    expect(replies!.some(r => /TP Hà Giang|Hà Nội/u.test(r))).toBe(true);
  });

  it("streams an English reply for L12 even after prior Vietnamese turns and passes the English language directive to the model", async () => {
    let capturedSystem = "";
    const englishAnswer =
      "Riding a motorbike in Hà Giang without a valid Vietnamese license or recognized 1968 IDP is illegal and usually voids travel insurance. For steep mountain passes like Đèo Mã Pì Lèng, hiring an Easy Rider or a car with a local driver is much safer.";
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        const sysMsg = options.prompt.find(m => m.role === "system");
        capturedSystem = typeof sysMsg?.content === "string" ? sysMsg.content : JSON.stringify(sysMsg?.content ?? "");
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start" as const, id: "t1" });
              controller.enqueue({ type: "text-delta" as const, id: "t1", delta: englishAnswer });
              controller.enqueue({ type: "text-end" as const, id: "t1" });
              controller.enqueue({
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                usage: {
                  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 40, text: 40, reasoning: 0 },
                },
              });
              controller.close();
            },
          }),
        };
      },
    });

    const l12 = "Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?";
    const res = streamTripsageChat({
      model,
      messages: [
        { role: "user", content: "chào bạn, hà giang tháng 12 có lạnh không?" },
        { role: "assistant", content: "Tháng 12 Hà Giang khá lạnh, bạn nên mang áo ấm." },
        { role: "user", content: l12 },
      ],
      latestUserText: l12,
      planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
    });

    const sse = await res.text();
    expect(capturedSystem).not.toContain("Luôn trả lời bằng tiếng Việt");
    expect(capturedSystem).toMatch(/tiếng Anh|English/iu);
    expect(sse).toContain("Riding a motorbike in Hà Giang without a valid Vietnamese license");
    expect(sse).toContain("Đèo Mã Pì Lèng");
  });

  it("B3: localizes expanded-knowledge labels ('General knowledge' vs 'Kiến thức mở rộng'), tool guidance, status, and cap notices by reply language", async () => {
    expect(expandedKnowledgeLabel("en")).toBe("General knowledge");
    expect(expandedKnowledgeLabel("vi")).toBe("Kiến thức mở rộng");

    const enTools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
      emitItinerary: () => {},
      latestUserText: "Is it safe for a foreigner to ride a motorbike in Ha Giang without a Vietnamese license?",
      knowledge: async () => [],
    });
    const enKnowledgeOut = await enTools.lookupLocalKnowledge.execute!(
      { question: "motorbike license for foreigner in Ha Giang" },
      { toolCallId: "k-en", messages: [], context: {} } as never,
    );
    expect(JSON.stringify(enKnowledgeOut)).toContain("General knowledge");
    expect(JSON.stringify(enKnowledgeOut)).not.toContain("'Kiến thức mở rộng'");

    const viTools = createTripsageChatTools({
      planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
      emitItinerary: () => {},
      latestUserText: "Hà Giang tháng 12 có lạnh không?",
      knowledge: async () => [],
    });
    const viKnowledgeOut = await viTools.lookupLocalKnowledge.execute!(
      { question: "thời tiết Hà Giang tháng 12" },
      { toolCallId: "k-vi", messages: [], context: {} } as never,
    );
    expect(JSON.stringify(viKnowledgeOut)).toContain("Kiến thức mở rộng");

    // Normalizes accidental Vietnamese label when streaming an English turn
    const normalizedText = stripRedundantInlineSourceLines(
      "**Kiến thức mở rộng:** Foreign riders generally need a Vietnamese license.",
      { lang: "en" },
    );
    expect(normalizedText).toBe("**General knowledge:** Foreign riders generally need a Vietnamese license.");

    const streamFilter = createInlineSourceStreamFilter({ lang: "en" });
    const streamed =
      ["**Kiến thức ", "mở rộng:** ", "Riding without a license is risky."]
        .map(c => streamFilter.push(c))
        .join("") + streamFilter.end();
    expect(streamed).toBe("**General knowledge:** Riding without a license is risky.");

    // Vietnamese turn keeps "Kiến thức mở rộng" untouched and SSE emits English data-status on English turns
    expect(stripRedundantInlineSourceLines("**Kiến thức mở rộng:** Trời lạnh.", { lang: "vi" })).toBe(
      "**Kiến thức mở rộng:** Trời lạnh.",
    );

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start" as const, id: "t1" });
            controller.enqueue({ type: "text-delta" as const, id: "t1", delta: "**Kiến thức mở rộng:** Foreign riders need a valid IDP." });
            controller.enqueue({ type: "text-end" as const, id: "t1" });
            controller.enqueue({
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: undefined },
              usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
            });
            controller.close();
          },
        }),
      }),
    });
    const enRes = streamTripsageChat({
      model,
      messages: [{ role: "user", content: "Is it safe for a foreigner to ride a motorbike in Ha Giang?" }],
      latestUserText: "Is it safe for a foreigner to ride a motorbike in Ha Giang?",
      planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
    });
    const sseText = await enRes.text();
    expect(sseText).toContain("Reading your request");
    expect(sseText).toContain("Writing reply");
    expect(sseText).toContain("General knowledge");
    expect(sseText).not.toContain("Kiến thức mở rộng");
    // Also verify no document sources leaked on general knowledge
    const events = sseText
      .split("\n")
      .filter(l => l.startsWith("data: ") && l !== "data: [DONE]")
      .map(l => JSON.parse(l.slice(6)) as { type?: string; data?: unknown });
    const src = events.find(e => e.type === "data-sources");
    expect(src ? sourcesPartSchema.parse(src.data).sources : []).toEqual([]);
  });
});
