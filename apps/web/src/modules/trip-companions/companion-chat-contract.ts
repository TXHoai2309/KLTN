import { z } from "zod";
import { companionIdSchema } from "./companion-contract";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";

export const companionSequenceSchema = z.string().regex(/^(0|[1-9]\d{0,18})$/).pipe(z.string().refine(value => BigInt(value) <= BigInt("9223372036854775807")));
export const companionSendSchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
export const companionSystemNoticeSchema = z.discriminatedUnion("type", [z.object({
  type: z.literal("ITINERARY_CHANGED"), revision: companionSequenceSchema,
  changes: z.object({ dates: z.boolean(), destinations: z.boolean(), times: z.boolean() }).strict(),
}).strict(), z.object({ type: z.literal("COMPANION_CANCELED") }).strict()]);
const userMessageSchema = z.object({
  id: companionIdSchema, sequence: companionSequenceSchema, kind: z.literal("USER"), text: z.string(),
  author: z.object({ userId: companionIdSchema, displayName: z.string(), avatarUrl: publicHttpsUrl.nullable() }).strict(),
  createdAt: z.iso.datetime(),
}).strict();
export const companionMessageSchema = z.discriminatedUnion("kind", [userMessageSchema,
  z.object({ id: companionIdSchema, sequence: companionSequenceSchema, kind: z.literal("SYSTEM"), text: z.string(), author: z.null(), createdAt: z.iso.datetime(), notice: companionSystemNoticeSchema }).strict(),
]);
export const companionSendResultSchema = z.object({ publicationId: companionIdSchema, messageId: companionIdSchema, sequence: companionSequenceSchema }).strict();
export const companionHistoryQuerySchema = z.object({
  before: companionSequenceSchema.optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),
}).strict();
export const companionHistorySchema = z.object({
  publicationId: companionIdSchema, items: z.array(companionMessageSchema),
  olderCursor: companionSequenceSchema.nullable(), highWaterCursor: companionSequenceSchema, canSend: z.boolean(),
}).strict();
export const companionDeltaQuerySchema = z.object({
  after: companionSequenceSchema.default("0"),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).default("100").transform(Number).pipe(z.number().int().min(1).max(100)),
}).strict();
export const companionDeltaSchema = z.object({
  publicationId: companionIdSchema, items: z.array(companionMessageSchema),
  nextCursor: companionSequenceSchema, highWaterCursor: companionSequenceSchema,
  hasMore: z.boolean(), canSend: z.boolean(), relationship: z.enum(["HOST", "MEMBER"]),
}).strict();
export type CompanionMessage = z.infer<typeof companionMessageSchema>;
export type CompanionHistory = z.infer<typeof companionHistorySchema>;
export type CompanionDelta = z.infer<typeof companionDeltaSchema>;
