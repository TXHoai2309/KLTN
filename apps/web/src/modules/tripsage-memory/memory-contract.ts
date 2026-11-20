import { z } from "zod";

export const MEMORY_CONTENT_MAX = 500;
export const MEMORY_LIMIT = 100;
export const memoryKindSchema = z.enum(["PREFERENCE", "CONSTRAINT", "NOTE"]);
export const memoryTextSchema = z.string().trim().min(1).max(MEMORY_CONTENT_MAX);
export const memoryInputSchema = z.strictObject({ content: memoryTextSchema, kind: memoryKindSchema });
export const memoryListSchema = z.strictObject({
  items: z.array(z.strictObject({
    id: z.string().min(1).max(128),
    content: memoryTextSchema,
    kind: memoryKindSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })).max(MEMORY_LIMIT),
});

export type MemoryInput = z.infer<typeof memoryInputSchema>;
export type MemoryItem = z.infer<typeof memoryListSchema>["items"][number];
