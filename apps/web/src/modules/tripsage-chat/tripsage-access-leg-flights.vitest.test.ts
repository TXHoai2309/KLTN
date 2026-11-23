import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import { TripsageAccessLegCard } from "../../components/tripsage-chat/tripsage-access-leg-card";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { accessLegInputSchema, accessLegPartSchema, buildAccessLeg, type AccessLegPart } from "./tripsage-access-leg";
import { buildTripsageChatBody, type TripsageTripInfo } from "./tripsage-chat-context";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";
import { readPriceReferenceTransportSection } from "./tripsage-price-reference";
import type { FlightLookup } from "./tripsage-serpapi-flights";

let seq = 0;
const auth = () => ({
  database: { user: { findUnique: async () => ({ id: `access-${seq}`, role: "TRAVELER", status: "ACTIVE" }) } },
  resolveSession: async () => ({ user: { id: `access-${++seq}` } }),
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

const DANANG_JOURNEY = {
  origin: { label: "Đà Nẵng", latitude: 16.0544, longitude: 108.2022, source: "STADIA" as const, confirmed: true as const },
  departureMinute: 420,
  returnDeadlineMinute: 1080,
  returnDepartureMinute: null,
};

const REMOTE_INFO: TripsageTripInfo = {
  transport: "MOTORCYCLE",
  durationDays: 4,
  startDate: "2026-11-20",
  travelers: 2,
  homeCity: "Đà Nẵng",
};

const planning = (longOutbound = false): (() => TripsagePlanningDeps) => () => ({
  candidates: async () => [planningCandidate("a"), planningCandidate("b")],
  routes: {
    route: fixtureRoutes.route,
    coordinateRoute: async () => ({
      status: "VERIFIED",
      reason: null,
      durationSeconds: longOutbound ? 48_000 : 3_600,
      distanceMeters: longOutbound ? 800_000 : 50_000,
      provider: "STADIA_MAPS",
    }),
  },
  now: () => planningNow,
});

type SsePart = { type: string; id?: string; data?: Record<string, unknown> };
const parseSse = (sse: string): SsePart[] =>
  sse.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)) as SsePart);

async function runChat(
  steps: Step[],
  options: {
    flights?: FlightLookup;
    flightsOn?: boolean;
    longOutbound?: boolean;
    tripInfo?: TripsageTripInfo | null;
    journey?: typeof DANANG_JOURNEY | null;
    messages?: unknown[];
  } = {},
) {
  const model = scripted(steps);
  const body = {
    messages: options.messages ?? [{ id: "u1", role: "user", parts: [{ type: "text", text: "Đi Hà Giang 4 ngày từ Đà Nẵng" }] }],
    journey: options.journey === undefined ? DANANG_JOURNEY : options.journey,
    tripInfo: options.tripInfo === undefined ? REMOTE_INFO : options.tripInfo,
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
      env: { TRIPSAGE_CHAT_ENABLED: "true", TRIPSAGE_FEATURE_FLIGHTS: String(options.flightsOn ?? true) },
      admit: createPlanningAdmission(),
      planning: planning(options.longOutbound ?? false),
      flights: options.flights ? () => options.flights : undefined,
    },
  );
  expect(response.status).toBe(200);
  const sse = await response.text();
  return { sse, parts: parseSse(sse), model };
}

describe("Ticket 05: access-leg mode question, live flight price injection, and source labels", () => {
  it("loads the transport price reference table from docs/fixtures/price-reference-ha-giang.md without fabricating routes", () => {
    const table = readPriceReferenceTransportSection();
    expect(table).toBeTruthy();
    expect(table).toContain("Xe khách giường nằm Hà Nội ⇄ TP Hà Giang");
    expect(table).toContain("Xăng RON 95");
  });

  it("instructs asking transport mode once on hubHint without assuming flights and makes 0 flight requests", async () => {
    const flightLookup = vi.fn<FlightLookup>();
    const { model } = await runChat([
      { tool: "proposeItinerary", input: { selection: { days: [["a"], ["b"], [], []] } } },
      { text: "Bạn muốn ra Hà Nội bằng máy bay, tàu hỏa hay xe khách? (hoặc để mình so sánh giúp)" },
    ], { flights: flightLookup, longOutbound: true });

    expect(flightLookup).not.toHaveBeenCalled();
    const toolResult = JSON.stringify(model.doStreamCalls[1]!.prompt);
    expect(toolResult).toContain("hubHint");
    expect(toolResult).toContain("máy bay, tàu hỏa hay xe khách");
    const systemPrompt = model.doStreamCalls[0]!.prompt.filter(m => m.role === "system").map(m => m.content).join("\n");
    expect(systemPrompt).toContain("Xe khách giường nằm Hà Nội ⇄ TP Hà Giang");
  });

  it("keeps 0 flight requests and ESTIMATE labels when traveler chooses train or declines flying", async () => {
    const flightLookup = vi.fn<FlightLookup>();
    const { parts, model } = await runChat([
      { tool: "recordTripInfo", input: { flightDeclined: true } },
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_NOI",
          outbound: [{ mode: "TRAIN", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 960, priceVndPerPerson: 750_000 }],
          return: [{ mode: "TRAIN", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 960, priceVndPerPerson: 750_000 }],
        },
      },
      { text: "Mình đã ước tính chặng tàu hỏa." },
    ], { flights: flightLookup });

    expect(flightLookup).not.toHaveBeenCalled();
    expect(JSON.stringify(model.doStreamCalls[2]!.prompt)).toContain("FLIGHT_DECLINED");

    const legPart = parts.find(p => p.type === "data-access-leg")?.data as AccessLegPart | undefined;
    expect(legPart).toBeTruthy();
    expect(legPart!.outbound[0]!.priceSource).toBe("ESTIMATE");
    expect(legPart!.return[0]!.priceSource).toBe("ESTIMATE");
  });

  it("overrides FLIGHT segment prices with cheapest SerpApi price / travelers and GOOGLE_FLIGHTS source while keeping SLEEPER_BUS as ESTIMATE", async () => {
    const flightLookup = vi.fn<FlightLookup>(async () => ({
      status: "RESULTS",
      roundTrip: true,
      offers: [
        {
          price: { total: "4400000", currency: "VND" }, // 2 adults round-trip -> 2,200,000 VND/person round-trip -> 1,100,000/leg
          itineraries: [{
            connections: 0,
            segments: [{
              from: "DAD",
              to: "HAN",
              departAt: "2026-11-20T08:00:00",
              arriveAt: "2026-11-20T09:30:00",
              airline: "Vietnam Airlines",
              flight: "VN162",
            }],
          }],
        },
      ],
    }));

    // Model cannot pass priceSource directly on input
    expect(accessLegInputSchema.safeParse({
      hubId: "HA_GIANG_CITY",
      outbound: [{ mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 1_500_000, priceSource: "GOOGLE_FLIGHTS" }],
      return: [{ mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 1_500_000 }],
    }).success).toBe(false);

    const { parts } = await runChat([
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_GIANG_CITY",
          outbound: [
            { mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 9_999_999 },
            { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000 },
          ],
          return: [
            { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000 },
            { mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 9_999_999 },
          ],
        },
      },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 1_000_000 }] } },
      { text: "Đã cập nhật chặng tiếp cận với giá vé tham khảo." },
    ], { flights: flightLookup });

    expect(flightLookup).toHaveBeenCalledTimes(1);
    const legPart = parts.find(p => p.type === "data-access-leg")?.data as AccessLegPart | undefined;
    expect(legPart).toBeTruthy();
    // 4,400,000 / 2 travelers = 2,200,000 round-trip per person -> 1,100,000 outbound + 1,100,000 return
    expect(legPart!.outbound[0]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS" });
    expect(legPart!.outbound[1]).toMatchObject({ mode: "SLEEPER_BUS", priceVndPerPerson: 300_000, priceSource: "ESTIMATE" });
    expect(legPart!.return[0]).toMatchObject({ mode: "SLEEPER_BUS", priceVndPerPerson: 300_000, priceSource: "ESTIMATE" });
    expect(legPart!.return[1]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS" });
    // Total: (1,100,000 + 300,000 + 300,000 + 1,100,000) * 2 = 5,600,000
    expect(legPart!.totalVnd).toBe(5_600_000);

    // estimateCosts receives the updated access leg total via its existing line
    const costPart = parts.find(p => p.type === "data-cost")?.data as { lines?: { label: string; amount: number }[] } | undefined;
    expect(costPart?.lines?.find(l => l.label === "Chặng tiếp cận (đi và về)")?.amount).toBe(5_600_000);
  });

  it("normalizes a 1-adult Google Flights lookup to per-person price for a 4-traveler group and matches cost table + current leg id (Bug G)", async () => {
    // Direct unit check: lookup searched with adults=1 (2,200,000 VND round-trip/person), group has 4 travelers
    const directLeg = buildAccessLeg(
      {
        hubId: "HA_GIANG_CITY",
        outbound: [
          { mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
          { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000 },
        ],
        return: [
          { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000 },
          { mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
        ],
      },
      "Đà Nẵng",
      4,
      { totalVnd: 2_200_000, adults: 1, roundTrip: true, lookupDate: "2026-11-23" },
    );
    expect(directLeg.outbound[0]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS" });
    expect(directLeg.return[1]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS" });
    expect(directLeg.totalVnd).toBe((1_100_000 + 300_000) * 2 * 4);

    // End-to-end chat flow: 4 travelers from Đà Nẵng, searchFlights called with adults=1 on Ngày đi (11/12 -> 15/12 for 12/12 4-day trip)
    const flightLookup = vi.fn<FlightLookup>(async () => ({
      status: "RESULTS",
      roundTrip: true,
      offers: [
        {
          price: { total: "2400000", currency: "VND" }, // 1 adult round-trip = 2,400,000 -> 1,200,000/leg
          itineraries: [{
            connections: 0,
            segments: [{
              from: "DAD",
              to: "HAN",
              departAt: "2026-12-11T18:00:00",
              arriveAt: "2026-12-11T19:30:00",
              airline: "VietJet",
              flight: "VJ518",
            }],
          }],
        },
      ],
    }));

    const { parts } = await runChat([
      { tool: "searchFlights", input: { departureDate: "2026-12-11", returnDate: "2026-12-15", adults: 1 } },
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_GIANG_CITY",
          outbound: [
            { mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
            { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000 },
          ],
          return: [
            { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000 },
            { mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
          ],
        },
      },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 3_200_000 }], budgetCap: 20_000_000 } },
      { text: "Đã áp giá vé máy bay Google Flights vào chặng tiếp cận." },
    ], {
      flights: flightLookup,
      tripInfo: { transport: "MOTORCYCLE", durationDays: 4, startDate: "2026-12-12", travelers: 4, homeCity: "Đà Nẵng" },
    });

    const legPart = parts.find(p => p.type === "data-access-leg")?.data as AccessLegPart | undefined;
    expect(legPart).toBeTruthy();
    expect(legPart!.travelers).toBe(4);
    expect(legPart!.outbound[0]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_200_000, priceSource: "GOOGLE_FLIGHTS" });
    expect(legPart!.return[1]).toMatchObject({ mode: "FLIGHT", priceVndPerPerson: 1_200_000, priceSource: "GOOGLE_FLIGHTS" });
    // (1,200,000 + 300,000) * 2 * 4 = 12,000,000
    expect(legPart!.totalVnd).toBe(12_000_000);

    const costPart = parts.find(p => p.type === "data-cost")?.data as { accessLegId?: string; lines?: { label: string; amount: number }[] } | undefined;
    expect(costPart?.accessLegId).toBe(legPart!.id);
    expect(costPart?.lines?.find(l => l.label === "Chặng tiếp cận (đi và về)")?.amount).toBe(12_000_000);

    // Also verify when planAccessLeg ran BEFORE searchFlights in the same turn: access leg refreshes automatically
    const lateLookup = await runChat([
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_GIANG_CITY",
          outbound: [
            { mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
            { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000 },
          ],
          return: [
            { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000 },
            { mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 2_500_000 },
          ],
        },
      },
      { tool: "searchFlights", input: { departureDate: "2026-12-11", returnDate: "2026-12-15", adults: 1 } },
      { tool: "estimateCosts", input: { lines: [{ category: "food", label: "Ăn uống", amount: 3_200_000 }], budgetCap: 20_000_000 } },
      { text: "Đã cập nhật giá vé máy bay." },
    ], {
      flights: flightLookup,
      tripInfo: { transport: "MOTORCYCLE", durationDays: 4, startDate: "2026-12-12", travelers: 4, homeCity: "Đà Nẵng" },
    });
    const legs = lateLookup.parts.filter(p => p.type === "data-access-leg").map(p => p.data as AccessLegPart);
    expect(legs).toHaveLength(2);
    const latestLeg = legs.at(-1)!;
    expect(latestLeg.outbound[0]?.priceSource).toBe("GOOGLE_FLIGHTS");
    expect(latestLeg.totalVnd).toBe(12_000_000);
    const lateCost = lateLookup.parts.find(p => p.type === "data-cost")?.data as { accessLegId?: string; lines?: { label: string; amount: number }[] } | undefined;
    expect(lateCost?.accessLegId).toBe(latestLeg.id);
    expect(lateCost?.lines?.find(l => l.label === "Chặng tiếp cận (đi và về)")?.amount).toBe(12_000_000);
  });

  it("keeps ESTIMATE when flight lookup fails (UNAVAILABLE) and enforces max 1 proactive lookup unless date/origin changes", async () => {
    const failLookup = vi.fn<FlightLookup>(async () => ({ status: "UNAVAILABLE" }));
    const failed = await runChat([
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      {
        tool: "planAccessLeg",
        input: {
          hubId: "HA_NOI",
          outbound: [{ mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 1_600_000 }],
          return: [{ mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 1_600_000 }],
        },
      },
      { text: "Chưa tra được vé máy bay, tạm dùng mức ước tính." },
    ], { flights: failLookup });

    const failedLeg = failed.parts.find(p => p.type === "data-access-leg")?.data as AccessLegPart;
    expect(failedLeg.outbound[0]).toMatchObject({ priceVndPerPerson: 1_600_000, priceSource: "ESTIMATE" });

    // Cross-turn cap: 1st lookup succeeds; repeating identical params -> 0 new calls; changing date -> 1 new call; 3rd distinct -> FLIGHT_LIMIT
    const okLookup = vi.fn<FlightLookup>(async () => ({
      status: "RESULTS",
      roundTrip: true,
      offers: [{
        price: { total: "4000000", currency: "VND" },
        itineraries: [{ connections: 0, segments: [{ from: "DAD", to: "HAN", departAt: "2026-11-20T08:00:00", arriveAt: "2026-11-20T09:30:00", airline: "VietJet", flight: "VJ504" }] }],
      }],
    }));

    const turn1 = await runChat([
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      { text: "Đã tra xong." },
    ], { flights: okLookup });
    expect(okLookup).toHaveBeenCalledTimes(1);

    const flightPart = turn1.parts.find(p => p.type === "data-flights")!;
    const turn2Body = buildTripsageChatBody({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Tra vé giúp mình" }] },
        { id: "a1", role: "assistant", parts: [flightPart, { type: "text", text: "Đã tra xong." }] },
        { id: "u2", role: "user", parts: [{ type: "text", text: "Đổi sang ngày 25/11" }] },
      ],
      journey: DANANG_JOURNEY,
      tripInfo: { ...REMOTE_INFO, startDate: "2026-11-25" },
      itinerary: null,
    });

    const turn2 = await runChat([
      // Same params as turn 1 -> deduplicated (0 calls)
      { tool: "searchFlights", input: { departureDate: "2026-11-20", returnDate: "2026-11-23", adults: 2 } },
      // Changed date -> allowed 1 additional lookup
      { tool: "searchFlights", input: { departureDate: "2026-11-25", returnDate: "2026-11-28", adults: 2 } },
      // 3rd distinct lookup -> blocked by FLIGHT_LIMIT
      { tool: "searchFlights", input: { departureDate: "2026-12-01", returnDate: "2026-12-04", adults: 2 } },
      { text: "Đã tra lại cho ngày mới." },
    ], { flights: okLookup, messages: turn2Body.messages });

    expect(okLookup).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(turn2.model.doStreamCalls[3]!.prompt)).toContain("FLIGHT_LIMIT");
  });

  it("renders GOOGLE_FLIGHTS and ESTIMATE source labels and keeps legacy saved AccessLegPart rendering as 'ước tính'", () => {
    const mixedLeg: AccessLegPart = {
      hubName: "TP Hà Giang",
      homeCity: "Đà Nẵng",
      travelers: 2,
      outbound: [
        { mode: "FLIGHT", from: "Đà Nẵng", to: "Hà Nội", durationMinutes: 90, priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS", priceLookupDate: "2026-11-20" },
        { mode: "SLEEPER_BUS", from: "Hà Nội", to: "TP Hà Giang", durationMinutes: 390, priceVndPerPerson: 300_000, priceSource: "ESTIMATE" },
      ],
      return: [
        { mode: "SLEEPER_BUS", from: "TP Hà Giang", to: "Hà Nội", durationMinutes: 390, priceVndPerPerson: 300_000, priceSource: "ESTIMATE" },
        { mode: "FLIGHT", from: "Hà Nội", to: "Đà Nẵng", durationMinutes: 90, priceVndPerPerson: 1_100_000, priceSource: "GOOGLE_FLIGHTS", priceLookupDate: "2026-11-20" },
      ],
      outboundMinutes: 480,
      returnMinutes: 480,
      totalVnd: 5_600_000,
    };
    expect(accessLegPartSchema.safeParse(mixedLeg).success).toBe(true);
    const mixedHtml = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: mixedLeg })).replaceAll("\u00a0", " ");
    expect(mixedHtml).toContain("giá tham khảo từ Google Flights");
    expect(mixedHtml).toContain("20/11/2026");
    expect(mixedHtml).toContain("ước tính");
    expect(mixedHtml).toContain("Giá tham khảo từ Google (qua SerpApi), có thể thay đổi. Ứng dụng không đặt chỗ.");

    // Legacy saved AccessLegPart without priceSource
    const legacyLeg = buildAccessLeg({
      hubId: "HA_NOI",
      outbound: [{ mode: "TRAIN", from: "Huế", to: "Hà Nội", durationMinutes: 840, priceVndPerPerson: 650_000 }],
      return: [{ mode: "TRAIN", from: "Hà Nội", to: "Huế", durationMinutes: 840, priceVndPerPerson: 650_000 }],
    }, "Huế", 2);
    // Strip priceSource to simulate old DB record
    const oldSaved = {
      ...legacyLeg,
      outbound: legacyLeg.outbound.map(({ priceSource: _, priceLookupDate: __, ...rest }) => rest),
      return: legacyLeg.return.map(({ priceSource: _, priceLookupDate: __, ...rest }) => rest),
    };
    expect(accessLegPartSchema.safeParse(oldSaved).success).toBe(true);
    const legacyHtml = renderToStaticMarkup(createElement(TripsageAccessLegCard, { leg: oldSaved as AccessLegPart })).replaceAll("\u00a0", " ");
    expect(legacyHtml).toContain("ước tính");
    expect(legacyHtml).not.toContain("Google Flights");
  });
});
