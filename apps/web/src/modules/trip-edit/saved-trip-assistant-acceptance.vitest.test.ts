import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "@KLTN/db";
import { describe, expect, it } from "vitest";

import { clearForecastCache } from "../trip-weather/forecast";
import { aiEditResponse, type AiEditHttpDependencies } from "./ai-edit-http";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import { setVisitTime, type EditCandidate } from "./edit-candidate";
import {
  applyWorkspaceDraft,
  createWorkspaceState,
  rebaseWorkspaceDraft,
  redoWorkspaceDraft,
  undoWorkspaceDraft,
} from "./edit-workspace-state";
import { applyEditResponse, type TripEditApplyHttpDependencies } from "./trip-edit-http";

const rev1 = new Date("2026-10-15T12:00:00.000Z");
const nowUpstream = new Date("2026-10-19T08:00:00.000Z");

const planOutput = (
  topic: WorkspacePlanModelOutput["adviceFocus"]["topic"],
  dayIndex: number | null = 1,
): WorkspacePlanModelOutput => ({
  mode: "ADVISED",
  operations: [],
  originClocks: {
    departureTime: null,
    returnDeadlineTime: null,
    returnDepartureTime: null,
    rescheduleDayOne: false,
  },
  adviceFocus: { dayIndex, topic },
  candidateVisitIds: [],
  candidateDestinationIds: [],
  affected: { visitIds: [], dayIndexes: dayIndex ? [dayIndex] : [1] },
  clarificationReason: null,
});

function openDaysFull() {
  return [
    {
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
    },
    {
      dayOfWeek: "WEDNESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 420, closesAtMinute: 1200 }],
    },
  ];
}

function createE2eHarness() {
  let tripUpdatedAt = rev1;
  let publicationSeq = 0;
  let publicationRev = 0;
  const companionMessages: { sequence: number; text: string; notice: unknown }[] = [];
  const idempotencyRecords = new Map<string, { requestHash: string; responseJson: string }>();
  let injectTransientFailure = false;
  let txQueue = Promise.resolve();

  const catalog = [
    {
      id: "dest-1",
      name: "Cổng Trời Quản Bạ",
      area: "Quản Bạ",
      category: "SCENIC",
      latitude: 23.07,
      longitude: 104.99,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openDaysFull(),
    },
    {
      id: "dest-2",
      name: "Dinh Vua Mèo",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.26,
      longitude: 105.23,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openDaysFull(),
    },
    {
      id: "dest-3",
      name: "Cột Cờ Lũng Cú",
      area: "Đồng Văn",
      category: "LANDMARK",
      latitude: 23.36,
      longitude: 105.32,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      visibility: "VISIBLE",
      deletedAt: null,
      openingDays: openDaysFull(),
    },
  ];

  const externalRow = {
    id: "ext-row-1",
    tripId: "trip-e2e-1",
    providerPlaceId: "local-noodles",
    name: "Phở Tráng Kìm",
    area: "Quản Bạ",
    category: "FOOD",
    latitude: 23.09,
    longitude: 105.01,
    fetchedAt: new Date("2026-10-15T00:00:00.000Z"),
    rawSummaryJson: {},
  };

  let persistedJourneySnapshot: unknown = {
    revision: "journey-save-v1",
    journey: {
      origin: {
        label: "Hà Nội",
        latitude: 21.028511,
        longitude: 105.804817,
        source: "MANUAL",
        confirmed: true,
      },
      departureMinute: 360,
      returnDeadlineMinute: 1260,
      returnDepartureMinute: null,
    },
    plan: null,
  };
  let persistedUncheckedChecks: unknown = null;

  let persistedDays: {
    id: string;
    tripId: string;
    dayIndex: number;
    localDate: Date;
    visits: {
      id: string;
      destinationId: string | null;
      externalPlaceId?: string;
      startMinute: number;
      plannedDurationMinutes: number;
      order: number;
      externalPlace?: typeof externalRow | null;
      destination?: {
        id: string;
        name: string;
        area: string;
        visibility: string;
        deletedAt: null;
      } | null;
    }[];
  }[] = [
    {
      id: "day-1",
      tripId: "trip-e2e-1",
      dayIndex: 1,
      localDate: new Date("2026-10-20T00:00:00.000Z"),
      visits: [
        {
          id: "v1",
          destinationId: "dest-1",
          startMinute: 480, // 08:00
          plannedDurationMinutes: 60,
          order: 1,
          externalPlace: null,
          destination: {
            id: "dest-1",
            name: "Cổng Trời Quản Bạ",
            area: "Quản Bạ",
            visibility: "VISIBLE",
            deletedAt: null,
          },
        },
        {
          id: "v-ext",
          destinationId: null,
          externalPlaceId: externalRow.id,
          startMinute: 600,
          plannedDurationMinutes: 45,
          order: 2,
          externalPlace: externalRow,
          destination: null,
        },
      ],
    },
    {
      id: "day-2",
      tripId: "trip-e2e-1",
      dayIndex: 2,
      localDate: new Date("2026-10-21T00:00:00.000Z"),
      visits: [],
    },
  ];

  const getTripSnapshot = () => ({
    id: "trip-e2e-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 2,
    transport: "CAR" as const,
    updatedAt: tripUpdatedAt,
    manuallyCompletedAt: null,
    journeySnapshot: persistedJourneySnapshot,
    uncheckedChecks: persistedUncheckedChecks,
    days: structuredClone(persistedDays),
  });

  const buildDatabase = () => ({
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === "trip-e2e-1" && where.userId === "owner-1" ? getTripSnapshot() : null,
    },
    destination: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        catalog.find((d) => d.id === where.id) ?? null,
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        if (!ids) return structuredClone(catalog);
        return structuredClone(catalog.filter((d) => ids.includes(d.id)));
      },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) =>
        idempotencyRecords.get(JSON.stringify([where.scope_key.scope, where.scope_key.key])) ?? null,
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const releasePrev = txQueue;
      let releaseSelf!: () => void;
      txQueue = new Promise<void>((resolve) => {
        releaseSelf = resolve;
      });
      await releasePrev;
      try {
        let pendingUpdatedAt = tripUpdatedAt;
      let pendingJourney = persistedJourneySnapshot;
      let pendingUnchecked = persistedUncheckedChecks;
      let pendingDays = structuredClone(persistedDays);
      let pendingPubSeq = publicationSeq;
      let pendingPubRev = publicationRev;
      const pendingMsgs = [...companionMessages];
      const pendingRecords = new Map(idempotencyRecords);

      const tx = {
        user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
        trip: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            where.id === "trip-e2e-1" && where.userId === "owner-1"
              ? {
                  ...getTripSnapshot(),
                  updatedAt: pendingUpdatedAt,
                  journeySnapshot: pendingJourney,
                  uncheckedChecks: pendingUnchecked,
                  days: structuredClone(pendingDays),
                }
              : null,
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; userId: string; updatedAt: Date };
            data: { updatedAt: Date; journeySnapshot?: unknown; uncheckedChecks?: unknown };
          }) => {
            if (
              where.id !== "trip-e2e-1" ||
              where.userId !== "owner-1" ||
              where.updatedAt.getTime() !== pendingUpdatedAt.getTime()
            ) {
              return { count: 0 };
            }
            pendingUpdatedAt = data.updatedAt;
            if ("journeySnapshot" in data) pendingJourney = data.journeySnapshot;
            if ("uncheckedChecks" in data) pendingUnchecked = data.uncheckedChecks;
            return { count: 1 };
          },
        },
        $queryRaw: async () => [],
        tripCompanionPublication: {
          findUnique: async () => ({ id: "pub-1" }),
          update: async ({ data }: { data: { messageSequence: { increment: number }; itineraryRevision: { increment: number } } }) => {
            pendingPubSeq += data.messageSequence.increment;
            pendingPubRev += data.itineraryRevision.increment;
            return { messageSequence: pendingPubSeq, itineraryRevision: pendingPubRev };
          },
        },
        tripCompanionMessage: {
          create: async ({ data }: { data: { sequence: number; text: string; notice: unknown } }) => {
            pendingMsgs.push({ sequence: data.sequence, text: data.text, notice: data.notice });
            return data;
          },
        },
        itineraryDay: {
          deleteMany: async () => {
            const count = pendingDays.length;
            pendingDays = [];
            return { count };
          },
          create: async ({
            data,
          }: {
            data: {
              tripId: string;
              dayIndex: number;
              localDate: Date;
              visits: {
                create: {
                  id: string;
                  destinationId?: string;
                  externalPlaceId?: string;
                  startMinute: number;
                  plannedDurationMinutes: number;
                  order: number;
                }[];
              };
            };
          }) => {
            if (injectTransientFailure) throw new Error("Simulated transient commit error");
            const created = {
              id: `day-${pendingDays.length + 1}`,
              tripId: data.tripId,
              dayIndex: data.dayIndex,
              localDate: data.localDate,
              visits: data.visits.create.map((v) => {
                const isExt = Boolean(v.externalPlaceId);
                const dest = v.destinationId ? catalog.find((d) => d.id === v.destinationId) : null;
                return {
                  id: v.id,
                  destinationId: v.destinationId ?? null,
                  ...(v.externalPlaceId ? { externalPlaceId: v.externalPlaceId } : {}),
                  startMinute: v.startMinute,
                  plannedDurationMinutes: v.plannedDurationMinutes,
                  order: v.order,
                  externalPlace: isExt ? externalRow : null,
                  destination: dest
                    ? {
                        id: dest.id,
                        name: dest.name,
                        area: dest.area,
                        visibility: "VISIBLE",
                        deletedAt: null,
                      }
                    : null,
                };
              }),
            };
            pendingDays.push(created);
            return created;
          },
        },
        idempotencyRecord: {
          create: async ({
            data,
          }: {
            data: { scope: string; key: string; requestHash: string; responseJson: string };
          }) => {
            const key = JSON.stringify([data.scope, data.key]);
            if (pendingRecords.has(key)) throw new Error("Duplicate idempotency key");
            pendingRecords.set(key, { requestHash: data.requestHash, responseJson: data.responseJson });
          },
          update: async ({
            where,
            data,
          }: {
            where: { scope_key: { scope: string; key: string } };
            data: { responseJson: string };
          }) => {
            const key = JSON.stringify([where.scope_key.scope, where.scope_key.key]);
            const existing = pendingRecords.get(key)!;
            existing.responseJson = data.responseJson;
          },
        },
      };

        const res = await callback(tx);
        tripUpdatedAt = pendingUpdatedAt;
        persistedJourneySnapshot = pendingJourney;
        persistedUncheckedChecks = pendingUnchecked;
        persistedDays = pendingDays;
        publicationSeq = pendingPubSeq;
        publicationRev = pendingPubRev;
        companionMessages.splice(0, companionMessages.length, ...pendingMsgs);
        idempotencyRecords.clear();
        for (const [k, v] of pendingRecords) idempotencyRecords.set(k, v);
        return res;
      } finally {
        releaseSelf();
      }
    },
  });

  const db = buildDatabase() as unknown as Database;
  const auth = {
    database: db as unknown as Pick<Database, "user">,
    resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
  };

  return {
    db,
    auth,
    getRevision: () => tripUpdatedAt.toISOString(),
    getCompanionMessages: () => [...companionMessages],
    getPersistedUnchecked: () => persistedUncheckedChecks,
    setTransientFailure: (flag: boolean) => {
      injectTransientFailure = flag;
    },
    advanceServerRevisionExternally: () => {
      tripUpdatedAt = new Date(tripUpdatedAt.getTime() + 5000);
      return tripUpdatedAt.toISOString();
    },
  };
}

describe("Saved-trip assistant Ticket 07: Vertical acceptance E2E (Seam 1 + Seam 2 + Concurrency/Idempotency)", () => {
  it("completes full end-to-end session across AI advice, rest buffer, 1-tap cards, recommendations, RAG/weather, Undo/Redo, 409 Rebase, and atomic Apply/UNKNOWN retry", async () => {
    clearForecastCache();
    const harness = createE2eHarness();
    let step1Topic: WorkspacePlanModelOutput["adviceFocus"]["topic"] = "GENERAL";

    const aiDeps: AiEditHttpDependencies = {
      authorization: harness.auth,
      service: {
        database: harness.db,
        llm: {
          complete: async ({ user }) => {
            if (user.includes('"requestData"')) {
              return { rawText: JSON.stringify(planOutput(step1Topic, 1)), model: "step-1" };
            }
            return {
              rawText: JSON.stringify({
                advice: "Đã phân tích lịch trình hiện tại kèm phương án đề xuất bên dưới.",
              }),
              model: "step-2",
            };
          },
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 900, distanceMeters: 8000 }),
        createVisitId: () => "v-added-day2",
        forecast: {
          fetcher: async (url) => {
            const count = new URL(url.toString()).searchParams.get("latitude")?.split(",").length ?? 1;
            const pt = {
              hourly: {
                time: ["2026-10-20T08:00", "2026-10-20T09:00"],
                temperature_2m: [21, 22],
                precipitation_probability: [15, 20],
                precipitation: [0, 0],
                wind_gusts_10m: [15, 18],
                visibility: [10000, 10000],
                weather_code: [1, 1],
              },
            };
            return new Response(JSON.stringify(count > 1 ? Array.from({ length: count }, () => pt) : pt), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
        qaLookup: async () => ({
          status: "PARTIAL",
          answerParts: [
            { text: "Cổng Trời Quản Bạ là cửa ngõ lên cao nguyên đá Đồng Văn.", mode: "SOURCE", citationIds: ["cit-gb"] },
            { text: "Buổi sáng thường mát và thoáng mây.", mode: "EXPANDED", citationIds: [] },
          ],
          citations: [
            {
              id: "cit-gb",
              sourceId: "src-gb",
              title: "Địa chí du lịch Quản Bạ",
              sourceUrl: "https://example.test/quan-ba",
              locators: [{ pageNumber: 5 }],
            },
          ],
          unansweredAspects: [],
          knowledgeMode: "EXPANDED",
        }),
      },
      now: () => new Date(nowUpstream),
    };

    const aiPost = (body: Record<string, unknown>) =>
      aiEditResponse(
        new Request("https://example.test/api/trips/trip-e2e-1/edits/ai", {
          method: "POST",
          headers: { origin: "https://example.test", "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        "trip-e2e-1",
        aiDeps,
      );

    const initialCandidate: EditCandidate = {
      startDate: "2026-10-20",
      durationDays: 2,
      transport: "CAR",
      journey: {
        origin: {
          label: "Hà Nội",
          latitude: 21.028511,
          longitude: 105.804817,
          source: "MANUAL",
          confirmed: true,
        },
        departureMinute: 360,
        returnDeadlineMinute: 1260,
        returnDepartureMinute: null,
      },
      days: [
        {
          dayIndex: 1,
          visits: [
            { visitId: "v1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
            { visitId: "v-ext", destinationId: "ext:google:local-noodles", startMinute: 600, plannedDurationMinutes: 45, order: 2 },
          ],
        },
        { dayIndex: 2, visits: [] },
      ],
    };

    let ws = createWorkspaceState(harness.getRevision(), initialCandidate);

    // 1. Frame immutability guard
    step1Topic = "FRAME_IMMUTABLE";
    const frameHttp = await aiPost({
      baseRevision: ws.baseRevision,
      message: "Đổi chuyến đi thành 3 ngày bằng xe máy",
      draft: ws.workingDraft,
    });
    const frameRes = await frameHttp.json();
    expect({ status: frameHttp.status, frameRes }).toMatchObject({ status: 200, frameRes: { success: true } });
    expect(frameRes.data.status).toBe("ADVISED");
    expect(frameRes.data.advice).toContain("cố định");

    // 2. General assessment -> ADVISED without mutating draft
    step1Topic = "SCHEDULE_PACE";
    const assessRes = await (await aiPost({
      baseRevision: ws.baseRevision,
      message: "Tôi đi thế này được không?",
      draft: ws.workingDraft,
    })).json();
    expect(assessRes.data.status).toBe("ADVISED");

    // 3. Rest buffer scenario -> ADVISED + 1-tap Schedule rest buffer card -> apply onto client draft
    step1Topic = "REST_BUFFER";
    const restRes = await (await aiPost({
      baseRevision: ws.baseRevision,
      message: "Sáng đến nơi muốn nghỉ ngơi đến 9h mới đi thì chỉnh sao?",
      draft: ws.workingDraft,
    })).json();
    expect(restRes.data.status).toBe("ADVISED");
    expect(restRes.data.suggestions?.length).toBeGreaterThanOrEqual(1);
    ws = applyWorkspaceDraft(ws, restRes.data.suggestions[0].candidate);
    expect(ws.workingDraft.days[0]!.visits[0]!.startMinute).toBe(540);
    expect(ws.undoStack).toHaveLength(1);

    // 4. Open Day 2 recommendation -> pick #1 Destination option onto draft
    step1Topic = "RECOMMEND_DESTINATION";
    const recRes = await (await aiPost({
      baseRevision: ws.baseRevision,
      message: "Chiều Ngày 2 còn trống nên đi đâu ở Đồng Văn?",
      draft: ws.workingDraft,
    })).json();
    expect(recRes.data.status).toBe("ADVISED");
    expect(recRes.data.suggestions?.length).toBe(2); // dest-2 and dest-3 eligible
    ws = applyWorkspaceDraft(ws, recRes.data.suggestions[0].candidate);
    expect(ws.workingDraft.days[1]!.visits).toHaveLength(1);
    expect(ws.undoStack).toHaveLength(2);

    // 5. Interleaved RAG + weather Q&A preserve workingDraft & undoStack
    step1Topic = "KNOWLEDGE_QA";
    const ragRes = await (await aiPost({
      baseRevision: ws.baseRevision,
      message: "Cổng Trời Quản Bạ có câu chuyện gì đặc biệt?",
      draft: ws.workingDraft,
    })).json();
    expect(ragRes.data.status).toBe("ADVISED");
    expect(ragRes.data.knowledgeParts).toHaveLength(2);
    expect(ragRes.data.citations).toHaveLength(1);

    step1Topic = "WEATHER_QA";
    const wxRes = await (await aiPost({
      baseRevision: ws.baseRevision,
      message: "Dự báo thời tiết Ngày 1 tại Quản Bạ?",
      draft: ws.workingDraft,
    })).json();
    expect(wxRes.data.status).toBe("ADVISED");
    expect(wxRes.data.advice).toContain("Giờ mặt trời Ngày 1");
    expect(ws.undoStack).toHaveLength(2);

    // 6. Manual edit + Undo + Redo
    ws = applyWorkspaceDraft(ws, setVisitTime(ws.workingDraft, "v-added-day2", 900));
    expect(ws.workingDraft.days[1]!.visits[0]!.startMinute).toBe(900);
    ws = undoWorkspaceDraft(ws);
    expect(ws.workingDraft.days[1]!.visits[0]!.startMinute).toBe(810);
    ws = redoWorkspaceDraft(ws);
    expect(ws.workingDraft.days[1]!.visits[0]!.startMinute).toBe(900);

    // 7. Simulated 409 conflict & non-destructive Rebase preserving workingDraft
    const applyDeps: TripEditApplyHttpDependencies = {
      authorization: harness.auth,
      service: {
        database: harness.db,
        authorization: harness.auth,
        getRoute: async () => ({ kind: "ok", durationSeconds: 900, distanceMeters: 8000 }),
      },
      now: () => new Date(nowUpstream),
    };

    const previewItems = recRes.data.suggestions[0].uncheckedItems ?? [];
    const ackPayload =
      previewItems.length > 0
        ? { acknowledgedUnchecked: { confirmed: true as const, items: previewItems } }
        : {};

    const staleRevision = ws.baseRevision;
    const fresherServerRev = harness.advanceServerRevisionExternally();
    const conflictHttp = await applyEditResponse(
      new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
        method: "POST",
        headers: {
          origin: "https://example.test",
          "content-type": "application/json",
          "Idempotency-Key": "e2e-stale-key",
        },
        body: JSON.stringify({
          baseRevision: staleRevision,
          candidate: ws.workingDraft,
          confirmed: true,
          kind: "AI",
          ...ackPayload,
        }),
      }),
      "trip-e2e-1",
      applyDeps,
    );
    expect(conflictHttp.status).toBe(409);

    ws = rebaseWorkspaceDraft(ws, {
      nextRevision: fresherServerRev,
      nextBaseline: initialCandidate,
      nextWorkingDraft: ws.workingDraft,
    });
    expect(ws.baseRevision).toBe(fresherServerRev);
    expect(ws.workingDraft.days[1]!.visits[0]!.startMinute).toBe(900);

    // 8. Transient failure -> UNKNOWN + rollback, then retry with IDENTICAL Idempotency-Key -> 1 commit, 1 companion notice (no origin coords!)
    const applyBody = JSON.stringify({
      baseRevision: ws.baseRevision,
      candidate: ws.workingDraft,
      confirmed: true,
      kind: "AI",
      ...ackPayload,
    });
    const idemKey = "e2e-save-retry-key";

    harness.setTransientFailure(true);
    const unknownHttp = await applyEditResponse(
      new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
        method: "POST",
        headers: {
          origin: "https://example.test",
          "content-type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: applyBody,
      }),
      "trip-e2e-1",
      applyDeps,
    );
    const unknownPayload = await unknownHttp.json();
    expect(unknownPayload.operationStatus).toBe("UNKNOWN");
    expect(harness.getCompanionMessages()).toHaveLength(0);

    harness.setTransientFailure(false);
    const retryWinner = await applyEditResponse(
      new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
        method: "POST",
        headers: {
          origin: "https://example.test",
          "content-type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: applyBody,
      }),
      "trip-e2e-1",
      applyDeps,
    );
    expect(retryWinner.status).toBe(200);
    const winnerBody = await retryWinner.json();
    expect(winnerBody.operationStatus).toBe("SUCCESS");
    expect(harness.getPersistedUnchecked()).toBeTruthy();

    // Replay same Idempotency-Key is idempotent (still only 1 companion notice)
    const idempotentReplay = await applyEditResponse(
      new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
        method: "POST",
        headers: {
          origin: "https://example.test",
          "content-type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: applyBody,
      }),
      "trip-e2e-1",
      applyDeps,
    );
    expect(idempotentReplay.status).toBe(200);

    // Concurrent race on updated revision -> exactly one 200 winner and one 409 conflict
    const revAfterRetry = harness.getRevision();
    const raceBody = JSON.stringify({
      baseRevision: revAfterRetry,
      candidate: setVisitTime(ws.workingDraft, "v-added-day2", 915),
      confirmed: true,
      kind: "AI",
      ...ackPayload,
    });
    const [raceA, raceB] = await Promise.all([
      applyEditResponse(
        new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
          method: "POST",
          headers: {
            origin: "https://example.test",
            "content-type": "application/json",
            "Idempotency-Key": "e2e-race-key-a",
          },
          body: raceBody,
        }),
        "trip-e2e-1",
        applyDeps,
      ),
      applyEditResponse(
        new Request("https://example.test/api/trips/trip-e2e-1/edits/apply", {
          method: "POST",
          headers: {
            origin: "https://example.test",
            "content-type": "application/json",
            "Idempotency-Key": "e2e-race-key-b",
          },
          body: raceBody,
        }),
        "trip-e2e-1",
        applyDeps,
      ),
    ]);
    expect([raceA.status, raceB.status].sort((a, b) => a - b)).toEqual([200, 409]);

    // Verify 2 companion notices total (1 from initial retry commit + 1 from race winner), containing NO leaked origin coordinates!
    const notices = harness.getCompanionMessages();
    expect(notices).toHaveLength(2);
    for (const notice of notices) {
      expect(notice.text).not.toContain("21.028511");
      expect(notice.text).not.toContain("105.804817");
      expect(JSON.stringify(notice)).not.toContain("21.028511");
    }
  });

  it("verifies responsive 360px+/Desktop layout, 44px touch targets, dark/light tokens, and global assistant suppression invariants", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const css = await readFile(resolve(dir, "../../app/trips/[id]/edit/edit-trip.module.css"), "utf8");
    const globalAssistant = await readFile(resolve(dir, "../../components/assistant/global-assistant.tsx"), "utf8");
    const unifiedPage = await readFile(resolve(dir, "../../app/trips/[id]/edit/saved-trip-assistant-page.tsx"), "utf8");

    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).toContain("var(--foreground)");
    expect(css).toContain("var(--border)");
    expect(globalAssistant).toContain("in-trip");
    expect(globalAssistant).toContain("edit|in-trip");
    expect(unifiedPage).toContain("COMPLETED");
  });
});
