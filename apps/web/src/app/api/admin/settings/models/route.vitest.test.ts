import { afterAll, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ admin: true, calls: 0 }));
vi.mock("@/server/authorization/server", () => ({ authorizationDependencies: {} }));
vi.mock("@/server/authorization/guard", () => ({ requireActor: async () => {
  if (!fixture.admin) { const { AppError } = await import("@/server/http/app-error"); throw new AppError("FORBIDDEN", "Forbidden", 403); }
  return { id: "admin-1" };
} }));
vi.mock("@/modules/runtime-config/openai-model-catalog", () => ({ availableConfigurableChatModels: async () => { fixture.calls++; return ["gpt-6-luna"]; } }));
import { GET } from "./route";

afterEach(() => { fixture.admin = true; fixture.calls = 0; });
afterAll(() => { vi.doUnmock("@/server/authorization/server"); vi.doUnmock("@/server/authorization/guard"); vi.doUnmock("@/modules/runtime-config/openai-model-catalog"); vi.resetModules(); });

it("checks Admin before contacting OpenAI for model choices", async () => {
  fixture.admin = false;
  expect((await GET(new Request("http://localhost/api/admin/settings/models"))).status).toBe(403);
  expect(fixture.calls).toBe(0);
  fixture.admin = true;
  const response = await GET(new Request("http://localhost/api/admin/settings/models"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(fixture.calls).toBe(1);
});
