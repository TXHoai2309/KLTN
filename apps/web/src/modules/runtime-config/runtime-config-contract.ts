import { z } from "zod";
import { configurableChatModelIds } from "./openai-model-catalog";

export const runtimeServiceSchema = z.enum(["OPENAI", "CLOUDINARY", "STADIA"]);
export type RuntimeService = z.infer<typeof runtimeServiceSchema>;

const model = z.enum(configurableChatModelIds);
export const settingSchemas = {
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
  z.object({ service: z.literal("OPENAI"), changes: settingSchemas.OPENAI }),
  z.object({ service: z.literal("CLOUDINARY"), changes: settingSchemas.CLOUDINARY }),
  z.object({ service: z.literal("STADIA"), changes: settingSchemas.STADIA }),
]);
export type RuntimeUpdate = z.infer<typeof updateSchema>;

export const secretKeys = new Set(["apiKey", "apiSecret"]);
