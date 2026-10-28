import "server-only";
import type { Database } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { decryptConfig, encryptConfig } from "./runtime-config-crypto";
import { runtimeServiceSchema, settingSchemas, updateSchema, secretKeys, type RuntimeService } from "./runtime-config-contract";

export function runtimeScope(): "LOCAL" | "PREVIEW" | "PRODUCTION" {
  if (process.env.VERCEL_ENV === "production") return "PRODUCTION";
  if (process.env.VERCEL_ENV === "preview") return "PREVIEW";
  return "LOCAL";
}
const loadDatabase = async () => (await import("@/services")).db;

function envDefaults(service: RuntimeService): Record<string, string | number | undefined> {
  if (service === "OPENAI") return {
    apiKey: process.env.OPENAI_API_KEY,
    preferenceModel: process.env.OPENAI_PREFERENCE_MODEL,
    editorialModel: "gpt-6-luna",
    qaModel: "gpt-6.1-sol",
    editorialTimeoutMs: process.env.OPENAI_EDITORIAL_TIMEOUT_MS ? Number(process.env.OPENAI_EDITORIAL_TIMEOUT_MS) : undefined,
  };
  if (service === "CLOUDINARY") return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  return { apiKey: process.env.STADIA_MAPS_API_KEY };
}

function parseStored(service: RuntimeService, payload: string, scope: string): Record<string, string | number> {
  const raw = decryptConfig(payload, scope, service);
  const parsed = settingSchemas[service].safeParse(raw);
  if (!parsed.success) throw new AppError("CONFIG_VAULT_UNAVAILABLE", "Cấu hình đang hoạt động không hợp lệ.", 503);
  return parsed.data;
}

export async function effectiveConfig(service: RuntimeService, injectedDatabase?: Pick<Database, "runtimeConfig">): Promise<Record<string, string | number | undefined>> {
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
  return { ...envDefaults(service), ...(record ? parseStored(service, record.payload, scope) : {}) };
}

export async function runtimeSetting(service: RuntimeService, name: string): Promise<string | undefined> {
  const value = (await effectiveConfig(service))[name];
  return value === undefined ? undefined : String(value);
}

export async function configurationOverview() {
  const scope = runtimeScope();
  const database = await loadDatabase();
  const records = await database.runtimeConfig.findMany({ where: { scope }, select: { service: true, payload: true, version: true, updatedAt: true } });
  return Promise.all(runtimeServiceSchema.options.map(async service => {
    const record = records.find(item => item.service === service);
    const overrides = record ? parseStored(service, record.payload, scope) : {};
    const defaults = envDefaults(service);
    const fields = Object.keys(settingSchemas[service].shape).map(name => ({
      name,
      configured: Boolean((name in overrides ? overrides[name] : defaults[name]) !== undefined && (name in overrides ? overrides[name] : defaults[name]) !== ""),
      source: name in overrides ? "CMS" as const : "ENV" as const,
      value: secretKeys.has(name) ? null : (name in overrides ? overrides[name] : defaults[name]) ?? null,
    }));
    return { service, version: record?.version ?? 0, updatedAt: record?.updatedAt?.toISOString() ?? null, fields };
  })).then(services => ({ scope, services, readOnly: {
    embedding: "text-embedding-3-small / 1536",
    vaultConfigured: /^[a-fA-F0-9]{64}$/u.test(process.env.RUNTIME_CONFIG_ENCRYPTION_KEY ?? ""),
    previousKeyConfigured: /^[a-fA-F0-9]{64}$/u.test(process.env.RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS ?? ""),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    qaRuntimeEnabled: process.env.QA_RUNTIME_ENABLED === "true",
    mapTiles: "Stadia domain authentication; Google iframe không cần key",
  } }));
}

export async function configurationHistory() {
  const database = await loadDatabase();
  return database.runtimeConfigAudit.findMany({ where: { scope: runtimeScope() }, select: { id: true, service: true, version: true, changedKeys: true, actorId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function updateConfiguration(actorId: string, key: string, input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success || !Object.keys(parsed.data.changes).length) throw new AppError("CONFIG_INPUT_INVALID", "Cấu hình không hợp lệ.", 400);
  const { service, changes } = parsed.data;
  if (service === "CLOUDINARY" && Object.keys(changes).length > 0 && !(changes.cloudName && changes.apiKey && changes.apiSecret)) {
    throw new AppError("CONFIG_INPUT_INVALID", "Cloudinary cần cloud name, API key và API secret trong cùng một lần thay.", 400);
  }
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
        const next = { ...previous, ...changes };
        const payload = encryptConfig(next, scope, service);
        const version = (current?.version ?? 0) + 1;
        await transaction.runtimeConfig.upsert({ where: { scope_service: { scope, service } },
          create: { scope, service, payload, version, updatedById: actorId },
          update: { payload, version, updatedById: actorId },
        });
        await transaction.runtimeConfigAudit.create({ data: { scope, service, version, changedKeys: Object.keys(changes).sort().join(","), actorId } });
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
