import { describe, expect, it, vi } from "vitest";
import { buildConversationAutoTitle, autoTitleFromAssistantParts } from "./conversation-auto-title";
import { createAssistantConversationStore } from "./assistant-conversation-store";

describe("Ticket 14: Conversation auto-title & saved trip indicator (slim B11, BR-7)", () => {
  it("formats full confirmed info as 'Đà Nẵng → HG · 4 người · 12/12'", () => {
    expect(
      buildConversationAutoTitle({
        tripInfo: { homeCity: "Đà Nẵng", travelers: 4, startDate: "2026-12-12", durationDays: 4 },
      }),
    ).toBe("Đà Nẵng → HG · 4 người · 12/12");
  });

  it("handles missing date, missing homeCity, and trip starting from TP Hà Giang hub", () => {
    expect(
      buildConversationAutoTitle({
        tripInfo: { homeCity: "Đà Nẵng", travelers: 4 },
      }),
    ).toBe("Đà Nẵng → HG · 4 người");

    expect(
      buildConversationAutoTitle({
        tripInfo: { durationDays: 4, travelers: 2 },
        journey: {
          origin: { label: "Hà Nội (bến xe Mỹ Đình)", latitude: 21.028, longitude: 105.778, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      }),
    ).toBe("Hà Nội → HG · 2 người · 4 ngày");

    expect(
      buildConversationAutoTitle({
        tripInfo: { startDate: "2026-12-13", travelers: 2 },
        journey: {
          origin: { label: "TP Hà Giang", latitude: 22.823, longitude: 104.983, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      }),
    ).toBe("Hà Giang · 2 người · 13/12");
  });

  it("returns null when all fields are only assumed or missing (never invents title from assumptions)", () => {
    expect(
      buildConversationAutoTitle({
        tripInfo: {
          durationDays: 4,
          startDate: "2026-12-12",
          assumedFields: ["origin", "startDate", "durationDays"],
        },
        journey: {
          origin: { label: "Hà Nội", latitude: 21.028, longitude: 105.778, source: "MANUAL", confirmed: true },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      }),
    ).toBeNull();
  });

  it("extracts auto-title from stored assistant parts", () => {
    expect(
      autoTitleFromAssistantParts([
        { type: "text", text: "Mình đã ghi nhận." },
        { type: "data-trip-info", data: { tripInfo: { homeCity: "TP.HCM", travelers: 3, startDate: "2026-12-20" } } },
      ]),
    ).toBe("TP.HCM → HG · 3 người · 20/12");
  });

  it("updates title on recordAssistantMessage ONLY when titleCustomized is false, and preserves user-edited titles", async () => {
    const update = vi.fn(async (_args?: unknown) => ({}));
    const makeStore = (titleCustomized: boolean) => {
      const tx = {
        idempotencyRecord: {
          findUnique: vi.fn(async () => null),
          create: vi.fn(async () => ({})),
          update: vi.fn(async () => ({})),
        },
        assistantConversation: {
          findFirst: vi.fn(async () => ({
            id: "conv_12345678",
            title: titleCustomized ? "Chuyến đi sinh nhật" : "Mình muốn đi Hà Giang",
            titleCustomized,
            updatedAt: new Date("2026-11-23T00:00:00Z"),
          })),
          update,
        },
        assistantMessage: {
          create: vi.fn(async () => ({})),
        },
      };
      const db = {
        idempotencyRecord: tx.idempotencyRecord,
        $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      };
      return createAssistantConversationStore(db as never, { now: () => new Date("2026-11-23T01:00:00Z") });
    };

    const parts = [
      { type: "text", text: "Đã chốt lịch!" },
      { type: "data-trip-info", data: { tripInfo: { homeCity: "Đà Nẵng", travelers: 4, startDate: "2026-12-12" } } },
    ];

    // Auto-title applies when titleCustomized=false
    const res1 = await makeStore(false).recordAssistantMessage({
      userId: "u1",
      conversationId: "conv_12345678",
      clientMessageId: "m1:assistant",
      parts,
    });
    expect(res1.status).toBe("SUCCESS");
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Đà Nẵng → HG · 4 người · 12/12" }),
      }),
    );

    // User-renamed conversation is NOT overwritten
    update.mockClear();
    const res2 = await makeStore(true).recordAssistantMessage({
      userId: "u1",
      conversationId: "conv_12345678",
      clientMessageId: "m2:assistant",
      parts,
    });
    expect(res2.status).toBe("SUCCESS");
    const lastCallData = (update.mock.calls.at(-1)?.[0] as { data?: Record<string, unknown> } | undefined)?.data;
    expect(lastCallData?.title).toBeUndefined();
  });

  it("strips street address / ward / house number when auto-titling from origin or homeCity (P1)", () => {
    expect(
      buildConversationAutoTitle({
        tripInfo: { travelers: 2, startDate: "2026-11-29" },
        journey: {
          origin: {
            label: "96 P. Định Công, Hoàng Mai, Hà Nội",
            latitude: 20.985,
            longitude: 105.838,
            source: "GOOGLE_PLACES",
            confirmed: true,
          },
          departureMinute: 420,
          returnDeadlineMinute: 1080,
          returnDepartureMinute: null,
        },
      }),
    ).toBe("Hà Nội → HG · 2 người · 29/11");

    expect(
      buildConversationAutoTitle({
        tripInfo: { homeCity: "96 P. Định Công", travelers: 2, startDate: "2026-11-29" },
      }),
    ).toBe("Hà Giang · 2 người · 29/11");
  });
});
