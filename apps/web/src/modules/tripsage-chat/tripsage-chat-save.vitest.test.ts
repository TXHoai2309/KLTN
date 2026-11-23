import { TRIP_INFO_FIXTURE } from "./tripsage-chat-fixtures";
import type { Database } from "@KLTN/db";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createPlanningAdmission } from "../assistant-planning/planning-admission";
import { plannerResultSchema, type PlannerResult } from "../trip-planner/planner-contract";
import { missingLeg } from "../trip-planner/planner-routes";
import { planningCandidate, planningNow } from "../../test/planning-fixtures";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { saveTripResponse } from "../trip-save/trip-save-http";
import type { TripSaveDependencies } from "../trip-save/trip-save-service";
import { chatSaveProposal, createChatSaveController } from "./tripsage-chat-save";
import { tripsageChatResponse } from "./tripsage-chat-http";
import type { TripsagePlanningDeps } from "./tripsage-chat-tools";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = { route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }), coordinateRoute: async () => verified };

/** Runs one scripted chat turn and returns the streamed itinerary exactly as the browser would receive it. */
async function chatItinerary(routing: TripsagePlanningDeps["routes"] = routes as never): Promise<PlannerResult> {
  let call = 0;
  const input = { selection: { days: [["a", "b"]] } };
  const model = new MockLanguageModelV4({ doStream: async () => {
    const chunks = call++ === 0
      ? [{ type: "tool-call", toolCallId: "c1", toolName: "proposeItinerary", input: JSON.stringify(input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage }]
      : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Xong." }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }];
    return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] as never[] }) };
  } });
  const authorization = { database: { user: { findUnique: async () => ({ id: "u", role: "TRAVELER", status: "ACTIVE" }) } }, resolveSession: async () => ({ user: { id: "u" } }) } as unknown as AuthorizationDependencies;
  const response = await tripsageChatResponse(new Request("https://app.test/api/ai/chat", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ id: "m", role: "user", parts: [{ type: "text", text: "Đi 1 ngày" }] }], journey: COMPLETE_JOURNEY_FIXTURE, tripInfo: TRIP_INFO_FIXTURE }) }), {
    authorization, model: async () => model, env: { TRIPSAGE_CHAT_ENABLED: "true" }, admit: createPlanningAdmission(),
    planning: () => ({ candidates: async () => [planningCandidate("a"), planningCandidate("b")], routes: routing, now: () => planningNow }),
  });
  const sse = await response.text();
  const part = sse.split("\n").filter(l => l.startsWith("data: {")).map(l => JSON.parse(l.slice(6)) as { type: string; data?: unknown }).find(p => p.type === "data-itinerary");
  return plannerResultSchema.parse(part!.data);
}

type Row = ReturnType<typeof planningCandidate>;
function store() {
  const rows: Row[] = [planningCandidate("a"), planningCandidate("b")];
  let records: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  let trips: { userId: string }[] = [];
  let actor: string | null = "owner";
  let loseResponse = false, failNextRead = false;
  let created = 0;
  const database = {
    user: { findUnique: async () => ({ id: actor, role: "TRAVELER" }) },
    destination: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => structuredClone(rows.filter(r => where.id.in.includes(r.id) && r.visibility === "VISIBLE")) },
    idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => { if (failNextRead) { failNextRead = false; throw new Error("database unreachable"); } return records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null; } },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingRecords = structuredClone(records), pendingTrips = structuredClone(trips);
      const tx = { user: database.user, destination: database.destination,
        idempotencyRecord: { create: async ({ data }: { data: typeof records[number] }) => { pendingRecords.push(data); }, update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => { pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key)!.responseJson = data.responseJson; } },
        trip: { create: async ({ data }: { data: { userId: string } }) => { pendingTrips.push({ userId: data.userId }); return { id: `trip-${++created}` }; } } };
      const result = await callback(tx);
      records = pendingRecords; trips = pendingTrips;
      if (loseResponse) { loseResponse = false; failNextRead = true; throw new Error("connection lost after commit"); }
      return result;
    },
  };
  const dependencies: TripSaveDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => actor ? { user: { id: actor } } : null,
    getRoute: async () => ({ kind: "ok", durationSeconds: 3600, distanceMeters: 50_000 }),
    journeyRoutes: routes as never,
  };
  return { dependencies, rows, get trips() { return trips; }, get records() { return records; }, as: (id: string | null) => { actor = id; }, loseNextResponse: () => { loseResponse = true; } };
}
const post = (deps: TripSaveDependencies, body: unknown, headers: Record<string, string> = { "Idempotency-Key": "k1" }) =>
  saveTripResponse(new Request("https://app.test/api/trips", { method: "POST", body: JSON.stringify(body), headers: Object.entries({ origin: "https://app.test", "content-type": "application/json", ...headers }).reduce((h, [k, v]) => { h.set(k, v); return h; }, new Headers()) }), deps);
/** The browser client talks to the real route handler, so the whole Save seam is exercised. */
const fetchTo = (deps: TripSaveDependencies): typeof fetch => async (_url, init) => post(deps, JSON.parse(init!.body as string), init!.headers as Record<string, string>); // the browser adds Origin itself

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(planningNow); });
afterEach(() => { vi.useRealTimers(); });

describe("Tripsage chat Save through POST /api/trips", () => {
  it("saves an eligible chat schedule: SUCCESS only after the database confirms, owned by the signed-in user", async () => {
    const db = store();
    const result = await chatItinerary();
    expect(result.eligibleForFinalConfirmation).toBe(true);
    const controller = createChatSaveController({ fetcher: fetchTo(db.dependencies), newKey: () => "key-1" });
    const view = await controller.save(result);
    expect(view).toMatchObject({ state: "success", tripId: "trip-1" });
    expect(db.trips).toEqual([{ userId: "owner" }]);
    expect(db.records).toHaveLength(1);
  });

  it("shows no Save for a schedule that is not all PASS and sends nothing", async () => {
    const result = await chatItinerary({ route: async (p: never) => missingLeg(p, "UNAVAILABLE"), coordinateRoute: async () => ({ status: "INSUFFICIENT_DATA", reason: "UNAVAILABLE", durationSeconds: null, distanceMeters: null, provider: null }) } as never);
    expect(result.eligibleForFinalConfirmation).toBe(false);
    expect(chatSaveProposal(result)).toBeNull();
    const fetcher = vi.fn();
    const view = await createChatSaveController({ fetcher: fetcher as never }).save(result);
    expect(view.state).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects without a session (401), without Idempotency-Key (400) and cross-origin (403); nothing is written", async () => {
    const db = store();
    const body = { confirm: true, proposal: chatSaveProposal(await chatItinerary())! };
    db.as(null);
    expect((await post(db.dependencies, body)).status).toBe(401);
    db.as("owner");
    expect((await post(db.dependencies, body, {})).status).toBe(400);
    const cross = await saveTripResponse(new Request("https://app.test/api/trips", { method: "POST", body: JSON.stringify(body), headers: { origin: "https://evil.test", "content-type": "application/json", "Idempotency-Key": "k" } }), db.dependencies);
    expect(cross.status).toBe(403);
    expect(db.trips).toHaveLength(0);
  });

  it("refuses a forged or stale schedule the server cannot validate (FAILED, no Trip) and ignores client claims", async () => {
    const db = store();
    const proposal = chatSaveProposal(await chatItinerary())!;
    const forged = structuredClone(proposal);
    forged.days[0]!.visits[1]!.startMinute = forged.days[0]!.visits[0]!.startMinute + 5; // overlaps and ignores travel time
    const response = await post(db.dependencies, { confirm: true, proposal: forged });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false, operationStatus: "FAILED", error: { code: "TRIP_VALIDATION_FAILED" } });
    for (const extra of [{ ownerId: "attacker" }, { validatorPassed: true }, { plannerResult: {} }]) expect((await post(db.dependencies, { confirm: true, proposal, ...extra }, { "Idempotency-Key": "k2" })).status).toBe(400);
    db.rows[0]!.visibility = "HIDDEN"; // destination no longer public
    expect((await post(db.dependencies, { confirm: true, proposal }, { "Idempotency-Key": "k3" })).status).toBe(422);
    expect(db.trips).toHaveLength(0);
  });

  it("surfaces FAILED in the client controller and does not claim success", async () => {
    const db = store();
    const result = await chatItinerary();
    db.rows[0]!.visibility = "HIDDEN";
    const view = await createChatSaveController({ fetcher: fetchTo(db.dependencies) }).save(result);
    expect(view.state).toBe("failed");
    expect(view.tripId).toBeNull();
    expect(db.trips).toHaveLength(0);
  });

  it("UNKNOWN (response lost after commit) then retry with the identical payload and key creates no second Trip", async () => {
    const db = store();
    const result = await chatItinerary();
    const sent: { key: string; body: string }[] = [];
    const inner = fetchTo(db.dependencies);
    const fetcher: typeof fetch = async (url, init) => { sent.push({ key: (init!.headers as Record<string, string>)["Idempotency-Key"]!, body: init!.body as string }); return inner(url, init); };
    let n = 0;
    const controller = createChatSaveController({ fetcher, newKey: () => `key-${++n}` });
    db.loseNextResponse();
    expect(await controller.save(result)).toMatchObject({ state: "unknown", tripId: null });
    expect(controller.locked).toBe(true);
    expect(db.trips).toHaveLength(1); // committed but never reported as saved
    expect(await controller.save(result)).toMatchObject({ state: "success", tripId: "trip-1" });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(n).toBe(1);
    expect(db.trips).toHaveLength(1);
    expect(db.records).toHaveLength(1);
  });

  it("a network error on Save is UNKNOWN (never success), Vietnamese, locks input, and the retry sends the identical payload and key", async () => {
    const result = await chatItinerary();
    const SECRET = "sk-test-secret-key-do-not-leak";
    const sent: { key: string; body: string }[] = [];
    const fetcher = (async (_url: unknown, init: RequestInit) => { sent.push({ key: (init.headers as Record<string, string>)["Idempotency-Key"]!, body: init.body as string }); throw new TypeError(`offline ${SECRET}`); }) as unknown as typeof fetch;
    const controller = createChatSaveController({ fetcher, newKey: () => "key-net" });
    const first = await controller.save(result);
    expect(first).toMatchObject({ state: "unknown", tripId: null });
    expect(first.message).toContain("Chưa xác định");
    expect(first.message).not.toContain(SECRET);
    expect(controller.locked).toBe(true);
    await controller.save(result);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[0]!.key).toBe("key-net");
  });

  it("another user cannot save on the owner's behalf or reuse the owner's receipt", async () => {
    const db = store();
    const body = { confirm: true, proposal: chatSaveProposal(await chatItinerary())! };
    expect((await post(db.dependencies, body, { "Idempotency-Key": "shared" })).status).toBe(200);
    db.as("intruder");
    const replay = await (await post(db.dependencies, body, { "Idempotency-Key": "shared" })).json() as { data: { tripId: string } };
    expect(db.trips.map(t => t.userId)).toEqual(["owner", "intruder"]); // owner is always the session, never the payload
    expect(replay.data.tripId).not.toBe("trip-1");
    expect((await post(db.dependencies, { ...body, userId: "owner" })).status).toBe(400);
  });

  it("an interrupted chat stream never saves: the chat module has no write path", async () => {
    const db = store();
    const result = await chatItinerary();
    expect(db.trips).toHaveLength(0);
    expect(db.records).toHaveLength(0);
    expect(createChatSaveController({ fetcher: vi.fn() as never }).view.state).toBe("idle"); // nothing saves without an explicit click
    for (const file of ["tripsage-chat-http.ts", "tripsage-chat-service.ts", "tripsage-chat-tools.ts", "tripsage-chat-runtime.ts"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).not.toMatch(/trip-save|trip\.create|idempotency|\/api\/trips/);
    }
    expect(result.eligibleForFinalConfirmation).toBe(true);
  });

  it("Point 6: re-saving the identical proposal from a fresh controller (after reload) sends the same deterministic Idempotency-Key and never creates a duplicate Trip", async () => {
    const db = store();
    const result = await chatItinerary();
    const sentKeys: string[] = [];
    const inner = fetchTo(db.dependencies);
    const fetcher: typeof fetch = async (url, init) => {
      sentKeys.push((init!.headers as Record<string, string>)["Idempotency-Key"]!);
      return inner(url, init);
    };

    // First save before reload
    const c1 = createChatSaveController({ fetcher });
    const v1 = await c1.save(result);
    expect(v1).toMatchObject({ state: "success", tripId: "trip-1" });
    expect(db.trips).toHaveLength(1);

    // Simulated reload: brand-new controller saving the identical proposal replays trip-1 with zero duplicate rows
    const c2 = createChatSaveController({ fetcher });
    const v2 = await c2.save(result);
    expect(v2).toMatchObject({ state: "success", tripId: "trip-1" });
    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[1]).toBe(sentKeys[0]);
    expect(db.trips).toHaveLength(1);

    // Editing to a new proposalId produces a distinct key and saves a distinct Trip
    const c3 = createChatSaveController({ fetcher });
    const v3 = await c3.save({ ...result, proposalId: `${result.proposalId}-v2` });
    expect(v3).toMatchObject({ state: "success", tripId: "trip-2" });
    expect(sentKeys[2]).not.toBe(sentKeys[0]);
    expect(db.trips).toHaveLength(2);
  });
});
