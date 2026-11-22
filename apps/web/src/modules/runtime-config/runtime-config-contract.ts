import { z } from "zod";
import { configurableChatModelIds } from "./openai-model-catalog";

export const runtimeServiceSchema = z.enum(["APPLICATION", "MAPS", "QA", "OPENAI", "CLOUDINARY", "STADIA"]);
export type RuntimeService = z.infer<typeof runtimeServiceSchema>;

const model = z.enum(configurableChatModelIds);
export const applicationSettingsSchema = z.object({
  chatEnabled: z.boolean(),
  budget: z.boolean(),
  flights: z.boolean(),
  hotels: z.boolean(),
  memory: z.boolean(),
  calendar: z.boolean(),
  amadeusEnvironment: z.enum(["test", "production"]),
  tripAssistantAgentEnabled: z.boolean(),
}).strict();
export type ApplicationSettings = z.infer<typeof applicationSettingsSchema>;
const databaseHost = z.string().trim().max(253).regex(/^[a-zA-Z0-9.-]*$/u);
const databaseName = z.string().trim().max(128).regex(/^[^/\u0000-\u001f]*$/u);
export const qaSettingsSchema = z.object({
  enabled: z.boolean(),
  abuseProtectionAccepted: z.boolean(),
  databaseHost,
  databaseName,
  localNetworkId: z.string().trim().max(128),
  legacySourceFilter: z.boolean(),
  publicSourceIds: z.string().trim().max(4096).refine(value => !value || value.split(",").every(id => /^[a-zA-Z0-9_-]{1,128}$/u.test(id.trim()))),
  cleanupEnabled: z.boolean(),
  cleanupDatabaseHost: databaseHost,
  cleanupDatabaseName: databaseName,
}).strict();
export type QaSettings = z.infer<typeof qaSettingsSchema>;
export const mapSettingsSchema = z.object({
  provider: z.enum(["GOOGLE", "STADIA"]),
  googleMapId: z.string().trim().max(128).regex(/^[a-zA-Z0-9_-]*$/u),
}).strict();
export type MapSettings = z.infer<typeof mapSettingsSchema>;

export const settingSchemas = {
  APPLICATION: applicationSettingsSchema.partial(),
  MAPS: mapSettingsSchema.partial(),
  QA: qaSettingsSchema.partial(),
  OPENAI: z.object({
    apiKey: z.string().trim().min(1).max(500),
    preferenceModel: model,
    editorialModel: model,
    qaModel: model,
    editorialTimeoutMs: z.number().int().min(1000).max(240000),
  }).partial().strict(),
  CLOUDINARY: z.object({
    cloudName: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u),
    apiKey: z.string().trim().min(1).max(200),
    apiSecret: z.string().trim().min(1).max(500),
  }).partial().strict(),
  STADIA: z.object({ apiKey: z.string().trim().min(1).max(500) }).partial().strict(),
} as const;

export const updateSchema = z.discriminatedUnion("service", [
  z.object({ service: z.literal("APPLICATION"), changes: settingSchemas.APPLICATION, saveCurrent: z.literal(true).optional() }),
  z.object({ service: z.literal("MAPS"), changes: settingSchemas.MAPS, saveCurrent: z.literal(true).optional() }),
  z.object({ service: z.literal("QA"), changes: settingSchemas.QA, saveCurrent: z.literal(true).optional() }),
  z.object({ service: z.literal("OPENAI"), changes: settingSchemas.OPENAI.omit({ apiKey: true }), saveCurrent: z.literal(true).optional(), useEnvironmentCredentials: z.literal(true).optional() }),
  z.object({ service: z.literal("CLOUDINARY"), changes: z.object({}).strict(), useEnvironmentCredentials: z.literal(true) }),
  z.object({ service: z.literal("STADIA"), changes: z.object({}).strict(), useEnvironmentCredentials: z.literal(true) }),
]);
export type RuntimeUpdate = z.infer<typeof updateSchema>;

export const secretKeys = new Set(["apiKey", "apiSecret"]);
