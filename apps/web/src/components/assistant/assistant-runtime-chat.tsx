"use client";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AssistantChat } from "./assistant-chat";
import { AssistantHttpTransport } from "./assistant-http-transport";

export function AssistantRuntimeChat() {
  const { data: session, isPending, error } = authClient.useSession();
  const boundary = isPending || error ? "unresolved" : session ? `USER:${session.user.id}` : "GUEST";
  if (boundary === "unresolved") return <AssistantChat key={boundary} />;
  // A pending/login/logout boundary unmounts all bootstrap readiness. Returning
  // to the same Guest/User must authenticate again before enabling the composer.
  return <AuthenticatedRuntimeChat key={boundary} boundary={boundary} />;
}

function AuthenticatedRuntimeChat({ boundary }: { boundary: string }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [transport] = useState(() => new AssistantHttpTransport());
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/ai/session", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const body = await response.json() as { data?: { identity?: unknown } };
        if (!controller.signal.aborted && typeof body.data?.identity === "string" &&
          (boundary === "GUEST" ? /^GUEST:[a-f0-9]{64}$/.test(body.data.identity) : body.data.identity === boundary)) setIdentity(body.data.identity);
      }).catch(() => undefined).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [boundary]);
  // Remount immediately on login/logout/pending boundary, before another request.
  if (!identity) return <AssistantChat key={boundary} />;
  return <AssistantChat key={identity} identity={identity} transport={transport} />;
}
