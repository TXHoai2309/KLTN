import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ role: "ADMIN" as string, reads: 0, writes: 0 }));
vi.mock("@/server/authorization/server", () => ({ authorizationDependencies: {} }));
vi.mock("@/server/authorization/guard", () => ({ requireActor: async () => {
  if (fixture.role !== "ADMIN") { const { AppError } = await import("@/server/http/app-error"); throw new AppError("FORBIDDEN", "Forbidden", 403); }
  return { id: "admin-1", role: "ADMIN" };
} }));
vi.mock("@/modules/runtime-config/runtime-config-service", () => ({
  configurationOverview: async () => { fixture.reads++; return { scope: "LOCAL", services: [], readOnly: {} }; },
  configurationHistory: async () => [],
  updateConfiguration: async () => { fixture.writes++; return { status: "SUCCESS", data: { service: "OPENAI", version: 1 } }; },
  rewrapConfiguration: async () => ({ status: "SUCCESS", data: { scope: "LOCAL", rewrapped: 0 } }),
}));
import { GET, PATCH } from "./route";

afterEach(() => { fixture.role = "ADMIN"; fixture.reads = 0; fixture.writes = 0; });
afterAll(() => { vi.doUnmock("@/server/authorization/server"); vi.doUnmock("@/server/authorization/guard"); vi.doUnmock("@/modules/runtime-config/runtime-config-service"); vi.resetModules(); });
describe("Admin settings HTTP boundary", () => {
  it("rejects a non-Admin before reading the request body", async () => {
    fixture.role = "TRAVELER";
    const request = new Request("http://localhost:3010/api/admin/settings", { method: "PATCH", headers: { "Idempotency-Key": "one" }, body: "invalid json" });
    const response = await PATCH(request);
    expect(response.status).toBe(403);
    expect(fixture.writes).toBe(0);
    const read = await GET(new Request("http://localhost:3010/api/admin/settings"));
    expect(read.status).not.toBe(200);
    expect(fixture.reads).toBe(0);
  });

  it("rejects cross-origin and malformed JSON as known failures", async () => {
    const wrongOrigin = await PATCH(new Request("http://localhost:3010/api/admin/settings", { method: "PATCH", headers: { "Idempotency-Key": "one", origin: "https://elsewhere.example" }, body: "{}" }));
    expect(wrongOrigin.status).toBe(403);
    const malformed = await PATCH(new Request("http://localhost:3010/api/admin/settings", { method: "PATCH", headers: { "Idempotency-Key": "two" }, body: "invalid json" }));
    expect(malformed.status).toBe(400);
    expect(fixture.writes).toBe(0);
  });

  it("never returns a submitted secret in the mutation response", async () => {
    const secret = "fixture-private-secret";
    const response = await PATCH(new Request("http://localhost:3010/api/admin/settings", { method: "PATCH", headers: { "Idempotency-Key": "one" }, body: JSON.stringify({ service: "OPENAI", changes: { apiKey: secret } }) }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(secret);
    expect(fixture.writes).toBe(1);
  });
});
