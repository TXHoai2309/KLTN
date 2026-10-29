import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantRuntimeVersion } from "./runtime-gate";
import { planningResponse } from "../assistant-planning/planning-http";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import type { PlanningDependencies } from "../assistant-planning/planning-service";
import { assistantV2RequestSchema } from "./http-contract";
import { assistantV2Fetch } from "../../components/assistant/assistant-v2-client";

afterEach(() => vi.unstubAllEnvs());
let actorSequence = 0;
function fixture(role: "TRAVELER" | "ADMIN" = "TRAVELER", identity: string | null = `gate-owner-${++actorSequence}`) {
  const authorization = { database: { user: { findUnique: async () => ({ id: identity, role, status: "ACTIVE" }) } }, resolveSession: async () => identity ? { user: { id: identity } } : null } as unknown as AuthorizationDependencies;
  const workspace = { conversationId: "owned", version: 0, needs: { requirement: {}, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} }, pendingSaveKey: null, savedTripId: null };
  const start = vi.fn(async () => workspace);
  const forActor = vi.fn(() => ({ repository: { start }, now: () => new Date("2026-10-28T00:00:00Z") } as unknown as PlanningDependencies));
  const v2 = vi.fn(async () => ({ runtimeVersion: "v2", mode: "PLANNING", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
  return { authorization, forActor, v2, start };
}
const request = (body: unknown, headers = {}) => new Request("https://app.test/api/ai/planning", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", "Idempotency-Key": "v207-gate-test-key", ...headers }, body: JSON.stringify(body) });
const v2start = { action: "ASSISTANT_V2", operation: "START" };

describe("V2-07 production endpoint gate and rollback", () => {
  it("selects V2 when the server setting is absent", () => {
    vi.stubEnv("ASSISTANT_RUNTIME_VERSION", undefined);
    expect(assistantRuntimeVersion()).toBe("v2");
  });
  it.each(["", "V2", "garbage", "v1"])("retains safe V1 selection for %s", value => {
    vi.stubEnv("ASSISTANT_RUNTIME_VERSION", value);
    expect(assistantRuntimeVersion()).toBe("v1");
  });
  it("selects V2 only for its exact server configuration", () => expect(assistantRuntimeVersion("v2")).toBe("v2"));
  it.each(["TRAVELER", "ADMIN"] as const)("dispatches the default V2 path for %s without a flag", async role => {
    const deps = fixture(role); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", undefined);
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(200); expect(response.headers.get("X-Assistant-Runtime")).toBe("v2");
    expect(deps.v2).toHaveBeenCalledOnce(); expect(deps.forActor).not.toHaveBeenCalled();
  });
  it("handles an invalid configured value through V1 without dispatching V2", async () => {
    const deps = fixture(); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "invalid");
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("ASSISTANT_RUNTIME_CHANGED");
    expect(deps.v2).not.toHaveBeenCalled(); expect(deps.forActor).not.toHaveBeenCalled();
    expect((await planningResponse(request({ action: "START", conversationId: null }), deps)).status).toBe(200);
    expect(deps.start).toHaveBeenCalledOnce();
  });
  it("keeps the V1 contract and invokes no V2 service when disabled", async () => {
    const deps = fixture(); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v1");
    const response = await planningResponse(request({ action: "START", conversationId: null }), deps);
    expect(response.status).toBe(200); expect(response.headers.get("X-Assistant-Runtime")).toBe("v1");
    expect(deps.start).toHaveBeenCalledOnce(); expect(deps.v2).not.toHaveBeenCalled();
    expect((await response.json()).data.conversationId).toBe("owned");
  });
  it.each(["TRAVELER", "ADMIN"] as const)("runs V2 then rolls back on the same endpoint for %s without replaying the turn through V1", async role => {
    const deps = fixture(role); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v2");
    const enabled = await planningResponse(request(v2start), deps);
    expect(enabled.status).toBe(200); expect(enabled.headers.get("X-Assistant-Runtime")).toBe("v2"); expect(deps.v2).toHaveBeenCalledOnce(); expect(deps.forActor).not.toHaveBeenCalled();
    vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v1");
    const closed = await planningResponse(request(v2start), deps);
    expect(closed.status).toBe(409); expect((await closed.json()).error.code).toBe("ASSISTANT_RUNTIME_CHANGED");
    const legacy = await planningResponse(request({ action: "START", conversationId: null }), deps);
    expect(legacy.status).toBe(200); expect(deps.start).toHaveBeenCalledOnce(); expect(deps.v2).toHaveBeenCalledOnce();
  });
  it("authenticates before any runtime/body/model work", async () => {
    const deps = fixture("TRAVELER", null); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v2");
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(401); expect(deps.v2).not.toHaveBeenCalled(); expect(deps.forActor).not.toHaveBeenCalled();
  });
  it("keeps same-origin and strict schema boundaries", async () => {
    const deps = fixture(); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v2");
    expect((await planningResponse(request(v2start, { origin: "https://foreign.test" }), deps)).status).toBe(403);
    expect((await planningResponse(request({ ...v2start, userId: "foreign" }), deps)).status).toBe(400);
    expect(assistantV2RequestSchema.safeParse({ action: "ASSISTANT_V2", operation: "SAVE", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", confirmed: false }).success).toBe(false);
    expect(deps.v2).not.toHaveBeenCalled();
  });
  it.each(["invalid structured output", "timeout", "provider error", "empty output", "unsupported decision"])("maps %s to a controlled error without leaking provider details", async message => {
    const deps = fixture(); vi.stubEnv("ASSISTANT_RUNTIME_VERSION", "v2");
    deps.v2.mockRejectedValueOnce(new Error(message + " private-provider-secret"));
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-provider-secret"); expect(deps.start).not.toHaveBeenCalled();
  });
  it("renders a friendly transport error and keeps the exact request/key on caller retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: false, error: { code: "PLANNING_UNAVAILABLE", message: "private stack" } }, { status: 503 })).mockResolvedValueOnce(Response.json({ success: true, data: { runtimeVersion: "v2", mode: "PLANNING" } }));
    await expect(assistantV2Fetch(v2start as Parameters<typeof assistantV2Fetch>[0], "v207-client-key", fetcher)).rejects.toThrow("Chưa hoàn tất yêu cầu");
    await assistantV2Fetch(v2start as Parameters<typeof assistantV2Fetch>[0], "v207-client-key", fetcher);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(fetcher.mock.calls[1]?.[1]?.body);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(fetcher.mock.calls[1]?.[1]?.headers);
  });
});
