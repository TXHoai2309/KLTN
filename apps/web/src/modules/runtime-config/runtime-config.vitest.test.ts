import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const fixture = vi.hoisted(() => ({ rows: new Map<string, { scope: string; service: string; payload: string; version: number; updatedAt: Date }>(), ids: new Map<string, { requestHash: string; responseJson: string }>(), audits: [] as unknown[], role: "ADMIN" as string }));
vi.mock("@/services", () => {
  const db = {
  runtimeConfig: {
    findUnique: async ({ where }: { where: { scope_service: { scope: string; service: string } } }) => fixture.rows.get(`${where.scope_service.scope}:${where.scope_service.service}`) ?? null,
    findMany: async ({ where }: { where: { scope: string } }) => [...fixture.rows.values()].filter(row => row.scope === where.scope),
    upsert: async ({ create, update }: { create: { scope: string; service: string; payload: string; version: number }; update: { payload: string; version: number } }) => {
      const id = `${create.scope}:${create.service}`;
      const previous = fixture.rows.get(id);
      fixture.rows.set(id, { scope: create.scope, service: create.service, payload: previous ? update.payload : create.payload, version: previous ? update.version : create.version, updatedAt: new Date() });
    },
  },
  runtimeConfigAudit: { findMany: async () => fixture.audits, create: async ({ data }: { data: unknown }) => { fixture.audits.push(data); } },
  idempotencyRecord: {
    findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => fixture.ids.get(`${where.scope_key.scope}:${where.scope_key.key}`) ?? null,
    create: async ({ data }: { data: { scope: string; key: string; requestHash: string; responseJson: string } }) => { fixture.ids.set(`${data.scope}:${data.key}`, { requestHash: data.requestHash, responseJson: data.responseJson }); },
    update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => { const item = fixture.ids.get(`${where.scope_key.scope}:${where.scope_key.key}`)!; item.responseJson = data.responseJson; },
  },
  user: { findUnique: async () => ({ role: fixture.role, status: "ACTIVE" }) },
  $executeRaw: async () => 1,
  $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
    const rows = new Map(fixture.rows);
    const ids = new Map(fixture.ids);
    const auditLength = fixture.audits.length;
    try { return await callback(db); }
    catch (error) {
      fixture.rows.clear(); for (const [name, row] of rows) fixture.rows.set(name, row);
      fixture.ids.clear(); for (const [name, row] of ids) fixture.ids.set(name, row);
      fixture.audits.length = auditLength;
      throw error;
    }
  },
  };
  return { db };
});

import { decryptConfig, encryptConfig } from "./runtime-config-crypto";
import { configurationOverview, effectiveConfig, runtimeScope, updateConfiguration } from "./runtime-config-service";

const key = "11".repeat(32);
afterEach(() => { fixture.rows.clear(); fixture.ids.clear(); fixture.audits.length = 0; fixture.role = "ADMIN"; vi.unstubAllEnvs(); });
afterAll(() => { vi.doUnmock("@/services"); vi.resetModules(); });

describe("Admin runtime configuration vault", () => {
  it("encrypts values with scope binding; wrong scope, corrupted tag and missing key fail closed", () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    const encrypted = encryptConfig({ apiKey: "fixture-private-secret" }, "LOCAL", "OPENAI");
    expect(encrypted).not.toContain("fixture-private-secret");
    expect(decryptConfig(encrypted, "LOCAL", "OPENAI")).toEqual({ apiKey: "fixture-private-secret" });
    expect(() => decryptConfig(encrypted, "PREVIEW", "OPENAI")).toThrow();
    const broken = JSON.parse(encrypted) as { tag: string };
    broken.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptConfig(JSON.stringify(broken), "LOCAL", "OPENAI")).toThrow();
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", "");
    expect(() => decryptConfig(encrypted, "LOCAL", "OPENAI")).toThrow();
  });

  it("reads the previous root key only during rotation and writes with the new key", () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    const oldPayload = encryptConfig({ apiKey: "fixture-old" }, "LOCAL", "STADIA");
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", "22".repeat(32));
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS", key);
    expect(decryptConfig(oldPayload, "LOCAL", "STADIA")).toEqual({ apiKey: "fixture-old" });
    const newPayload = encryptConfig(decryptConfig(oldPayload, "LOCAL", "STADIA") as object, "LOCAL", "STADIA");
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS", "");
    expect(decryptConfig(newPayload, "LOCAL", "STADIA")).toEqual({ apiKey: "fixture-old" });
    expect(() => decryptConfig(oldPayload, "LOCAL", "STADIA")).toThrow();
  });

  it("separates Local, Preview and Production even when the database is shared", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("OPENAI_API_KEY", "environment-key");
    fixture.rows.set("PREVIEW:OPENAI", { scope: "PREVIEW", service: "OPENAI", payload: encryptConfig({ apiKey: "preview-private-key" }, "PREVIEW", "OPENAI"), version: 1, updatedAt: new Date() });
    vi.stubEnv("VERCEL_ENV", ""); expect(runtimeScope()).toBe("LOCAL"); expect((await effectiveConfig("OPENAI")).apiKey).toBe("environment-key");
    vi.stubEnv("VERCEL_ENV", "preview"); expect((await effectiveConfig("OPENAI")).apiKey).toBe("preview-private-key");
    vi.stubEnv("VERCEL_ENV", "production"); expect(runtimeScope()).toBe("PRODUCTION"); expect((await effectiveConfig("OPENAI")).apiKey).toBe("environment-key");
  });

  it("returns status without a secret; broken active override never falls back to env", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("OPENAI_API_KEY", "environment-key");
    vi.stubEnv("VERCEL_ENV", "");
    fixture.rows.set("LOCAL:OPENAI", { scope: "LOCAL", service: "OPENAI", payload: encryptConfig({ apiKey: "fixture-private-secret", preferenceModel: "gpt-6-luna" }, "LOCAL", "OPENAI"), version: 2, updatedAt: new Date() });
    const overview = await configurationOverview();
    expect(JSON.stringify(overview)).not.toContain("fixture-private-secret");
    expect(overview.services.find(group => group.service === "OPENAI")?.fields.find(field => field.name === "apiKey")).toMatchObject({ configured: true, source: "CMS", value: null });
    fixture.rows.get("LOCAL:OPENAI")!.payload = "broken";
    await expect(effectiveConfig("OPENAI")).rejects.toMatchObject({ code: "CONFIG_VAULT_UNAVAILABLE" });
  });

  it("commits encrypted changes with safe audit and replays the identical mutation", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    const input = { service: "OPENAI", changes: { apiKey: "fixture-private-secret" } };
    const first = await updateConfiguration("admin-1", "request-1", input);
    expect(first).toMatchObject({ status: "SUCCESS", data: { service: "OPENAI", version: 1 } });
    expect(JSON.stringify(first)).not.toContain("fixture-private-secret");
    const stored = fixture.rows.get("LOCAL:OPENAI")!;
    expect(stored.payload).not.toContain("fixture-private-secret");
    expect(JSON.stringify(fixture.audits)).not.toContain("fixture-private-secret");
    const replay = await updateConfiguration("admin-1", "request-1", input);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(fixture.rows.get("LOCAL:OPENAI")?.version).toBe(1);
    expect(fixture.audits).toHaveLength(1);
    await expect(updateConfiguration("admin-1", "request-2", { service: "CLOUDINARY", changes: { apiKey: "partial" } })).rejects.toMatchObject({ code: "CONFIG_INPUT_INVALID" });
    fixture.role = "TRAVELER";
    expect(await updateConfiguration("admin-1", "request-3", { service: "STADIA", changes: { apiKey: "new-key" } })).toMatchObject({ status: "FAILED", httpStatus: 403 });
  });

  it("persists independent Editorial and QA model selections in the encrypted OpenAI override", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    const result = await updateConfiguration("admin-1", "models-1", { service: "OPENAI", changes: { editorialModel: "gpt-6.1-terra", qaModel: "gpt-6-sol" } });
    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(await effectiveConfig("OPENAI")).toMatchObject({ editorialModel: "gpt-6.1-terra", qaModel: "gpt-6-sol" });
    expect(JSON.stringify(fixture.audits)).toContain("editorialModel,qaModel");
  });
});
