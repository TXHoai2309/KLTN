import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, rmdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TripsageMemoryPanel } from "../../components/tripsage-chat/tripsage-memory-panel";
import { fixtureRoutes, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { createOpenAiEmbeddingProvider } from "../rag-processing/openai-embedding-provider";
import { EMBEDDING_PROVENANCE } from "../rag-processing/embedding-contract";
import { tripCalendarResponse } from "../trip-read/trip-read-http";
import type { TripReadDependencies } from "../trip-read/trip-read-service";
import { memoriesResponse } from "../tripsage-memory/memory-http";
import { createMemoryService } from "../tripsage-memory/memory-service";
import { fakeMemoryStore } from "../tripsage-memory/memory-test-fixtures";
import { createAmadeusHotelLookup } from "./tripsage-amadeus";
import { tripsageChatResponse, type TripsageChatHttpDependencies } from "./tripsage-chat-http";
import { createDuffelFlightLookup } from "./tripsage-duffel";
import { enabledTripsageFeatures } from "./tripsage-features";

const flagCases = [
  { group: "budget", flag: "TRIPSAGE_FEATURE_BUDGET", tools: ["checkBudget"], part: "data-budget" },
  { group: "flights", flag: "TRIPSAGE_FEATURE_FLIGHTS", tools: ["searchFlights"], part: "data-flights" },
  { group: "hotels", flag: "TRIPSAGE_FEATURE_HOTELS", tools: ["searchHotels"], part: "data-hotels" },
  { group: "memory", flag: "TRIPSAGE_FEATURE_MEMORY", tools: ["rememberPreference", "recallMemories"] },
  { group: "calendar", flag: "TRIPSAGE_FEATURE_CALENDAR", tools: [] },
] as const;
const baseTools = ["fetchPage", "listDestinations", "proposeItinerary", "searchPlaces", "webSearch"];
const originalPromptHash = "49f3fa29ac1aed4fe5cca4c41247b91148a1377fcffc717c0a67969e62bf41bd";

type FlagEnv = Record<string, string | undefined>;
type ToolCall = { name: string; input: unknown };
const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};
const date = "2026-11-20";
const calls = {
  budget: { name: "checkBudget", input: { currency: "VND", travelers: 1, durationDays: 1, allocations: [{ category: "food", amount: 100000 }] } },
  flights: { name: "searchFlights", input: { origin: "SGN", destination: "HAN", departureDate: date } },
  hotels: { name: "searchHotels", input: { destinationId: "a", checkInDate: date, checkOutDate: "2026-11-21" } },
  memory: { name: "rememberPreference", input: { content: "Tôi ăn chay", kind: "PREFERENCE" } },
} satisfies Record<string, ToolCall>;

const tripDate = new Date(date + "T00:00:00Z");
const authorization = {
  resolveSession: async () => ({ user: { id: "fixture-owner" } }),
  database: {
    user: { findUnique: async () => ({ id: "fixture-owner", role: "TRAVELER", status: "ACTIVE" }) },
    trip: { findFirst: async () => ({
      id: "fixture-trip", userId: "fixture-owner", startDate: tripDate, durationDays: 1, transport: "CAR", favorites: [],
      days: [{ id: "fixture-day", dayIndex: 1, localDate: tripDate, _count: { visits: 1 }, visits: [{
        id: "fixture-stop", order: 1, startMinute: 480, plannedDurationMinutes: 60,
        destination: { id: "a", name: "Điểm mẫu", area: "Đồng Văn", address: null, visibility: "VISIBLE" },
      }] }],
    }) },
  },
} as unknown as TripReadDependencies;

const origin = "https://app.test";
const memoryRequest = () => new Request(origin + "/api/ai/memories");
const calendarRequest = () => new Request(origin + "/api/trips/fixture-trip/calendar");
const deps = {
  authorization,
  planning: () => ({ candidates: async () => [planningCandidate("a")], routes: fixtureRoutes, now: () => planningNow }),
  flights: () => async () => ({
    status: "RESULTS", offers: [{
      price: { total: "100.12", currency: "USD" },
      itineraries: [{ connections: 0, segments: [{ from: "SGN", to: "HAN", departAt: date + "T08:00:00", arriveAt: date + "T10:00:00", airline: "Hãng mẫu", flight: "VN120" }] }],
    }],
  }),
  hotels: () => async () => ({
    status: "RESULTS", offers: [{
      hotelId: "HG000001", name: "Khách sạn mẫu", distanceKm: null, room: null, price: { total: "50.00", currency: "USD" },
      checkInDate: date, checkOutDate: "2026-11-21",
    }],
  }),
} satisfies Partial<TripsageChatHttpDependencies>;

function scripted(toolCalls: ToolCall[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const call = toolCalls[index++];
      const chunks = call
        ? [{ type: "tool-call", toolCallId: "fixture-call-" + index, toolName: call.name, input: JSON.stringify(call.input) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
        : [{ type: "text-start", id: "fixture-text" }, { type: "text-delta", id: "fixture-text", delta: "Đã nhận yêu cầu." },
          { type: "text-end", id: "fixture-text" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
      return { stream: simulateReadableStream({ chunks: chunks as never[] }) };
    },
  });
}

const createMemory = () => createMemoryService(fakeMemoryStore(), {
  ...EMBEDDING_PROVENANCE,
  embed: async () => [{ index: 0, embedding: [1, ...Array<number>(1535).fill(0)] }],
});

async function chat(env: FlagEnv, toolCalls: ToolCall[] = [], overrides: Partial<TripsageChatHttpDependencies> = {}) {
  const model = scripted(toolCalls);
  const response = await tripsageChatResponse(new Request(origin + "/api/ai/chat", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ id: "fixture-message", role: "user", parts: [{ type: "text", text: "Tôi ăn chay" }] }] }),
  }), { ...deps, env, model: async () => model, admit: createPlanningAdmission(), ...overrides });
  expect(response.status).toBe(200);
  const stream = await response.text();
  const { tools, prompt } = model.doStreamCalls[0]!;
  return {
    model, stream,
    tools: tools?.map(tool => tool.name).sort(),
    system: prompt.filter(message => message.role === "system").map(message => message.content).join("\n"),
  };
}

const cases = Array.from({ length: 32 }, (_, mask) => {
  const enabled = flagCases.filter((_, index) => mask & (1 << index));
  return [enabled.map(({ group }) => group).join(" + ") || "all off", enabled] as const;
});

afterEach(() => vi.unstubAllEnvs());

describe("TripSage five-flag acceptance matrix", () => {
  it.each(cases)("exposes exactly the enabled tools, data parts and private routes for %s", async (_, enabled) => {
    const flags: FlagEnv = { TRIPSAGE_CHAT_ENABLED: "true" };
    for (const item of flagCases) flags[item.flag] = enabled.includes(item) ? "true" : "false";
    const memoryOn = flags.TRIPSAGE_FEATURE_MEMORY === "true";
    const calendarOn = flags.TRIPSAGE_FEATURE_CALENDAR === "true";
    const memory = vi.fn(createMemory);
    const result = await chat(flags, enabled.flatMap(item => "part" in item ? [calls[item.group]] : []), { memory });
    expect(result.tools).toEqual([...baseTools, ...enabled.flatMap(item => [...item.tools])].sort());
    for (const item of flagCases) {
      for (const tool of item.tools) expect(result.system.includes(tool)).toBe(enabled.includes(item));
      if ("part" in item) expect(result.stream.includes('"type":"' + item.part + '"')).toBe(enabled.includes(item));
    }
    if (!enabled.some(item => item.tools.length > 0)) {
      expect(createHash("sha256").update(result.system).digest("hex")).toBe(originalPromptHash);
    }
    expect(memory).not.toHaveBeenCalled();
    const memoryResult = await memoriesResponse(memoryRequest(), { authorization, memory, env: flags });
    expect(memoryResult.status).toBe(memoryOn ? 200 : 404);
    expect(memory.mock.calls).toHaveLength(memoryOn ? 1 : 0);
    const html = renderToStaticMarkup(createElement(TripsageMemoryPanel, { enabled: enabledTripsageFeatures(flags).has("memory") }));
    expect(html.includes("Bộ nhớ của tôi")).toBe(memoryOn);

    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", flags.TRIPSAGE_FEATURE_CALENDAR);
    const calendar = await tripCalendarResponse(calendarRequest(), "fixture-trip", authorization, tripDate);
    expect(calendar.status).toBe(calendarOn ? 200 : 404);
    expect((await calendar.text()).includes("BEGIN:VEVENT")).toBe(calendarOn);
  });

  it.each(["TRUE", "1", " true"])("treats %j as off across chat, memory and calendar", async value => {
    const flags: FlagEnv = { TRIPSAGE_CHAT_ENABLED: "true" };
    for (const item of flagCases) flags[item.flag] = value;
    const response = await chat(flags);
    expect(response.tools).toEqual(baseTools);
    expect(createHash("sha256").update(response.system).digest("hex")).toBe(originalPromptHash);
    expect((await memoriesResponse(memoryRequest(), { authorization, memory: createMemory, env: flags })).status).toBe(404);
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", value);
    expect((await tripCalendarResponse(calendarRequest(), "fixture-trip", authorization, tripDate)).status).toBe(404);
    expect(enabledTripsageFeatures(flags).size).toBe(0);
  });

  it("preserves exact flag strings through the production Next.js Varlock loader", async () => {
    const keys = flagCases.map(({ flag }) => flag);
    const overrides = Object.fromEntries(keys.map((key, index) => [key, ["TRUE", "1", " true", "true ", "true"][index]]));
    const fixture = await mkdtemp(join(tmpdir(), "kltn-feature-flags-"));
    const schema = join(fixture, ".env.schema");
    const nextEnv = createRequire(import.meta.url).resolve("@next/env");
    const load = [
      "const [nextEnv, ...keys] = process.argv.slice(1);",
      "require(nextEnv).loadEnvConfig(process.cwd(), false);",
      "process.stdout.write('\\nP6_FLAGS:' + JSON.stringify(Object.fromEntries(keys.map(key => [key, process.env[key]]))));",
    ].join("\n");
    try {
      await copyFile(new URL("../../../.env.schema", import.meta.url), schema);
      const { stdout } = await promisify(execFile)(process.execPath, ["-e", load, nextEnv, ...keys], {
        cwd: fixture,
        timeout: 15_000,
        env: {
          PATH: [fileURLToPath(new URL("../../../../../node_modules/.bin", import.meta.url)), process.env.PATH].join(delimiter),
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "production",
          DO_NOT_TRACK: "1",
          DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/feature_flags",
          BETTER_AUTH_URL: "http://127.0.0.1",
          BETTER_AUTH_SECRET: "feature-flag-test-fixture-not-a-secret",
          ...overrides,
        },
      });
      expect(stdout).toContain("P6_FLAGS:");
      const loaded = JSON.parse(stdout.split("P6_FLAGS:").at(-1)!) as FlagEnv;
      expect(loaded).toEqual(overrides);
      expect([...enabledTripsageFeatures(loaded)]).toEqual(["calendar"]);
    } finally {
      await rm(schema, { force: true });
      await rmdir(fixture);
    }
  }, 20_000);

  it("uses changed flags on two successive requests without reloading the modules", async () => {
    const flags: FlagEnv = { TRIPSAGE_CHAT_ENABLED: "true" };
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", undefined);
    expect((await chat(flags)).tools).toEqual(baseTools);
    expect((await memoriesResponse(memoryRequest(), { authorization, memory: createMemory, env: flags })).status).toBe(404);
    expect((await tripCalendarResponse(calendarRequest(), "fixture-trip", authorization, tripDate)).status).toBe(404);
    for (const item of flagCases) flags[item.flag] = "true";
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    expect((await chat(flags)).tools).toEqual([...baseTools, ...flagCases.flatMap(item => [...item.tools])].sort());
    expect((await memoriesResponse(memoryRequest(), { authorization, memory: createMemory, env: flags })).status).toBe(200);
    expect((await tripCalendarResponse(calendarRequest(), "fixture-trip", authorization, tripDate)).status).toBe(200);
  });

  it.each([
    ["Duffel", "Dịch vụ tra cứu vé máy bay chưa sẵn sàng", "flights"],
    ["Amadeus", "Dịch vụ tra cứu khách sạn chưa sẵn sàng", "hotels"],
    ["embedding", "Bộ nhớ chưa sẵn sàng", "memory"],
  ] as const)("keeps the other four groups ready when %s credentials are missing", async (_, message, missing) => {
    const flags: FlagEnv = { TRIPSAGE_CHAT_ENABLED: "true" };
    for (const item of flagCases) flags[item.flag] = "true";
    const fetcher = vi.fn<typeof fetch>();
    const memory = missing === "memory"
      ? createMemoryService(fakeMemoryStore(), createOpenAiEmbeddingProvider({ apiKey: () => undefined, fetcher }))
      : createMemory();
    const overrides: Partial<TripsageChatHttpDependencies> = { memory: () => memory };
    if (missing === "flights") overrides.flights = () => createDuffelFlightLookup({ accessToken: () => undefined, fetcher });
    if (missing === "hotels") overrides.hotels = () => createAmadeusHotelLookup({ clientId: () => undefined, clientSecret: () => undefined, fetcher });
    const { model, stream } = await chat(flags, Object.values(calls), overrides);
    expect(JSON.stringify(model.doStreamCalls.at(-1)?.prompt)).toContain(message);
    expect(stream).toContain('"type":"data-budget"');
    expect(stream.includes('"type":"data-flights"')).toBe(missing !== "flights");
    expect(stream.includes('"type":"data-hotels"')).toBe(missing !== "hotels");
    expect(await memory.list({ userId: "fixture-owner" })).toHaveLength(missing === "memory" ? 0 : 1);
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    expect((await tripCalendarResponse(calendarRequest(), "fixture-trip", authorization, tripDate)).status).toBe(200);
  });
});
