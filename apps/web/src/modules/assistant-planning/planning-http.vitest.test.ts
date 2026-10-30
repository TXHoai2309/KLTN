import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningResponse } from "./planning-http";
import { assistantV2RequestSchema } from "../assistant-agent-v2/http-contract";
import { assistantV2Fetch } from "../../components/assistant/assistant-v2-client";

afterEach(() => vi.unstubAllEnvs());
let actorSequence = 0;
function fixture(role: "TRAVELER" | "ADMIN" = "TRAVELER", identity: string | null = `route-owner-${++actorSequence}`) {
  const authorization = { database: { user: { findUnique: async () => ({ id: identity, role, status: "ACTIVE" }) } }, resolveSession: async () => identity ? { user: { id: identity } } : null } as unknown as AuthorizationDependencies;
  const v2 = vi.fn(async () => ({ runtimeVersion: "v2", mode: "PLANNING", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
  return { authorization, v2 };
}
const request = (body: unknown, headers = {}) => new Request("https://app.test/api/ai/planning", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", "Idempotency-Key": "planning-route-test-key", ...headers }, body: JSON.stringify(body) });
const v2start = { action: "ASSISTANT_V2", operation: "START" };

describe("Planning route: the single V2 assistant endpoint", () => {
  it.each(["TRAVELER", "ADMIN"] as const)("dispatches the V2 action for %s with the server owner ID", async role => {
    const deps = fixture(role);
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Assistant-Runtime")).toBe("v2");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.v2).toHaveBeenCalledOnce();
    expect(deps.v2).toHaveBeenCalledWith(expect.objectContaining({ action: "ASSISTANT_V2", operation: "START" }), "planning-route-test-key", expect.stringMatching(/^route-owner-/), expect.any(Headers));
  });
  it("ignores a leftover ASSISTANT_RUNTIME_VERSION deployment setting", async () => {
    for (const value of ["v1", "v2", "", "garbage"]) {
      vi.stubEnv("ASSISTANT_RUNTIME_VERSION", value);
      const deps = fixture();
      const response = await planningResponse(request(v2start), deps);
      expect(response.status).toBe(200);
      expect(deps.v2).toHaveBeenCalledOnce();
    }
  });
  it.each([
    { action: "START", conversationId: null },
    { action: "READ", conversationId: "chat" },
    { action: "ANALYZE", conversationId: "chat", text: "đi Hà Giang" },
  ])("rejects the retired V1 planning action $action without running anything", async body => {
    const deps = fixture();
    const response = await planningResponse(request(body), deps);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.v2).not.toHaveBeenCalled();
  });
  it("rejects a body without an action", async () => {
    const deps = fixture();
    expect((await planningResponse(request({}), deps)).status).toBe(400);
    expect((await planningResponse(request([]), deps)).status).toBe(400);
    expect(deps.v2).not.toHaveBeenCalled();
  });
  it("rejects Guests before reading the body or running the assistant", async () => {
    const deps = fixture("TRAVELER", null);
    const req = request(v2start);
    const read = vi.spyOn(req, "body", "get");
    const response = await planningResponse(req, deps);
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled(); expect(deps.v2).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps same-origin and strict schema boundaries", async () => {
    const deps = fixture();
    expect((await planningResponse(request(v2start, { origin: "https://foreign.test" }), deps)).status).toBe(403);
    expect((await planningResponse(request({ ...v2start, userId: "foreign" }), deps)).status).toBe(400);
    expect(assistantV2RequestSchema.safeParse({ action: "ASSISTANT_V2", operation: "SAVE", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", confirmed: false }).success).toBe(false);
    expect(deps.v2).not.toHaveBeenCalled();
  });
  it("reports the assistant unavailable when no V2 service is configured", async () => {
    const response = await planningResponse(request(v2start), { authorization: fixture().authorization });
    expect(response.status).toBe(503);
  });
  it.each(["invalid structured output", "timeout", "provider error", "empty output", "unsupported decision"])("maps %s to a controlled error without leaking provider details", async message => {
    const deps = fixture();
    deps.v2.mockRejectedValueOnce(new Error(message + " private-provider-secret"));
    const response = await planningResponse(request(v2start), deps);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-provider-secret");
  });
  it("renders a friendly transport error and keeps the exact request/key on caller retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: false, error: { code: "PLANNING_UNAVAILABLE", message: "private stack" } }, { status: 503 })).mockResolvedValueOnce(Response.json({ success: true, data: { runtimeVersion: "v2", mode: "PLANNING" } }));
    await expect(assistantV2Fetch(v2start as Parameters<typeof assistantV2Fetch>[0], "planning-client-key", fetcher)).rejects.toThrow("Chưa hoàn tất yêu cầu");
    await assistantV2Fetch(v2start as Parameters<typeof assistantV2Fetch>[0], "planning-client-key", fetcher);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(fetcher.mock.calls[1]?.[1]?.body);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(fetcher.mock.calls[1]?.[1]?.headers);
  });
});
