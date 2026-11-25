"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FileText, Menu, MessageSquare, PanelLeft, PanelLeftOpen, Plus, Send, ShieldCheck, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createIdempotencyKey } from "@/lib/mutation-client";
import { cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import type { QaContext } from "@/modules/ai/qa-contract";
import { conversationMetaPartSchema, extractSuggestRepliesDirectives } from "@/modules/tripsage-chat/assistant-conversation-contract";
import { accessLegPartSchema, isCurrentAccessLeg, reconcileAccessPins, resolveTravelDaysContext } from "@/modules/tripsage-chat/tripsage-access-leg";
import { resolveBudgetSavingsChips } from "@/modules/tripsage-chat/tripsage-cost";
import { buildTripsageChatBody, summarizeItinerary } from "@/modules/tripsage-chat/tripsage-chat-context";
import { classifyChatError, createTripsageChatFetch } from "@/modules/tripsage-chat/tripsage-chat-errors";
import {
  applyPlanProgress,
  hasPlanProgressErrors,
  planProgressPartSchema,
  saveActionPartSchema,
  type PlanProgressSnapshot,
} from "@/modules/tripsage-chat/tripsage-chat-parts";
import {
  chosenLodgingMapToList,
  pruneChosenLodgings,
  toggleChosenLodging,
  type ChosenLodgingMap,
} from "@/modules/tripsage-chat/tripsage-timeline";
import type { SaveState } from "@/modules/trip-save/trip-save-state";
import { isTripSaveNavigationLocked } from "@/modules/trip-save/trip-save-state";
import { pinKey } from "@/modules/trip-save/trip-pin-builders";
import type { PinnedItem } from "@/modules/trip-save/trip-pin-contract";
import { pinToTrip } from "@/modules/trip-read/trip-management-client";
import type { PinControl } from "./tripsage-pin-button";

import type { ConfirmedTurn } from "@/components/assistant/assistant-controller";
import { deleteConversation, fetchConversationDetail, fetchConversations, renameConversation, type ConversationDetailResult } from "@/components/assistant/assistant-conversation-client";
import { AssistantLandscape } from "@/components/assistant/assistant-landscape";
import {
  AssistantSidebar,
  readSidebarPreference,
  resolveDesktopSidebarOpen,
  writeSidebarPreference,
} from "@/components/assistant/assistant-sidebar";
import { consumePlanningAuthDraft } from "@/components/assistant/planning-auth-handoff";

import {
  deleteAllAssistantConversations,
  deleteAssistantConversation,
  fetchAssistantConversationDetail,
  fetchAssistantConversations,
  markAssistantConversationSavedTrip,
  mergeUnifiedConversations,
  renameAssistantConversation,
  saveAssistantConversationChosenLodgings,
  storedMessagesToUiMessages,
  type UnifiedConversationItem,
} from "./assistant-unified-history";
import { TripsageAccessLegCard } from "./tripsage-access-leg-card";
import { TripsageChatNotice } from "./tripsage-chat-notice";
import { isAssistantTurnTextDone, TripsageStreamedText } from "./tripsage-streamed-text";
import { isProposalOutdated, readConversationState, STALE_ITINERARY_MESSAGE } from "./tripsage-conversation-state";
import { TripsageCostCard } from "./tripsage-cost-card";
import { parseItineraryPart } from "./tripsage-itinerary-view";
import { TripsageMarkdown } from "./tripsage-markdown";
import { TripsageMemoryPanel } from "./tripsage-memory-panel";
import {
  readPlanPanelMode,
  resolvePanelModeAfterCardOpen,
  TripsagePlanPanel,
  writePlanPanelMode,
  type PlanPanelMode,
} from "./tripsage-plan-panel";
import { TripsagePlanProgress, planProgressRetryPrompt } from "./tripsage-plan-progress";
import { TripsagePlanSummaryCard } from "./tripsage-plan-summary-card";
import { readTripsageResultTurns, TripsageResultCards } from "./tripsage-result-cards";
import { TripsageSaveSection } from "./tripsage-save-section";
import { parseSourcesPart, TripsageSourcesView } from "./tripsage-sources-view";
import {
  decideQueuePostTurnAction,
  enqueueQueuedMessage,
  evaluateComposerLength,
  formatQueuedPreview,
  removeQueuedMessage,
  restoreQueueToDraft,
} from "./tripsage-chat-queue";

/**
 * Lifts the answer's closing question out of the prose so it sits right above its quick-reply buttons.
 * shortcut: relies on the model ending with the question on its own line; upgrade to a `question` field on suggestReplies if that drifts.
 */
export function splitTrailingQuestion(text: string): { body: string; question: string | null } {
  const trimmed = text.trimEnd();
  const cut = trimmed.lastIndexOf("\n");
  const last = trimmed.slice(cut + 1).replace(/^[#>*_\s]+|[*_\s]+$/gu, "").replace(/\*\*|__/gu, "");
  if (!/[?？]$/u.test(last) || last.length > 200) return { body: text, question: null };
  return { body: cut < 0 ? "" : trimmed.slice(0, cut), question: last };
}

type StatusPart = { kind: "start" | "checking" | "writing"; label: string };

const MAX_LENGTH = 1000;
const SUGGESTION_CARDS = [
  { icon: "🗺️", title: "Lập hành trình Hà Giang", prompt: (subject: string) => subject === "Hà Giang" ? "Đi Hà Giang 4 ngày 3 đêm bằng xe máy" : `Lên lịch Hà Giang 4 ngày có ghé ${subject}.` },
  { icon: "✈️", title: "Đi Hà Giang từ xa", prompt: () => "Mình ở Sài Gòn, muốn đi Hà Giang 4 ngày." },
  { icon: "🏔️", title: "Giới thiệu điểm đến", prompt: (subject: string) => `Giới thiệu ngắn gọn về ${subject}.` },
  { icon: "🌿", title: "Văn hóa & ẩm thực", prompt: (subject: string) => `${subject} có những nét văn hóa và ẩm thực nào nổi bật?` },
] as const;

export function buildPreselectedPlanningDraft(stops: readonly { id: string; name: string }[]): string {
  const names = stops.map(stop => cleanPlaceDisplayName(stop.name) || stop.name.trim()).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return `Lên lịch trình Hà Giang có ghé ${names[0]}.`;
  return `Lên lịch trình Hà Giang ưu tiên ghé các điểm: ${names.join(", ")}.`;
}

export type TripsageChatClientProps = {
  memoryEnabled?: boolean;
  identity?: string;
  initialContext?: QaContext;
  destinationName?: string;
  mustIncludeDestinations?: readonly { id: string; name: string }[];
  initialPlanIntent?: boolean;
  conversationId?: string;
  renderLegacyAnswer?: (turn: ConfirmedTurn) => ReactNode;
};

/**
 * Single unified assistant chat at `/assistant` for signed-in travelers (ADR-43):
 * one composer and shared left sidebar (merging new saved conversations + legacy Q&A/V2 read-only),
 * chat-only origin confirmation, source chips, collapsed itinerary map, and persisted display cards.
 */
export function TripsageChatClient({
  memoryEnabled = false,
  identity,
  initialContext,
  destinationName,
  mustIncludeDestinations = [],
  initialPlanIntent = false,
  conversationId: initialConversationId,
  renderLegacyAnswer,
}: TripsageChatClientProps) {
  const [selectedStops, setSelectedStops] = useState<{ id: string; name: string }[]>(() =>
    mustIncludeDestinations.slice(0, 4).map(stop => ({ id: stop.id, name: cleanPlaceDisplayName(stop.name) || stop.name })),
  );
  const [draft, setDraft] = useState(() =>
    initialPlanIntent && mustIncludeDestinations.length > 0 && !initialConversationId
      ? buildPreselectedPlanningDraft(mustIncludeDestinations.slice(0, 4))
      : "",
  );
  const draftEditedRef = useRef(false);
  const [queued, setQueued] = useState<string[]>([]);
  const queuedRef = useRef<string[]>([]);
  const stopRequestedRef = useRef(false);
  const pendingAutoFlushRef = useRef(false);
  const [status, setStatus] = useState<StatusPart | null>(null);
  const [planProgress, setPlanProgress] = useState<PlanProgressSnapshot | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [legacyReadOnly, setLegacyReadOnly] = useState<ConversationDetailResult | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isDesktopSplitViewport, setIsDesktopSplitViewport] = useState(false);
  const [planPanelMode, setPlanPanelMode] = useState<PlanPanelMode>("split");
  const userToggledSidebarRef = useRef(false);
  const [conversations, setConversations] = useState<UnifiedConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const listFetch = useRef<AbortController | null>(null);

  const bodyRef = useRef<Omit<Parameters<typeof buildTripsageChatBody>[0], "messages">>({
    journey: null,
    tripInfo: null,
    itinerary: null,
    originCandidatesToken: null,
    conversationId: null,
  });

  function syncUrl(id: string | null) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("conversationId", id);
    else url.searchParams.delete("conversationId");
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    fetch: createTripsageChatFetch(),
    prepareSendMessagesRequest: ({ messages }) => ({ body: buildTripsageChatBody({ messages, ...bodyRef.current }) }),
  }), []);

  const { messages, setMessages, sendMessage, status: chatStatus, error, stop, regenerate, clearError } = useChat({
    transport,
    // The notice text is generic; keep the real cause (name and short message only, never the request) visible for debugging.
    onError: err => console.warn("[tripsage-chat] stream error", err.name, err.message.slice(0, 200)),
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) {
        pendingAutoFlushRef.current = false;
        return;
      }
      const hasAnyText = message.parts.some(part => part.type === "text" && part.text.trim().length > 0);
      if (!hasAnyText) {
        setFinishedTextIds(prev => {
          if (prev.has(message.id)) return prev;
          const next = new Set(prev);
          next.add(message.id);
          return next;
        });
      }
    },
    onData: part => {
      if (part.type === "data-status") {
        setStatus(part.data as StatusPart);
      } else if (part.type === "data-plan-progress") {
        const parsed = planProgressPartSchema.safeParse(part.data);
        if (parsed.success) {
          setPlanProgress(prev => applyPlanProgress(prev, parsed.data));
        }
      } else if (part.type === "data-conversation") {
        const parsed = conversationMetaPartSchema.safeParse(part.data);
        if (parsed.success) {
          const { conversationId, title } = parsed.data;
          bodyRef.current = { ...bodyRef.current, conversationId };
          setActiveConversationId(conversationId);
          syncUrl(conversationId);
          const nowIso = new Date().toISOString();
          setConversations(current => {
            const exists = current.find(item => item.id === conversationId);
            const updated: UnifiedConversationItem = exists
              ? { ...exists, title, lastActivityAt: nowIso, source: "ASSISTANT" }
              : { id: conversationId, title, context: { type: "GENERAL" }, createdAt: nowIso, lastActivityAt: nowIso, source: "ASSISTANT" };
            return [updated, ...current.filter(item => item.id !== conversationId)];
          });
        }
      }
    },
  });

  const [saveState, setSaveState] = useState<SaveState>("idle");
  // True while the saved answer is being fetched back after the stream dropped: the user sees progress, not a red error.
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  // ADR-47 & Point 6: items pinned from cards, plus server-verified saved trip scoped to (conversationId, proposalId).
  const [pinned, setPinned] = useState<PinnedItem[]>([]);
  const [savedRecord, setSavedRecord] = useState<{ conversationId: string | null; tripId: string; proposalId: string | null } | null>(null);
  const savedTripId = savedRecord && savedRecord.conversationId === activeConversationId ? savedRecord.tripId : null;
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const pinKeys = useMemo(() => new Set(pinned.map(pinKey)), [pinned]);
  // The way to the meeting hub travels with the saved trip (owner-only), so the trip page shows the whole journey.
  const pinControl: PinControl = {
    saved: savedTripId !== null,
    isPinned: item => pinKeys.has(pinKey(item)),
    toggle: item => {
      const key = pinKey(item);
      if (!savedTripId) {
        setPinMessage(null);
        setPinned(current => current.some(existing => pinKey(existing) === key) ? current.filter(existing => pinKey(existing) !== key) : [...current, item]);
        return;
      }
      if (pinKeys.has(key)) return;
      setPinMessage("Đang ghim vào chuyến đi…");
      void pinToTrip(savedTripId, [item], createIdempotencyKey()).then(outcome => {
        if (outcome.status === "SUCCESS") { setPinned(current => [...current, item]); setPinMessage("Đã ghim vào chuyến đi."); }
        else setPinMessage(outcome.status === "UNKNOWN" ? "Chưa xác nhận được việc ghim. Hãy thử lại." : outcome.error.message);
      });
    },
  };
  const [chosenLodgings, setChosenLodgings] = useState<ChosenLodgingMap>({});
  const lastSyncedProposalRef = useRef<string | null>(null);
  const saveLocked = isTripSaveNavigationLocked(saveState);
  const rawNotice = chatStatus === "error" ? classifyChatError(error) : null;
  const interrupted = rawNotice?.kind === "INTERRUPTED";
  const recovering = interrupted && !!activeConversationId && !recoveryFailed;
  const notice = recovering ? null : rawNotice;
  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const inputLocked = saveLocked || loadingConversation || recovering;
  const locked = busy || inputLocked;
  const composerLength = evaluateComposerLength({
    busy,
    queued,
    draft,
    maxLength: MAX_LENGTH,
  });

  const { turns: resultTurns, latestBudgetMessageId } = useMemo(() => readTripsageResultTurns(messages), [messages]);
  const state = useMemo(() => readConversationState(messages, data => parseItineraryPart(data) !== null), [messages]);
  const lastItineraryMessageId = state.lastItineraryMessageId;
  // Bug 4: only show "Ngày đi / Ngày về" when an access leg exists OR origin is a fixed hub in a different city from homeCity.
  const travelDays = useMemo(
    () =>
      resolveTravelDaysContext({
        accessLeg: state.accessLeg?.data ?? null,
        homeCity: state.tripInfo?.homeCity,
        originLabel: state.journey?.origin?.label,
      }),
    [state.accessLeg?.data, state.tripInfo?.homeCity, state.journey?.origin?.label],
  );
  // Schema parsing creates a fresh object; keep it stable between message updates
  // so the lodging synchronization effect cannot trigger itself on every render.
  const itineraryRef = useRef<ReturnType<typeof parseItineraryPart>>(null);
  const latestItinerary = useMemo(() => {
    const next = lastItineraryMessageId
      ? messages.find(m => m.id === lastItineraryMessageId)?.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) ?? null
      : null;
    // Same proposal, same object: a new one on every streamed chunk remounts the map and refetches /api/maps/config each time.
    if (next && itineraryRef.current?.proposalId === next.proposalId) return itineraryRef.current;
    itineraryRef.current = next;
    return next;
  }, [lastItineraryMessageId, messages]);
  const itineraryCurrent = latestItinerary && !state.itineraryStale;
  const planOutdated = latestItinerary
    ? isProposalOutdated({
        proposal: latestItinerary,
        tripInfo: state.tripInfo,
        journey: state.journey,
        cost: state.cost?.data ?? null,
        itineraryStale: state.itineraryStale,
      })
    : false;
  // A replan that leaves the days unchanged (e.g. only the origin was confirmed) folds the cards instead of re-showing them open.
  const planUnchanged = useMemo(() => {
    const plans = messages.flatMap(message => {
      const plan = message.role === "assistant" ? message.parts.map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null)).filter(Boolean).at(-1) : null;
      return plan ? [JSON.stringify(plan.days)] : [];
    });
    return plans.length > 1 && plans.at(-1) === plans.at(-2);
  }, [messages]);

  // Keep chosen lodgings synced with restored saved conversations and prune nights removed on replan (Ticket 10).
  useEffect(() => {
    const proposalKey = latestItinerary ? `${activeConversationId ?? "draft"}:${latestItinerary.proposalId}` : null;
    if (!latestItinerary || !proposalKey) {
      if (lastSyncedProposalRef.current !== null) {
        lastSyncedProposalRef.current = null;
        setChosenLodgings({});
      }
      return;
    }
    if (lastSyncedProposalRef.current !== proposalKey) {
      lastSyncedProposalRef.current = proposalKey;
      setChosenLodgings(prev => {
        const base = Object.keys(state.chosenLodgings).length > 0 ? state.chosenLodgings : prev;
        return pruneChosenLodgings(base, latestItinerary.days.length, state.suggestions);
      });
    } else {
      setChosenLodgings(prev => pruneChosenLodgings(prev, latestItinerary.days.length, state.suggestions));
    }
  }, [activeConversationId, latestItinerary, state.chosenLodgings, state.suggestions]);

  function handleToggleChosenLodging(nightIndex: number, placeId: string) {
    setChosenLodgings(current => {
      const next = toggleChosenLodging(current, state.suggestions, nightIndex, placeId);
      if (next === current) return current;
      if (activeConversationId) {
        void saveAssistantConversationChosenLodgings(
          activeConversationId,
          chosenLodgingMapToList(next),
          createIdempotencyKey(),
        ).catch(() => {});
      }
      return next;
    });
  }

  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [finishedTextIds, setFinishedTextIds] = useState<ReadonlySet<string>>(() => new Set());
  const streamedMessageIdsRef = useRef<Set<string>>(new Set());

  const planVersions = useMemo(() => {
    const map = new Map<string, { version: number; proposal: NonNullable<ReturnType<typeof parseItineraryPart>> }>();
    let count = 0;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const plan = msg.parts
        .map(part => (part.type === "data-itinerary" ? parseItineraryPart(part.data) : null))
        .filter(Boolean)
        .at(-1);
      if (plan) {
        count += 1;
        map.set(msg.id, { version: count, proposal: plan });
      }
    }
    return map;
  }, [messages]);

  const lastSaveActionMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]!;
      if (msg.role !== "assistant") continue;
      if (msg.parts.some(part => part.type === "data-save-action" && saveActionPartSchema.safeParse(part.data).success)) {
        return msg.id;
      }
    }
    return null;
  }, [messages]);

  const reconciledPinned = useMemo(
    () => reconcileAccessPins(pinned, state.accessLeg?.data),
    [pinned, state.accessLeg?.data],
  );

  const preselectedTripInfo = useMemo(() => {
    if (activeConversationId || !selectedStops.length) return state.tripInfo;
    if (state.tripInfo?.mustIncludeDestinationIds?.length) return state.tripInfo;
    return {
      ...(state.tripInfo ?? {}),
      mustIncludeDestinationIds: selectedStops.slice(0, 4).map(stop => stop.id),
    };
  }, [activeConversationId, selectedStops, state.tripInfo]);

  bodyRef.current = {
    journey: state.journey,
    tripInfo: preselectedTripInfo,
    itinerary: itineraryCurrent ? summarizeItinerary(latestItinerary) : null,
    suggestions: itineraryCurrent ? state.suggestions : undefined,
    accessLeg: state.accessLeg?.data ?? null,
    originCandidatesToken: state.originCandidatesToken,
    conversationId: activeConversationId,
  };

  useEffect(() => { if (!busy) setStatus(null); }, [busy]);
  // Grow the single-line composer up to 4 lines (~96px), then scroll (design §3.6).
  useEffect(() => {
    const el = composer.current;
    if (!el) return;
    if (!draft) { el.style.height = ""; return; }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [draft]);
  // Pins belong to one conversation; savedRecord is already scoped by conversationId + proposalId.
  useEffect(() => { setPinned([]); setPinMessage(null); setPlanProgress(null); }, [activeConversationId]);
  // PARITY BR-3 & BR-4: before saving, keep any pinned ACCESS synced to the current access leg; after saving, keep the saved snapshot unchanged.
  useEffect(() => {
    if (savedTripId || !state.accessLeg?.data) return;
    const currentLeg = state.accessLeg.data;
    setPinned(current => {
      const hasStaleAccess = current.some(item => item.kind === "ACCESS" && !isCurrentAccessLeg(item.leg, currentLeg));
      return hasStaleAccess ? reconcileAccessPins(current, currentLeg) : current;
    });
  }, [savedTripId, state.accessLeg]);

  // A cut connection does not stop the server: it finishes the turn and saves it. Poll the saved conversation and
  // swap it in (same data as a reload) instead of leaving the user on "connection lost".
  useEffect(() => {
    if (!interrupted || !activeConversationId) return;
    setRecoveryFailed(false);
    const conversationId = activeConversationId;
    const sentUserTurns = messages.filter(message => message.role === "user").length;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      while (!cancelled && attempts < 20) {
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (cancelled) return;
        const detail = await fetchAssistantConversationDetail(conversationId).catch(() => null);
        const stored = detail?.messages ?? [];
        if (stored.at(-1)?.role === "assistant" && stored.filter(message => message.role === "user").length === sentUserTurns) {
          setMessages(storedMessagesToUiMessages(stored));
          clearError();
          return;
        }
      }
      if (!cancelled) setRecoveryFailed(true);
    };
    void poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted, activeConversationId]);

  // Restore any draft retained when a guest clicked sign-in from the planning invitation (ADR-35 / ADR-43).
  useEffect(() => {
    if (!identity) return;
    const retained = consumePlanningAuthDraft(identity);
    if (retained?.text) setDraft(retained.text);
  }, [identity]);

  const hasActivePlan = Boolean(latestItinerary && !legacyReadOnly);

  useEffect(() => {
    setPlanPanelMode(readPlanPanelMode());
  }, []);

  // Desktop uses 48px icon rail when plan panel is open unless user persisted open; mobile keeps sheet.
  useEffect(() => {
    const sync = () => {
      const desktop = window.innerWidth >= 1024;
      const splitDesktop = window.innerWidth >= 1200;
      setIsDesktopViewport(desktop);
      setIsDesktopSplitViewport(splitDesktop);
      if (!desktop) {
        setSidebarOpen(false);
      } else if (!userToggledSidebarRef.current) {
        setSidebarOpen(resolveDesktopSidebarOpen({
          hasOpenPlan: hasActivePlan,
          storedPreference: readSidebarPreference(),
        }));
      }
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [hasActivePlan, planPanelMode]);

  function handlePlanPanelModeChange(next: PlanPanelMode) {
    setPlanPanelMode(next);
    writePlanPanelMode(undefined, next);
  }

  function handleOpenPlanFromSummaryCard() {
    setPlanDrawerOpen(true);
    if (isDesktopSplitViewport) {
      const next = resolvePanelModeAfterCardOpen(planPanelMode);
      if (next !== planPanelMode) {
        handlePlanPanelModeChange(next);
      }
    }
  }

  const candidateStops = useMemo(() => {
    const seen = new Set<string>();
    return mustIncludeDestinations
      .map(stop => ({ id: stop.id, name: cleanPlaceDisplayName(stop.name) || stop.name }))
      .filter(stop => {
        if (seen.has(stop.id)) return false;
        seen.add(stop.id);
        return true;
      });
  }, [mustIncludeDestinations]);

  function togglePreselectedStop(stop: { id: string; name: string }) {
    setSelectedStops(current => {
      const exists = current.some(item => item.id === stop.id);
      const next = exists
        ? current.filter(item => item.id !== stop.id)
        : current.length >= 4
          ? current
          : [...current, stop];
      if (!draftEditedRef.current) {
        setDraft(buildPreselectedPlanningDraft(next));
      }
      return next;
    });
  }

  function handleOpenSidebar() {
    userToggledSidebarRef.current = true;
    setSidebarOpen(true);
    if (isDesktopViewport) writeSidebarPreference(undefined, "open");
  }

  function handleCloseSidebar() {
    if (isDesktopViewport) {
      userToggledSidebarRef.current = true;
      writeSidebarPreference(undefined, "collapsed");
    }
    setSidebarOpen(false);
  }

  function handleToggleSidebar() {
    if (sidebarOpen) handleCloseSidebar();
    else handleOpenSidebar();
  }

  async function loadHistory(search = "") {
    listFetch.current?.abort();
    const controller = new AbortController();
    listFetch.current = controller;
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const [assistantRes, legacyRes] = await Promise.allSettled([
        fetchAssistantConversations({ search, limit: 30, signal: controller.signal }),
        fetchConversations({ search, limit: 30, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const assistantItems = assistantRes.status === "fulfilled" ? assistantRes.value.items : [];
      const legacyItems = legacyRes.status === "fulfilled" ? legacyRes.value.items : [];
      if (assistantRes.status === "rejected" && legacyRes.status === "rejected") {
        setHistoryError("Không thể tải lịch sử hội thoại. Vui lòng thử lại.");
        return;
      }
      setConversations(mergeUnifiedConversations(assistantItems, legacyItems));
    } finally {
      if (listFetch.current === controller) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadHistory(searchQuery); }, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); listFetch.current?.abort(); };
  }, [searchQuery, identity]);

  function clearQueueState() {
    queuedRef.current = [];
    setQueued([]);
    pendingAutoFlushRef.current = false;
    stopRequestedRef.current = false;
  }

  async function openConversationById(id: string, preferredSource?: "ASSISTANT" | "LEGACY") {
    if (busy || saveLocked) return;
    clearQueueState();
    setLoadingConversation(true);
    setHistoryNotice(null);
    try {
      if (preferredSource !== "LEGACY") {
        const detail = await fetchAssistantConversationDetail(id).catch(() => null);
        if (detail) {
          setLegacyReadOnly(null);
          setActiveConversationId(detail.conversation.id);
          setSavedRecord(
            detail.conversation.savedTripId && detail.conversation.savedProposalId
              ? {
                  conversationId: detail.conversation.id,
                  tripId: detail.conversation.savedTripId,
                  proposalId: detail.conversation.savedProposalId,
                }
              : null,
          );
          bodyRef.current = { ...bodyRef.current, conversationId: detail.conversation.id };
          setMessages(storedMessagesToUiMessages(detail.messages));
          syncUrl(detail.conversation.id);
          return;
        }
      }
      const legacy = await fetchConversationDetail(id).catch(() => null);
      if (legacy) {
        setActiveConversationId(legacy.conversation.id);
        bodyRef.current = { ...bodyRef.current, conversationId: null };
        setMessages([]);
        setLegacyReadOnly(legacy);
        syncUrl(legacy.conversation.id);
        return;
      }
      setHistoryNotice("Cuộc hội thoại không tồn tại hoặc đã hết hạn.");
      syncUrl(null);
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    if (!initialConversationId) return;
    void openConversationById(initialConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  function startNewChat() {
    if (busy || saveLocked) return;
    clearQueueState();
    setLegacyReadOnly(null);
    setActiveConversationId(null);
    setHistoryNotice(null);
    setSelectedStops([]);
    draftEditedRef.current = false;
    setDraft("");
    setChosenLodgings({});
    setPlanProgress(null);
    streamedMessageIdsRef.current.clear();
    setFinishedTextIds(new Set());
    setPinned([]); setSavedRecord(null); setPinMessage(null);
    lastSyncedProposalRef.current = null;
    bodyRef.current = { journey: null, tripInfo: null, itinerary: null, originCandidatesToken: null, conversationId: null };
    setMessages([]);
    syncUrl(null);
  }

  async function handleSelectConversation(id: string) {
    const item = conversations.find(c => c.id === id);
    await openConversationById(id, item?.source);
  }

  async function handleRenameConversation(id: string, title: string) {
    const item = conversations.find(c => c.id === id);
    try {
      if (item?.source === "LEGACY") {
        await renameConversation(id, title);
      } else {
        const ok = await renameAssistantConversation(id, title, createIdempotencyKey());
        if (!ok) return false;
      }
      setConversations(current => current.map(c => (c.id === id ? { ...c, title, titleCustomized: true } : c)));
      return true;
    } catch {
      return false;
    }
  }

  function handleTripSaved(tripId: string) {
    setSavedRecord({
      conversationId: activeConversationId,
      tripId,
      proposalId: latestItinerary?.proposalId ?? null,
    });
    const convId = activeConversationId;
    if (!convId) return;
    void markAssistantConversationSavedTrip(convId, tripId, createIdempotencyKey()).then(ok => {
      if (ok) {
        setConversations(current => current.map(c => (c.id === convId ? { ...c, savedTripId: tripId } : c)));
      }
    }).catch(() => {});
  }

  async function handleDeleteConversation(id: string) {
    const item = conversations.find(c => c.id === id);
    try {
      const ok = item?.source === "LEGACY"
        ? await deleteConversation(id).then(() => true).catch(() => false)
        : await deleteAssistantConversation(id, createIdempotencyKey());
      if (!ok) {
        setHistoryNotice("Chưa xác nhận xóa hội thoại. Vui lòng thử lại.");
        return false;
      }
      setConversations(current => current.filter(c => c.id !== id));
      if (id === activeConversationId) startNewChat();
      return true;
    } catch {
      setHistoryNotice("Chưa xác nhận xóa hội thoại. Vui lòng thử lại.");
      return false;
    }
  }

  async function handleDeleteAll() {
    setHistoryNotice(null);
    try {
      const okAssistant = await deleteAllAssistantConversations(createIdempotencyKey());
      const legacyItems = conversations.filter(c => c.source === "LEGACY");
      const legacyResults = await Promise.all(
        legacyItems.map(item => deleteConversation(item.id).then(() => true).catch(() => false)),
      );
      if (!okAssistant || legacyResults.some(res => !res)) {
        setHistoryNotice("Một số hội thoại chưa thể xóa. Vui lòng thử lại.");
        void loadHistory(searchQuery);
        return false;
      }
      setConversations([]);
      startNewChat();
      return true;
    } catch {
      setHistoryNotice("Chưa xác nhận xóa toàn bộ lịch sử. Vui lòng thử lại.");
      return false;
    }
  }

  function send(text: string) {
    if (!text.trim() || locked || legacyReadOnly) return;
    // Immediately finish revealing any previous assistant turn when the traveler sends a new message (Bug E).
    setFinishedTextIds(prev => {
      const next = new Set(prev);
      for (const m of messages) {
        if (m.role === "assistant") next.add(m.id);
      }
      return next;
    });
    stopRequestedRef.current = false;
    pendingAutoFlushRef.current = true;
    setPlanProgress(null);
    void sendMessage({ text });
  }

  function handleStop() {
    stopRequestedRef.current = true;
    pendingAutoFlushRef.current = false;
    if (queuedRef.current.length > 0) {
      const restored = restoreQueueToDraft(queuedRef.current, draft);
      queuedRef.current = [];
      setQueued([]);
      if (restored) {
        draftEditedRef.current = true;
        setDraft(restored);
      }
    }
    void stop();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || inputLocked || legacyReadOnly) return;
    if (busy) {
      const result = enqueueQueuedMessage(queuedRef.current, text, MAX_LENGTH);
      if (!result.accepted) return;
      queuedRef.current = result.queued;
      setQueued(result.queued);
      setDraft("");
      return;
    }
    if (text.length > MAX_LENGTH) return;
    setDraft("");
    send(text);
  }

  useEffect(() => {
    const action = decideQueuePostTurnAction({
      chatStatus,
      inputLocked,
      legacyReadOnly: Boolean(legacyReadOnly),
      stopRequested: stopRequestedRef.current,
      pendingAutoFlush: pendingAutoFlushRef.current,
      queued: queuedRef.current,
      draft,
    });
    if (action.type === "none") return;
    queuedRef.current = [];
    setQueued([]);
    pendingAutoFlushRef.current = false;
    stopRequestedRef.current = false;
    if (action.type === "restore") {
      draftEditedRef.current = true;
      setDraft(action.draft);
      return;
    }
    if (action.type === "flush") {
      send(action.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatStatus, inputLocked, legacyReadOnly, queued]);

  const composer = useRef<HTMLTextAreaElement>(null);
  const subject = initialContext?.type === "DESTINATION" && destinationName?.trim() ? destinationName.trim() : "Hà Giang";

  return (
    <section
      className={`assistant-chat assistant-v2-chat${hasActivePlan ? " has-plan" : ""}${isDesktopViewport ? " has-sidebar-rail" : ""}`}
      data-runtime="tripsage-unified"
      data-has-plan={hasActivePlan ? "true" : "false"}
      data-panel-mode={hasActivePlan ? planPanelMode : "none"}
      aria-label="Trợ lý AI"
      aria-busy={busy || loadingConversation}
      lang="vi"
    >
      <AssistantSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={historyLoading}
        loadingMore={false}
        error={historyError}
        onRetry={() => void loadHistory(searchQuery)}
        hasMore={false}
        isOpen={sidebarOpen}
        railOnDesktop={isDesktopViewport}
        onOpen={handleOpenSidebar}
        onClose={handleCloseSidebar}
        onNewChat={startNewChat}
        onSelectConversation={id => void handleSelectConversation(id)}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onDeleteAll={handleDeleteAll}
        canRename={() => true}
        onLoadMore={() => undefined}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="assistant-workspace">
      <div className={`assistant-chat-main assistant-chat-fullscreen${hasActivePlan && planPanelMode === "expanded" ? " is-chat-collapsed" : ""}`}>
        <div className="assistant-chat-collapsed-strip" aria-label="Khung chat thu gọn">
          <button
            type="button"
            className="tripsage-panel-strip-btn"
            data-testid="chat-reopen-btn"
            onClick={() => handlePlanPanelModeChange("split")}
            aria-label="Mở lại khung chat"
            title="Mở lại khung chat"
          >
            <MessageSquare size={18} aria-hidden="true" />
          </button>
          <span className="tripsage-panel-vertical-title">Trò chuyện</span>
        </div>
        {/* Ticket 11 (design §4.1): 48px mobile top bar (☰ · conversation title · +) replacing floating sidebar pill */}
        <header className="assistant-mobile-topbar">
          <button
            type="button"
            className="assistant-mobile-topbar-btn"
            onClick={handleToggleSidebar}
            aria-label={sidebarOpen ? "Đóng lịch sử hội thoại" : "Mở lịch sử hội thoại"}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <span className="assistant-mobile-topbar-title">
            {conversations.find(c => c.id === activeConversationId)?.title ?? "Trợ lý Hà Giang"}
          </span>
          <button
            type="button"
            className="assistant-mobile-topbar-btn"
            onClick={startNewChat}
            disabled={busy || saveLocked}
            aria-label="Đoạn chat mới"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={`assistant-floating-header ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
          <div className="assistant-header-left">
            <button
              type="button"
              className="assistant-sidebar-toggle-btn"
              onClick={handleToggleSidebar}
              aria-label={sidebarOpen ? "Thu gọn thanh lịch sử" : "Mở thanh lịch sử"}
              title={sidebarOpen ? "Thu gọn thanh lịch sử" : "Mở thanh lịch sử"}
            >
              {sidebarOpen ? <PanelLeft aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
            {!sidebarOpen && (
              <button
                type="button"
                className="assistant-floating-new-btn"
                onClick={startNewChat}
                disabled={busy || saveLocked}
                aria-label="Tạo cuộc trò chuyện mới"
                title="Đoạn chat mới"
              >
                <Plus aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="assistant-transcript" tabIndex={0} aria-label="Danh sách tin nhắn">
          <div className="assistant-transcript-inner">
            <TripsageMemoryPanel enabled={memoryEnabled} />
            {historyNotice && <p role="status" className="assistant-muted">{historyNotice}</p>}

            {loadingConversation ? (
              <p role="status" className="assistant-muted">Đang mở cuộc hội thoại…</p>
            ) : legacyReadOnly ? (
              <div className="assistant-messages" data-legacy-readonly="true">
                <div className="tripsage-legacy-banner" role="note">
                  <span>Hội thoại cũ (chỉ đọc).</span>
                  <button type="button" onClick={startNewChat}>Bắt đầu đoạn chat mới</button>
                </div>
                {legacyReadOnly.turns.map(turn => (
                  <div key={turn.response.turnId} className="assistant-turn assistant-planning-exchange">
                    <article className="assistant-message assistant-user"><p>{turn.question}</p></article>
                    <article className="assistant-message assistant-answer">
                      <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                      {renderLegacyAnswer ? renderLegacyAnswer(turn) : (
                        <TripsageMarkdown text={turn.response.answerParts.map(part => part.text).join("\n\n") || ("clarificationQuestion" in turn.response && typeof turn.response.clarificationQuestion === "string" ? turn.response.clarificationQuestion : "") || ("unanswered" in turn.response && Array.isArray(turn.response.unanswered) ? turn.response.unanswered.join(" ") : "")} />
                      )}
                    </article>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!messages.length && (
                  <div className="assistant-empty">
                    <div className="assistant-empty-art">
                      <AssistantLandscape />
                      <Sparkles className="assistant-icon" aria-hidden="true" />
                    </div>
                    <h2>{initialContext?.type === "DESTINATION" && destinationName?.trim() ? `Hỏi về ${destinationName.trim()}` : "Bạn muốn khám phá điều gì?"}</h2>
                    <p>{initialContext?.type === "DESTINATION" && destinationName?.trim()
                      ? `Hỏi về lịch sử, cảnh quan, đường đi hoặc nhờ mình lên hành trình ghé ${destinationName.trim()}.`
                      : "Hỏi về văn hóa, lịch sử và điểm đến tại Hà Giang, hoặc nhờ mình lên hành trình."}</p>
                    <div className="assistant-suggestions" aria-label="Gợi ý câu hỏi">
                      {SUGGESTION_CARDS.map((item, index) => (
                        <button
                          key={index}
                          type="button"
                          className="assistant-suggestion-chip"
                          disabled={locked}
                          onClick={() => {
                            setDraft(item.prompt(subject));
                            composer.current?.focus();
                          }}
                        >
                          <span className="assistant-suggestion-icon" aria-hidden="true">{item.icon}</span>
                          <div className="assistant-suggestion-info">
                            <span className="assistant-suggestion-title">{item.title}</span>
                            <span className="assistant-suggestion-prompt">{item.prompt(subject)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="assistant-messages" aria-live="polite">
                  {messages.map(message => {
                    const rawText = message.parts.map(part => (part.type === "text" ? part.text : "")).join("");
                    const directiveResult =
                      message.role === "assistant"
                        ? extractSuggestRepliesDirectives(rawText)
                        : { text: rawText, replies: [] };
                    const text = directiveResult.text;
                    const planEntry = planVersions.get(message.id) ?? null;
                    const itinerary = message.role === "assistant" && message.id === lastItineraryMessageId ? latestItinerary : null;
                    const isCurrentPlanMessage = Boolean(itinerary && planEntry);
                    const sources = message.role === "assistant" ? [...message.parts].reverse().map(part => (part.type === "data-sources" ? parseSourcesPart(part.data) : null)).find(Boolean) ?? [] : [];
                    const resultParts = resultTurns.get(message.id)?.filter(part => part.type !== "data-budget" || message.id === latestBudgetMessageId) ?? [];
                    const candidateButtons = state.originCandidates?.messageId === message.id && !busy ? state.originCandidates.candidates.map(c => c.label) : [];
                    const quickReplies =
                      state.quickReplies?.messageId === message.id && !busy
                        ? state.quickReplies.replies
                        : message.role === "assistant" && !busy && directiveResult.replies.length > 0 && message.id === messages.at(-1)?.id
                          ? directiveResult.replies
                          : [];
                    const replies = candidateButtons.length > 0 ? candidateButtons : quickReplies;
                    const cost = state.cost?.messageId === message.id ? state.cost.data : null;
                    const activeTurnCost = cost ?? (isCurrentPlanMessage ? (state.cost?.data ?? null) : null);
                    const isLatestAssistant = message.role === "assistant" && message.id === messages.at(-1)?.id;
                    const budgetSavingsChips =
                      !busy && (cost || isCurrentPlanMessage) && (isLatestAssistant || state.cost?.messageId === message.id)
                        ? resolveBudgetSavingsChips(activeTurnCost, state.accessLeg?.data ?? null, state.tripInfo?.transport ?? null)
                        : [];
                    const messageAccessLeg = message.role === "assistant"
                      ? [...message.parts].reverse().map(part => (part.type === "data-access-leg" ? accessLegPartSchema.safeParse(part.data) : null)).find(res => res?.success)?.data ?? null
                      : null;
                    const isStaleAccessLeg = Boolean(
                      messageAccessLeg
                      && state.accessLeg
                      && (state.accessLeg.messageId !== message.id || !isCurrentAccessLeg(messageAccessLeg, state.accessLeg.data)),
                    );
                    const accessLeg = messageAccessLeg;
                    const saveAction = message.role === "assistant"
                      ? [...message.parts].reverse().map(part => (part.type === "data-save-action" ? saveActionPartSchema.safeParse(part.data) : null)).find(res => res?.success)?.data ?? null
                      : null;
                    const showInlineSave = Boolean(saveAction && message.id === lastSaveActionMessageId && latestItinerary);
                    const hasCards = Boolean(cost || accessLeg || planEntry || resultParts.length || showInlineSave);
                    const isLastMessage = message.id === messages.at(-1)?.id;
                    const live = busy && isLastMessage;
                    if (live && message.role === "assistant") {
                      streamedMessageIdsRef.current.add(message.id);
                    }
                    // The closing question sits under the cards and buttons it refers to, never above them.
                    const { body, question } =
                      message.role === "assistant" && (replies.length > 0 || budgetSavingsChips.length > 0 || hasCards)
                        ? splitTrailingQuestion(text)
                        : { body: text, question: null };
                    const isTextDone = isAssistantTurnTextDone({
                      hasBody: Boolean(body),
                      isLatestMessage: isLastMessage,
                      live,
                      recovering,
                      wasStreamedLive: streamedMessageIdsRef.current.has(message.id),
                      finished: finishedTextIds.has(message.id),
                    });
                    if (!text && !planEntry && !sources.length && !resultParts.length && !replies.length && !cost && !accessLeg && !showInlineSave) return null;
                    return message.role === "user" ? (
                      <article key={message.id} className="assistant-message assistant-user"><p>{text}</p></article>
                    ) : (
                      <article key={message.id} className="assistant-message assistant-answer">
                        <span className="assistant-speaker"><Sparkles className="assistant-speaker-icon" aria-hidden="true" /><span>Trợ lý AI</span></span>
                        {body && (
                          <TripsageStreamedText
                            text={body}
                            live={live}
                            flushNow={!isLastMessage || finishedTextIds.has(message.id)}
                            onDone={() => {
                              setFinishedTextIds(prev => {
                                if (prev.has(message.id)) return prev;
                                const next = new Set(prev);
                                next.add(message.id);
                                return next;
                              });
                            }}
                          />
                        )}
                        {/* Slim B6: in chat messages, show compact Plan Summary Card; full timeline/map/cost lives in TripsagePlanPanel */}
                        {planEntry && isTextDone && (
                          <TripsagePlanSummaryCard
                            version={planEntry.version}
                            proposal={planEntry.proposal}
                            cost={isCurrentPlanMessage ? (state.cost?.data ?? cost) : null}
                            isCurrent={isCurrentPlanMessage}
                            isOutdated={isCurrentPlanMessage && planOutdated}
                            isPanelOpen={isDesktopSplitViewport && hasActivePlan ? planPanelMode !== "collapsed" : planDrawerOpen}
                            onOpenPanel={isCurrentPlanMessage ? handleOpenPlanFromSummaryCard : undefined}
                          />
                        )}
                        {/* Standalone cost or access-leg card when no itinerary exists in this turn */}
                        {!planEntry && cost && isTextDone && (
                          <TripsageCostCard
                            cost={cost}
                            pins={pinControl}
                            accessLeg={state.accessLeg?.data ?? null}
                            onSelectSavingsOption={prompt => send(prompt)}
                          />
                        )}
                        {!planEntry && accessLeg && isTextDone && (
                          <TripsageAccessLegCard
                            leg={accessLeg}
                            isStale={isStaleAccessLeg}
                            pins={isStaleAccessLeg ? undefined : pinControl}
                          />
                        )}
                        {isTextDone && <TripsageSourcesView sources={sources} />}
                        {isTextDone && <TripsageResultCards parts={resultParts} pins={pinControl} />}
                        {showInlineSave && latestItinerary && isTextDone && (
                          <div className="tripsage-inline-save" data-testid="tripsage-inline-save">
                            <TripsageSaveSection
                              key={latestItinerary.proposalId}
                              result={latestItinerary}
                              tripInfo={state.tripInfo}
                              chosenLodgings={chosenLodgings}
                              suggestions={state.suggestions}
                              pinnedItems={reconciledPinned}
                              primaryLabel="Lưu chuyến"
                              buttonSize="md"
                              outdatedReason={planOutdated ? STALE_ITINERARY_MESSAGE : null}
                              savedTripId={
                                savedRecord
                                && savedRecord.conversationId === activeConversationId
                                && savedRecord.proposalId === latestItinerary.proposalId
                                  ? savedRecord.tripId
                                  : null
                              }
                              onSaved={handleTripSaved}
                              onStateChange={setSaveState}
                              onRequestFix={prompt => send(prompt)}
                            />
                          </div>
                        )}
                        {replies.length === 0 && budgetSavingsChips.length === 0 && question && isTextDone && (
                          <p className="tripsage-next-question">{question}</p>
                        )}
                        {budgetSavingsChips.length > 0 && isTextDone && (
                          <div className="tripsage-next-step">
                            {question && <p className="tripsage-next-question">{question}</p>}
                            <div className="tripsage-quick-replies" role="group" aria-label={question ?? "Gợi ý giảm chi phí ước tính"}>
                              {budgetSavingsChips.map(chip => (
                                <button key={chip.id} type="button" onClick={() => send(chip.prompt)} disabled={locked}>
                                  {chip.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {budgetSavingsChips.length === 0 && replies.length > 0 && isTextDone && (
                          <div className="tripsage-next-step">
                            {question && <p className="tripsage-next-question">{question}</p>}
                            <div className="tripsage-quick-replies" role="group" aria-label={question ?? "Gợi ý trả lời nhanh"}>
                              {replies.map(reply => <button key={reply} type="button" onClick={() => send(reply)} disabled={locked}>{reply}</button>)}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                {(busy || recovering) && planProgress ? (
                  <TripsagePlanProgress snapshot={planProgress} />
                ) : busy ? (
                  <div role="status" aria-live="polite" className="tripsage-thinking">
                    <span className="tripsage-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                    <span>{status?.label ?? "Mình đang xử lý yêu cầu…"}</span>
                  </div>
                ) : interrupted && !recovering && planProgress ? (
                  <TripsagePlanProgress
                    snapshot={planProgress}
                    interrupted
                    onRetryStream={saveLocked ? undefined : () => void regenerate()}
                  />
                ) : !interrupted && planProgress && hasPlanProgressErrors(planProgress) ? (
                  <TripsagePlanProgress
                    snapshot={planProgress}
                    onRetryStep={locked ? undefined : step => send(planProgressRetryPrompt(step))}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        {!legacyReadOnly && (
          <div className="assistant-bottom-dock"><div className="assistant-bottom-dock-inner">
            {pinMessage && <p role="status" className="assistant-muted">{pinMessage}</p>}
            {recovering && (
              <div role="status" aria-live="polite" className="tripsage-thinking">
                <span className="tripsage-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                <span>Đang hoàn tất câu trả lời</span>
              </div>
            )}
            <TripsageChatNotice notice={notice} onResend={saveLocked ? undefined : () => void regenerate()} />
            {!messages.length && !activeConversationId && candidateStops.length > 0 && (
              <div className="tripsage-preselected-bar" data-testid="assistant-preselected-stops" role="group" aria-label="Điểm bắt buộc trong lịch">
                <span className="tripsage-preselected-label">Điểm bắt buộc ({selectedStops.length}/4):</span>
                <div className="tripsage-preselected-chips">
                  {candidateStops.map(stop => {
                    const active = selectedStops.some(item => item.id === stop.id);
                    const disabledChip = !active && selectedStops.length >= 4;
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        className="tripsage-preselected-chip"
                        aria-pressed={active}
                        disabled={locked || disabledChip}
                        onClick={() => togglePreselectedStop(stop)}
                      >
                        <span>{stop.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {queued.length > 0 && (
              <div className="assistant-queued-list" aria-live="polite" aria-label="Tin nhắn đang chờ gửi">
                <span className="assistant-queued-header">Đang chờ gửi</span>
                <ul className="assistant-queued-items">
                  {queued.map((item, index) => {
                    const preview = formatQueuedPreview(item);
                    return (
                      <li key={`${index}-${item.slice(0, 24)}`} className="assistant-queued-item">
                        <span className="assistant-queued-text" title={item}>{preview}</span>
                        <button
                          type="button"
                          className="assistant-queued-remove"
                          aria-label={`Bỏ câu chờ: ${preview}`}
                          onClick={() => {
                            const next = removeQueuedMessage(queuedRef.current, index);
                            queuedRef.current = next;
                            setQueued(next);
                          }}
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <form noValidate className="assistant-composer" onSubmit={submit}>
              <label htmlFor="tripsage-chat-input" className="assistant-sr-only">Tin nhắn cho trợ lý</label>
              <div
                className="assistant-composer-input"
                onPointerDown={event => {
                  if (event.target === event.currentTarget) {
                    event.preventDefault();
                    composer.current?.focus();
                  }
                }}
              >
                <textarea
                  ref={composer}
                  id="tripsage-chat-input"
                  className="resize-none"
                  rows={1}
                  placeholder="Hỏi về chuyến đi Hà Giang…"
                  value={draft}
                  disabled={inputLocked}
                  onChange={event => {
                    draftEditedRef.current = true;
                    setDraft(event.target.value);
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="assistant-composer-bar">
                  <div className="assistant-composer-left-tools" />
                  {busy ? (
                    <>
                      {draft.trim().length > 0 && (
                        <button
                          type="submit"
                          className="assistant-composer-send-circle"
                          aria-label="Thêm vào hàng chờ"
                          disabled={inputLocked || legacyReadOnly !== null || composerLength.overLimit}
                        >
                          <Send size={15} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="assistant-composer-send-circle is-stop"
                        aria-label="Dừng trả lời"
                        onClick={handleStop}
                      >
                        <Square size={14} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="submit"
                      className="assistant-composer-send-circle"
                      aria-label="Gửi tin nhắn"
                      disabled={!draft.trim() || inputLocked || legacyReadOnly !== null || composerLength.overLimit}
                    >
                      <Send size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {(draft.length > MAX_LENGTH * 0.8 || composerLength.showCounter) && (
                <div className="assistant-composer-footer">
                  <span
                    className={`assistant-char-counter${composerLength.overLimit ? " is-over-limit" : ""}`}
                    role={composerLength.overLimit ? "alert" : undefined}
                  >
                    {composerLength.displayCount}/{MAX_LENGTH} ký tự
                  </span>
                </div>
              )}
            </form>
            <footer className="assistant-trust-footer">
              <div className="assistant-trust-item"><ShieldCheck aria-hidden="true" /><span>Thông tin thực tế cần có nguồn</span></div>
              <span className="assistant-trust-sep" aria-hidden="true">•</span>
              <div className="assistant-trust-item"><FileText aria-hidden="true" /><span>Nêu rõ giới hạn khi thiếu dữ liệu</span></div>
            </footer>
          </div></div>
        )}
      </div>

      {hasActivePlan && latestItinerary && (
        <TripsagePlanPanel
          key={latestItinerary.proposalId}
          proposal={latestItinerary}
          timeline={state.timeline}
          suggestions={state.suggestions}
          cost={state.cost?.data ?? null}
          accessLeg={state.accessLeg?.data ?? null}
          travel={travelDays}
          tripInfo={state.tripInfo}
          chosenLodgings={chosenLodgings}
          pinnedItems={reconciledPinned}
          pins={pinControl}
          busy={busy}
          noticePresent={Boolean(notice)}
          isOutdated={planOutdated}
          savedTripId={
            savedRecord
            && savedRecord.conversationId === activeConversationId
            && savedRecord.proposalId === latestItinerary.proposalId
              ? savedRecord.tripId
              : null
          }
          drawerOpen={planDrawerOpen}
          panelMode={planPanelMode}
          onPanelModeChange={handlePlanPanelModeChange}
          onCloseDrawer={() => setPlanDrawerOpen(false)}
          onToggleChosenLodging={handleToggleChosenLodging}
          onRequestMeals={day => send(`Tìm giúp mình quán ăn trưa cho ngày ${day}.`)}
          onAskAccess={() => send(`So sánh giúp mình cách đi từ ${travelDays?.homeCity} ra ${travelDays?.hubName} cho cả đoàn.`)}
          onSelectSavingsOption={prompt => send(prompt)}
          onSaved={handleTripSaved}
          onSaveStateChange={setSaveState}
        />
      )}
      </div>
    </section>
  );
}
