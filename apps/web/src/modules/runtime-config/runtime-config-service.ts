import "server-only";
import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { decryptConfig, encryptConfig } from "./runtime-config-crypto";
import { applicationSettingsSchema, mapSettingsSchema, qaSettingsSchema, runtimeServiceSchema, settingSchemas, updateSchema, secretKeys, type ApplicationSettings, type MapSettings, type QaSettings, type RuntimeService } from "./runtime-config-contract";
import { mapsProviderFromEnv } from "../map/maps-provider";
import { isConfigurableChatModel } from "./openai-model-catalog";

export function runtimeScope(): "LOCAL" | "PREVIEW" | "PRODUCTION" {
  if (process.env.VERCEL_ENV === "production") return "PRODUCTION";
  if (process.env.VERCEL_ENV === "preview") return "PREVIEW";
  return "LOCAL";
}
const loadDatabase = async () => (await import("@/services")).db;

type SettingValue = string | number | boolean;
const cloudinaryCredentials = ["cloudName", "apiKey", "apiSecret"];

function envDefaults(service: RuntimeService): Record<string, SettingValue | undefined> {
  if (service === "APPLICATION") return {
    chatEnabled: process.env.TRIPSAGE_CHAT_ENABLED === "true",
    budget: process.env.TRIPSAGE_FEATURE_BUDGET === "true",
    flights: process.env.TRIPSAGE_FEATURE_FLIGHTS === "true",
    hotels: process.env.TRIPSAGE_FEATURE_HOTELS === "true",
    memory: process.env.TRIPSAGE_FEATURE_MEMORY === "true",
    calendar: process.env.TRIPSAGE_FEATURE_CALENDAR === "true",
    amadeusEnvironment: process.env.AMADEUS_ENV === "production" ? "production" : "test",
    tripAssistantAgentEnabled: process.env.TRIP_ASSISTANT_AGENT !== "off",
  };
  if (service === "MAPS") return { provider: mapsProviderFromEnv(), googleMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() ?? "" };
  if (service === "QA") {
    const scope = runtimeScope();
    return {
      enabled: (scope === "PRODUCTION" ? process.env.QA_PRODUCTION_RUNTIME_ENABLED : scope === "PREVIEW" ? process.env.QA_PREVIEW_RUNTIME_ENABLED : process.env.QA_RUNTIME_ENABLED) === "true",
      abuseProtectionAccepted: process.env.QA_ABUSE_PROTECTION_ACCEPTED === "true",
      databaseHost: process.env.QA_RUNTIME_ALLOWED_DATABASE_HOST?.trim() ?? "",
      databaseName: process.env.QA_RUNTIME_ALLOWED_DATABASE_NAME?.trim() ?? "",
      localNetworkId: process.env.QA_LOCAL_NETWORK_ID?.trim() ?? "",
      legacySourceFilter: process.env.QA_LEGACY_SOURCE_ALLOWLIST_ENABLED === "true",
      publicSourceIds: (process.env.QA_PUBLIC_SOURCE_IDS ?? "").split(",").map(id => id.trim()).filter(id => /^[a-zA-Z0-9_-]{1,128}$/u.test(id)).join(","),
      cleanupEnabled: process.env.QA_CLEANUP_ENABLED === "true",
      cleanupDatabaseHost: process.env.QA_CLEANUP_ALLOWED_DATABASE_HOST?.trim() ?? "",
      cleanupDatabaseName: process.env.QA_CLEANUP_ALLOWED_DATABASE_NAME?.trim() ?? "",
    };
  }
  if (service === "OPENAI") return {
    apiKey: process.env.OPENAI_API_KEY,
    preferenceModel: process.env.OPENAI_PREFERENCE_MODEL,
    editorialModel: isConfigurableChatModel(process.env.OPENAI_EDITORIAL_MODEL) ? process.env.OPENAI_EDITORIAL_MODEL : "gpt-6-luna",
    qaModel: isConfigurableChatModel(process.env.OPENAI_QA_MODEL) ? process.env.OPENAI_QA_MODEL : "gpt-6.1-terra",
    editorialTimeoutMs: process.env.OPENAI_EDITORIAL_TIMEOUT_MS ? Number(process.env.OPENAI_EDITORIAL_TIMEOUT_MS) : undefined,
  };
  if (service === "CLOUDINARY") return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  return { apiKey: process.env.STADIA_MAPS_API_KEY };
}

function parseStored(service: RuntimeService, payload: string, scope: string): Record<string, SettingValue> {
  const raw = decryptConfig(payload, scope, service);
  const parsed = settingSchemas[service].safeParse(raw);
  if (!parsed.success) throw new AppError("CONFIG_VAULT_UNAVAILABLE", "Cấu hình đang hoạt động không hợp lệ.", 503);
  return parsed.data;
}

function configuredCredentialFields(service: RuntimeService, defaults: Record<string, SettingValue | undefined>) {
  if (service === "CLOUDINARY") return cloudinaryCredentials.every(name => defaults[name]) ? cloudinaryCredentials : [];
  return (service === "OPENAI" || service === "STADIA") && defaults.apiKey ? ["apiKey"] : [];
}

export function effectiveConfig(service: "OPENAI" | "CLOUDINARY" | "STADIA", injectedDatabase?: Pick<Database, "runtimeConfig">): Promise<Record<string, string | number | undefined>>;
export function effectiveConfig(service: RuntimeService, injectedDatabase?: Pick<Database, "runtimeConfig">): Promise<Record<string, SettingValue | undefined>>;
export async function effectiveConfig(service: RuntimeService, injectedDatabase?: Pick<Database, "runtimeConfig">): Promise<Record<string, SettingValue | undefined>> {
  const scope = runtimeScope();
  const database = injectedDatabase ?? await loadDatabase();
  let record;
  try { record = await database.runtimeConfig.findUnique({ where: { scope_service: { scope, service } } }); }
  catch (error) {
    // An additive migration may be deployed just after the code. No override can
    // exist before the table does; all other DB failures remain unavailable.
    if (error && typeof error === "object" && "code" in error && error.code === "P2021") return envDefaults(service);
    throw error;
  }
  const defaults = envDefaults(service);
  const overrides = record ? parseStored(service, record.payload, scope) : {};
  return { ...defaults, ...overrides };
}

export async function runtimeSetting(service: RuntimeService, name: string): Promise<string | undefined> {
  const value = (await effectiveConfig(service))[name];
  return value === undefined ? undefined : String(value);
}

export async function applicationSettings(database?: Pick<Database, "runtimeConfig">): Promise<ApplicationSettings> {
  return applicationSettingsSchema.parse(await effectiveConfig("APPLICATION", database));
}

export async function mapSettings(): Promise<MapSettings> {
  return mapSettingsSchema.parse(await effectiveConfig("MAPS"));
}

export async function qaSettings(): Promise<QaSettings> {
  return qaSettingsSchema.parse(await effectiveConfig("QA"));
}

export async function configurationOverview() {
  const scope = runtimeScope();
  const database = await loadDatabase();
  const records = await database.runtimeConfig.findMany({ where: { scope }, select: { service: true, payload: true, version: true, updatedAt: true } });
  return Promise.all(runtimeServiceSchema.options.map(async service => {
    const record = records.find(item => item.service === service);
    const defaults = envDefaults(service);
    const overrides = record ? parseStored(service, record.payload, scope) : {};
    const fields = Object.keys(settingSchemas[service].shape).map(name => ({
      name,
      configured: Boolean((name in overrides ? overrides[name] : defaults[name]) !== undefined && (name in overrides ? overrides[name] : defaults[name]) !== ""),
      source: name in overrides ? "CMS" as const : "ENV" as const,
      value: secretKeys.has(name) ? null : (name in overrides ? overrides[name] : defaults[name]) ?? null,
    }));
    const canMoveCredentials = configuredCredentialFields(service, defaults).some(name => name in overrides);
    return { service, version: record?.version ?? 0, updatedAt: record?.updatedAt?.toISOString() ?? null, fields, canMoveCredentials };
  })).then(services => ({ scope, services, readOnly: {
    embedding: "text-embedding-3-small / 1536",
    vaultConfigured: /^[a-fA-F0-9]{64}$/u.test(process.env.RUNTIME_CONFIG_ENCRYPTION_KEY ?? ""),
    previousKeyConfigured: /^[a-fA-F0-9]{64}$/u.test(process.env.RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS ?? ""),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  } }));
}

export async function configurationHistory() {
  const database = await loadDatabase();
  return database.runtimeConfigAudit.findMany({ where: { scope: runtimeScope() }, select: { id: true, service: true, version: true, changedKeys: true, actorId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function updateConfiguration(actorId: string, key: string, input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new AppError("CONFIG_INPUT_INVALID", "Cấu hình không hợp lệ.", 400);
  const { service, changes } = parsed.data;
  const saveCurrent = "saveCurrent" in parsed.data && parsed.data.saveCurrent === true;
  const moveCredentials = "useEnvironmentCredentials" in parsed.data && parsed.data.useEnvironmentCredentials === true;
  if (!saveCurrent && !moveCredentials && !Object.keys(changes).length) throw new AppError("CONFIG_INPUT_INVALID", "Cấu hình không hợp lệ.", 400);
  const environment = envDefaults(service);
  const credentialFields = moveCredentials ? configuredCredentialFields(service, environment) : [];
  if (moveCredentials && !credentialFields.length) throw new AppError("CONFIG_INPUT_INVALID", "Hãy cấu hình đủ thông tin xác thực trong env trước khi chuyển.", 400);
  const defaults = saveCurrent ? settingSchemas[service].safeParse(Object.fromEntries(
    Object.entries(environment).filter(([name, value]) => !secretKeys.has(name) && value !== undefined),
  )) : null;
  if (defaults && !defaults.success) throw new AppError("CONFIG_INPUT_INVALID", "Một giá trị trong env cũ không hợp lệ để lưu. Hãy sửa giá trị đó trước khi chuyển cấu hình.", 400);
  const scope = runtimeScope();
  // Check the vault before writing an idempotency record.
  encryptConfig({}, scope, service);
  const database = await loadDatabase();
  return executeIdempotentWrite({ database, actorId, operation: `runtime-config:${scope}:${service}`, key, input: parsed.data,
    execute: async transaction => {
      try {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-config:${scope}:all`}, 0))`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-config:${scope}:${service}`}, 0))`;
        const actor = await transaction.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
        if (actor?.role !== "ADMIN" || actor.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Không có quyền thay cấu hình.", 403);
        const current = await transaction.runtimeConfig.findUnique({ where: { scope_service: { scope, service } } });
        const previous = current ? parseStored(service, current.payload, scope) : {};
        const retained = Object.fromEntries(Object.entries(previous).filter(([name]) => !credentialFields.includes(name)));
        const next: Record<string, SettingValue | undefined> = { ...defaults?.data, ...retained, ...changes };
        const changedKeys = Object.keys({ ...previous, ...next }).filter(name => previous[name] !== next[name]);
        const payload = encryptConfig(next, scope, service);
        const version = (current?.version ?? 0) + 1;
        await transaction.runtimeConfig.upsert({ where: { scope_service: { scope, service } },
          create: { scope, service, payload, version, updatedById: actorId },
          update: { payload, version, updatedById: actorId },
        });
        await transaction.runtimeConfigAudit.create({ data: { scope, service, version, changedKeys: changedKeys.sort().join(","), actorId } });
        return { service, scope, version };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new Error("Runtime configuration write failed");
      }
    },
  });
}

export async function rewrapConfiguration(actorId: string, key: string) {
  if (!/^[a-fA-F0-9]{64}$/u.test(process.env.RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS ?? "")) {
    throw new AppError("CONFIG_ROTATION_UNAVAILABLE", "Chưa cấu hình khóa mã hóa cũ để xoay vòng.", 400);
  }
  const scope = runtimeScope();
  const database = await loadDatabase();
  return executeIdempotentWrite({ database, actorId, operation: `runtime-config:${scope}:rewrap`, key, input: { action: "REWRAP", scope },
    execute: async transaction => {
      try {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-config:${scope}:all`}, 0))`;
        const actor = await transaction.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
        if (actor?.role !== "ADMIN" || actor.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Không có quyền thay cấu hình.", 403);
        const rows = await transaction.runtimeConfig.findMany({ where: { scope }, orderBy: { service: "asc" } });
        for (const row of rows) {
          if (!runtimeServiceSchema.safeParse(row.service).success) throw new AppError("CONFIG_VAULT_UNAVAILABLE", "Cấu hình đang hoạt động không hợp lệ.", 503);
          const service = runtimeServiceSchema.parse(row.service);
          const payload = encryptConfig(parseStored(service, row.payload, scope), scope, service);
          const version = row.version + 1;
          await transaction.runtimeConfig.update({ where: { scope_service: { scope, service } }, data: { payload, version, updatedById: actorId } });
          await transaction.runtimeConfigAudit.create({ data: { scope, service, version, changedKeys: "REWRAP", actorId } });
        }
        return { scope, rewrapped: rows.length };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new Error("Runtime configuration rotation failed");
      }
    },
  });
}
