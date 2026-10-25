import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../server/http/app-error";
import { createQaPrincipalResolver } from "./qa-principal";
import type { Database } from "@KLTN/db";

const runtime = vi.hoisted(() => ({
  qaRuntimeEnabled: vi.fn(() => true),
  qaPrincipalResolver: { bootstrap: vi.fn(), revoke: vi.fn() },
  qaService: { ask: vi.fn(), get: vi.fn(), revokeGuest: vi.fn() },
}));
vi.mock("./qa-runtime", () => runtime);
import { POST } from "../../app/api/ai/session/route";

const request = (origin = "http://localhost") => new Request("http://localhost/api/ai/session", { method: "POST", headers: { origin } });

describe("panel opening uses the existing identity bootstrap only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.qaRuntimeEnabled.mockReturnValue(true);
    runtime.qaPrincipalResolver.bootstrap.mockResolvedValue({ principal: { kind: "GUEST", id: "fixture_guest" } });
  });
  it("returns correlation identity with no conversation or ask dispatch", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: { identity: "GUEST:fixture_guest" } });
    expect(runtime.qaService.ask).not.toHaveBeenCalled();
    expect(runtime.qaService.get).not.toHaveBeenCalled();
    expect(runtime.qaService.revokeGuest).not.toHaveBeenCalled();
  });
  it("fails closed before bootstrap for disabled runtime and foreign origin", async () => {
    runtime.qaRuntimeEnabled.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    runtime.qaRuntimeEnabled.mockReturnValue(true);
    expect((await POST(request("https://foreign.invalid"))).status).toBe(403);
    expect(runtime.qaPrincipalResolver.bootstrap).not.toHaveBeenCalled();
  });
  it.each([new AppError("UNAUTHENTICATED", "private", 401), new Error("private SQL/token")])("bootstrap failure does not manufacture an identity", async failure => {
    runtime.qaPrincipalResolver.bootstrap.mockRejectedValue(failure);
    const response = await POST(request());
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toMatch(/private|SQL|token/);
  });
});

describe("panel principals keep the public role and Guest boundary", () => {
  it.each(["TRAVELER", "ADMIN"])("uses the persisted %s identity and clears the Guest cookie", async role => {
    const query = vi.fn();
    const resolver = createQaPrincipalResolver({ secure: true, database: { $queryRaw: query } as unknown as Database,
      auth: { resolveSession: async () => ({ user: { id: "fixture_user" } }), database: {
        user: { findUnique: async () => ({ id: "fixture_user", role, status: "ACTIVE" }) },
      } as never },
    });
    const result = await resolver.bootstrap(new Headers({ cookie: `kltn_qa_guest=${"a".repeat(64)}` }));
    expect(result.principal).toEqual({ kind: "USER", id: "fixture_user" });
    expect(result.setCookie).toContain("Max-Age=0");
    expect(query).not.toHaveBeenCalled();
  });
  it("a locked persisted user cannot fall back to their previous Guest cookie", async () => {
    const query = vi.fn();
    const resolver = createQaPrincipalResolver({ secure: true, database: { $queryRaw: query } as unknown as Database,
      auth: { resolveSession: async () => ({ user: { id: "locked_fixture" } }), database: {
        user: { findUnique: async () => ({ id: "locked_fixture", role: "ADMIN", status: "LOCKED" }) },
      } as never },
    });
    const headers = new Headers({ cookie: `kltn_qa_guest=${"a".repeat(64)}` });
    await expect(resolver.resolve(headers)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(resolver.bootstrap(headers)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(query).not.toHaveBeenCalled();
  });
  it("Guest bootstrap inserts only identity, never a conversation", async () => {
    const execute = vi.fn(async (_sql: { sql: string }) => 1);
    const resolver = createQaPrincipalResolver({ secure: true,
      database: { $queryRaw: vi.fn(async () => []), $executeRaw: execute } as unknown as Database,
      auth: { resolveSession: async () => null, database: { user: { findUnique: vi.fn() } } as never },
    });
    const result = await resolver.bootstrap(new Headers());
    expect(result.principal.kind).toBe("GUEST");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0].sql).toContain('INSERT INTO "qa_guest_identity"');
    expect(execute.mock.calls[0]![0].sql).not.toContain("qa_conversation");
    expect(result.setCookie).toContain("Path=/api/ai; HttpOnly; SameSite=Strict");
  });
});
