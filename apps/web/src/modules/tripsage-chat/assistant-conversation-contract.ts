import { z } from "zod";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { accessLegPartSchema } from "./tripsage-access-leg";
import { journeyPartSchema, quickRepliesPartSchema, sourcesPartSchema, tripInfoPartSchema } from "./tripsage-chat-context";
import { TRIP_HUBS } from "./trip-hubs";
import { costPartSchema } from "./tripsage-cost";
import { saveActionPartSchema } from "./tripsage-chat-parts";
import { chosenLodgingsPartSchema, suggestionsPartSchema, timelinePartSchema } from "./tripsage-timeline";

/**
 * Client-safe contract for persisted unified assistant conversations (ADR-43 §6).
 * Only schema-validated display parts are persisted or returned; raw tool outputs,
 * origin candidates/coordinates, and system context are excluded.
 */

export const ASSISTANT_CONVERSATION_RETENTION_DAYS = 30;
export const ASSISTANT_CONVERSATION_MAX_PARTS = 60;

export const assistantConversationIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/u);

export const storedAssistantPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(30_000) }).strict(),
  z.object({ type: z.literal("data-itinerary"), id: z.string().min(1).max(64).optional(), data: plannerResultSchema }).strict(),
  z.object({ type: z.literal("data-timeline"), id: z.string().min(1).max(64).optional(), data: timelinePartSchema }).strict(),
  z.object({ type: z.literal("data-suggestions"), id: z.string().min(1).max(64).optional(), data: suggestionsPartSchema }).strict(),
  z.object({ type: z.literal("data-cost"), id: z.string().min(1).max(64).optional(), data: costPartSchema }).strict(),
  z.object({ type: z.literal("data-access-leg"), id: z.string().min(1).max(64).optional(), data: accessLegPartSchema }).strict(),
  z.object({ type: z.literal("data-trip-info"), id: z.string().min(1).max(64).optional(), data: tripInfoPartSchema }).strict(),
  z.object({ type: z.literal("data-sources"), id: z.string().min(1).max(64).optional(), data: sourcesPartSchema }).strict(),
  z.object({ type: z.literal("data-quick-replies"), id: z.string().min(1).max(64).optional(), data: quickRepliesPartSchema }).strict(),
  z.object({ type: z.literal("data-chosen-lodgings"), id: z.string().min(1).max(64).optional(), data: chosenLodgingsPartSchema }).strict(),
  z.object({ type: z.literal("data-save-action"), id: z.string().min(1).max(64).optional(), data: saveActionPartSchema }).strict(),
  // Only a journey whose origin is a fixed public hub is storable (restores the confirmed hub after reload); searched origins keep their coordinates out of storage (ADR-43 §6).
  z.object({ type: z.literal("data-journey"), id: z.string().min(1).max(64).optional(), data: journeyPartSchema.refine(({ journey }) => TRIP_HUBS.some(hub => journey.origin?.confirmed === true && journey.origin.label === hub.name && journey.origin.latitude === hub.latitude && journey.origin.longitude === hub.longitude)) }).strict(),
]);
export type StoredAssistantPart = z.infer<typeof storedAssistantPartSchema>;

export const storedAssistantPartsSchema = z.array(storedAssistantPartSchema).max(ASSISTANT_CONVERSATION_MAX_PARTS);

/** Filters an arbitrary list of UI/stream parts down to strictly schema-valid storable display parts. */
export function sanitizeStoredParts(parts: readonly unknown[]): StoredAssistantPart[] {
  const out: StoredAssistantPart[] = [];
  for (const part of parts) {
    if (out.length >= ASSISTANT_CONVERSATION_MAX_PARTS) break;
    const parsed = storedAssistantPartSchema.safeParse(part);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const assistantConversationSummarySchema = z.object({
  id: assistantConversationIdSchema,
  title: z.string().min(1).max(120),
  titleCustomized: z.boolean().optional(),
  savedTripId: z.string().min(1).max(128).nullable().optional(),
  /** Proposal id of the latest itinerary when it matches `savedTripId` (Point 6). Null/absent when a newer proposal was created after saving. */
  savedProposalId: z.string().min(1).max(128).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type AssistantConversationSummary = z.infer<typeof assistantConversationSummarySchema>;

export const assistantConversationPatchMetaSchema = z.union([
  z.object({ title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ savedTripId: z.string().trim().min(1).max(128) }).strict(),
]);
export type AssistantConversationPatchMeta = z.infer<typeof assistantConversationPatchMetaSchema>;

export const assistantConversationMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.enum(["user", "assistant"]),
  parts: storedAssistantPartsSchema,
  createdAt: z.string().datetime(),
}).strict();
export type AssistantConversationMessage = z.infer<typeof assistantConversationMessageSchema>;

export const assistantConversationDetailSchema = z.object({
  conversation: assistantConversationSummarySchema,
  messages: z.array(assistantConversationMessageSchema),
}).strict();
export type AssistantConversationDetail = z.infer<typeof assistantConversationDetailSchema>;

export const assistantConversationListSchema = z.object({
  items: z.array(assistantConversationSummarySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
}).strict();
export type AssistantConversationList = z.infer<typeof assistantConversationListSchema>;

export const conversationMetaPartSchema = z.object({
  conversationId: assistantConversationIdSchema,
  title: z.string().min(1).max(120),
}).strict();
export type ConversationMetaPart = z.infer<typeof conversationMetaPartSchema>;
