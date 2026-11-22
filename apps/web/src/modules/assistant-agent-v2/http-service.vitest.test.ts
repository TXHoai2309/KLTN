import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { AppError } from "../../server/http/app-error";
import { AssistantV2Error } from "./agent-errors";
import { createAssistantV2HttpService } from "./http-service";
import type { startSavedTripAssistantV2 } from "./in-trip-runtime";
import { createTestSessionHeadStore } from "./session-head-test-store";
import type { InTripSessionState } from "./in-trip-session";

function fixture() {
  let time = 0;
  let headers: Headers;
  let readable = true;
  let token: string | undefined;
  const state: InTripSessionState = { location: null, awaitingLocation: null, clarification: null, pending: null, interrupted: false, unknown: null, qa: { head: null, subject: null } };
  const snapshot = vi.fn(async () => { if (!readable) throw new AppError("UNAUTHENTICATED", "revoked", 401); return { trip: { baseRevision: "current" } }; });
  const send = vi.fn(async (text: string) => ({ message: text, uncertain: false }));
  const provideLocation = vi.fn(async () => ({ uncertain: false }));
  const reconcile = vi.fn(async () => ({ uncertain: false }));
  const startInTrip = vi.fn(async (input: { tripId: string; headers: Headers }) => {
    headers = input.headers;
    if (input.tripId === "foreign") throw new AssistantV2Error("ACTION_EXECUTION_FAILED", { cause: new AppError("TRIP_NOT_FOUND", "not owned", 404) });
    return { snapshot, send, provideLocation, reconcile, exportState: () => structuredClone(state) };
  });
  const forActor = vi.fn(() => { throw Error("Planning must not run for a saved Trip"); });
  const dispatch = createAssistantV2HttpService({ authorization: {} as AuthorizationDependencies, forActor, startInTrip: startInTrip as unknown as typeof startSavedTripAssistantV2, heads: createTestSessionHeadStore(), secret: () => "v207a-test-only-secret-with-at-least-32-characters", now: () => time });
  const call = async (input: Parameters<typeof dispatch>[0], key = "v207-service-key", actorId = "owner", cookie = "old-cookie") => {
    const request = input.operation === "START" ? input : { ...input, stateToken: input.stateToken ?? token };
    const result = await dispatch(request, key, actorId, new Headers({ cookie }));
    if (actorId === "owner" && result && typeof result === "object" && "stateToken" in result && typeof result.stateToken === "string") token = result.stateToken;
    return result;
  };
  const start = async () => await call({ action: "ASSISTANT_V2", operation: "START", tripId: "own" }) as { sessionId: string; stateToken: string };
  return { call, start, send, provideLocation, reconcile, snapshot, startInTrip, forActor, headers: () => headers!, advance: () => { time += 31 * 60_000; }, revoke: () => { readable = false; } };
}
describe("V2-07 HTTP interaction ownership, replay and lifecycle", () => {
  it("does not use a process-local admission limit for valid durable heads", async () => {
    const f = fixture();
    const first = await f.start();
    for (let i = 0; i < 17; i++) await f.call({ action: "ASSISTANT_V2", operation: "START", tripId: "own" }, `v207-bound-${i}`);
    await expect(f.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId: first.sessionId, stateToken: first.stateToken, text: "still owned" }, "v207-after-17")).resolves.toMatchObject({ turn: { message: "still owned" } });
  });
  it("binds the explicit saved Trip, checks initial authority and replays START once", async () => {
    const f = fixture(); const first = await f.start();
    expect(await f.start()).toEqual(first); expect(f.startInTrip).toHaveBeenCalledTimes(2); expect(f.snapshot).toHaveBeenCalledTimes(2); expect(f.forActor).not.toHaveBeenCalled();
    await expect(f.call({ action: "ASSISTANT_V2", operation: "START", tripId: "different" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("does not turn a foreign Trip ID into an owned session", async () => {
    const f = fixture(); await expect(f.call({ action: "ASSISTANT_V2", operation: "START", tripId: "foreign" })).rejects.toMatchObject({ status: 404 }); expect(f.send).not.toHaveBeenCalled();
  });
  it("rejects another actor's handle before read/model/mutation", async () => {
    const f = fixture(); const { sessionId } = await f.start();
    await expect(f.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Áp dụng đi" }, "v207-foreign-key", "other")).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
    expect(f.snapshot).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled();
  });
  it("refreshes rotated auth headers and rechecks authority even for same-key replay", async () => {
    const f = fixture(); const { sessionId, stateToken } = await f.start(); const request = { action: "ASSISTANT_V2" as const, operation: "TURN" as const, sessionId, stateToken, text: "Đề xuất trước khi áp dụng" };
    const first = await f.call(request, "v207-turn-key", "owner", "rotated-cookie");
    expect(f.headers().get("cookie")).toBe("rotated-cookie"); expect(await f.call(request, "v207-turn-key")).toEqual(first); expect(f.send).toHaveBeenCalledOnce();
    f.revoke(); await expect(f.call(request, "v207-turn-key")).rejects.toMatchObject({ status: 401 }); expect(f.send).toHaveBeenCalledOnce();
  });
  it("never executes a changed payload under an old key", async () => {
    const f = fixture(); const { sessionId, stateToken } = await f.start(); await f.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, stateToken, text: "Bỏ A ngày 2" }, "v207-same-key");
    await expect(f.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, stateToken, text: "Áp dụng đi" }, "v207-same-key")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" }); expect(f.send).toHaveBeenCalledOnce();
  });
  it("expires transient handles safely and does not guess an old proposal after process loss", async () => {
    const f = fixture(); const { sessionId } = await f.start(); f.advance();
    await expect(f.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Áp dụng đi" })).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" }); expect(f.send).not.toHaveBeenCalled();
    const fresh = fixture(); await expect(fresh.call({ action: "ASSISTANT_V2", operation: "TURN", sessionId, text: "Áp dụng đi" })).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
  });
  it("delegates only explicit normalized location and reconciliation; START never asks for GPS", async () => {
    const f = fixture(); const { sessionId } = await f.start(); expect(f.provideLocation).not.toHaveBeenCalled();
    const location = { source: "MANUAL" as const, latitude: 23, longitude: 105, capturedAt: "2026-10-29T00:00:00.000Z" };
    await f.call({ action: "ASSISTANT_V2", operation: "LOCATION", sessionId, location }, "v207-location-key"); expect(f.provideLocation).toHaveBeenCalledWith(location, "v207-location-key");
    await f.call({ action: "ASSISTANT_V2", operation: "RECONCILE", sessionId }, "v207-reconcile-key"); expect(f.reconcile).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled();
  });
  it("does not expose the new-trip Save capability to an in-trip session", async () => {
    const f = fixture(); const { sessionId } = await f.start(); await expect(f.call({ action: "ASSISTANT_V2", operation: "SAVE", sessionId, confirmed: true }, "v207-unsupported-save")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_UNSUPPORTED" }); expect(f.send).not.toHaveBeenCalled();
  });
});
