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
import { configurationOverview, effectiveConfig, mapSettings, qaSettings, runtimeScope, updateConfiguration } from "./runtime-config-service";

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
    await expect(updateConfiguration("admin-1", "secret", { service: "OPENAI", changes: { apiKey: "fixture-private-secret" } })).rejects.toMatchObject({ code: "CONFIG_INPUT_INVALID" });
    const input = { service: "OPENAI", changes: { preferenceModel: "gpt-6-luna" } };
    const first = await updateConfiguration("admin-1", "request-1", input);
    expect(first).toMatchObject({ status: "SUCCESS", data: { service: "OPENAI", version: 1 } });
    expect(JSON.stringify(first)).not.toContain("fixture-private-secret");
    const stored = fixture.rows.get("LOCAL:OPENAI")!;
    expect(stored.payload).not.toContain("gpt-6-luna");
    expect(JSON.stringify(fixture.audits)).not.toContain("fixture-private-secret");
    const replay = await updateConfiguration("admin-1", "request-1", input);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(fixture.rows.get("LOCAL:OPENAI")?.version).toBe(1);
    expect(fixture.audits).toHaveLength(1);
    await expect(updateConfiguration("admin-1", "request-2", { service: "CLOUDINARY", changes: { apiKey: "partial" } })).rejects.toMatchObject({ code: "CONFIG_INPUT_INVALID" });
    fixture.role = "TRAVELER";
    expect(await updateConfiguration("admin-1", "request-3", { service: "APPLICATION", changes: { chatEnabled: true } })).toMatchObject({ status: "FAILED", httpStatus: 403 });
  });

  it("persists independent Editorial and QA model selections in the encrypted OpenAI override", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    const result = await updateConfiguration("admin-1", "models-1", { service: "OPENAI", changes: { editorialModel: "gpt-6.1-terra", qaModel: "gpt-6-sol" } });
    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(await effectiveConfig("OPENAI")).toMatchObject({ editorialModel: "gpt-6.1-terra", qaModel: "gpt-6-sol" });
    expect(JSON.stringify(fixture.audits)).toContain("editorialModel,qaModel");
  });

  it("lets Admin turn off an enabled feature and keeps deployment scopes separate", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TRIPSAGE_CHAT_ENABLED", "true");
    expect(await effectiveConfig("APPLICATION")).toMatchObject({ chatEnabled: true });

    const result = await updateConfiguration("admin-1", "feature-toggle", {
      service: "APPLICATION", changes: { chatEnabled: false, calendar: true },
    });
    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(await effectiveConfig("APPLICATION")).toMatchObject({ chatEnabled: false, calendar: true });
    const overview = await configurationOverview();
    expect(overview.services.find(group => group.service === "APPLICATION")?.fields).toContainEqual({
      name: "chatEnabled", configured: true, source: "CMS", value: false,
    });

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await effectiveConfig("APPLICATION")).toMatchObject({ chatEnabled: true, calendar: false });
  });

  it("can retain effective feature settings after removing their legacy env variables", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TRIPSAGE_CHAT_ENABLED", "true");
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    await updateConfiguration("admin-1", "disable-calendar", { service: "APPLICATION", changes: { calendar: false } });
    const saved = await updateConfiguration("admin-1", "save-current", { service: "APPLICATION", changes: {}, saveCurrent: true });
    expect(saved).toMatchObject({ status: "SUCCESS" });
    vi.stubEnv("TRIPSAGE_CHAT_ENABLED", undefined);
    expect(await effectiveConfig("APPLICATION")).toMatchObject({ chatEnabled: true, calendar: false });
  });

  it("reads an Admin's provider and QA switches only in the selected environment", async () => {
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_MAPS_PROVIDER", "STADIA");
    vi.stubEnv("QA_RUNTIME_ENABLED", "true");
    vi.stubEnv("QA_PREVIEW_RUNTIME_ENABLED", "true");
    await updateConfiguration("admin-1", "maps", { service: "MAPS", changes: { provider: "GOOGLE", googleMapId: "admin-map-id" } });
    await updateConfiguration("admin-1", "qa", { service: "QA", changes: { enabled: false, cleanupEnabled: true } });
    expect(await mapSettings()).toEqual({ provider: "GOOGLE", googleMapId: "admin-map-id" });
    expect(await qaSettings()).toMatchObject({ enabled: false, cleanupEnabled: true });
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await mapSettings()).provider).toBe("STADIA");
    expect(await qaSettings()).toMatchObject({ enabled: true, cleanupEnabled: false });
  });

  it("leaves an old credential in service until an Admin explicitly switches to env", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("RUNTIME_CONFIG_ENCRYPTION_KEY", key);
    vi.stubEnv("OPENAI_API_KEY", "env-key-fixture");
    fixture.rows.set("LOCAL:OPENAI", { scope: "LOCAL", service: "OPENAI", payload: encryptConfig({ apiKey: "legacy-key-fixture" }, "LOCAL", "OPENAI"), version: 1, updatedAt: new Date() });
    await updateConfiguration("admin-1", "edit-model", { service: "OPENAI", changes: { qaModel: "gpt-6-luna" } });
    expect(await effectiveConfig("OPENAI")).toMatchObject({ apiKey: "legacy-key-fixture", qaModel: "gpt-6-luna" });
    expect(await updateConfiguration("admin-1", "move-key", { service: "OPENAI", changes: {}, useEnvironmentCredentials: true })).toMatchObject({ status: "SUCCESS" });
    expect(await effectiveConfig("OPENAI")).toMatchObject({ apiKey: "env-key-fixture", qaModel: "gpt-6-luna" });
    expect(JSON.stringify(fixture.audits)).not.toContain("key-fixture");
  });
});
