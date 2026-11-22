import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { MAX_AI_HISTORY_TURN_CHARS, type AiChatHistoryTurn } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";
import { aiEditResponse, type AiEditHttpDependencies } from "./ai-edit-http";
import { createTripAssistantStructuredClient, resolveTripAssistantModel } from "./trip-assistant-openai";

const LIVE = process.env.TRIP_ASSISTANT_LIVE === "1";

function loadLocalOpenAiKey(): string | undefined {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^OPENAI_API_KEY\s*=\s*(.+)$/u.exec(trimmed);
      if (match) {
        return match[1]!.trim().replace(/^["']|["']$/gu, "");
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const revision = new Date("2026-11-20T12:00:00.000Z");
const timeReference = new Date("2026-11-21T03:00:00.000Z"); // 10:00 VN

const allOpen = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
].map((dayOfWeek) => ({
  dayOfWeek,
  status: "OPEN" as const,
  intervals: [{ opensAtMinute: 360, closesAtMinute: 1140 }], // 06:00 - 19:00
}));

const destinations = [
  {
    id: "dest-khau-vai-001",
    name: "Chợ tình Khâu Vai",
    area: "Mèo Vạc",
    category: "CULTURE",
    latitude: 23.0972,
    longitude: 105.4519,
    suggestedDurationMinutes: 90,
    minimumDurationMinutes: 45,
    isOutdoor: true,
    openingDays: allOpen,
  },
  {
    id: "dest-quan-ba-002",
    name: "Cổng Trời Quản Bạ",
    area: "Quản Bạ",
    category: "NATURE",
    latitude: 23.0639,
    longitude: 104.9854,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    isOutdoor: true,
    openingDays: allOpen,
  },
  {
    id: "dest-dong-van-003",
    name: "Phố cổ Đồng Văn",
    area: "Đồng Văn",
    category: "CULTURE",
    latitude: 23.2777,
    longitude: 105.3629,
    suggestedDurationMinutes: 90,
    minimumDurationMinutes: 45,
    isOutdoor: true,
    openingDays: allOpen,
  },
  {
    id: "dest-lung-cu-004",
    name: "Cột cờ Lũng Cú",
    area: "Đồng Văn",
    category: "LANDMARK",
    latitude: 23.3615,
    longitude: 105.3195,
    suggestedDurationMinutes: 75,
    minimumDurationMinutes: 45,
    isOutdoor: true,
    openingDays: allOpen,
  },
  {
    id: "dest-dinh-vua-meo-005",
    name: "Dinh thự Vua Mèo",
    area: "Đồng Văn",
    category: "CULTURE",
    latitude: 23.2512,
    longitude: 105.2633,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    isOutdoor: false,
    openingDays: allOpen,
  },
];

const tripRecord = {
  id: "trip-live-1",
  userId: "owner-live-1",
  startDate: new Date("2026-12-05T00:00:00.000Z"),
  durationDays: 3,
  transport: "CAR" as const,
  updatedAt: revision,
  manuallyCompletedAt: null,
  journeySnapshot: {
    revision: "journey-save-v1",
    journey: {
      origin: {
        label: "Hà Nội",
        latitude: 21.0285,
        longitude: 105.8542,
        source: "NOMINATIM",
        confirmed: true,
      },
      departureMinute: 300, // 05:00
      returnDeadlineMinute: 1320, // 22:00
      returnDepartureMinute: null,
    },
    plan: null,
  },
  days: [
    {
      dayIndex: 1,
      visits: [
        {
          id: "visit-d1-1",
          order: 1,
          startMinute: 690, // 11:30
          plannedDurationMinutes: 90,
          destination: { id: "dest-khau-vai-001", name: "Chợ tình Khâu Vai", area: "Mèo Vạc", visibility: "VISIBLE", deletedAt: null },
        },
      ],
    },
    {
      dayIndex: 2,
      visits: [
        {
          id: "visit-d2-1",
          order: 1,
          startMinute: 450, // 07:30
          plannedDurationMinutes: 75,
          destination: { id: "dest-lung-cu-004", name: "Cột cờ Lũng Cú", area: "Đồng Văn", visibility: "VISIBLE", deletedAt: null },
        },
        {
          id: "visit-d2-2",
          order: 2,
          startMinute: 585, // 09:45
          plannedDurationMinutes: 90,
          destination: { id: "dest-dong-van-003", name: "Phố cổ Đồng Văn", area: "Đồng Văn", visibility: "VISIBLE", deletedAt: null },
        },
      ],
    },
    {
      dayIndex: 3,
      visits: [
        {
          id: "visit-d3-1",
          order: 1,
          startMinute: 480, // 08:00
          plannedDurationMinutes: 60,
          destination: { id: "dest-quan-ba-002", name: "Cổng Trời Quản Bạ", area: "Quản Bạ", visibility: "VISIBLE", deletedAt: null },
        },
      ],
    },
  ],
};

function parseSseChunks(sseText: string): Array<{ type: string; delta?: string; data?: unknown }> {
  return sseText
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string; data?: unknown });
}

describe.skipIf(!LIVE)("Saved-trip assistant live OpenAI check (ADR-40 Ticket 04)", () => {
  it("streams 5 realistic multi-turn questions on gpt-6.1-terra without DB or ID leaks", async () => {
    const apiKey = loadLocalOpenAiKey();
    expect(apiKey, "OPENAI_API_KEY must be set locally to run TRIP_ASSISTANT_LIVE=1").toBeTruthy();

    const database = {
      user: { findUnique: async () => ({ id: "owner-live-1", role: "TRAVELER" }) },
      trip: {
        findFirst: async () => structuredClone(tripRecord),
      },
      destination: {
        findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const ids = where?.id?.in;
          return structuredClone(ids ? destinations.filter((d) => ids.includes(d.id)) : destinations);
        },
      },
    };

    const dependencies: AiEditHttpDependencies = {
      authorization: {
        database: database as unknown as Pick<Database, "user">,
        resolveSession: async () => ({ user: { id: "owner-live-1", role: "TRAVELER" } }),
      } as AuthorizationDependencies,
      service: {
        database: database as unknown as Database,
        llm: createTripAssistantStructuredClient({ apiKey: () => apiKey }),
        getRoute: async ({ origin, destination }) => {
          const distKm = Math.hypot(origin.latitude - destination.latitude, origin.longitude - destination.longitude) * 111;
          const durationSeconds = Math.max(900, Math.round((distKm / 40) * 3600));
          return { kind: "ok", durationSeconds, distanceMeters: Math.round(distKm * 1000) };
        },
        createVisitId: () => `visit-live-${Math.random().toString(36).slice(2, 8)}`,
        agent: () => resolveTripAssistantModel({ apiKey: () => apiKey }),
      },
      now: () => new Date(timeReference),
    };

    const prompts = [
      "hiện hành trình của tôi đang như nào",
      "tôi xuất phát từ đâu lúc mấy giờ",
      "ngày 1 tôi chưa muốn tham quan, dời chợ tình Khâu Vai sang hôm khác",
      "sáng ngày 2 muốn nghỉ đến 9h mới đi thì chỉnh sao",
      "cảm ơn bạn",
    ];

    const history: AiChatHistoryTurn[] = [];
    let currentDraft: EditCandidate | undefined = undefined;
    const summaryRows: Array<Record<string, unknown>> = [];

    for (const [idx, message] of prompts.entries()) {
      const started = Date.now();
      const request = new Request("https://live.test/api/trips/trip-live-1/edits/ai", {
        method: "POST",
        headers: {
          origin: "https://live.test",
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          baseRevision: revision.toISOString(),
          message,
          ...(currentDraft ? { draft: currentDraft } : {}),
          ...(history.length > 0 ? { history } : {}),
        }),
      });

      const response = await aiEditResponse(request, "trip-live-1", dependencies);
      expect(response.status).toBe(200);
      const rawSse = await response.text();
      const elapsedMs = Date.now() - started;
      const chunks = parseSseChunks(rawSse);

      const textDeltas = chunks.filter((c) => c.type === "text-delta").map((c) => c.delta ?? "");
      const streamedText = textDeltas.join("");
      const statuses = chunks
        .filter((c) => c.type === "data-status")
        .map((c) => (c.data as { label: string }).label);
      const stepsChunk = chunks.filter((c) => c.type === "data-steps").at(-1);
      const steps = (stepsChunk?.data as { steps?: string[] } | undefined)?.steps ?? [];
      const resultChunk = chunks.find((c) => c.type === "data-trip-assistant-result");
      expect(resultChunk, `Turn ${idx + 1} missing data-trip-assistant-result`).toBeDefined();

      const resultData = resultChunk!.data as {
        status: string;
        advice?: string;
        aiSummary?: string;
        candidate?: EditCandidate;
        suggestions?: unknown[];
        correctionNote?: string;
      };
      const reply = resultData.advice ?? resultData.aiSummary ?? "";

      const leakedIdOrUrl =
        /\b(?:visit-[a-z0-9_-]+|dest-[a-z0-9_-]+|ext:[a-z0-9:_-]+|sim-\d+|c[a-z0-9]{20,})\b|https?:\/\//iu.test(
          `${streamedText}\n${reply}`,
        );
      expect(leakedIdOrUrl, `Turn ${idx + 1} leaked internal ID or URL`).toBe(false);

      if (resultData.status === "PROPOSED" && resultData.candidate) {
        currentDraft = resultData.candidate;
      }
      history.push({ role: "user", content: message });
      if (reply) {
        history.push({
          role: "assistant",
          content: [...reply.trim()].slice(0, MAX_AI_HISTORY_TURN_CHARS).join(""),
        });
      }

      summaryRows.push({
        turn: idx + 1,
        prompt: message,
        outcome: resultData.status,
        streamedDeltas: textDeltas.length,
        steps,
        statuses,
        suggestionsCount: resultData.suggestions?.length ?? 0,
        correctionNote: resultData.correctionNote ?? null,
        leakedIdOrUrl,
        elapsedMs,
        replyPreview: reply.slice(0, 320),
      });
    }

    console.info("LIVE_SUMMARY_JSON:" + JSON.stringify(summaryRows, null, 2));
  }, 300_000);
});
