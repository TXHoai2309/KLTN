"use client";

import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AssistantHttpTransport } from "./assistant-http-transport";
import { assistantAuthBoundary } from "./assistant-auth-boundary";

export type AssistantSessionState = {
  boundary: string | null;
  identity: string | null;
  transport: AssistantHttpTransport | null;
  available: boolean;
  isPending: boolean;
  error: unknown;
  retry: () => void;
};

export function useAssistantSession(): AssistantSessionState {
  const { data: session, isPending, error } = authClient.useSession();
  const [confirmedBoundary, setConfirmedBoundary] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ boundary: string; identity: string } | null>(null);
  const [verified, setVerified] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [transport] = useState(() => new AssistantHttpTransport());

  const userId = session?.user.id;
  const unauthorized = (error as { status?: number })?.status === 401 || (error as { status?: number })?.status === 403;
  const authReady = !isPending && !error;
  const boundary = assistantAuthBoundary({ userId, isPending, hasError: !!error, unauthorized }, confirmedBoundary);
  // A transient auth refetch pauses sending; it does not change the principal.
  // A confirmed boundary change hides the previous identity immediately.
  const identity = resolved?.boundary === boundary ? resolved.identity : null;

  useEffect(() => {
    if (unauthorized) {
      setConfirmedBoundary(null);
      setResolved(null);
      setVerified(false);
    } else if (authReady) {
      setConfirmedBoundary(userId ? `USER:${userId}` : "GUEST");
    }
  }, [authReady, unauthorized, userId]);

  useEffect(() => {
    setVerified(false);
    if (!authReady || !boundary) {
      return;
    }
    setBootstrapError(null);
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (active) setBootstrapError(new Error("Session verification timed out"));
      controller.abort();
    }, 10_000);
    void fetch("/api/ai/session", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) {
            setResolved(null);
          }
          throw new Error("Session verification failed");
        }
        const body = (await response.json()) as { success?: boolean; data?: { identity?: unknown } };
        if (
          !controller.signal.aborted &&
          body.success === true &&
          typeof body.data?.identity === "string" &&
          (boundary === "GUEST" ? /^GUEST:[a-f0-9]{64}$/.test(body.data.identity) : body.data.identity === boundary)
        ) {
          setResolved({ boundary, identity: body.data.identity });
          setVerified(true);
        } else if (!controller.signal.aborted) throw new Error("Invalid session response");
      })
      .catch(error => { if (active) setBootstrapError(error); })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [boundary, authReady, attempt]);

  return {
    boundary,
    identity,
    // The mounted controller captures this transport once. Keep it stable even
    // before bootstrap; `available` is the separate authorization/send gate.
    transport,
    available: authReady && verified && !!identity,
    isPending,
    error: error ?? bootstrapError,
    retry: () => setAttempt(value => value + 1),
  };
}
