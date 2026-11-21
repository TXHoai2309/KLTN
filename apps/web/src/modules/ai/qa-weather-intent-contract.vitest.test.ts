import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssistantAnswer } from "@/components/assistant/assistant-answer";
import {
  QA_INSUFFICIENT_SOURCE_MESSAGE,
  qaCompletedTurnSchema,
  qaResponseSchema,
} from "./qa-contract";
import { QA_CONVERSATION_MESSAGES } from "./qa-conversation";
import {
  createQaQuestionUnderstander,
  questionUnderstandingSchema,
  understandingValidationSchema,
} from "./qa-question-understander";
import { deterministicQuestionUnderstanding } from "./qa-question-understanding";
import { validateWeatherDate } from "./qa-weather-date";

vi.mock("server-only", () => ({}));

const FIXED_NOW = new Date("2026-11-18T03:00:00Z"); // 2026-11-18 10:00 in Asia/Ho_Chi_Minh (Wednesday)

describe("Ticket 02: WEATHER intent, server date check, and Q&A weather turn contract", () => {
  describe("Question understanding schema, Vietnam today prompt, and non-WEATHER fallback", () => {
    it("exposes WEATHER intent and nullable weatherDate in both JSON schema and Zod validation", () => {
      expect(questionUnderstandingSchema.required).toContain("weatherDate");
      expect(questionUnderstandingSchema.properties.intent.enum).toContain("WEATHER");
      expect(questionUnderstandingSchema.properties.weatherDate.type).toEqual(["string", "null"]);

      expect(
        understandingValidationSchema.safeParse({
          targetSubjects: ["Đèo Mã Pí Lèng"],
          intent: "WEATHER",
          weatherDate: "2026-11-19",
          attributes: ["mưa"],
          temporalConstraint: "mai",
          conditions: [],
          searchQuery: "Đèo Mã Pí Lèng thời tiết ngày mai",
          ambiguous: false,
          clarificationQuestion: null,
        }).success,
      ).toBe(true);

      expect(
        understandingValidationSchema.safeParse({
          targetSubjects: [],
          intent: "WEATHER",
          weatherDate: null,
          attributes: ["mưa"],
          temporalConstraint: null,
          conditions: [],
          searchQuery: "Hà Giang thời tiết hôm nay",
          ambiguous: false,
          clarificationQuestion: null,
        }).success,
      ).toBe(true);

      expect(
        understandingValidationSchema.safeParse({
          targetSubjects: [],
          intent: "WEATHER",
          weatherDate: 20261119,
          attributes: [],
          conditions: [],
          searchQuery: "thời tiết",
          ambiguous: false,
        }).success,
      ).toBe(false);
    });

    it("passes today's Vietnam date to the provider and returns WEATHER + weatherDate", async () => {
      const captured: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
      const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        captured.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    targetSubjects: ["Đèo Mã Pí Lèng"],
                    intent: "WEATHER",
                    weatherDate: "2026-11-19",
                    attributes: ["mưa"],
                    temporalConstraint: "mai",
                    conditions: [],
                    searchQuery: "Đèo Mã Pí Lèng mưa ngày mai",
                    ambiguous: false,
                    clarificationQuestion: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      });

      const understander = createQaQuestionUnderstander({
        apiKey: () => "test-key",
        fetcher: fetcher as typeof fetch,
        now: () => FIXED_NOW,
      });

      const res = await understander.understand({ question: "Mai Mã Pí Lèng có mưa không?" });
      expect(res.intent).toBe("WEATHER");
      expect(res.weatherDate).toBe("2026-11-19");
      expect(res.targetSubjects).toEqual(["Đèo Mã Pí Lèng"]);
      expect(res.ambiguous).toBe(false);

      const capturedBody = captured[0];
      const systemMsg = capturedBody?.messages?.find(m => m.role === "system")?.content ?? "";
      const userMsg = JSON.parse(capturedBody?.messages?.find(m => m.role === "user")?.content ?? "{}") as {
        todayVietnam?: string;
        todayWeekday?: string;
      };
      expect(systemMsg).toContain("2026-11-18");
      expect(userMsg.todayVietnam).toBe("2026-11-18");
      expect(userMsg.todayWeekday).toBe("Thứ tư");
    });

    it("normalizes weatherDate to null when model intent is not WEATHER", async () => {
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    targetSubjects: ["Đèo Mã Pí Lèng"],
                    intent: "SCHEDULE",
                    weatherDate: "2026-11-20",
                    attributes: ["mùa đẹp nhất"],
                    temporalConstraint: null,
                    conditions: [],
                    searchQuery: "Đèo Mã Pí Lèng mùa đẹp nhất",
                    ambiguous: false,
                    clarificationQuestion: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const understander = createQaQuestionUnderstander({
        apiKey: () => "test-key",
        fetcher: fetcher as typeof fetch,
        now: () => FIXED_NOW,
      });
      const res = await understander.understand({ question: "Mã Pí Lèng đẹp nhất mùa nào?" });
      expect(res.intent).toBe("SCHEDULE");
      expect(res.weatherDate).toBeNull();
    });

    it.each([
      "Mai Mã Pí Lèng có mưa không?",
      "Lũng Cú hôm nay mấy giờ hoàng hôn và bình minh?",
      "Dự báo thời tiết Hà Giang cuối tuần này sương mù gió giật thế nào?",
      "20/11 Đồng Văn nhiệt độ bao nhiêu độ C?",
    ])("deterministic fallback NEVER yields WEATHER when AI fails (%s)", async question => {
      expect(deterministicQuestionUnderstanding(question).intent).not.toBe("WEATHER");
      expect(deterministicQuestionUnderstanding(question).weatherDate).toBeNull();

      const understander = createQaQuestionUnderstander({
        apiKey: () => "test-key",
        fetcher: (async () => new Response("error", { status: 503 })) as typeof fetch,
        now: () => FIXED_NOW,
      });
      const fallback = await understander.understand({ question });
      expect(fallback.intent).not.toBe("WEATHER");
      expect(fallback.weatherDate).toBeNull();
    });
  });

  describe("Server weatherDate validation table", () => {
    it.each([
      ["today", "2026-11-18", { status: "VALID", date: "2026-11-18" }],
      ["tomorrow", "2026-11-19", { status: "VALID", date: "2026-11-19" }],
      ["16th day horizon boundary", "2026-12-03", { status: "VALID", date: "2026-12-03" }],
      ["past date (yesterday)", "2026-11-17", { status: "INVALID", reason: "PAST_DATE" }],
      ["past year", "2025-11-18", { status: "INVALID", reason: "PAST_DATE" }],
      ["beyond horizon (17th day)", "2026-12-04", { status: "BEYOND_HORIZON", date: "2026-12-04", availableFrom: "2026-11-19" }],
      ["far beyond horizon", "2026-12-25", { status: "BEYOND_HORIZON", date: "2026-12-25", availableFrom: "2026-12-10" }],
      ["malformed slash format", "20/11/2026", { status: "INVALID", reason: "MALFORMED" }],
      ["malformed nonexistent calendar day", "2026-02-30", { status: "INVALID", reason: "MALFORMED" }],
      ["ambiguous marker", "AMBIGUOUS", { status: "INVALID", reason: "MALFORMED" }],
      ["empty string", "", { status: "INVALID", reason: "MALFORMED" }],
      ["null (missing day -> today)", null, { status: "DEFAULT_TODAY", date: "2026-11-18" }],
      ["undefined (missing day -> today)", undefined, { status: "DEFAULT_TODAY", date: "2026-11-18" }],
    ] as const)("validates %s (%j)", (_label, input, expected) => {
      expect(validateWeatherDate(input, FIXED_NOW)).toEqual(expected);
    });

    it("uses Asia/Ho_Chi_Minh (UTC+7) midnight boundary", () => {
      const vnJustAfterMidnight = new Date("2026-11-17T17:15:00Z"); // 2026-11-18 00:15 ICT
      expect(validateWeatherDate(null, vnJustAfterMidnight)).toEqual({
        status: "DEFAULT_TODAY",
        date: "2026-11-18",
      });
      expect(validateWeatherDate("2026-11-17", vnJustAfterMidnight)).toEqual({
        status: "INVALID",
        reason: "PAST_DATE",
      });
    });
  });

  describe("Completed-turn WEATHER contract and legacy turn compatibility", () => {
    const baseIdentity = {
      conversationId: "conv_weather_01",
      turnId: "turn_weather_01",
      turnState: "COMPLETED" as const,
      context: { type: "GENERAL" as const },
    };

    it("accepts WEATHER completed turn without citations or forecast values and rejects forbidden fields", () => {
      const weatherTurn = {
        ...baseIdentity,
        status: "WEATHER" as const,
        answerParts: [],
        citations: [],
        destinationId: "dest_lung_cu",
        date: "2026-11-19",
        representative: false,
        leadIn: "Dưới đây là dự báo thời tiết và giờ mặt trời tại Cột cờ Lũng Cú ngày 2026-11-19.",
      };

      expect(qaCompletedTurnSchema.parse(weatherTurn)).toEqual(weatherTurn);
      expect(
        qaResponseSchema.safeParse({
          success: true,
          operationStatus: "SUCCESS",
          data: weatherTurn,
        }).success,
      ).toBe(true);

      // Must not carry citations, answerParts, or stored forecast figures
      expect(
        qaCompletedTurnSchema.safeParse({
          ...weatherTurn,
          citations: [{ id: "c1", sourceId: "s1", title: "Tài liệu", sourceUrl: null, locators: [{ pageNumber: 1 }] }],
        }).success,
      ).toBe(false);
      expect(
        qaCompletedTurnSchema.safeParse({
          ...weatherTurn,
          forecast: { temperatureC: 15 },
        }).success,
      ).toBe(false);
      expect(
        qaCompletedTurnSchema.safeParse({
          ...weatherTurn,
          temperatureC: 15,
        }).success,
      ).toBe(false);
      expect(
        qaCompletedTurnSchema.safeParse({
          ...weatherTurn,
          date: "2026-02-30",
        }).success,
      ).toBe(false);
    });

    it("continues reading and rendering all legacy persisted turn shapes", () => {
      const legacyTurns = [
        {
          ...baseIdentity,
          status: "CONVERSATIONAL",
          answerParts: [],
          citations: [],
          message: QA_CONVERSATION_MESSAGES.greeting,
        },
        {
          ...baseIdentity,
          status: "ANSWERED",
          answerParts: [{ text: "Dinh thự họ Vương nằm ở thung lũng Sà Phìn.", citationIds: ["c1"] }],
          citations: [{ id: "c1", sourceId: "doc_1", title: "Dinh thự họ Vương", sourceUrl: null, locators: [{ pageNumber: 2 }] }],
          unansweredAspects: [],
        },
        {
          ...baseIdentity,
          knowledgeMode: "EXPANDED",
          status: "PARTIAL",
          answerParts: [
            { text: "Thông tin từ nguồn.", mode: "SOURCE", citationIds: ["c1"] },
            { text: "Bổ sung ngữ cảnh chung.", mode: "EXPANDED", citationIds: [] },
          ],
          citations: [{ id: "c1", sourceId: "doc_1", title: "Nguồn A", sourceUrl: "https://example.com/a", locators: [{ section: "Mục 1" }] }],
          unansweredAspects: ["Chưa rõ giá vé năm nay."],
        },
        {
          ...baseIdentity,
          status: "INSUFFICIENT_SOURCE",
          answerParts: [],
          citations: [],
          message: QA_INSUFFICIENT_SOURCE_MESSAGE,
        },
        {
          ...baseIdentity,
          status: "CLARIFICATION_REQUIRED",
          answerParts: [],
          citations: [],
          clarificationQuestion: "Bạn muốn hỏi về điểm đến nào?",
        },
      ];

      for (const raw of legacyTurns) {
        const parsed = qaCompletedTurnSchema.parse(raw);
        const html = renderToStaticMarkup(createElement(AssistantAnswer, { turn: parsed, question: "Câu hỏi cũ" }));
        expect(html.length).toBeGreaterThan(0);
      }
    });
  });
});
