import { describe, expect, it } from "vitest";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";

const NHO_QUE: PlannerCandidate = {
  id: "dest-nho-que",
  name: "Sông Nho Quế",
  description: "Trải nghiệm đi thuyền trên sông Nho Quế dưới chân đèo Mã Pì Lèng.",
  area: "khu vực hà giang",
  category: "thiên nhiên – thắng cảnh",
  latitude: 23.1907,
  longitude: 105.4695,
  address: "Khu vực bến thuyền Nho Quế 1, xã Mèo Vạc, tỉnh Tuyên Quang",
  image: null,
  suggestedDurationMinutes: 90,
  minimumDurationMinutes: 60,
  visibility: "VISIBLE",
  revision: "v1",
  isOutdoor: true,
  openingDays: [
    { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "TUESDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "WEDNESDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "THURSDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "FRIDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "SATURDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
    { dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 360, closesAtMinute: 1020 }] },
  ],
};

const LUNG_CU: PlannerCandidate = {
  ...NHO_QUE,
  id: "dest-lung-cu",
  name: "Cột cờ Lũng Cú",
  ticketPrice: "40.000đ/người lớn",
  openingDays: [
    { dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 300, closesAtMinute: 1020 }, { opensAtMinute: 420, closesAtMinute: 1020 }] },
    { dayOfWeek: "MONDAY", status: "CLOSED", intervals: [] },
  ],
};

const EMPTY_ROUTES = {
  route: async () => ({
    fromDestinationId: "",
    toDestinationId: "",
    status: "INSUFFICIENT_DATA" as const,
    reason: "NOT_CONFIGURED" as const,
    durationSeconds: null,
    distanceMeters: null,
    provider: null,
  }),
};

describe("Point 5 — getDestinationInfo tool for catalog opening hours & ticket price (L8)", () => {
  it("returns Sunday opening hours (06:00–17:00) and explicit 'chưa có giá vé trong dữ liệu' for Sông Nho Quế", async () => {
    const tools = createTripsageChatTools({
      planning: { candidates: async () => [NHO_QUE, LUNG_CU], routes: EMPTY_ROUTES, now: () => new Date("2026-11-23T05:00:00Z") },
      emitItinerary: () => {},
    });

    // Resolve by short code D1 after listDestinations or directly by catalog id / name
    const byId = await tools.getDestinationInfo.execute!(
      { destinationId: "dest-nho-que", dayOfWeek: "SUNDAY" },
      { toolCallId: "g1", messages: [], context: {} },
    ) as {
      ok: boolean;
      name: string;
      source: string;
      requestedDay?: { dayOfWeek: string; labelVi: string; status: string; intervals: string[]; summary: string };
      ticketPrice: string | null;
      ticketPriceNote: string;
      note: string;
    };

    expect(byId.ok).toBe(true);
    expect(byId.name).toBe("Sông Nho Quế");
    expect(byId.source).toContain("dữ liệu điểm đến");
    expect(byId.requestedDay).toMatchObject({
      dayOfWeek: "SUNDAY",
      labelVi: "Chủ Nhật",
      status: "OPEN",
      intervals: ["06:00–17:00"],
    });
    expect(byId.requestedDay!.summary).toContain("Chủ Nhật");
    expect(byId.requestedDay!.summary).toContain("06:00–17:00");
    expect(byId.ticketPrice).toBeNull();
    expect(byId.ticketPriceNote).toContain("chưa có giá vé trong dữ liệu");
  });

  it("resolves weekday from ISO date (2026-12-20 = Sunday), merges overlapping intervals, and returns catalog ticketPrice when present", async () => {
    const tools = createTripsageChatTools({
      planning: { candidates: async () => [NHO_QUE, LUNG_CU], routes: EMPTY_ROUTES, now: () => new Date("2026-11-23T05:00:00Z") },
      emitItinerary: () => {},
    });

    const byDate = await tools.getDestinationInfo.execute!(
      { destinationId: "Cột cờ Lũng Cú", date: "2026-12-20" },
      { toolCallId: "g2", messages: [], context: {} },
    ) as {
      ok: boolean;
      name: string;
      requestedDay?: { dayOfWeek: string; intervals: string[]; summary: string };
      ticketPrice: string | null;
    };

    expect(byDate.ok).toBe(true);
    expect(byDate.name).toBe("Cột cờ Lũng Cú");
    expect(byDate.requestedDay!.dayOfWeek).toBe("SUNDAY");
    expect(byDate.requestedDay!.intervals).toEqual(["05:00–17:00"]);
    expect(byDate.ticketPrice).toBe("40.000đ/người lớn");
  });

  it("resolves short code D1 and returns CLOSED when destination is closed on that weekday", async () => {
    const tools = createTripsageChatTools({
      planning: { candidates: async () => [NHO_QUE, LUNG_CU], routes: EMPTY_ROUTES, now: () => new Date("2026-11-23T05:00:00Z") },
      emitItinerary: () => {},
    });

    await tools.listDestinations.execute!({}, { toolCallId: "l1", messages: [], context: {} });
    const res = await tools.getDestinationInfo.execute!(
      { destinationId: "D2", dayOfWeek: "MONDAY" },
      { toolCallId: "g3", messages: [], context: {} },
    ) as { ok: boolean; requestedDay?: { status: string; summary: string } };

    expect(res.ok).toBe(true);
    expect(res.requestedDay!.status).toBe("CLOSED");
    expect(res.requestedDay!.summary).toContain("Đóng cửa");
  });

  it("instructs persona to use getDestinationInfo for opening hours/tickets and disambiguate references like 'điểm thứ 2'", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("getDestinationInfo");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toContain("chưa có giá vé trong dữ liệu");
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/điểm thứ 2|mơ hồ/iu);
  });
});
