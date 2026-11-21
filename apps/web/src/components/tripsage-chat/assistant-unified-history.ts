"use client";

import type { UIMessage } from "ai";
import type { QaConversationSummary } from "@/modules/ai/qa-contract";
import {
  assistantConversationDetailSchema,
  assistantConversationListSchema,
  type AssistantConversationDetail,
  type AssistantConversationMessage,
  type AssistantConversationSummary,
} from "@/modules/tripsage-chat/assistant-conversation-contract";
import type { ChosenLodgingItem } from "@/modules/tripsage-chat/tripsage-timeline";

export type UnifiedConversationItem = QaConversationSummary & {
  source: "ASSISTANT" | "LEGACY";
};

export function toUnifiedAssistantItem(item: AssistantConversationSummary): UnifiedConversationItem {
  return {
    id: item.id,
    title: item.title,
    context: { type: "GENERAL" },
    createdAt: item.createdAt,
    lastActivityAt: item.updatedAt,
    source: "ASSISTANT",
  };
}

/** Merges new unified assistant conversations with legacy Q&A / V2 conversations, newest activity first. */
export function mergeUnifiedConversations(
  assistantItems: readonly AssistantConversationSummary[],
  legacyItems: readonly QaConversationSummary[],
): UnifiedConversationItem[] {
  const byId = new Map<string, UnifiedConversationItem>();
  for (const item of legacyItems) {
    byId.set(item.id, { ...item, source: "LEGACY" });
  }
  for (const item of assistantItems) {
    byId.set(item.id, toUnifiedAssistantItem(item));
  }
  return [...byId.values()].sort((a, b) => {
    const diff = new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Converts stored assistant conversation messages into AI SDK UIMessage[] so all saved cards render immediately. */
export function storedMessagesToUiMessages(messages: readonly AssistantConversationMessage[]): UIMessage[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    parts: message.parts as unknown as UIMessage["parts"],
  }));
}

export async function fetchAssistantConversations(options: {
  cursor?: string | null;
  search?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<{ items: AssistantConversationSummary[]; nextCursor: string | null; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.limit) params.set("limit", String(options.limit));
  const url = `/api/ai/assistant-conversations${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store", signal: options.signal });
  const json = await response.json().catch(() => null) as { success?: boolean; data?: unknown } | null;
  if (!response.ok || !json?.success) throw new Error("FAILED_TO_LIST");
  return assistantConversationListSchema.parse(json.data);
}

export async function fetchAssistantConversationDetail(id: string, signal?: AbortSignal): Promise<AssistantConversationDetail | null> {
  const response = await fetch(`/api/ai/assistant-conversations/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  const json = await response.json().catch(() => null) as { success?: boolean; data?: unknown } | null;
  if (!response.ok || !json?.success) throw new Error("FAILED_TO_LOAD");
  return assistantConversationDetailSchema.parse(json.data);
}

export async function deleteAssistantConversation(id: string, idempotencyKey: string): Promise<boolean> {
  const response = await fetch(`/api/ai/assistant-conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null) as { success?: boolean; operationStatus?: string } | null;
  return response.ok && json?.success === true && json.operationStatus === "SUCCESS";
}

export async function deleteAllAssistantConversations(idempotencyKey: string): Promise<boolean> {
  const response = await fetch("/api/ai/assistant-conversations", {
    method: "DELETE",
    headers: { "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null) as { success?: boolean; operationStatus?: string } | null;
  return response.ok && json?.success === true && json.operationStatus === "SUCCESS";
}

export async function saveAssistantConversationChosenLodgings(
  id: string,
  chosenLodgings: readonly ChosenLodgingItem[],
  idempotencyKey: string,
): Promise<boolean> {
  const response = await fetch(`/api/ai/assistant-conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ chosenLodgings }),
  });
  const json = await response.json().catch(() => null) as { success?: boolean; operationStatus?: string } | null;
  return response.ok && json?.success === true && json.operationStatus === "SUCCESS";
}
