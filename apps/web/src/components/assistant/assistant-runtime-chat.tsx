"use client";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AssistantChat, type AssistantContextProps } from "./assistant-chat";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { assistantRuntimeChatKey } from "./assistant-runtime-chat-key";
import { assistantAuthBoundary } from "./assistant-auth-boundary";
import { AssistantV2Chat } from "./assistant-v2-chat";

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
  if (boundary === null) return <AssistantChat key="unresolved" {...contextProps} />;
  // A transient refetch retains local intent, but cannot authorize another send.
  // Confirmed login/logout/account changes still unmount the old principal.
  return <AuthenticatedRuntimeChat key={boundary} boundary={boundary} authReady={authReady} {...contextProps} />;
}

function AuthenticatedRuntimeChat({ boundary, authReady, ...contextProps }: { boundary: string; authReady: boolean } & AssistantContextProps) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState<"v1" | "v2">("v1");
  const [transport] = useState(() => new AssistantHttpTransport());
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
        const body = await response.json() as { data?: { identity?: unknown; runtimeVersion?: unknown } };
        if (!controller.signal.aborted && typeof body.data?.identity === "string" &&
          (boundary === "GUEST" ? /^GUEST:[a-f0-9]{64}$/.test(body.data.identity) : body.data.identity === boundary)) {
          setIdentity(body.data.identity);
          setRuntimeVersion(body.data.runtimeVersion === "v2" ? "v2" : "v1");
          setVerified(true);
        }
      }).catch(() => undefined).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [boundary, authReady]);
  if (!identity) return <AssistantChat key={assistantRuntimeChatKey(boundary, identity)} {...contextProps} />;
  // A saved-conversation deep link opens in the history-aware chat; V2 planning sessions are not stored there.
  const savedConversation = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("conversationId");
  // Guests (GUEST:) get V2 Guest mode: Q&A only through the existing guest transport.
  if (runtimeVersion === "v2" && (identity.startsWith("USER:") || identity.startsWith("GUEST:")) && !savedConversation) return <AssistantV2Chat key={identity} identity={identity} initialContext={contextProps.initialContext} available={authReady && verified}/>;
  return <AssistantChat key={assistantRuntimeChatKey(boundary, identity)} identity={identity} transport={transport} available={authReady && verified} {...contextProps} />;
}
