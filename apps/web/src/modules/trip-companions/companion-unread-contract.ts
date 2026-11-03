import { z } from "zod";
import { companionIdSchema } from "./companion-contract";
import { companionSequenceSchema } from "./companion-chat-contract";
export const companionReadInputSchema = z.object({ sequence: companionSequenceSchema }).strict();
export const companionReadResultSchema = z.object({ publicationId: companionIdSchema, sequence: companionSequenceSchema }).strict();
export const companionUnreadQuerySchema = z.object({
  after: companionIdSchema.optional(),
  limit: z.string().regex(/^[1-9]\d?$/).default("50").transform(Number).pipe(z.number().int().min(1).max(50)),
}).strict();
export const companionUnreadSchema = z.object({
  items: z.array(z.object({ publicationId: companionIdSchema, unreadCount: z.number().int().nonnegative(),
    lastReadCursor: companionSequenceSchema, highWaterCursor: companionSequenceSchema, canSend: z.boolean(),
  }).strict()), nextCursor: companionIdSchema.nullable(),
}).strict();
export type CompanionUnread = z.infer<typeof companionUnreadSchema>;
