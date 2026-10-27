import { describe, expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { planningResponse } from "./planning-http";

const authorization = (role: "TRAVELER" | "ADMIN" = "TRAVELER"): AuthorizationDependencies => ({ resolveSession: async () => ({ user: { id: "owner" } }), database: { user: { findUnique: async () => ({ id: "owner", role, status: "ACTIVE" }) } } as unknown as AuthorizationDependencies["database"] });
const request = (body: unknown, origin = "https://app.test") => new Request("https://app.test/api/ai/planning", { method: "POST", headers: { "content-type": "application/json", origin, "Idempotency-Key": "test-request-key" }, body: JSON.stringify(body) });
describe("Planning route auth and request boundary", () => {
  it("rejects Guests before reading body or constructing service dependencies", async () => {
    const forActor = vi.fn();
    const req = request({ action: "START", conversationId: null });
    const read = vi.spyOn(req, "body", "get");
    const response = await planningResponse(req, { authorization: { ...authorization(), resolveSession: async () => null }, forActor });
    expect(response.status).toBe(401);
    expect(forActor).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects cross-origin and unexpected owner fields before invoking the service", async () => {
    const forActor = vi.fn();
    expect((await planningResponse(request({ action: "START", conversationId: null }, "https://evil.test"), { authorization: authorization(), forActor })).status).toBe(403);
    expect((await planningResponse(request({ action: "START", conversationId: null, userId: "other" }), { authorization: authorization(), forActor })).status).toBe(400);
    expect(forActor).not.toHaveBeenCalled();
  });
  it.each(["TRAVELER", "ADMIN"] as const)("admits %s with the server owner ID", async role => {
    const read = vi.fn(async () => ({ conversationId: "chat" }));
    const forActor = vi.fn(() => ({ repository: { read }, now: () => new Date("2026-10-27T03:00:00Z") })) as unknown as Parameters<typeof planningResponse>[1]["forActor"];
    const response = await planningResponse(request({ action: "READ", conversationId: "chat" }), { authorization: authorization(role), forActor });
    expect(response.status).toBe(200); expect(forActor).toHaveBeenCalledWith("owner", expect.any(Headers));
    expect(read).toHaveBeenCalledWith("chat");
  });
});
