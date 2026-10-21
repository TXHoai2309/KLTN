import type { QaConversationSummary, QaConversationDetailMetadata, QaKnowledgeMode } from "../../modules/ai/qa-contract";
import type { ConfirmedTurn } from "./assistant-controller";

export type ConversationListResult = {
  items: QaConversationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ConversationDetailResult = {
  conversation: QaConversationDetailMetadata;
  turns: ConfirmedTurn[];
};

export class ConversationApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "ConversationApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const code = data?.error?.code ?? (response.status === 404 ? "NOT_FOUND" : response.status === 401 ? "UNAUTHENTICATED" : "REQUEST_FAILED");
    const message = data?.error?.message ?? "Không thể hoàn thành thao tác.";
    throw new ConversationApiError(code, message, response.status);
  }
  return data;
}

export async function fetchConversations(options: {
  cursor?: string | null;
  search?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ConversationListResult> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.limit) params.set("limit", String(options.limit));

  const url = `/api/ai/conversations${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
  });

  const body = await handleResponse<{ success: true; data: ConversationListResult }>(response);
  return body.data;
}

export async function fetchConversationDetail(id: string, signal?: AbortSignal): Promise<ConversationDetailResult> {
  const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  const body = await handleResponse<{
    success: true;
    data: ConfirmedTurn[];
    conversation: QaConversationDetailMetadata;
  }>(response);

  return {
    conversation: body.conversation,
    turns: body.data,
  };
}

export async function renameConversation(id: string, title: string, signal?: AbortSignal): Promise<{ id: string; title: string }> {
  const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
    body: JSON.stringify({ title }),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  const body = await handleResponse<{ success: true; data: { id: string; title: string } }>(response);
  return body.data;
}

export async function deleteConversation(id: string, signal?: AbortSignal): Promise<{ id: string }> {
  const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "x-requested-with": "XMLHttpRequest",
    },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  const body = await handleResponse<{ success: true; data: { id: string } }>(response);
  return body.data;
}

export async function updateConversationPreference(id: string, knowledgeMode: QaKnowledgeMode, signal?: AbortSignal): Promise<{ id: string; knowledgeMode: QaKnowledgeMode }> {
  const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
    body: JSON.stringify({ knowledgeMode }),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const body = await handleResponse<{ success: true; data: { id: string; knowledgeMode: QaKnowledgeMode } }>(response);
  return body.data;
}
