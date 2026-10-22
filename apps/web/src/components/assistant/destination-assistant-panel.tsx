"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AssistantChat } from "./assistant-chat";
import { hasUnresolvedAttempt, type AssistantState, type AssistantTransport } from "./assistant-controller";
import type { QaContext } from "../../modules/ai/qa-contract";
import { useAssistantSession } from "./use-assistant-session";
import { setAssistantHandoff, clearAssistantHandoff } from "./assistant-handoff";

export interface DestinationAssistantPanelProps {
  destinationId?: string;
  destinationName?: string;
  context?: QaContext;
  newChatContext?: QaContext;
  onStartedNewChat?: () => void;
  onHandedOff?: () => void;
  panelId?: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  transport?: AssistantTransport | null;
  identity?: string;
  available?: boolean;
}

export function DestinationAssistantPanel({
  destinationId,
  destinationName,
  context,
  newChatContext,
  onStartedNewChat,
  onHandedOff,
  panelId,
  isOpen,
  onClose,
  triggerRef,
  transport: customTransport,
  identity: customIdentity,
  available: customAvailable,
}: DestinationAssistantPanelProps) {
  const router = useRouter();
  const session = useAssistantSession();

  const transport = customTransport !== undefined ? customTransport : session.transport;
  const identity = customIdentity !== undefined ? customIdentity : (session.identity ?? "unavailable");
  const available = customAvailable !== undefined ? customAvailable : session.available;

  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const wasOpenRef = useRef(false);
  const previousIdentity = useRef(identity);

  // Responsive breakpoint tracking without unmounting controller
  useEffect(() => {
    function checkMobile() {
      if (typeof window !== "undefined") {
        setIsMobile(window.innerWidth <= 640);
      }
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Invalidate in-memory handoff when identity changes
  useEffect(() => {
    if (previousIdentity.current !== identity) clearAssistantHandoff();
    previousIdentity.current = identity;
  }, [identity]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const viewport = window.visualViewport;
    const updateBounds = () => {
      panel.style.setProperty("--assistant-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      panel.style.setProperty("--assistant-keyboard-offset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    };
    updateBounds();
    viewport?.addEventListener("resize", updateBounds);
    viewport?.addEventListener("scroll", updateBounds);
    return () => {
      viewport?.removeEventListener("resize", updateBounds);
      viewport?.removeEventListener("scroll", updateBounds);
    };
  }, [isOpen]);

  // Modal mobile sheet: contain keyboard focus and restore each sibling's
  // previous inert state. Desktop remains an interactive non-modal panel.
  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !isMobile || !panel) return;
    const previousInert = new Map<HTMLElement, boolean>();
    let node: HTMLElement = panel;
    while (node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === node || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName) || sibling.classList.contains("destination-assistant-backdrop")) continue;
        previousInert.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      if (node.parentElement === document.body) break;
      node = node.parentElement;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), summary, [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    const containTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || panel.querySelector("dialog[open]")) return;
      const controls = focusable();
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) (focusable()[0] ?? panel).focus();
    };
    window.addEventListener("keydown", containTab);
    document.addEventListener("focusin", containFocus);
    if (!panel.contains(document.activeElement)) (focusable()[0] ?? panel).focus();
    return () => {
      window.removeEventListener("keydown", containTab);
      document.removeEventListener("focusin", containFocus);
      for (const [element, inert] of previousInert) element.inert = inert;
      document.body.style.overflow = overflow;
    };
  }, [isOpen, isMobile]);

  // Focus management on open/close
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Panel just opened: focus composer or panel
      const textarea = panelRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea && !textarea.disabled) {
        textarea.focus();
      } else {
        panelRef.current?.focus();
      }
    } else if (!isOpen && wasOpenRef.current) {
      // Hiding an ancestor does not cancel a native dialog's modal lifetime.
      // Treat a hidden confirmation as Cancel, preserving unresolved work.
      panelRef.current?.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(dialog => dialog.close());
      // Panel just closed/minimized: restore focus to trigger button
      triggerRef?.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, triggerRef]);

  // Escape key minimizes panel and restores focus
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // If an open native dialog exists inside the panel, let it handle Escape
        const activeDialog = panelRef.current?.querySelector<HTMLDialogElement>("dialog[open]");
        if (activeDialog) return;
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Explicit full-page continuation
  function handleOpenFullPage(snapshot: AssistantState) {
    if (!available || hasUnresolvedAttempt(snapshot)) return;
    setAssistantHandoff({
      principal: snapshot.identity,
      context: snapshot.context,
      conversationId: snapshot.conversationId,
      draft: snapshot.draft,
      knowledgeMode: snapshot.knowledgeMode,
    });
    const href = (snapshot.conversationId
      ? `/assistant?conversationId=${encodeURIComponent(snapshot.conversationId)}`
      : snapshot.context.type === "DESTINATION" ? `/assistant?destinationId=${encodeURIComponent(snapshot.context.destinationId)}` : "/assistant") as Route;
    router.push(href);
    onHandedOff?.();
  }

  return (
    <>
      {isOpen && isMobile && (
        <div
          className="destination-assistant-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        ref={panelRef}
        id={panelId}
        className="destination-assistant-panel assistant-chat-panel assistant-page"
        hidden={!isOpen}
        style={{ display: isOpen ? "flex" : "none" }}
        role="dialog"
        aria-modal={isMobile && isOpen ? "true" : "false"}
        aria-label={destinationName ? `Trợ lý AI về ${destinationName}` : "Trợ lý AI Hà Giang"}
        tabIndex={-1}
      >
        <AssistantChat
          mode="panel"
          transport={transport}
          identity={identity}
          available={available}
          availabilityError={customAvailable === undefined && session.error ? "Chưa kết nối được trợ lý AI. Bạn có thể thử lại." : undefined}
          onRetrySession={session.retry}
          initialContext={context ?? (destinationId ? { type: "DESTINATION", destinationId } : { type: "GENERAL" })}
          newChatContext={newChatContext}
          onStartedNewChat={onStartedNewChat}
          pinnedDestinationName={destinationName}
          showSources={true}
          onMinimize={onClose}
          onOpenFullPage={handleOpenFullPage}
        />
      </div>
    </>
  );
}

export default DestinationAssistantPanel;
