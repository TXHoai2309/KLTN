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

/**
 * Extracts `:::suggest_replies` JSON payloads and removes any `:::` fenced directives
 * (including unclosed trailing blocks) from assistant text (C1).
 */
export function extractSuggestRepliesDirectives(raw: string): { text: string; replies: string[] } {
  const replies: string[] = [];
  if (!raw.includes(":::")) {
    return { text: raw, replies };
  }

  const tryCollectReplies = (body: string) => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    try {
      const parsedJson = JSON.parse(trimmedBody) as unknown;
      const rawList = Array.isArray(parsedJson)
        ? parsedJson
        : parsedJson && typeof parsedJson === "object" && "replies" in parsedJson
          ? (parsedJson as { replies?: unknown }).replies
          : null;
      if (!Array.isArray(rawList)) return;
      const cleaned = rawList
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim())
        .filter(item => item.length > 0 && item.length <= 40)
        .slice(0, 4);
      const validated = quickRepliesPartSchema.safeParse({ replies: cleaned });
      if (validated.success && replies.length === 0) {
        replies.push(...validated.data.replies);
      }
    } catch {
      // Malformed or partial mid-stream directive JSON; stripped without crashing.
    }
  };

  let cleaned = raw.replace(
    /^[ \t]*:::[ \t]*([a-zA-Z0-9_-]*)[ \t]*(\{[^\n]*\}|\[[^\n]*\])[ \t]*:::[ \t]*$/gmu,
    (_full, kind: string, payload: string) => {
      if (kind.toLowerCase() === "suggest_replies") tryCollectReplies(payload);
      return "";
    },
  );

  cleaned = cleaned.replace(
    /(?:^|\r?\n)[ \t]*:::[ \t]*([a-zA-Z0-9_-]*)[ \t]*(?:\r?\n([\s\S]*?))?(?:\r?\n[ \t]*:::[ \t]*(?=\r?\n|$)|$)/gu,
    (_full, kind: string, body: string | undefined) => {
      if (kind.toLowerCase() === "suggest_replies" && body) {
        tryCollectReplies(body);
      }
      return "";
    },
  );

  cleaned = cleaned.replace(/\n{3,}/gu, "\n\n").trim();
  return { text: cleaned, replies };
}

/** Matches standalone inline source-attribution lines such as "Nguồn tài liệu: ...", "Nguồn: ...", or "Source: ...". */
export const STANDALONE_INLINE_SOURCE_LINE_RE =
  /^\s*(?:[>#\-*•]+\s*)?(?:\(\s*|[*_]{1,2}\s*){0,2}(?:ngu[oôồ]n\s+t[aà]i\s+li[eệ]u(?:\s+tham\s+kh[aả]o)?|ngu[oôồ]n\s+tham\s+kh[aả]o|t[aà]i\s+li[eệ]u\s+tham\s+kh[aả]o|ngu[oôồ]n|sources?|references?)(?:\s*[:：]\s*[*_]{1,2}|\s*[*_]{1,2}\s*[:：]|\s*[:：])\s*.*$/iu;

const INLINE_SOURCE_TAIL_RE =
  /(?:(?<=[.!?…])\s+|\s+[—–-]\s+)(?:\(\s*|[*_]{1,2}\s*){0,2}(?:ngu[oôồ]n\s+t[aà]i\s+li[eệ]u(?:\s+tham\s+kh[aả]o)?|ngu[oôồ]n\s+tham\s+kh[aả]o|t[aà]i\s+li[eệ]u\s+tham\s+kh[aả]o|ngu[oôồ]n|sources?|references?)(?:\s*[:：]\s*[*_]{1,2}|\s*[*_]{1,2}\s*[:：]|\s*[:：])\s*.*$/iu;

const TRAILING_PAREN_SOURCE_RE =
  /\s*\(\s*[*_]{0,2}(?:ngu[oôồ]n\s+t[aà]i\s+li[eệ]u(?:\s+tham\s+kh[aả]o)?|ngu[oôồ]n\s+tham\s+kh[aả]o|t[aà]i\s+li[eệ]u\s+tham\s+kh[aả]o|ngu[oôồ]n|sources?|references?)\s*[:：][^)\n]*\)(?=\s*[.!?…]?\s*$)/iu;

/** Removes trailing inline source attributions from one non-standalone line while preserving normal mid-sentence "nguồn". */
export function cleanInlineSourceLine(line: string): string {
  return line
    .replace(INLINE_SOURCE_TAIL_RE, "")
    .replace(TRAILING_PAREN_SOURCE_RE, "")
    .trimEnd();
}

/** Strips redundant inline "Nguồn tài liệu:" / "Nguồn:" / "Source:" lines and trailing tails across prose (B2 / C4). */
export function stripInlineSourceLines(raw: string): string {
  const lines = raw.split(/\r?\n/u);
  const kept: string[] = [];
  for (const line of lines) {
    if (STANDALONE_INLINE_SOURCE_LINE_RE.test(line)) continue;
    kept.push(cleanInlineSourceLine(line));
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Filters an arbitrary list of UI/stream parts down to strictly schema-valid storable display parts. */
export function sanitizeStoredParts(parts: readonly unknown[]): StoredAssistantPart[] {
  const out: StoredAssistantPart[] = [];
  const extractedReplies: string[] = [];
  let hasQuickReplies = false;
  const hasDataSources = parts.some((part) => {
    const parsed = storedAssistantPartSchema.safeParse(part);
    return parsed.success && parsed.data.type === "data-sources" && parsed.data.data.sources.length > 0;
  });
  for (const part of parts) {
    if (out.length >= ASSISTANT_CONVERSATION_MAX_PARTS) break;
    const parsed = storedAssistantPartSchema.safeParse(part);
    if (!parsed.success) continue;
    if (parsed.data.type === "text") {
      const extracted = extractSuggestRepliesDirectives(parsed.data.text);
      const text = hasDataSources ? stripInlineSourceLines(extracted.text) : extracted.text;
      if (extracted.replies.length > 0 && extractedReplies.length === 0) {
        extractedReplies.push(...extracted.replies);
      }
      if (!text) continue;
      out.push({ type: "text", text });
      continue;
    }
    if (parsed.data.type === "data-quick-replies") hasQuickReplies = true;
    out.push(parsed.data);
  }
  if (!hasQuickReplies && extractedReplies.length > 0 && out.length < ASSISTANT_CONVERSATION_MAX_PARTS) {
    const qr = storedAssistantPartSchema.safeParse({
      type: "data-quick-replies",
      id: "quick-replies",
      data: { replies: extractedReplies },
    });
    if (qr.success) out.push(qr.data);
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
