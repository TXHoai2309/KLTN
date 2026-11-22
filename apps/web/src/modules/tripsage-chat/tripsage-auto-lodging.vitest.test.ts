import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { buildTripsageChatBody, type TripsageTripInfo } from "./tripsage-chat-context";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import type { HotelLookup, HotelQuery } from "./tripsage-serpapi-hotels";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `lodging-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `lodging-${++seq}` } }),
}) as unknown as AuthorizationDependencies;

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

type Step = { tool: string; input: unknown } | { text: string };
function scripted(steps: Step[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      const chunks = "tool" in step
        ? [{ type: "tool-call", toolCallId: `c${call}`, toolName: step.tool, input: JSON.stringify(step.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
        : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
    },
  });
}

const DEST_DV = { ...planningCandidate("dv"), name: "Phố cổ Đồng Văn", area: "Đồng Văn", latitude: 23.2775, longitude: 105.3632 };
const DEST_MV = { ...planningCandidate("mv"), name: "Thị trấn Mèo Vạc", area: "Mèo Vạc", latitude: 23.1641, longitude: 105.4095 };
const DEST_DG = { ...planningCandidate("dg"), name: "Làng Du Già", area: "Yên Minh", latitude: 22.9278, longitude: 105.2361 };

const planning = (): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [DEST_DV, DEST_MV, DEST_DG],
  routes: {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({ status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" }),
  },
  now: () => planningNow,
});

const CONFIRMED_INFO: TripsageTripInfo = {
  transport: "MOTORCYCLE",
  durationDays: 5,
  startDate: "2026-11-20",
  travelers: 2,
  lodgingKind: "HOMESTAY",
};

type SsePart = { type: string; id?: string; data?: Record<string, unknown> };
const parseSse = (sse: string): SsePart[] =>
  sse.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)) as SsePart);

async function runChat(
  steps: Step[],
  options: {
    hotels?: HotelLookup;
    hotelsOn?: boolean;
    tripInfo?: TripsageTripInfo | null;
    journey?: typeof COMPLETE_JOURNEY_FIXTURE | null;
    messages?: unknown[];
  } = {},
) {
  const model = scripted(steps);
  const body = {
    messages: options.messages ?? [{ id: "u1", role: "user", parts: [{ type: "text", text: "Xác nhận đi từ Hà Nội ngày 20/11, 2 người, ở homestay." }] }],
    journey: options.journey === undefined ? COMPLETE_JOURNEY_FIXTURE : options.journey,
    tripInfo: options.tripInfo === undefined ? CONFIRMED_INFO : options.tripInfo,
  };
  const response = await tripsageChatResponse(
    new Request("https://app.test/api/ai/chat", {
      method: "POST",
      headers: { origin: "https://app.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      authorization: auth(),
      model: async () => model,
      env: { TRIPSAGE_CHAT_ENABLED: "true", TRIPSAGE_FEATURE_HOTELS: String(options.hotelsOn ?? true) },
      admit: createPlanningAdmission(),
      planning: planning(),
      hotels: options.hotels ? () => options.hotels : undefined,
    },
  );
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, parts: parseSse(sse), model };
}

const okOffer = (query: HotelQuery) => ({
  status: "RESULTS" as const,
  offers: [{
    name: `Homestay ${query.nearName}`,
    distanceKm: 0.5,
    room: null,
    rating: 4.6,
    reviews: 30,
    price: { total: "800000", perNight: "400000", currency: query.currency },
    checkInDate: query.checkInDate,
    checkOutDate: query.checkOutDate,
  }],
});

describe("Ticket 03: auto lodging price lookup across the full confirmed itinerary", () => {
  it("merges consecutive nights at the same stop and runs 3 areas in parallel for a 4-night itinerary", async () => {
    let active = 0;
    let peakActive = 0;
    const seenQueries: HotelQuery[] = [];
    const hotelsLookup = vi.fn<HotelLookup>(async query => {
      seenQueries.push(query);
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active -= 1;
      return okOffer(query);
    });

    const { parts } = await runChat([
      {
        tool: "searchHotels",
        input: {
          stays: [
            { destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-21" },
            { destinationId: "dv", checkInDate: "2026-11-21", checkOutDate: "2026-11-22" },
            { destinationId: "mv", checkInDate: "2026-11-22", checkOutDate: "2026-11-23" },
            { destinationId: "dg", checkInDate: "2026-11-23", checkOutDate: "2026-11-24" },
          ],
          adults: 2,
          kind: "HOMESTAY",
        },
      },
      { text: "Mình đã tra giá tham khảo cho cả 3 khu nghỉ đêm." },
    ], { hotels: hotelsLookup });

    expect(hotelsLookup).toHaveBeenCalledTimes(3);
    expect(peakActive).toBeGreaterThanOrEqual(2);
    expect(seenQueries.map(q => [q.nearName, q.checkInDate, q.checkOutDate, q.kind])).toEqual([
      ["Phố cổ Đồng Văn", "2026-11-20", "2026-11-22", "HOMESTAY"],
      ["Thị trấn Mèo Vạc", "2026-11-22", "2026-11-23", "HOMESTAY"],
      ["Làng Du Già", "2026-11-23", "2026-11-24", "HOMESTAY"],
    ]);

    const hotelParts = parts.filter(p => p.type === "data-hotels");
    expect(hotelParts).toHaveLength(3);
    expect(hotelParts.map(p => p.data?.near)).toEqual(["Phố cổ Đồng Văn", "Thị trấn Mèo Vạc", "Làng Du Già"]);
    expect(hotelParts[0]?.data?.nights).toBe(2);
  });

  it("blocks searchHotels on an Assumed draft (origin or startDate unconfirmed) with 0 provider requests", async () => {
    const hotelsLookup = vi.fn<HotelLookup>(async query => okOffer(query));
    const { parts, model } = await runChat([
      {
        tool: "searchHotels",
        input: {
          stays: [{ destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-22" }],
          adults: 2,
          kind: "HOMESTAY",
        },
      },
      { text: "Bạn xác nhận ngày đi và nơi xuất phát trước nhé." },
    ], {
      hotels: hotelsLookup,
      tripInfo: { ...CONFIRMED_INFO, assumedFields: ["origin", "startDate"] },
    });

    expect(hotelsLookup).not.toHaveBeenCalled();
    expect(parts.filter(p => p.type === "data-hotels")).toHaveLength(0);
    const toolResult = JSON.stringify(model.doStreamCalls[1]!.prompt);
    expect(toolResult).toContain("ASSUMED_DRAFT_BLOCKED");
  });

  it("skips duplicate area lookups within the same turn and across turns via prior HotelsPart context", async () => {
    const hotelsLookup = vi.fn<HotelLookup>(async query => okOffer(query));

    // Turn 1: look up Đồng Văn twice in the same turn -> only 1 call
    const turn1 = await runChat([
      {
        tool: "searchHotels",
        input: {
          stays: [{ destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-22" }],
          adults: 2,
          kind: "HOMESTAY",
        },
      },
      {
        tool: "searchHotels",
        input: { destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-22", adults: 2, kind: "HOMESTAY" },
      },
      { text: "Đã tra Đồng Văn." },
    ], { hotels: hotelsLookup });

    expect(hotelsLookup).toHaveBeenCalledTimes(1);
    const emittedHotelPart = turn1.parts.find(p => p.type === "data-hotels")!;
    expect(emittedHotelPart).toBeTruthy();

    // Turn 2: pass the previous assistant message (compacted through buildTripsageChatBody) -> 0 new calls for same params, 1 new call for Mèo Vạc
    const compacted = buildTripsageChatBody({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Tra giá giúp mình" }] },
        { id: "a1", role: "assistant", parts: [emittedHotelPart, { type: "text", text: "Đã tra Đồng Văn." }] },
        { id: "u2", role: "user", parts: [{ type: "text", text: "Xem lại giá phòng" }] },
      ],
      journey: COMPLETE_JOURNEY_FIXTURE,
      tripInfo: CONFIRMED_INFO,
      itinerary: null,
    });

    const turn2 = await runChat([
      {
        tool: "searchHotels",
        input: {
          stays: [
            { destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-22" },
            { destinationId: "mv", checkInDate: "2026-11-22", checkOutDate: "2026-11-23" },
          ],
          adults: 2,
          kind: "HOMESTAY",
        },
      },
      { text: "Đã cập nhật thêm Mèo Vạc." },
    ], { hotels: hotelsLookup, messages: compacted.messages });

    expect(hotelsLookup).toHaveBeenCalledTimes(2);
    expect(turn2.parts.filter(p => p.type === "data-hotels").map(p => p.data?.near)).toEqual(["Thị trấn Mèo Vạc"]);
  });

  it("keeps cards for healthy areas when one area returns UNAVAILABLE", async () => {
    const hotelsLookup = vi.fn<HotelLookup>(async query => {
      if (query.nearName === "Thị trấn Mèo Vạc") return { status: "UNAVAILABLE" };
      return okOffer(query);
    });

    const { parts, model } = await runChat([
      {
        tool: "searchHotels",
        input: {
          stays: [
            { destinationId: "dv", checkInDate: "2026-11-20", checkOutDate: "2026-11-21" },
            { destinationId: "mv", checkInDate: "2026-11-21", checkOutDate: "2026-11-22" },
            { destinationId: "dg", checkInDate: "2026-11-22", checkOutDate: "2026-11-23" },
          ],
          adults: 2,
          kind: "ANY",
        },
      },
      { text: "Đồng Văn và Du Già có giá, Mèo Vạc tạm chưa tra được." },
    ], { hotels: hotelsLookup });

    expect(hotelsLookup).toHaveBeenCalledTimes(3);
    expect(parts.filter(p => p.type === "data-hotels").map(p => p.data?.near)).toEqual(["Phố cổ Đồng Văn", "Làng Du Già"]);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("UNAVAILABLE");
  });

  it("omits searchHotels and auto-lodging prompt when TRIPSAGE_FEATURE_HOTELS is off, and includes them when on", async () => {
    const off = await runChat([{ text: "Chào bạn." }], { hotelsOn: false });
    const offSystem = off.model.doStreamCalls[0]!.prompt.filter(m => m.role === "system").map(m => m.content).join("\n");
    const offTools = off.model.doStreamCalls[0]!.tools?.map(t => t.name) ?? [];
    expect(offTools).not.toContain("searchHotels");
    expect(offSystem).not.toContain("searchHotels");
    expect(offSystem).not.toContain("bản nháp giả định (khi nơi xuất phát hoặc ngày đi còn trong assumedFields)");

    const on = await runChat([{ text: "Chào bạn." }], { hotelsOn: true });
    const onSystem = on.model.doStreamCalls[0]!.prompt.filter(m => m.role === "system").map(m => m.content).join("\n");
    const onTools = on.model.doStreamCalls[0]!.tools?.map(t => t.name) ?? [];
    expect(onTools).toContain("searchHotels");
    expect(onSystem).toContain("searchHotels");
    expect(onSystem).toContain("lodgingKind");
  });
});
