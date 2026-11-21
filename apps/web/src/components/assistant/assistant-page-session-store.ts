import type { PlanningV2Turn } from "../../modules/assistant-agent-v2/travel-planning-session";
import type { InTripV2Turn } from "../../modules/assistant-agent-v2/in-trip-session";

export type StoredV2Exchange = {
  question: string;
  turn: PlanningV2Turn | InTripV2Turn;
  steps?: readonly string[];
};

export type StoredAssistantPageSession = {
  sessionId: string | null;
  stateToken?: string;
  messages: StoredV2Exchange[];
  draft: string;
  savedTripId: string | null;
  writeUnknown: boolean;
  updatedAt: number;
};

// Module-level in-memory store: survives Next.js App Router client navigation
// (/assistant -> /explore -> /assistant) without ever persisting stateToken to storage or URLs.
const activePageSessions = new Map<string, StoredAssistantPageSession>();

function lastConversationKey(identity: string): string {
  return `kltn:assistant-last-conversation:v1:${identity}`;
}

export function getStoredAssistantPageSession(identity: string | undefined): StoredAssistantPageSession | null {
  if (!identity) return null;
  return activePageSessions.get(identity) ?? null;
}

export function setStoredAssistantPageSession(
  identity: string | undefined,
  session: StoredAssistantPageSession,
): void {
  if (!identity) return;
  activePageSessions.set(identity, session);
}

export function clearStoredAssistantPageSession(identity: string | undefined): void {
  if (!identity) return;
  activePageSessions.delete(identity);
}

export function getLastSavedConversationId(
  identity: string | undefined,
  storage?: Pick<Storage, "getItem">,
): string | null {
  if (!identity) return null;
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return null;
  try {
    const val = store.getItem(lastConversationKey(identity));
    return val && val.trim().length > 0 ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setLastSavedConversationId(
  identity: string | undefined,
  conversationId: string | null,
  storage?: Pick<Storage, "setItem" | "removeItem">,
): void {
  if (!identity) return;
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return;
  try {
    if (conversationId && conversationId.trim().length > 0) {
      store.setItem(lastConversationKey(identity), conversationId.trim());
    } else {
      store.removeItem(lastConversationKey(identity));
    }
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export function syncAssistantSessionUrl(sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (url.pathname !== "/assistant") return;
    if (sessionId) {
      url.searchParams.delete("conversationId");
      url.searchParams.set("session", sessionId);
    } else {
      url.searchParams.delete("session");
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, "", next);
    }
  } catch {
    // Ignore history API errors.
  }
}
