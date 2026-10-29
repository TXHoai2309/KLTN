import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "../../server/http/app-error";
import { measureAssistantTurn } from "../../server/assistant-turn-metrics";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { executePlanning } from "../assistant-planning/planning-service";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { startTravelPlanningV2Session } from "./travel-planning-session";
import type { startSavedTripAssistantV2 } from "./in-trip-runtime";
import type { AssistantV2Request } from "./http-contract";
import { AssistantV2Error } from "./agent-errors";
import { capsuleSessionId, openSessionCapsule, sealSessionCapsule, type SessionCapsule } from "./session-capsule";
import { SESSION_TTL_MS, sessionExpired, type SessionHeadStore } from "./session-head-store";

type Dependencies = {
  authorization: AuthorizationDependencies;
  forActor: (id: string, headers: Headers) => PlanningDependencies;
  heads: SessionHeadStore;
  secret: () => string;
  startInTrip?: typeof startSavedTripAssistantV2;
  startPlanning?: typeof startTravelPlanningV2Session;
  now?: () => number;
};
type LiveSession =
  | { mode: "PLANNING"; session: Awaited<ReturnType<typeof startTravelPlanningV2Session>>; deps: PlanningDependencies }
  | { mode: "IN_TRIP"; session: Awaited<ReturnType<typeof startSavedTripAssistantV2>> };
const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

/** Client carries authenticated encrypted convenience state; shared DB holds
 * only an owner/subject/version/CAS head. Every worker can reconstruct a session.
 * The bounded cache coalesces local retries only, never grants availability,
 * ownership, proposal currency or permission to write. */
export function createAssistantV2HttpService(deps: Dependencies) {
  const replay = new Map<string, { hash: string; expires: number; result: Promise<unknown> }>();
  const now = deps.now ?? Date.now;
  async function startTrip(tripId: string, headers: Headers, resume?: Extract<SessionCapsule, { mode: "IN_TRIP" }>["state"]): Promise<LiveSession> {
    const start = deps.startInTrip ?? (await import("./in-trip-runtime")).startSavedTripAssistantV2;
    return { mode: "IN_TRIP", session: await start({ tripId, headers, resume }) };
  }
  async function startPlanning(actorId: string, headers: Headers, key: string, input: Parameters<typeof startTravelPlanningV2Session>[0]): Promise<LiveSession> {
    const planning = deps.forActor(actorId, headers);
    return { mode: "PLANNING", deps: planning, session: await (deps.startPlanning ?? startTravelPlanningV2Session)({ ...input, headers, key }, { authorization: deps.authorization, forActor: () => planning }) };
  }
  function capture(live: LiveSession, sessionId: string, actorId: string, version: number, tripId?: string): SessionCapsule {
    const common = { format: 1 as const, sessionId, actorId, version, expiresAt: now() + SESSION_TTL_MS };
    return live.mode === "PLANNING" ? { ...common, mode: "PLANNING", state: live.session.exportState() }
      : { ...common, mode: "IN_TRIP", tripId: tripId!, state: live.session.exportState() };
  }
  return async function dispatch(request: AssistantV2Request, key: string, actorId: string, headers: Headers) {
    for (const [id, item] of replay) if (item.expires <= now()) replay.delete(id);
    const secret = deps.secret();
    const sessionId = request.operation === "START" ? capsuleSessionId(actorId, key, secret) : request.sessionId;
    const capsule = request.operation === "START" ? null : request.stateToken
      ? openSessionCapsule(request.stateToken, actorId, sessionId, secret, now()) : (() => { throw sessionExpired(); })();
    const hash = digest(request), scope = digest([actorId, sessionId, key]);
    const existing = replay.get(scope);
    if (existing) {
      if (existing.hash !== hash) throw new AppError("IDEMPOTENCY_CONFLICT", "Mã lượt đã dùng cho nội dung khác.", 409);
      // Fresh headers/domain authorization even when a local response is cached.
      if (capsule?.mode === "IN_TRIP") await (await startTrip(capsule.tripId, headers, capsule.state)).session.snapshot();
      else if (capsule?.mode === "PLANNING") await deps.forActor(actorId, headers).repository.read(capsule.state.workspace.conversationId);
      else if (request.operation === "START" && request.tripId) await (await startTrip(request.tripId, headers)).session.snapshot();
      else if (request.operation === "START") {
        const head = await deps.heads.read(sessionId, actorId);
        if (!head) throw sessionExpired();
        await deps.forActor(actorId, headers).repository.read(head.subject.slice("PLANNING:".length));
      }
      return existing.result;
    }
    const result = measureAssistantTurn(async () => {
      if (request.operation === "START") {
        const live = request.tripId ? await startTrip(request.tripId, headers)
          : await startPlanning(actorId, headers, key, { headers, key, conversationId: null, context: request.context });
        const initial = await live.session.snapshot();
        const capsule = capture(live, sessionId, actorId, 0, request.tripId);
        const subject = capsule.mode === "PLANNING" ? "PLANNING:" + capsule.state.workspace.conversationId : "IN_TRIP:" + capsule.tripId;
        const head = await deps.heads.create({ id: sessionId, userId: actorId, subject, startHash: hash }, now());
        if (head.version !== 0 || head.leaseToken || head.expiresAt.getTime() <= now()) throw sessionExpired();
        return { runtimeVersion: "v2", sessionId, mode: live.mode, initial, stateToken: sealSessionCapsule(capsule, secret) };
      }
      if (!capsule) throw sessionExpired();
      const subject = capsule.mode === "PLANNING" ? "PLANNING:" + capsule.state.workspace.conversationId : "IN_TRIP:" + capsule.tripId;
      const live = capsule.mode === "PLANNING"
        ? await startPlanning(actorId, headers, key, { headers, key, conversationId: capsule.state.workspace.conversationId, resume: capsule.state })
        : await startTrip(capsule.tripId, headers, capsule.state);
      await live.session.snapshot();
      const lease = await deps.heads.claim({ id: sessionId, userId: actorId, subject, version: capsule.version, keyHash: digest(key), requestHash: hash }, now());
      try {
        let data;
        if (request.operation === "TURN") data = { turn: await live.session.send(request.text, key) };
        else if (live.mode === "IN_TRIP" && request.operation === "LOCATION") data = { turn: await live.session.provideLocation(request.location, key) };
        else if (live.mode === "IN_TRIP" && request.operation === "RECONCILE") data = { turn: await live.session.reconcile() };
        else if (live.mode === "PLANNING" && request.operation === "RECONCILE") {
          const current = await live.session.snapshot();
          data = { save: await executePlanning({ action: "RECONCILE", conversationId: current.workspace.conversationId }, key, live.deps) };
        } else if (live.mode === "PLANNING" && request.operation === "SAVE") {
          const current = await live.session.snapshot();
          if (current.uncertain || !current.generated) throw new AppError("PLANNING_CHANGED", "Cần phương án hiện hành đã kiểm tra trước khi lưu.", 409);
          data = { save: await executePlanning({ action: "SAVE", conversationId: current.workspace.conversationId, version: current.workspace.version, confirm: true, proposal: current.generated.proposal }, key, live.deps) };
        } else throw new AppError("ASSISTANT_ACTION_UNSUPPORTED", "Thao tác này không thuộc phiên hiện tại.", 422);
        const next = capture(live, sessionId, actorId, capsule.version + 1, capsule.mode === "IN_TRIP" ? capsule.tripId : undefined);
        const stateToken = sealSessionCapsule(next, secret);
        await deps.heads.complete(sessionId, actorId, capsule.version, lease, now());
        return { runtimeVersion: "v2", sessionId, mode: live.mode, ...data, stateToken };
      } catch (error) {
        // Do not replay an ambiguously completed domain action after process loss.
        // Expiry requires reopening from canonical DB data, never guessed apply.
        try { await deps.heads.abandon(sessionId, actorId, lease, now()); } catch { /* Remains fenced/busy, never authorized for a second write. */ }
        throw error;
      }
    }).catch(error => {
      if (error instanceof AssistantV2Error && error.cause instanceof AppError) throw error.cause;
      throw error;
    });
    if (replay.size >= 64) replay.delete(replay.keys().next().value!);
    replay.set(scope, { hash, expires: now() + SESSION_TTL_MS, result });
    return result;
  };
}
