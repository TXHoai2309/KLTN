"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { QaContext } from "../../modules/ai/qa-contract";
import { DestinationAssistantPanel } from "./destination-assistant-panel";

type Destination = { id: string; name?: string };
type PageDestination = Destination & { pathname: string; token: symbol };
const DestinationRegistration = createContext<((destination: Destination) => () => void) | null>(null);

/** Server-projected page context only; the server still resolves visibility and evidence. */
export function useAssistantDestination(destination: Destination) {
  const register = useContext(DestinationRegistration);
  useEffect(() => register?.(destination), [register, destination.id, destination.name]);
}

/** Root-layout owner: normal client navigation hides/shows a view, never its session. */
export function GlobalAssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [pageDestination, setPageDestination] = useState<PageDestination | null>(null);
  const [active, setActive] = useState<{ context: QaContext; name?: string }>({ context: { type: "GENERAL" } });
  const [hasSession, setHasSession] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => setMounted(true), []);

  const register = useCallback((destination: Destination) => {
    const token = Symbol();
    setPageDestination({ ...destination, pathname, token });
    return () => setPageDestination(current => current?.token === token ? null : current);
  }, [pathname]);
  const current = pageDestination?.pathname === pathname ? pageDestination : null;
  const nextContext: QaContext = current ? { type: "DESTINATION", destinationId: current.id } : { type: "GENERAL" };
  const routeVisible = !/^\/(admin|assistant|login|register|forgot-password|reset-password)(\/|$)/.test(pathname);

  function openPanel() {
    if (!hasSession) {
      setActive({ context: nextContext, name: current?.name });
      setHasSession(true);
    }
    setOpen(true);
  }

  return <DestinationRegistration.Provider value={register}>
    {children}
    {mounted && createPortal(
      <div data-assistant-overlay-root="" className="global-assistant-root">
        <aside className="global-assistant-launcher" hidden={!routeVisible || open} aria-label="Trợ lý AI">
          <button ref={triggerRef} type="button" onClick={openPanel} aria-label="Hỏi trợ lý AI"
            aria-haspopup="dialog" aria-expanded={open && routeVisible} aria-controls={hasSession ? panelId : undefined}>
            <Sparkles size={20} aria-hidden="true" /><span>Hỏi trợ lý AI</span>
          </button>
        </aside>
        {hasSession && <DestinationAssistantPanel
          panelId={panelId}
          context={active.context}
          destinationName={active.name}
          newChatContext={nextContext}
          onStartedNewChat={() => setActive({ context: nextContext, name: current?.name })}
          isOpen={open && routeVisible}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
          onHandedOff={() => { setOpen(false); setHasSession(false); }}
        />}
      </div>, document.body
    )}
  </DestinationRegistration.Provider>;
}
