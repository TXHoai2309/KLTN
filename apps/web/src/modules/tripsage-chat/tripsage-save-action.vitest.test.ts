import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import { TripsageSaveSection } from "@/components/tripsage-chat/tripsage-save-section";
import { STALE_ITINERARY_MESSAGE } from "@/components/tripsage-chat/tripsage-conversation-state";
import { scheduleSelection } from "../assistant-planning/planning-engine";
import { fixtureNeeds, fixtureRoutes, planningCandidate, planningNow } from "@/test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { sanitizeStoredParts } from "./assistant-conversation-contract";
import { saveActionPartSchema } from "./tripsage-chat-parts";
import { createChatSaveController } from "./tripsage-chat-save";
import {
  isSaveItineraryRequest,
  resolveSaveActionPart,
  streamTripsageChat,
  TRIPSAGE_CHAT_INSTRUCTIONS,
} from "./tripsage-chat-service";

describe("Point 7 — accurate 'Lưu chuyến' button copy and inline confirmed save action (L11)", () => {
  it("uses exact button name 'Lưu chuyến' and real desktop/mobile locations in persona (no 'Lưu hành trình')", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("Lưu chuyến");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("góc phải đầu panel lịch");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("chân sheet");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).not.toContain("Lưu hành trình");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).not.toContain("dưới thẻ lịch");
  });

  it("detects explicit save requests and ignores negations or normal planning messages", () => {
    expect(isSaveItineraryRequest("ok lưu lịch này giúp mình luôn nhé")).toBe(true);
    expect(isSaveItineraryRequest("lưu giúp mình")).toBe(true);
    expect(isSaveItineraryRequest("Lưu chuyến này nhé")).toBe(true);
    expect(isSaveItineraryRequest("Please save this trip for me")).toBe(true);

    expect(isSaveItineraryRequest("không cần lưu đâu")).toBe(false);
    expect(isSaveItineraryRequest("đừng lưu vội")).toBe(false);
    expect(isSaveItineraryRequest("do not save yet")).toBe(false);
    expect(isSaveItineraryRequest("lên lịch 3 ngày Hà Giang")).toBe(false);
  });

  it("emits data-save-action on 'ok lưu lịch này giúp mình luôn nhé' without auto-saving, and explains ineligibility on assumed drafts", async () => {
    const runWith = async (userText: string, assumedFields?: ("origin" | "startDate")[]) => {
      const model = new MockLanguageModelV3({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start" as const, id: "t1" });
              controller.enqueue({ type: "text-delta" as const, id: "t1", delta: "Bạn bấm nút Lưu chuyến bên dưới nhé." });
              controller.enqueue({ type: "text-end" as const, id: "t1" });
              controller.enqueue({
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                usage: {
                  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 10, text: 10, reasoning: 0 },
                },
              });
              controller.close();
            },
          }),
        }),
      });
      const res = streamTripsageChat({
        model,
        messages: [{ role: "user", content: userText }],
        latestUserText: userText,
        tripInfo: {
          transport: "CAR",
          durationDays: 2,
          startDate: "2026-12-19",
          ...(assumedFields ? { assumedFields } : {}),
        },
        currentItinerary: {
          days: [
            { day: 1, stops: [{ id: "a", name: "Phố cổ Đồng Văn", arrivalMinute: 540, departureMinute: 660 }] },
            { day: 2, stops: [{ id: "b", name: "Sông Nho Quế", arrivalMinute: 540, departureMinute: 660 }] },
          ],
          distanceKm: 180,
        },
        planning: { candidates: async () => [], routes: fixtureRoutes, now: () => planningNow },
      });
      const sse = await res.text();
      return sse
        .split("\n")
        .filter(line => line.startsWith("data: ") && line !== "data: [DONE]")
        .map(line => JSON.parse(line.slice(6)) as { type?: string; data?: unknown });
    };

    const eligibleParts = await runWith("ok lưu lịch này giúp mình luôn nhé");
    const savePart = eligibleParts.find(p => p.type === "data-save-action");
    expect(savePart).toBeTruthy();
    expect(saveActionPartSchema.parse(savePart!.data)).toEqual({ eligible: true });

    const assumedParts = await runWith("lưu giúp mình", ["origin", "startDate"]);
    const blockedPart = assumedParts.find(p => p.type === "data-save-action");
    expect(blockedPart).toBeTruthy();
    const parsedBlocked = saveActionPartSchema.parse(blockedPart!.data);
    expect(parsedBlocked.eligible).toBe(false);
    expect(parsedBlocked.reason).toMatch(/xác nhận/iu);

    // Persisted storage sanitizer preserves valid data-save-action
    expect(sanitizeStoredParts([{ type: "data-save-action", id: "save-action", data: { eligible: true } }])).toEqual([
      { type: "data-save-action", id: "save-action", data: { eligible: true } },
    ]);
  });

  it("resolveSaveActionPart returns null when no itinerary exists yet", () => {
    expect(
      resolveSaveActionPart({
        latestUserText: "lưu giúp mình",
        itinerary: null,
        currentItinerary: null,
        tripInfo: null,
      }),
    ).toBeNull();
  });

  it("renders inline 'Lưu chuyến' button, shows outdated reason when stale, and saves through the confirmed idempotent flow", async () => {
    const needs = {
      ...fixtureNeeds,
      requirement: { ...fixtureNeeds.requirement, durationDays: 1, journey: COMPLETE_JOURNEY_FIXTURE },
    };
    const proposal = await scheduleSelection(
      needs,
      { days: [["a", "b"]] },
      [planningCandidate("a"), planningCandidate("b")],
      {
        route: fixtureRoutes.route,
        coordinateRoute: async () => ({
          status: "VERIFIED",
          provider: "GOOGLE_MAPS",
          durationSeconds: 3600,
          distanceMeters: 50_000,
          reason: null,
        }),
      },
      planningNow,
    );

    // Eligible: renders enabled "Lưu chuyến" button
    const html = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: proposal,
        primaryLabel: "Lưu chuyến",
      }),
    );
    expect(html).toContain(">Lưu chuyến<");
    expect(html).not.toContain("disabled");

    // Stale/outdated: renders disabled "Lưu chuyến" button with clear explanation
    const staleHtml = renderToStaticMarkup(
      createElement(TripsageSaveSection, {
        result: proposal,
        primaryLabel: "Lưu chuyến",
        outdatedReason: STALE_ITINERARY_MESSAGE,
      }),
    );
    expect(staleHtml).toContain("Lưu chuyến");
    expect(staleHtml).toContain("disabled");
    expect(staleHtml).toContain(STALE_ITINERARY_MESSAGE);

    // Confirmed save click goes through POST /api/trips with idempotency key and returns SUCCESS
    const validSaveValidation = {
      canConfirm: true,
      groups: {
        openingHours: { status: "SATISFIED", findings: [] },
        minimumDuration: { status: "SATISFIED", findings: [] },
        travelTime: { status: "SATISFIED", findings: [] },
        scheduleConflict: { status: "SATISFIED", findings: [] },
      },
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("idempotency-key")).toBeTruthy();
      return new Response(
        JSON.stringify({
          success: true,
          operationStatus: "SUCCESS",
          data: { tripId: "trip-test-123", validation: validSaveValidation, unchecked: [] },
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const controller = createChatSaveController({ fetcher: fetcher as unknown as typeof fetch });
    const outcome = await controller.save(proposal);
    expect(outcome.state).toBe("success");
    expect(outcome.tripId).toBe("trip-test-123");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
