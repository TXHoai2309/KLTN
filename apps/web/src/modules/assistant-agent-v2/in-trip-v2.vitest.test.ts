import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import type { ReplanModelOutput } from "../in-trip/replan-contract";
import { inTripReplanRequestSchema } from "../in-trip/replan-http";
import { inTripPreviewRequestSchema } from "../in-trip/in-trip-preview-http";
import { applyEditRequestSchema } from "../trip-edit/apply-edit";
import type { EditCandidate } from "../trip-edit/edit-candidate";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { createQaService } from "../ai/qa-service";
import type { QaConversationStore } from "../ai/qa-conversation-store";
import { planningCandidate } from "../../test/planning-fixtures";
import { startInTripV2Session, type InTripSessionState } from "./in-trip-session";
import type { InTripActionServices } from "./in-trip-actions";
import { executeAssistantV2Action } from "./agent-runtime";

vi.mock("../runtime-config/runtime-config-service", () => ({ effectiveConfig: async () => ({ apiKey: "v206-fixture-only" }) }));
afterAll(() => { vi.doUnmock("../runtime-config/runtime-config-service"); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tripId = "saved-trip";
const revision = "2026-10-26T00:00:00.000Z";
const location = { source: "MANUAL" as const, latitude: 23.123456, longitude: 105.123456, capturedAt: "2026-10-27T03:00:00.000Z" };
const original: EditCandidate = { startDate: "2026-10-27", durationDays: 3, transport: "CAR", days: [
  { dayIndex: 1, visits: [{ visitId: "completed", destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }, { visitId: "today", destinationId: "b", startMinute: 900, plannedDurationMinutes: 60, order: 2 }] },
  { dayIndex: 2, visits: [{ visitId: "vuong2", destinationId: "vuong", startMinute: 480, plannedDurationMinutes: 60, order: 1 }, { visitId: "v2-end", destinationId: "c", startMinute: 900, plannedDurationMinutes: 60, order: 2 }] },
  { dayIndex: 3, visits: [{ visitId: "vuong3", destinationId: "vuong", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] },
] };
const remove = (id: string): ReplanModelOutput => ({ operations: [{ operationType: "REMOVE_VISIT", targetVisitId: id, destinationId: null, params: { dayIndex: null, position: null, startTime: null, durationMinutes: null } }], mandatoryEndpoint: null, needsClarification: false, clarificationReason: null });
function fixture(role: "TRAVELER" | "ADMIN" = "TRAVELER") {
  let identity: string | null = "owner";
  let now = new Date("2026-10-27T03:00:00.000Z");
  let lostResponse = false; let lostLookup = false; let failWrite = false; let unavailable = false;
  const labels: Record<string, string> = { a: "Đã ghé", b: "Điểm hôm nay", c: "Cuối ngày hai", vuong: "Dinh thự họ Vương", replacement: "Lô Lô Chải" };
  const destinations = Object.entries(labels).map(([id, name]) => ({ ...planningCandidate(id), name, area: "Đồng Văn", deletedAt: null as Date | null }));
  const toTrip = (candidate: EditCandidate, updatedAt = new Date(revision)) => ({ id: tripId, userId: "owner", updatedAt, startDate: new Date(candidate.startDate!+"T00:00:00Z"), durationDays: candidate.durationDays, transport: candidate.transport,
    days: candidate.days.map(day => ({ id: `day-${day.dayIndex}`, tripId, dayIndex: day.dayIndex, localDate: new Date(Date.UTC(2026, 9, 26 + day.dayIndex)), visits: day.visits.map(v => ({ ...v, id: v.visitId, destination: structuredClone(destinations.find(d => d.id === v.destinationId)!) })) })) });
  let trip = toTrip(original);
  const records = new Map<string, { requestHash: string; responseJson: string }>();
  const writes: string[] = [];
  type Query = { where: { id?: string | { in: string[] }; userId?: string; updatedAt?: Date; deletedAt?: null } };
  const owned = (q: Query, state = trip) => q.where.id === state.id && q.where.userId === state.userId ? { ...structuredClone(state), days: state.days.map(day => ({ ...structuredClone(day), visits: day.visits.map(v => ({ ...structuredClone(v), destination: structuredClone(destinations.find(d => d.id === v.destinationId)!) })) })) } : null;
  const database = {
    user: { findUnique: async () => identity ? { id: identity, role, status: "ACTIVE" } : null },
    trip: { findFirst: vi.fn(async (q: Query) => owned(q)) },
    destination: {
      findMany: vi.fn(async (q: Query) => destinations.filter(d => d.visibility === "VISIBLE" && !d.deletedAt && (typeof q.where.id !== "object" || q.where.id.in.includes(d.id))).map(d => structuredClone(d))),
      findFirst: vi.fn(async (q: Query) => structuredClone(destinations.find(d => d.id === q.where.id && !d.deletedAt && d.visibility === "VISIBLE") ?? null)),
    },
    idempotencyRecord: { findUnique: async (q: { where: { scope_key: { scope: string; key: string } } }) => { if (lostLookup) { lostLookup = false; throw new Error("fixture reconciliation lookup unavailable"); } return records.get(JSON.stringify(q.where.scope_key)) ?? null; } },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingTrip = structuredClone(trip); const pendingRecords = new Map(records);
      const tx = {
        $queryRaw: async () => [],
        tripCompanionPublication: { findUnique: async () => null },
        user: database.user,
        trip: {
          findFirst: async (q: Query) => owned(q, pendingTrip),
          updateMany: async (q: Query & { data: { updatedAt: Date } }) => { if (!owned(q, pendingTrip) || q.where.updatedAt?.getTime() !== pendingTrip.updatedAt.getTime()) return { count: 0 }; pendingTrip.updatedAt = q.data.updatedAt; writes.push("revision"); return { count: 1 }; },
        },
        itineraryDay: {
          deleteMany: async () => { writes.push("delete-days"); pendingTrip.days = []; return { count: 3 }; },
          create: async (q: { data: { tripId: string; dayIndex: number; localDate: Date; visits: { create: { id: string; destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number }[] } } }) => {
            if (failWrite) throw new Error("fixture rollback");
            writes.push("create-day"); pendingTrip.days.push({ id: `day-${q.data.dayIndex}`, tripId, dayIndex: q.data.dayIndex, localDate: q.data.localDate, visits: q.data.visits.create.map(v => ({ ...v, visitId: v.id, destination: structuredClone(destinations.find(d => d.id === v.destinationId)!) })) });
          },
        },
        idempotencyRecord: {
          create: async (q: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => { pendingRecords.set(JSON.stringify({ scope: q.data.scope, key: q.data.key }), { requestHash: q.data.requestHash, responseJson: q.data.responseJson }); },
          update: async (q: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => { const record = pendingRecords.get(JSON.stringify(q.where.scope_key)); if (record) record.responseJson = q.data.responseJson; },
        },
      };
      const result = await callback(tx); trip = pendingTrip; records.clear(); for (const [key, value] of pendingRecords) records.set(key, value);
      if (lostResponse) { lostResponse = false; lostLookup = true; throw new Error("fixture acknowledgement lost after commit"); }
      return result;
    },
  };
  const db = database as unknown as Database;
  const authorization: AuthorizationDependencies = { database: db, resolveSession: async () => identity ? { user: { id: identity } } : null };
  let completion: ReplanModelOutput | ((input: { requestData: { resolution?: { selectedDayIndex?: number }; need: string } }) => ReplanModelOutput) = remove("vuong2");
  const llm: StructuredLlmClient = { complete: vi.fn(async input => ({ rawText: JSON.stringify(typeof completion === "function" ? completion(JSON.parse(input.user)) : completion), model: "fixture" })) };
  const route = { intent: "EDIT", needsLocation: false, affectedDays: [2], qa: { question: null as string | null, subjectName: null as string | null, usesReferent: false, compound: false, unsupported: false } };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { name: string } }; messages: { content: string }[] };
    expect(body.response_format.json_schema.name).toBe("in_trip_v2_route");
    const payload = JSON.stringify(body.messages);
    expect(payload).not.toContain(String(location.latitude)); expect(payload).not.toContain(String(location.longitude));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(route) } }] });
  }));
  const getRoute = vi.fn(async () => unavailable ? { kind: "unavailable" as const } : { kind: "ok" as const, durationSeconds: 0 });
  const headers = new Headers();
  const services: InTripActionServices = { userId: "owner", tripId, headers, database: db, authorization, llm, getRoute, now: () => new Date(now) };
  const source = { id: "qa-source", sourceId: "reviewed", title: "Fixture lịch sử", sourceUrl: null, locators: [] };
  const qaStore: QaConversationStore = { reserve: vi.fn(async () => ({ kind: "RESERVED" as const, conversationId: "qa-owned", turnId: "qa-turn", fence: 1, history: [], context: { type: "GENERAL" as const } })), complete: vi.fn(async (_p, _r, data) => data), fail: vi.fn(), history: vi.fn(), delete: vi.fn(), revokeGuest: vi.fn(), cleanup: vi.fn() };
  const qaService = createQaService({ store: qaStore, retriever: { retrieve: async () => [{ citationId: source.id, citation: source, documentId: "internal-document", generationId: "generation", contentVersionId: "version", chunkId: "chunk", chunkHash: "hash", text: "Dinh thự họ Vương được khởi công năm 1898.", tokenCount: 20, score: 1 }], recheck: async () => true }, generator: { generate: async () => ({ status: "ANSWERED", answerParts: [{ text: "Dinh thự họ Vương được khởi công năm 1898.", mode: "SOURCE", citationIds: [source.id] }], citations: [source], unansweredAspects: [] }) } });
  const start = (resume?: InTripSessionState) => startInTripV2Session({ tripId, headers, resume }, { services, candidates: async () => destinations.filter(d => d.visibility === "VISIBLE" && !d.deletedAt), qaForActor: () => ({ userId: "owner", service: qaService }) });
  return { start, services, headers, database, destinations, llm, getRoute, route, writes, records, qaStore,
    setCompletion: (value: typeof completion) => { completion = value; }, setIdentity: (value: string | null) => { identity = value; },
    setNow: (value: Date) => { now = value; }, setRouteUnavailable: () => { unavailable = true; }, loseResponse: () => { lostResponse = true; }, failWrite: () => { failWrite = true; },
    snapshot: () => structuredClone(trip), bump: () => { trip.updatedAt = new Date(trip.updatedAt.getTime() + 1); },
    qa: () => { route.intent = "QA"; route.qa = { question: "Dinh họ Vương xây năm nào?", subjectName: "Dinh họ Vương", usesReferent: false, compound: false, unsupported: false }; },
    edit: (days = [2], material = false) => { route.intent = "EDIT"; route.needsLocation = material; route.affectedDays = days; route.qa = { question: null, subjectName: null, usesReferent: false, compound: false, unsupported: false }; },
  };
}

describe("V2-06 saved-trip authority through existing US-35/36/37", () => {
  it("keeps a lost apply acknowledgement UNKNOWN on a fresh worker and reconciles the identical operation", async () => {
    const f = fixture(); const a = await f.start();
    await a.send("Bỏ Dinh họ Vương ngày 2", "v207a-unknown-propose");
    f.loseResponse();
    const unknown = await a.send("Áp dụng đi", "v207a-unknown-apply");
    expect(unknown.uncertain).toBe(true);
    const state = JSON.parse(JSON.stringify(a.exportState()));
    expect(state.unknown.key).toBe("v207a-unknown-apply");
    const b = await f.start(state);
    const calls = vi.mocked(f.llm.complete).mock.calls.length;
    expect((await b.send("Bỏ điểm khác ngày 2", "v207a-unknown-new-edit")).plan.goal).toBe("APPLY_UNKNOWN");
    expect(f.llm.complete).toHaveBeenCalledTimes(calls);
    expect((await b.reconcile()).plan.goal).toBe("APPLY_SUCCESS");
    expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
  });
  it("restores pending day clarification and confirmation across fresh sessions", async () => {
    const f = fixture(); const a = await f.start();
    f.route.affectedDays = []; f.setCompletion(input => input.requestData.resolution?.selectedDayIndex === 2 ? remove("vuong2") : { operations: [], mandatoryEndpoint: null, needsClarification: true, clarificationReason: "MISSING_DAY" });
    expect((await a.send("Bỏ Dinh họ Vương", "v207a-clarify-a")).plan.goal).toBe("ASK_CLARIFICATION");
    const b = await f.start(JSON.parse(JSON.stringify(a.exportState())));
    f.edit(); expect((await b.send("Ngày 2", "v207a-clarify-b")).plan.goal).toBe("AWAIT_CONFIRMATION");
    expect(f.writes).toHaveLength(0);
    const c = await f.start(JSON.parse(JSON.stringify(b.exportState())));
    const applied = await c.send("Áp dụng đi", "v207a-confirm-c");
    expect(applied.plan.goal).toBe("APPLY_SUCCESS");
    expect(applied.trip.candidate.days[0]).toEqual(original.days[0]); expect(applied.trip.candidate.days[2]).toEqual(original.days[2]);
    expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
  });
  it.each(["TRAVELER", "ADMIN"] as const)("runs clarification → grounded QA → proposal → explicit apply for %s", async role => {
    const f = fixture(role); const session = await f.start(); const originalDb = f.snapshot();
    f.route.affectedDays = []; f.setCompletion(input => input.requestData.resolution?.selectedDayIndex === 2 ? remove("vuong2") : { operations: [], mandatoryEndpoint: null, needsClarification: true, clarificationReason: "MISSING_DAY" });
    const pending = await session.send("Bỏ Dinh họ Vương đi", "v206-demo-remove");
    expect(pending.plan).toMatchObject({ goal: "ASK_CLARIFICATION", code: "MISSING_DAY", status: "NEEDS_CLARIFICATION" }); expect(pending.message).not.toContain("MISSING_DAY");
    f.qa(); const answer = await session.send("Dinh họ Vương xây năm nào?", "v206-demo-qa"); expect(answer.plan.goal).toBe("QA_ANSWER"); expect(answer.plan.qa?.citations).toHaveLength(1);
    const shown = await session.send("Đồng ý", "v206-demo-qa-agreement"); expect(shown.plan).toMatchObject({ goal: "ASK_CLARIFICATION", code: "MISSING_DAY" }); expect(shown.plan.clarification).toEqual(pending.plan.clarification); expect(f.writes).toHaveLength(0);
    f.edit(); const proposal = await session.send("Ngày 2", "v206-demo-day");
    expect(proposal.plan).toMatchObject({ goal: "AWAIT_CONFIRMATION", requiresConfirmation: true, status: "PROPOSED", currentLocationSource: "UNKNOWN", affectedDays: [2] });
    expect(proposal.proposal?.candidate.days[0]).toEqual(original.days[0]); expect(proposal.proposal?.candidate.days[2]).toEqual(original.days[2]); expect(f.snapshot()).toEqual(originalDb); expect(f.writes).toHaveLength(0);
    const applied = await session.send("Áp dụng đi", "v206-demo-confirm"); expect(applied.plan.goal).toBe("APPLY_SUCCESS"); expect(applied.message).toContain("đã áp dụng");
    expect(applied.trip.candidate.days[1]?.visits.map(v => v.visitId)).toEqual(["v2-end"]); expect(applied.trip.candidate.days[0]).toEqual(original.days[0]); expect(applied.trip.candidate.days[2]).toEqual(original.days[2]);
    expect(f.snapshot().updatedAt.toISOString()).not.toBe(revision); expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
    expect(await session.send("Áp dụng đi", "v206-demo-confirm")).toEqual(applied); expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
  });

  it("does not request location for explicit future-day edits or the next scheduled visit", async () => {
    const f = fixture(); const session = await f.start(); f.route.intent = "NEXT_VISIT";
    const next = await session.send("Điểm tiếp theo là gì?", "v206-next-visit"); expect(next.plan.goal).toBe("NEXT_VISIT"); expect(next.plan.nextVisit?.name).toContain("Điểm hôm nay"); expect(f.llm.complete).not.toHaveBeenCalled();
    f.edit(); const proposal = await session.send("Bỏ Dinh họ Vương ngày 2", "v206-no-gps"); expect(proposal.plan.goal).toBe("AWAIT_CONFIRMATION"); expect(proposal.plan.currentLocationSource).toBe("UNKNOWN");
    for (const call of vi.mocked(f.getRoute).mock.calls) expect(call).toHaveLength(1);
    expect(f.writes).toHaveLength(0);
  });

  it.each(["GPS", "MANUAL"] as const)("normalizes %s only for a material current-position request and applies via US-37", async source => {
    const f = fixture(); const session = await f.start(); f.edit([1], true);
    f.setCompletion({ ...remove("today"), operations: [{ operationType: "CHANGE_TIME", targetVisitId: "today", destinationId: null, params: { dayIndex: null, position: null, startTime: "16:00", durationMinutes: null } }] });
    const need = await session.send("Từ vị trí hiện tại điều chỉnh hôm nay", "v206-material-request"); expect(need.plan.goal).toBe("ASK_LOCATION"); expect(f.llm.complete).not.toHaveBeenCalled();
    const result = source === "MANUAL" ? await session.provideLocation(location, "v206-location-manual") : await session.requestGps({ getCurrentPosition: success => success({ coords: { latitude: location.latitude, longitude: location.longitude, accuracy: 10 }, timestamp: Date.parse(location.capturedAt) } as GeolocationPosition) }, "v206-location-gps");
    expect(result).toHaveProperty("plan.goal", "AWAIT_CONFIRMATION"); expect(result).toHaveProperty("plan.currentLocationSource", source);
    const applied = await session.send("Đồng ý", "v206-material-confirm"); expect(applied.plan.goal).toBe("APPLY_SUCCESS"); expect(applied.trip.candidate.days[0]?.visits[0]).toEqual(original.days[0]?.visits[0]);
    expect(f.getRoute).toHaveBeenCalled();
  });

  it.each([1, 2, 3] as const)("GPS error %s offers manual fallback without claiming a location", async code => {
    const f = fixture(); const session = await f.start(); f.edit([1], true);
    await session.send("Từ đây điều chỉnh hôm nay", "v206-denied-request");
    const gps = await session.requestGps({ getCurrentPosition: (_ok, fail) => fail?.({ code } as GeolocationPositionError) }, "v206-denied-gps");
    expect(gps).toMatchObject({ manualFallback: true }); expect(gps).not.toHaveProperty("plan.currentLocationSource", "GPS"); expect(f.llm.complete).not.toHaveBeenCalled();
    f.setCompletion({ ...remove("today"), operations: [{ operationType: "CHANGE_TIME", targetVisitId: "today", destinationId: null, params: { dayIndex: null, position: null, startTime: "16:00", durationMinutes: null } }] });
    const manual = await session.provideLocation(location, "v206-denied-manual"); expect(manual.plan.currentLocationSource).toBe("MANUAL"); expect(manual.plan.goal).toBe("AWAIT_CONFIRMATION");
    expect(f.writes).toHaveLength(0);
  });

  it("rejects invalid/manual noncoordinates and does not turn a map viewport into a location", async () => {
    const f = fixture(); const session = await f.start(); f.edit([1], true); await session.send("Từ đây chỉnh hôm nay", "v206-invalid-request");
    await expect(session.provideLocation({ source: "MANUAL", place: "Hà Giang" }, "v206-invalid-location")).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(f.llm.complete).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0);
    const unsupported = await session.requestGps(null, "v206-unsupported-gps"); expect(unsupported).toMatchObject({ status: "UNSUPPORTED", manualFallback: true });
  });

  it.each(["AMBIGUOUS_DESTINATION", "MISSING_DAY"] as const)("preserves existing %s semantics with no writes", async clarificationReason => {
    const f = fixture(); const session = await f.start(); f.setCompletion({ operations: [], mandatoryEndpoint: null, needsClarification: true, clarificationReason });
    const result = await session.send("Thêm điểm ngày 2", "v206-clarification"); expect(result.plan.code).toBe(clarificationReason); expect(result.plan.status).toBe("NEEDS_CLARIFICATION"); expect(result.plan.clarification?.choices?.length).toBeGreaterThan(0); expect(f.writes).toHaveLength(0);
  });

  it("rejects completed scope and model changes to an unaffected day", async () => {
    const f = fixture(); const session = await f.start(); f.setCompletion(remove("completed"));
    const before = f.snapshot();
    const completed = await session.send("Bỏ điểm đã ghé ngày 1", "v206-completed-edit"); expect(completed.plan.goal).toBe("APPLY_REJECTED"); expect(f.writes).toHaveLength(0);
    f.edit([2]); f.setCompletion(remove("vuong3")); const outside = await session.send("Bỏ Dinh Vương ngày 2", "v206-other-day"); expect(outside.plan.code).toBe("EDIT_SCOPE_CHANGED"); expect(f.snapshot()).toEqual(before); expect(f.writes).toHaveLength(0);
  });

  it("asks for location if the model misroutes a current-day edit as location-independent", async () => {
    const f = fixture(); const session = await f.start(); f.edit([1], false); f.setCompletion(remove("today"));
    const result = await session.send("Bỏ điểm chiều nay", "v206-origin-guard"); expect(result.plan.goal).toBe("ASK_LOCATION"); expect(f.writes).toHaveLength(0);
  });

  it("does not apply without explicit confirmation and rejects stale/superseded proposals", async () => {
    const f = fixture(); const session = await f.start(); await session.send("Bỏ Dinh Vương ngày 2", "v206-confirm-proposal");
    f.route.intent = "NEXT_VISIT"; await session.send("nghe ổn đấy", "v206-not-confirmed"); expect(f.writes).toHaveLength(0);
    f.bump(); const stale = await session.send("Áp dụng đi", "v206-stale-confirm"); expect(stale.plan.code).toBe("TRIP_REVISION_CONFLICT"); expect(f.writes).toHaveLength(0);
    f.edit(); await session.send("Bỏ Dinh Vương ngày 2", "v206-new-proposal"); f.setCompletion({ operations: [], mandatoryEndpoint: null, needsClarification: true, clarificationReason: "AMBIGUOUS_DESTINATION" });
    await session.send("Thay bằng điểm nào khác", "v206-supersede"); const invalid = await session.send("Đồng ý", "v206-superseded-confirm"); expect(invalid.plan.goal).toBe("APPLY_REJECTED"); expect(f.writes).toHaveLength(0);
  });

  it("revalidates fresh evidence before apply and preserves DB on rejection", async () => {
    const f = fixture(); const session = await f.start(); const before = f.snapshot(); await session.send("Bỏ Dinh Vương ngày 2", "v206-fresh-proposal");
    f.setRouteUnavailable(); const result = await session.send("Áp dụng đi", "v206-fresh-confirm"); expect(result.plan.goal).toBe("APPLY_REJECTED"); expect(f.snapshot()).toEqual(before); expect(f.writes).toHaveLength(0);
  });

  it("shows a nonconfirmable proposal on insufficient Validator evidence", async () => {
    const f = fixture(); f.setRouteUnavailable(); const session = await f.start(); const result = await session.send("Bỏ Dinh Vương ngày 2", "v206-insufficient-proposal");
    expect(result.plan).toMatchObject({ goal: "AWAIT_CONFIRMATION", requiresConfirmation: false }); expect(result.plan.validation?.canConfirm).toBe(false);
    expect((await session.send("Áp dụng đi", "v206-insufficient-confirm")).plan.goal).toBe("APPLY_REJECTED"); expect(f.writes).toHaveLength(0);
  });

  it("keeps apply UNKNOWN across QA, blocks changes and explicitly reconciles the original key once", async () => {
    const f = fixture(); const session = await f.start(); await session.send("Bỏ Dinh Vương ngày 2", "v206-unknown-proposal"); f.loseResponse();
    const unknown = await session.send("Áp dụng đi", "v206-unknown-apply"); expect(unknown.plan.goal).toBe("APPLY_UNKNOWN"); expect(unknown.message).not.toContain("đã áp dụng");
    expect(f.writes.filter(v => v === "revision")).toHaveLength(1); f.qa(); const qa = await session.send("Dinh họ Vương xây năm nào?", "v206-unknown-qa"); expect(qa.plan.goal).toBe("QA_ANSWER"); expect(qa.uncertain).toBe(true);
    f.edit(); expect((await session.send("Bỏ điểm khác", "v206-unknown-edit")).plan.goal).toBe("APPLY_UNKNOWN");
    const routeCount = f.getRoute.mock.calls.length;
    const success = await session.reconcile(); expect(success.plan.goal).toBe("APPLY_SUCCESS"); expect(success.uncertain).toBe(false); expect(f.getRoute).toHaveBeenCalledTimes(routeCount); expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
    await expect(session.reconcile()).rejects.toMatchObject({ code: "IN_TRIP_NOT_UNKNOWN" });
  });

  it("preserves rollback and never claims success on a transaction failure", async () => {
    const f = fixture(); const session = await f.start(); const before = f.snapshot(); await session.send("Bỏ Dinh Vương ngày 2", "v206-rollback-proposal"); f.failWrite();
    const failed = await session.send("Áp dụng đi", "v206-rollback-apply"); expect(failed.plan.goal).toBe("APPLY_UNKNOWN"); expect(f.snapshot()).toEqual(before); expect(f.records.size).toBe(0);
  });

  it("retains pending proposal across QA and requires re-showing it before a bare agreement", async () => {
    const f = fixture(); const session = await f.start();
    f.setCompletion({ ...remove("vuong2"), operations: [{ operationType: "REPLACE_VISIT", targetVisitId: "vuong2", destinationId: "replacement", params: { dayIndex: null, position: null, startTime: null, durationMinutes: null } }] });
    const proposed = await session.send("Thay Dinh họ Vương bằng Lô Lô Chải ngày 2", "v206-interrupt-proposal");
    f.qa(); const qa = await session.send("Dinh họ Vương xây năm nào?", "v206-interrupt-qa"); expect(qa.proposal).toEqual(proposed.proposal);
    const shown = await session.send("Đồng ý", "v206-interrupt-agreement"); expect(shown.plan.goal).toBe("AWAIT_CONFIRMATION"); expect(f.writes).toHaveLength(0);
    expect(shown.message).toContain("Lô Lô Chải"); expect(shown.plan.affectedDays).toEqual([2]); expect(shown.plan.diff).toEqual(proposed.plan.diff);
    expect((await session.send("Đồng ý", "v206-interrupt-confirm")).plan.goal).toBe("APPLY_SUCCESS");
  });

  it.each([null, "foreign"])("denies identity %s before model/read data or writes", async identity => {
    const f = fixture(); f.setIdentity(identity); await expect(f.start()).rejects.toMatchObject(identity === null ? { status: 401 } : { code: "IN_TRIP_CONTEXT_REQUIRED" }); expect(f.llm.complete).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0);
  });

  it("enforces ownership on each action/replay and protects schemas/allowlists", async () => {
    const f = fixture(); const session = await f.start(); const first = await session.send("Bỏ Dinh Vương ngày 2", "v206-auth-proposal");
    const input = { skill: "in-trip-assistance", context: { userId: "owner", workspace: null, savedTripId: tripId }, action: "read-saved-trip" as const, payload: { tripId: "foreign" } };
    await expect(executeAssistantV2Action(input, { inTrip: f.services })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(executeAssistantV2Action({ ...input, payload: {}, context: { ...input.context, savedTripId: "foreign" } }, { inTrip: f.services })).rejects.toMatchObject({ cause: { code: "IN_TRIP_CONTEXT_REQUIRED" } });
    for (const skill of ["travel-planning", "ha-giang-qa", "itinerary-replanning"]) await expect(executeAssistantV2Action({ ...input, skill, payload: {} }, { inTrip: f.services })).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
    const candidate = first.proposal!.candidate;
    expect(inTripReplanRequestSchema.safeParse({ baseRevision: revision, need: "Bỏ điểm", location: null }).success).toBe(false);
    expect(inTripPreviewRequestSchema.safeParse({ baseRevision: revision, candidate }).success).toBe(false);
    expect(applyEditRequestSchema.safeParse({ baseRevision: revision, candidate, kind: "IN_TRIP", confirmed: true }).success).toBe(false);
    f.setIdentity("foreign"); await expect(session.send("Bỏ Dinh Vương ngày 2", "v206-auth-proposal")).rejects.toBeDefined(); expect(f.writes).toHaveLength(0);
  });

  it("keeps deleted historical labels unavailable and does not offer deleted replacements", async () => {
    const f = fixture(); f.destinations.find(d => d.id === "vuong")!.deletedAt = new Date("2026-10-26T00:00:00Z");
    // Existing saved history is retained; the DB fixture projects its historical
    // destination object so getTripForEdit applies the current unavailable label.
    const session = await f.start(); f.setCompletion({ operations: [], mandatoryEndpoint: null, needsClarification: true, clarificationReason: "AMBIGUOUS_DESTINATION" });
    const result = await session.send("Thay bằng điểm khác ngày 2", "v206-deleted-choice");
    expect(result.plan.clarification?.choices?.some(c => c.resolution.selectedDestinationId === "vuong")).toBe(false); expect(result.trip.destinationLabels.vuong).toBe("Điểm đến không còn khả dụng"); expect(f.snapshot().days[1]?.visits[0]?.destinationId).toBe("vuong"); expect(f.writes).toHaveLength(0);
  });

  it("rejects a future-day proposal if the server clock reaches that day before apply without a location", async () => {
    const f = fixture(); const session = await f.start(); const before = f.snapshot(); await session.send("Bỏ Dinh Vương ngày 2", "v206-day-boundary-proposal");
    f.setNow(new Date("2026-10-28T00:00:00Z"));
    const result = await session.send("Đồng ý", "v206-day-boundary-apply"); expect(result.plan.goal).toBe("APPLY_REJECTED"); expect(f.snapshot()).toEqual(before); expect(f.writes).toHaveLength(0);
  });

  it("does not expose raw coordinates to either the router or existing US-36 provider", async () => {
    const f = fixture(); const session = await f.start(); await session.provideLocation(location, "v206-privacy-location"); await session.send("Bỏ Dinh Vương ngày 2", "v206-privacy-proposal");
    const call = vi.mocked(f.llm.complete).mock.lastCall!;
    expect(call[0].user).not.toContain(String(location.latitude)); expect(call[0].user).not.toContain(String(location.longitude)); expect(call[0].user).not.toContain("capturedAt"); expect(f.writes).toHaveLength(0);
  });

  it.each(["Lô Lô Chải", "Điểm văn hóa độc lập"])("reuses generic US-36 replacement for %s without applying it", async replacementName => {
    const f = fixture(); f.destinations.find(d => d.id === "replacement")!.name = replacementName;
    const session = await f.start(); const before = f.snapshot();
    f.setCompletion({ ...remove("vuong2"), operations: [{ operationType: "REPLACE_VISIT", targetVisitId: "vuong2", destinationId: "replacement", params: { dayIndex: null, position: null, startTime: null, durationMinutes: null } }] });
    const result = await session.send(`Thay Dinh họ Vương bằng ${replacementName} ngày 2`, "v206-replace-proposal");
    expect(result.plan.goal).toBe("AWAIT_CONFIRMATION"); expect(result.message).toContain("Dinh thự họ Vương"); expect(result.message).toContain(replacementName);
    expect(result.proposal?.candidate.days[0]).toEqual(original.days[0]); expect(result.proposal?.candidate.days[2]).toEqual(original.days[2]);
    expect(result.plan.validation).toHaveProperty("canConfirm", true); expect(f.getRoute).toHaveBeenCalled();
    expect(result.proposal?.candidate.days[1]?.visits[0]).toMatchObject({ visitId: "vuong2", destinationId: "replacement" }); expect(f.snapshot()).toEqual(before); expect(f.writes).toHaveLength(0);
  });

  it("retains the safely resolved QA referent when returning to the existing in-trip analyzer", async () => {
    const f = fixture(); const session = await f.start(); f.qa(); await session.send("Dinh họ Vương xây năm nào?", "v206-referent-qa");
    f.edit(); f.route.qa.usesReferent = true;
    const result = await session.send("Bỏ điểm đó ngày 2", "v206-referent-edit"); expect(result.plan.goal).toBe("AWAIT_CONFIRMATION");
    const body = JSON.parse(vi.mocked(f.llm.complete).mock.lastCall![0].user) as { requestData: { need: string } };
    expect(body.requestData.need).toContain("Dinh thự họ Vương"); expect(f.writes).toHaveLength(0);
  });

  it("rejects a competing session's old revision and does not perform a second write", async () => {
    const f = fixture(); const a = await f.start(); const b = await f.start();
    await a.send("Bỏ Dinh Vương ngày 2", "v206-two-tabs-a-proposal"); await b.send("Bỏ Dinh Vương ngày 2", "v206-two-tabs-b-proposal");
    expect((await a.send("Đồng ý", "v206-two-tabs-a-apply")).plan.goal).toBe("APPLY_SUCCESS");
    const stale = await b.send("Đồng ý", "v206-two-tabs-b-apply"); expect(stale.plan).toMatchObject({ goal: "APPLY_REJECTED", code: "TRIP_REVISION_CONFLICT" }); expect(f.writes.filter(v => v === "revision")).toHaveLength(1);
  });
});
