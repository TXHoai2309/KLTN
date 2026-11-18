import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { describe, expect, it, vi } from "vitest";
import { qaCompletedTurnSchema, type QaCompletedTurn } from "../../modules/ai/qa-contract";
import type { DestinationWeather } from "../../modules/trip-weather/destination-weather-service";
import { AssistantAnswer, AssistantTurn } from "./assistant-answer";
import { AssistantController } from "./assistant-controller";
import { isGuestPlanningRequest, submitGuestMessage } from "./assistant-guest-mode";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { openSavedConversation } from "./assistant-saved-conversation";
import {
  AssistantWeatherCard,
  buildWeatherChoiceFollowUp,
} from "./assistant-weather-card";

const SAMPLE_SUN_TIMES = {
  date: "2026-11-19",
  timeZone: "Asia/Ho_Chi_Minh" as const,
  sunriseMinute: 379,
  sunsetMinute: 1034,
  morningGoldenEndMinute: 439,
  eveningGoldenStartMinute: 974,
  civilDawnMinute: 356,
  civilDuskMinute: 1057,
  polarEvent: null,
};

const AVAILABLE_WEATHER: DestinationWeather = {
  destinationId: "cmv97lcrq0016z09ws0o74lqp",
  date: "2026-11-19",
  sunTimes: SAMPLE_SUN_TIMES,
  forecast: {
    status: "AVAILABLE",
    provider: "OPEN_METEO",
    fetchedAt: "2026-11-18T03:00:00.000Z",
    hours: [
      {
        time: "2026-11-19T08:00",
        temperatureC: 16.4,
        precipitationProbability: 65,
        precipitationMm: 2.3,
        visibilityM: 3200,
        windGustKmh: 28,
        weatherCode: 61,
      },
      {
        time: "2026-11-19T14:00",
        temperatureC: 21.1,
        precipitationProbability: 20,
        precipitationMm: 0,
        visibilityM: 12000,
        windGustKmh: 18,
        weatherCode: 2,
      },
    ],
    days: [
      {
        date: "2026-11-19",
        minTemperatureC: 14,
        maxTemperatureC: 22,
        maxPrecipitationProbability: 65,
        totalPrecipitationMm: 2.3,
        minVisibilityM: 3200,
        maxWindGustKmh: 28,
      },
    ],
  },
};

function makeWeatherTurn(overrides: Partial<Extract<QaCompletedTurn, { status: "WEATHER" }>> = {}): QaCompletedTurn {
  return qaCompletedTurnSchema.parse({
    conversationId: "conv_weather_1",
    turnId: "turn_weather_1",
    turnState: "COMPLETED",
    context: { type: "GENERAL" },
    status: "WEATHER",
    answerParts: [],
    citations: [],
    destinationId: "cmv97lcrq0016z09ws0o74lqp",
    date: "2026-11-19",
    representative: false,
    leadIn: "Dưới đây là dự báo thời tiết và giờ mặt trời tại Cao nguyên đá Đồng Văn ngày 2026-11-19 (chỉ để tham khảo):",
    ...overrides,
  });
}

describe("AssistantWeatherCard & chat weather message rendering (Ticket 04)", () => {
  it("renders loading, available forecast with sun times & Open-Meteo source, and destination link", () => {
    const loadingHtml = renderToStaticMarkup(
      createElement(AssistantWeatherCard, {
        destinationId: "cmv97lcrq0016z09ws0o74lqp",
        date: "2026-11-19",
        representative: false,
      }),
    );
    expect(loadingHtml).toContain("Đang tải giờ mặt trời và dự báo…");
    expect(loadingHtml).toContain('aria-live="polite"');
    expect(loadingHtml).not.toContain("Điểm đại diện:");

    const readyHtml = renderToStaticMarkup(
      createElement(AssistantWeatherCard, {
        destinationId: "cmv97lcrq0016z09ws0o74lqp",
        date: "2026-11-19",
        representative: false,
        initialState: { status: "ready", weather: AVAILABLE_WEATHER },
        today: "2026-11-18",
      }),
    );
    expect(readyHtml).toContain("Bình minh");
    expect(readyHtml).toContain("06:19");
    expect(readyHtml).toContain("Hoàng hôn");
    expect(readyHtml).toContain("17:14");
    expect(readyHtml).toContain("Dự báo theo giờ");
    expect(readyHtml).toContain('aria-label="Bảng dự báo theo giờ"');
    expect(readyHtml).toContain('tabindex="0"');
    expect(readyHtml).toContain("Open-Meteo");
    expect(readyHtml).toContain("cập nhật");
    expect(readyHtml).toContain('/destinations/cmv97lcrq0016z09ws0o74lqp');
    expect(readyHtml).toContain("Chỉ để tham khảo");
  });

  it("displays the representative point notice directly on the card when representative=true", () => {
    const repHtml = renderToStaticMarkup(
      createElement(AssistantWeatherCard, {
        destinationId: "dest_tp_hg",
        date: "2026-11-19",
        representative: true,
        initialState: { status: "ready", weather: { ...AVAILABLE_WEATHER, destinationId: "dest_tp_hg" } },
        today: "2026-11-18",
      }),
    );
    expect(repHtml).toContain('data-representative="true"');
    expect(repHtml).toContain("Điểm đại diện:");
    expect(repHtml).toContain("thành phố Hà Giang");
  });

  it("clearly displays beyond-horizon ('sẽ có từ ngày X'), provider unavailable, and isolated card error states without breaking the turn", () => {
    const beyondHorizon: DestinationWeather = {
      destinationId: "cmv97lcrq0016z09ws0o74lqp",
      date: "2026-12-20",
      sunTimes: { ...SAMPLE_SUN_TIMES, date: "2026-12-20" },
      forecast: {
        status: "NOT_YET_AVAILABLE",
        availableFrom: "2026-12-05",
        days: [],
      },
    };
    const notYetHtml = renderToStaticMarkup(
      createElement(AssistantWeatherCard, {
        destinationId: "cmv97lcrq0016z09ws0o74lqp",
        date: "2026-12-20",
        representative: false,
        initialState: { status: "ready", weather: beyondHorizon },
        today: "2026-11-18",
      }),
    );
    expect(notYetHtml).toContain("Chưa có dự báo cho ngày này, sẽ có từ ngày 2026-12-05.");
    expect(notYetHtml).toContain("Bình minh");

    const providerDown: DestinationWeather = {
      destinationId: "cmv97lcrq0016z09ws0o74lqp",
      date: "2026-11-19",
      sunTimes: SAMPLE_SUN_TIMES,
      forecast: { status: "UNAVAILABLE", reason: "UNAVAILABLE" },
    };
    const unavailableHtml = renderToStaticMarkup(
      createElement(AssistantWeatherCard, {
        destinationId: "cmv97lcrq0016z09ws0o74lqp",
        date: "2026-11-19",
        representative: false,
        initialState: { status: "ready", weather: providerDown },
        today: "2026-11-18",
      }),
    );
    expect(unavailableHtml).toContain("Không lấy được dự báo thời tiết lúc này. Đây không phải là trời đẹp; vui lòng thử lại sau.");
    expect(unavailableHtml).toContain('role="alert"');

    // Card error inside AssistantTurn keeps the user question and assistant lead-in completely intact
    const turnWithErrorHtml = renderToStaticMarkup(
      createElement(AssistantTurn, {
        turn: { question: "Mai Đồng Văn có mưa không?", response: makeWeatherTurn() },
        weatherCardInitialState: { status: "error" },
      }),
    );
    expect(turnWithErrorHtml).toContain("Mai Đồng Văn có mưa không?");
    expect(turnWithErrorHtml).toContain("Dưới đây là dự báo thời tiết và giờ mặt trời tại Cao nguyên đá Đồng Văn");
    expect(turnWithErrorHtml).toContain("Không lấy được dự báo thời tiết lúc này.");
    expect(turnWithErrorHtml).not.toContain("Thông tin nguồn không khả dụng");
  });

  it("renders up to 3 clickable destination choices on CLARIFICATION_REQUIRED and sends follow-up in Guest & Saved modes", async () => {
    const clarificationTurn = qaCompletedTurnSchema.parse({
      conversationId: "conv_clarify_1",
      turnId: "turn_clarify_1",
      turnState: "COMPLETED",
      context: { type: "GENERAL" },
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: "Mình thấy có vài điểm đến phù hợp, bạn muốn xem dự báo thời tiết ở điểm nào?",
      choices: [
        { id: "d1", name: "Cao nguyên đá Đồng Văn" },
        { id: "d2", name: "Phố cổ Đồng Văn" },
        { id: "d3", name: "Đèo Mã Pí Lèng" },
      ],
    });

    const onSelect = vi.fn();
    const html = renderToStaticMarkup(
      createElement(AssistantAnswer, {
        turn: clarificationTurn,
        question: "Ngày mai ở Đồng Văn có mưa không?",
        onSelectChoice: onSelect,
      }),
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Chọn điểm đến"');
    expect(html.match(/class="assistant-weather-choice-btn"/gu)).toHaveLength(3);
    expect(html).toContain("Cao nguyên đá Đồng Văn");
    expect(html).toContain("Phố cổ Đồng Văn");
    expect(html).toContain("Đèo Mã Pí Lèng");
    expect(html).not.toContain("disabled");

    const followUp = buildWeatherChoiceFollowUp(
      { id: "d2", name: "Phố cổ Đồng Văn" },
      "Ngày mai ở Đồng Văn có mưa không?",
    );
    expect(followUp).toBe("Ngày mai ở Đồng Văn có mưa không — tại Phố cổ Đồng Văn?");
    expect(isGuestPlanningRequest(followUp)).toBe(false);

    // Verify Guest mode controller sends choice follow-up to /api/ai/ask and receives WEATHER turn
    const weatherTurn = makeWeatherTurn({ destinationId: "d2" });
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ success: true, operationStatus: "SUCCESS", data: weatherTurn }),
    );
    const guestIdentity = `GUEST:${"b".repeat(64)}`;
    const controller = new AssistantController(new AssistantHttpTransport(fetcher), guestIdentity, () => "idem_choice_1");
    const outcome = submitGuestMessage({
      controller,
      text: followUp,
      context: { type: "GENERAL" },
      retain: vi.fn(),
    });
    expect(outcome).toBe("SENT");
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe("/api/ai/ask");
    expect(controller.getSnapshot().turns[0]?.response).toMatchObject({
      status: "WEATHER",
      destinationId: "d2",
      date: "2026-11-19",
    });
  });

  it("keeps legacy non-weather turns working and renders reopened saved conversations containing a WEATHER turn", async () => {
    // 1. Legacy turns (ANSWERED, CONVERSATIONAL, CLARIFICATION_REQUIRED without choices, INSUFFICIENT_SOURCE)
    const legacyAnswered = qaCompletedTurnSchema.parse({
      conversationId: "conv_old",
      turnId: "turn_old_1",
      turnState: "COMPLETED",
      context: { type: "GENERAL" },
      status: "ANSWERED",
      answerParts: [{ text: "Cao nguyên đá Đồng Văn được UNESCO công nhận năm 2010.", citationIds: ["c1"] }],
      citations: [{ id: "c1", sourceId: "src1", title: "Tài liệu Hà Giang", sourceUrl: "https://example.com/hg", locators: [] }],
      unansweredAspects: [],
    });
    const legacyClarify = qaCompletedTurnSchema.parse({
      conversationId: "conv_old",
      turnId: "turn_old_2",
      turnState: "COMPLETED",
      context: { type: "GENERAL" },
      status: "CLARIFICATION_REQUIRED",
      answerParts: [],
      citations: [],
      clarificationQuestion: "Bạn muốn hỏi về điểm đến nào?",
    });
    expect(renderToStaticMarkup(createElement(AssistantAnswer, { turn: legacyAnswered }))).toContain("UNESCO");
    const legacyClarifyHtml = renderToStaticMarkup(createElement(AssistantAnswer, { turn: legacyClarify }));
    expect(legacyClarifyHtml).toBe("<p>Bạn muốn hỏi về điểm đến nào?</p>");

    // 2. Reopening a saved conversation with both a legacy turn and a WEATHER turn (no stored forecast values)
    const savedWeatherTurn = makeWeatherTurn({ turnId: "turn_saved_w1", conversationId: "conv_saved_mix" });
    const fetchDetail = vi.fn(async () => ({
      conversation: {
        id: "conv_saved_mix",
        title: "Thời tiết Đồng Văn",
        context: { type: "GENERAL" as const },
        knowledgeMode: "SOURCE_ONLY" as const,
        headTurnId: "turn_saved_w1",
        createdAt: "2026-11-18T03:00:00.000Z",
        lastActivityAt: "2026-11-18T03:05:00.000Z",
      },
      turns: [
        { question: "Đồng Văn có gì?", response: { ...legacyAnswered, conversationId: "conv_saved_mix" } },
        { question: "Mai Cao nguyên đá Đồng Văn có mưa không?", response: savedWeatherTurn },
      ],
    }));
    const savedController = new AssistantController(null, "USER:u1", () => "k1");
    const openOutcome = await openSavedConversation(savedController, "conv_saved_mix", fetchDetail);
    expect(openOutcome).toBe("LOADED");
    expect(savedController.getSnapshot().turns).toHaveLength(2);
    const reopenedHtml = renderToStaticMarkup(
      createElement(AssistantTurn, { turn: savedController.getSnapshot().turns[1]! }),
    );
    expect(reopenedHtml).toContain("assistant-weather-card");
    expect(reopenedHtml).toContain("Đang tải giờ mặt trời và dự báo…");

    // 3. Bundled V2 chat surfaces (page & destination panel) render without errors
    const { build } = await import("esbuild");
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("./assistant-v2-chat.tsx", import.meta.url))],
      bundle: true,
      write: false,
      format: "cjs",
      platform: "node",
      jsx: "automatic",
      external: ["react", "react/*", "next/*", "lucide-react"],
      loader: { ".css": "local-css" },
      outdir: "out",
      logLevel: "silent",
    });
    const mod = { exports: {} as { AssistantV2Chat: (props: Record<string, unknown>) => unknown } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), mod, mod.exports);
    const panelHtml = renderToStaticMarkup(
      createElement(mod.exports.AssistantV2Chat as never, {
        identity: `GUEST:${"c".repeat(64)}`,
        available: true,
        onMinimize: () => {},
        initialContext: { type: "DESTINATION", destinationId: "cmv97lcrq0016z09ws0o74lqp" },
      }),
    );
    expect(panelHtml).toContain("assistant-chat-panel");
  });

  it("ships valid Light/Dark, keyboard-focus, and 375px mobile responsive CSS rules", () => {
    const cssPath = fileURLToPath(new URL("./assistant-weather-card.css", import.meta.url));
    const css = readFileSync(cssPath, "utf8");
    const root = postcss.parse(css);

    const selectors = new Set<string>();
    root.walkRules(rule => {
      for (const s of rule.selectors) selectors.add(s.trim());
    });

    expect(selectors.has(".assistant-weather-card")).toBe(true);
    expect(selectors.has(".dark .assistant-weather-card")).toBe(true);
    expect(selectors.has(".assistant-weather-choice-btn")).toBe(true);
    expect(selectors.has(".dark .assistant-weather-choice-btn")).toBe(true);
    expect(selectors.has(".assistant-weather-card :focus-visible")).toBe(true);
    expect(selectors.has(".assistant-weather-choice-btn:focus-visible")).toBe(true);
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("overflow: auto");
  });
});
