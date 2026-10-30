"use client";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { AssistantContextProps } from "./assistant-chat";
import { AssistantV2Pending } from "./assistant-v2-pending";
import { assistantAuthBoundary } from "./assistant-auth-boundary";
import { AssistantV2Chat } from "./assistant-v2-chat";
import { savedConversationIdFromSearch } from "./assistant-saved-conversation";

export function AssistantRuntimeChat(contextProps: AssistantContextProps = {}) {
  const { data: session, isPending, error } = authClient.useSession();
  const [confirmedBoundary, setConfirmedBoundary] = useState<string | null>(null);
  const userId = session?.user.id;
  const unauthorized = error?.status === 401 || error?.status === 403;
  const authReady = !isPending && !error;
  const boundary = assistantAuthBoundary({ userId, isPending, hasError: !!error, unauthorized }, confirmedBoundary);
  useEffect(() => {
    if (unauthorized) setConfirmedBoundary(null);
    else if (authReady) setConfirmedBoundary(userId ? `USER:${userId}` : "GUEST");
  }, [authReady, unauthorized, userId]);
  if (boundary === null) return <AssistantV2Pending key="unresolved" />;
  // A transient refetch retains local intent, but cannot authorize another send.
  // Confirmed login/logout/account changes still unmount the old principal.
  return <AuthenticatedRuntimeChat key={boundary} boundary={boundary} authReady={authReady} {...contextProps} />;
}

function AuthenticatedRuntimeChat({ boundary, authReady, ...contextProps }: { boundary: string; authReady: boolean } & AssistantContextProps) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    setVerified(false);
    if (!authReady) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/ai/session", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) setIdentity(null);
          return;
        }
        const body = await response.json() as { data?: { identity?: unknown } };
        if (!controller.signal.aborted && typeof body.data?.identity === "string" &&
          (boundary === "GUEST" ? /^GUEST:[a-f0-9]{64}$/.test(body.data.identity) : body.data.identity === boundary)) {
          setIdentity(body.data.identity);
          setVerified(true);
        }
      }).catch(() => undefined).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [boundary, authReady]);
  if (!identity) return <AssistantV2Pending key={`bootstrap:${boundary}`} />;
  // A saved-conversation link (?conversationId=) opens in the V2 chat for guests and signed-in users.
  const conversationId = typeof window !== "undefined" ? savedConversationIdFromSearch(window.location.search) ?? undefined : undefined;
  // Guests (GUEST:) get V2 Guest mode: Q&A only through the existing guest transport.
  if (identity.startsWith("USER:") || identity.startsWith("GUEST:")) return <AssistantV2Chat key={identity} identity={identity} initialContext={contextProps.initialContext} conversationId={conversationId} available={authReady && verified}/>;
  return <AssistantV2Pending key={`bootstrap:${boundary}`} failed />;
}
