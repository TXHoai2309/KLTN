"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Columns2,
  Layers,
  LoaderCircle,
  Lock,
  Map as MapIcon,
  MapPin,
  Menu,
  Navigation,
  PanelLeft,
  PanelLeftOpen,
  Plus,
  Redo2,
  RefreshCw,
  Replace,
  RotateCcw,
  Route as RouteIcon,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import { getDestinationVisual } from "@/lib/destination-visuals";
import { cleanTravelerDisplay, cleanTravelerProse } from "@/lib/traveler-display-clean";
import { createIdempotencyKey } from "@/lib/mutation-client";
import {
  appendTripEditChatMessagesClient,
  applyTripEdit,
  clearTripEditChatMessagesClient,
  extractCompletedVisitIdsFromDetails,
  fetchTripEditSnapshot,
  parseTripEditApplyValidation,
  previewTripEdit,
  streamAiTripEdit,
  type PersistedTripEditChatPayload,
  type TripEditSnapshot,
} from "@/lib/trip-edit-client";
import { resolveAiStreamOutcome } from "@/modules/trip-edit/ai-stream-outcome";
import type { EditResolution } from "@/modules/trip-edit/edit-clarification";
import type { AdviceSuggestionCard } from "@/modules/trip-edit/saved-trip-advisory";
import { requestBrowserLocation } from "@/modules/in-trip/browser-location";
import {
  inTripLocationSchema,
  isInTripLocationFresh,
  type InTripLocation,
} from "@/modules/in-trip/in-trip-location";
import { createLocationFlowState, transitionLocationFlow } from "@/modules/in-trip/location-flow";
import type { MapCoordinate } from "@/modules/map/map-model";
import {
  MAX_AI_HISTORY_TURN_CHARS,
  MAX_AI_HISTORY_TURNS,
} from "@/modules/trip-edit/ai-workspace-plan";
import AiEditBar, {
  type AiBarUiState,
  type AiConversationEntry,
  type TripIssueHint,
} from "./ai-edit-bar";
import {
  beginEditApply,
  cancelEditApply,
  clearEditApplyFailure,
  createEditApplyState,
  finishEditApply,
  retryUnknownEditApply,
  updateEditApplyCandidate,
  type EditApplyState,
} from "@/modules/trip-edit/edit-apply-state";
import {
  diffEditCandidate,
  hasJourneyChanged,
  type EditCandidate,
} from "@/modules/trip-edit/edit-candidate";
import {
  createEmptyJourney,
  minuteClockLabel,
  rescheduleDraftFromOrigin,
} from "@/modules/trip-edit/edit-journey-helper";
import { editCandidateToPlannerDays } from "@/modules/trip-edit/edit-map-adapter";
import {
  areEditCandidatesEqual,
  beginEditPreview,
  canConfirmEditPreview,
  canProceedToEditConfirmation,
  EMPTY_EDIT_PREVIEW_STATE,
  finishEditPreview,
  invalidateEditPreviewForCandidateChange,
  type EditPreviewState,
} from "@/modules/trip-edit/edit-preview-state";
import {
  createEditSession,
  addVisitToEditSession,
  moveVisitDownInEditSession,
  moveVisitToDayInEditSession,
  moveVisitUpInEditSession,
  removeVisitFromEditSession,
  setVisitDurationInEditSession,
  setVisitTimeInEditSession,
} from "@/modules/trip-edit/edit-session";
import {
  createClientVisitId,
  type EditCatalogDestinationMeta,
} from "@/modules/trip-edit/add-visit-helper";
import type { PublicLocation } from "@/modules/destination/public-destination-query";
import AddVisitDrawer from "./add-visit-drawer";
import {
  applyWorkspaceDraft,
  countWorkspaceChanges,
  createWorkspaceState,
  rebaseWorkspaceDraft,
  redoWorkspaceDraft,
  resetWorkspaceToBaseline,
  syncWorkspaceApplied,
  undoWorkspaceDraft,
  type EditWorkspaceState,
} from "@/modules/trip-edit/edit-workspace-state";
import { rebaseEditDraft } from "@/modules/trip-edit/edit-rebase";
import type { EditPlaceDetail, PreviewLegMetric } from "@/modules/trip-edit/trip-edit-service";
import type { TripStatus } from "@/modules/trip-read/trip-status";
import { uncheckedItemLabel } from "@/modules/trip-save/unchecked-checks";
import {
  autoFixItinerarySchedule,
  autoShiftDayVisits,
  formatLegMetricLabel,
  mapValidationToWorkspace,
  runInstantClientChecks,
} from "@/modules/trip-edit/edit-workspace-checks";
import { TripWeatherPanel } from "@/modules/trip-weather/trip-weather-panel";
import { tripDayDate } from "@/modules/trip-validation/trip-proposal-contract";
import styles from "./edit-trip.module.css";

type Props = {
  tripId: string;
  baseRevision: string;
  initialCandidate: EditCandidate;
  destinationLabels: Record<string, string>;
  placeDetails: Record<string, EditPlaceDetail>;
  tripStatus: TripStatus;
  hasCompanionPublication: boolean;
  initialCompletedVisitIds?: string[];
  catalogMeta?: Record<string, EditCatalogDestinationMeta>;
  entryMode?: "edit" | "in-trip";
  initialAiThread?: AiConversationEntry[];
};

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function dateLabel(date: string | null): string {
  if (date === null) return "Chưa có ngày bắt đầu";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function weekdayLabel(date: string | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function VisitThumb({ place, order }: { place: EditPlaceDetail | undefined; order: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fallback = getDestinationVisual(place?.name ?? "", place?.area ?? "");
  const usable = place?.image && place.image.url !== failedUrl;
  return (
    <div className={styles.visitThumbWrap}>
      <img
        src={usable ? place!.image!.url : fallback.src}
        alt={usable ? place!.image!.alt : fallback.alt}
        className={styles.visitThumbImg}
        loading="lazy"
        onError={() => {
          if (usable) setFailedUrl(place!.image!.url);
        }}
      />
      <span className={styles.visitOrderTag}>#{order}</span>
    </div>
  );
}

type DrawerTarget =
  | { kind: "add"; dayIndex: number }
  | {
      kind: "replace";
      dayIndex: number;
      visitId: string;
      startMinute: number;
      plannedDurationMinutes: number;
    };

export default function EditTripClient({
  tripId,
  baseRevision,
  initialCandidate,
  destinationLabels,
  placeDetails,
  tripStatus,
  hasCompanionPublication,
  initialCompletedVisitIds = [],
  catalogMeta = {},
  entryMode = "edit",
  initialAiThread = [],
}: Props) {
  const [liveTripStatus, setLiveTripStatus] = useState<TripStatus>(tripStatus);
  const [completedVisitIds, setCompletedVisitIds] = useState<string[]>(initialCompletedVisitIds);
  const completedVisitSet = useMemo(() => new Set(completedVisitIds), [completedVisitIds]);
  const [placeDetailsState, setPlaceDetailsState] = useState<Record<string, EditPlaceDetail>>(() =>
    Object.fromEntries(
      Object.entries(placeDetails).map(([id, detail]) => [
        id,
        {
          ...detail,
          name: cleanTravelerDisplay(detail.name) || detail.name,
          ...(detail.area ? { area: cleanTravelerDisplay(detail.area) || detail.area } : {}),
        },
      ]),
    ),
  );
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [drawerOpener, setDrawerOpener] = useState<HTMLElement | null>(null);
  const [autoShiftEnabled, setAutoShiftEnabled] = useState(true);
  const [autoShiftWarning, setAutoShiftWarning] = useState<string | null>(null);
  const [originEditorExpanded, setOriginEditorExpanded] = useState(false);
  const [reschedulingFromOrigin, setReschedulingFromOrigin] = useState(false);
  const [uncheckedAckConfirmed, setUncheckedAckConfirmed] = useState(false);
  const [conflictState, setConflictState] = useState<
    | null
    | { status: "LOADING" }
    | { status: "READY"; snapshot: TripEditSnapshot }
    | { status: "ERROR"; message: string }
  >(null);
  const conflictDialogRef = useRef<HTMLDialogElement>(null);
  const [workspace, setWorkspace] = useState<EditWorkspaceState>(() =>
    createWorkspaceState(baseRevision, initialCandidate),
  );
  const [applyState, setApplyState] = useState<EditApplyState>(() =>
    createEditApplyState(baseRevision, initialCandidate),
  );
  const [previewState, setPreviewState] = useState<EditPreviewState>(EMPTY_EDIT_PREVIEW_STATE);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(
    initialCandidate.days[0]?.visits[0]?.destinationId ?? null,
  );
  const [focusSelection, setFocusSelection] = useState(false);
  const [mobileTab, setMobileTab] = useState<"assistant" | "timeline" | "map">("assistant");
  const [desktopSplit, setDesktopSplit] = useState(false);
  const [splitRightTab, setSplitRightTab] = useState<"timeline" | "map">("timeline");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [toastFeedback, setToastFeedback] = useState<{
    message: string;
    canUndo?: boolean;
    fromAi?: boolean;
  } | null>(null);
  const [timingDrafts, setTimingDrafts] = useState<Record<string, { startTime: string; duration: string }>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const [aiInput, setAiInput] = useState("");
  const [aiBarState, setAiBarState] = useState<AiBarUiState>({ kind: "IDLE" });
  const [aiThread, setAiThread] = useState<AiConversationEntry[]>(() =>
    initialAiThread.map((entry) => ({
      ...entry,
      text: entry.role === "assistant" ? cleanTravelerProse(entry.text) || entry.text : entry.text,
      ...(entry.correctionNote
        ? { correctionNote: cleanTravelerProse(entry.correctionNote) || entry.correctionNote }
        : {}),
      ...(entry.statusNotice
        ? { statusNotice: cleanTravelerProse(entry.statusNotice) || entry.statusNotice }
        : {}),
    })),
  );
  const [sessionLocation, setSessionLocation] = useState<InTripLocation | null>(null);
  const aiTurnSeqRef = useRef(0);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [lastAiChange, setLastAiChange] = useState<{
    added: Set<string>;
    updated: Set<string>;
    shifted: Set<string>;
    appliedDraft: EditCandidate;
  } | null>(null);

  const workingRef = useRef(workspace.workingDraft);
  const applyStateRef = useRef(applyState);
  const previewRequestSequence = useRef(0);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  const workingDraft = workspace.workingDraft;
  workingRef.current = workingDraft;
  const applyInProgress = applyState.status === "SENDING" || applyState.status === "UNKNOWN";

  function commitApplyState(next: EditApplyState) {
    applyStateRef.current = next;
    setApplyState(next);
  }

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);

  useEffect(() => {
    const dialog = conflictDialogRef.current;
    if (!dialog) return;
    if (conflictState !== null && !dialog.open) dialog.showModal();
    if (conflictState === null && dialog.open) dialog.close();
  }, [conflictState]);

  const changeCount = countWorkspaceChanges(workspace.baseline, workingDraft);
  const editDirty = changeCount > 0;
  const markSafeToLeave = useUnsavedChanges(editDirty, applyInProgress);
  const draftSerialization = useMemo(() => JSON.stringify(workingDraft), [workingDraft]);

  useEffect(() => {
    if (liveTripStatus === "COMPLETED" || applyInProgress || conflictState !== null) return;
    if (canConfirmEditPreview(workingRef.current, previewState) && previewState.result?.baseRevision === applyStateRef.current.baseRevision) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleCheck();
    }, editDirty ? 800 : 120);
    return () => {
      window.clearTimeout(timer);
    };
    // Intentionally triggers only on draft or revision changes so manual retry owns failed states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSerialization, applyState.baseRevision, liveTripStatus, conflictState]);

  function commitDraft(nextCandidate: EditCandidate, statusMessage?: string) {
    if (applyStateRef.current.pending) return;
    const previous = workingRef.current;
    const changed = !areEditCandidatesEqual(previous, nextCandidate);
    workingRef.current = nextCandidate;
    if (changed) {
      previewRequestSequence.current += 1;
      setPreviewState((current) => invalidateEditPreviewForCandidateChange(previous, nextCandidate, current));
    }
    setWorkspace((current) => applyWorkspaceDraft(current, nextCandidate));
    commitApplyState(updateEditApplyCandidate(applyStateRef.current, nextCandidate));
    if (statusMessage) {
      setAnnouncement(statusMessage);
      if (changed) {
        setToastFeedback({ message: statusMessage, canUndo: true });
      }
    }
  }

  function handleUndo() {
    if (applyInProgress || workspace.undoStack.length === 0) return;
    const nextWorkspace = undoWorkspaceDraft(workspace);
    const previous = workingRef.current;
    workingRef.current = nextWorkspace.workingDraft;
    previewRequestSequence.current += 1;
    setPreviewState((current) =>
      invalidateEditPreviewForCandidateChange(previous, nextWorkspace.workingDraft, current),
    );
    setWorkspace(nextWorkspace);
    commitApplyState(updateEditApplyCandidate(applyStateRef.current, nextWorkspace.workingDraft));
    setTimingDrafts({});
    setLastAiChange(null);
    setAiBarState((current) => (current.kind === "APPLIED" ? { kind: "IDLE" } : current));
    setAnnouncement("Đã hoàn tác một bước chỉnh sửa.");
    setToastFeedback({ message: "Đã hoàn tác một bước chỉnh sửa." });
  }

  function handleRedo() {
    if (applyInProgress || workspace.redoStack.length === 0) return;
    const nextWorkspace = redoWorkspaceDraft(workspace);
    const previous = workingRef.current;
    workingRef.current = nextWorkspace.workingDraft;
    previewRequestSequence.current += 1;
    setPreviewState((current) =>
      invalidateEditPreviewForCandidateChange(previous, nextWorkspace.workingDraft, current),
    );
    setWorkspace(nextWorkspace);
    commitApplyState(updateEditApplyCandidate(applyStateRef.current, nextWorkspace.workingDraft));
    setTimingDrafts({});
    setAnnouncement("Đã làm lại bước chỉnh sửa.");
    setToastFeedback({ message: "Đã làm lại bước chỉnh sửa." });
  }

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  function handleStopAiStream() {
    aiAbortRef.current?.abort();
  }

  async function handleAiSubmit(
    promptText: string,
    resolution?: EditResolution,
    overrideLocation?: InTripLocation,
  ) {
    if (applyInProgress || liveTripStatus === "COMPLETED") return;
    const trimmed = promptText.trim();
    if (!trimmed) return;

    aiAbortRef.current?.abort();
    const abortController = new AbortController();
    aiAbortRef.current = abortController;

    const requestedRevision = applyStateRef.current.baseRevision;
    const requestedDraft = workingRef.current;
    const boundedHistory = aiThread
      .filter((item) => item.kind !== "INTERRUPTED" && item.kind !== "STOPPED")
      .slice(-MAX_AI_HISTORY_TURNS)
      .map((item) => ({
        role: item.role,
        content: [...item.text.trim()].slice(0, MAX_AI_HISTORY_TURN_CHARS).join(""),
      }))
      .filter((item) => item.content.length > 0);
    const freshSessionLocation =
      sessionLocation && isInTripLocationFresh(sessionLocation) ? sessionLocation : null;
    if (sessionLocation && !freshSessionLocation) {
      setSessionLocation(null);
    }
    const activeLocation =
      liveTripStatus === "ONGOING" ? (overrideLocation ?? freshSessionLocation ?? undefined) : undefined;
    const isReusingSessionLocation =
      liveTripStatus === "ONGOING" && !overrideLocation && freshSessionLocation !== null;
    const shouldAppendOptimisticUser = !overrideLocation;
    const optimisticUserId = shouldAppendOptimisticUser ? `u-${++aiTurnSeqRef.current}` : null;
    setAiOpen(true);
    setAiInput("");
    if (optimisticUserId) {
      setAiThread((prev) =>
        [...prev, { id: optimisticUserId, role: "user" as const, text: trimmed }].slice(-MAX_AI_HISTORY_TURNS),
      );
    }

    let latestSteps: string[] = ["Xem lịch"];
    let streamedCorrectionNote: string | null = null;
    setAiBarState({
      kind: "STREAMING",
      prompt: trimmed,
      statusLabel: "Đang xem lịch của bạn…",
      steps: latestSteps,
      text: "",
    });

    const rollbackOptimisticUser = () => {
      if (optimisticUserId) {
        setAiThread((prev) => prev.filter((item) => item.id !== optimisticUserId));
      }
      setAiInput(trimmed);
    };

    const persistCommittedTurn = (assistantEntry: AiConversationEntry) => {
      const batch: PersistedTripEditChatPayload[] = [];
      if (shouldAppendOptimisticUser) {
        batch.push({ role: "user", text: trimmed });
      }
      if (assistantEntry.text.trim().length > 0) {
        batch.push({
          role: "assistant",
          ...(assistantEntry.kind ? { kind: assistantEntry.kind } : {}),
          text: assistantEntry.text,
          ...(assistantEntry.steps && assistantEntry.steps.length > 0 ? { steps: assistantEntry.steps } : {}),
          ...(assistantEntry.correctionNote ? { correctionNote: assistantEntry.correctionNote } : {}),
          ...(assistantEntry.statusNotice ? { statusNotice: assistantEntry.statusNotice } : {}),
          ...(assistantEntry.knowledgeParts && assistantEntry.knowledgeParts.length > 0
            ? { knowledgeParts: assistantEntry.knowledgeParts }
            : {}),
          ...(assistantEntry.citations && assistantEntry.citations.length > 0
            ? { citations: assistantEntry.citations }
            : {}),
        });
      }
      if (batch.length > 0) {
        void appendTripEditChatMessagesClient(tripId, batch);
      }
    };

    const outcome = await streamAiTripEdit(
      tripId,
      {
        baseRevision: requestedRevision,
        message: trimmed,
        ...(resolution ? { resolution } : {}),
        draft: requestedDraft,
        ...(boundedHistory.length > 0 ? { history: boundedHistory } : {}),
        ...(activeLocation ? { location: activeLocation } : {}),
        ...(isReusingSessionLocation ? { locationReused: true } : {}),
      },
      {
        signal: abortController.signal,
        onStatus: (status) => {
          setAiBarState((current) =>
            current.kind === "STREAMING" ? { ...current, statusLabel: status.label } : current,
          );
        },
        onSteps: (steps) => {
          latestSteps = steps;
          setAiBarState((current) =>
            current.kind === "STREAMING" ? { ...current, steps } : current,
          );
        },
        onTextDelta: (delta) => {
          setAiBarState((current) =>
            current.kind === "STREAMING" ? { ...current, text: current.text + delta } : current,
          );
        },
        onCorrectionNote: (note) => {
          streamedCorrectionNote = note;
          setAiBarState((current) =>
            current.kind === "STREAMING" ? { ...current, correctionNote: note } : current,
          );
        },
      },
    );

    if (aiAbortRef.current === abortController) {
      aiAbortRef.current = null;
    }

    const decision = resolveAiStreamOutcome(outcome, {
      prompt: trimmed,
      ...(resolution ? { resolution } : {}),
      steps: latestSteps,
      streamedCorrectionNote,
    });

    if (decision.action === "STOPPED" || decision.action === "INTERRUPTED") {
      const partialEntry: AiConversationEntry = {
        id: `a-${++aiTurnSeqRef.current}`,
        role: "assistant",
        kind: decision.action,
        text: decision.partialText,
        ...(decision.steps.length > 0 ? { steps: decision.steps } : {}),
        statusNotice: decision.notice,
        retryPrompt: decision.prompt,
        ...(decision.resolution ? { retryResolution: decision.resolution } : {}),
      };
      setAiThread((prev) => [...prev, partialEntry].slice(-MAX_AI_HISTORY_TURNS));
      persistCommittedTurn(partialEntry);
      setAiBarState({ kind: "IDLE" });
      setAnnouncement(decision.notice);
      return;
    }

    if (decision.action === "CONFLICT_REBASE") {
      rollbackOptimisticUser();
      setAiBarState({ kind: "IDLE" });
      void openConflictRebaseFlow();
      return;
    }

    if (decision.action === "ERROR") {
      rollbackOptimisticUser();
      if (decision.completedVisitDetails !== undefined) {
        const lockedIds = extractCompletedVisitIdsFromDetails(decision.completedVisitDetails);
        if (lockedIds.length > 0) setCompletedVisitIds(lockedIds);
      }
      setAiBarState({
        kind: "ERROR",
        prompt: decision.prompt,
        ...(decision.resolution ? { resolution: decision.resolution } : {}),
        message: decision.message,
        canRetry: decision.canRetry,
      });
      return;
    }

    if (decision.action === "REQUEST_LOCATION") {
      const isCoverageRejection =
        activeLocation !== undefined &&
        decision.result.prompt.includes("ngoài phạm vi");
      setSessionLocation(null);
      setAiBarState({
        kind: "NEEDS_LOCATION",
        prompt: decision.result.prompt,
        pendingMessage: decision.result.pendingMessage,
        locationFlow: createLocationFlowState(),
        manualPickerOpen: isCoverageRejection,
        manualCoords: null,
        coverageError: null,
      });
      setAnnouncement(decision.result.prompt);
      return;
    }

    if (decision.action === "COMMIT_CLARIFYING") {
      const clarifyingEntry: AiConversationEntry = {
        id: `a-${++aiTurnSeqRef.current}`,
        role: "assistant",
        kind: "CLARIFYING",
        text: decision.result.clarification.prompt,
      };
      setAiThread((prev) => [...prev, clarifyingEntry].slice(-MAX_AI_HISTORY_TURNS));
      persistCommittedTurn(clarifyingEntry);
      setAiBarState({
        kind: "CLARIFYING",
        prompt: decision.prompt,
        clarification: decision.result.clarification,
      });
      setAnnouncement(decision.result.clarification.prompt);
      return;
    }

    if (decision.action === "COMMIT_ADVISED") {
      const result = decision.result;
      const assistantEntry: AiConversationEntry = {
        id: `a-${++aiTurnSeqRef.current}`,
        role: "assistant",
        kind: "ADVISED",
        text: result.advice,
        ...(decision.steps.length > 0 ? { steps: decision.steps } : {}),
        ...(decision.correctionNote ? { correctionNote: decision.correctionNote } : {}),
        ...(result.knowledgeParts ? { knowledgeParts: result.knowledgeParts } : {}),
        ...(result.citations ? { citations: result.citations } : {}),
      };
      setAiThread((prev) => [...prev, assistantEntry].slice(-MAX_AI_HISTORY_TURNS));
      persistCommittedTurn(assistantEntry);
      setAiBarState({
        kind: "ADVISED",
        advice: result.advice,
        ...(result.suggestions && result.suggestions.length > 0 ? { suggestions: result.suggestions } : {}),
        ...(result.knowledgeParts ? { knowledgeParts: result.knowledgeParts } : {}),
        ...(result.citations ? { citations: result.citations } : {}),
        ...(decision.correctionNote ? { correctionNote: decision.correctionNote } : {}),
      });
      setAnnouncement(result.advice);
      setToastFeedback(null);
      return;
    }

    const result = decision.result;
    if (result.addedPlaceDetails) {
      setPlaceDetailsState((current) => ({
        ...current,
        ...(result.addedPlaceDetails as Record<string, EditPlaceDetail>),
      }));
    }

    const summary = decision.summary;
    const appliedEntry: AiConversationEntry = {
      id: `a-${++aiTurnSeqRef.current}`,
      role: "assistant",
      kind: "APPLIED",
      text: summary,
      ...(decision.steps.length > 0 ? { steps: decision.steps } : {}),
      ...(decision.correctionNote ? { correctionNote: decision.correctionNote } : {}),
    };
    setAiThread((prev) => [...prev, appliedEntry].slice(-MAX_AI_HISTORY_TURNS));
    persistCommittedTurn(appliedEntry);
    commitDraft(result.candidate, summary);
    setTimingDrafts({});
    setPreviewState(
      finishEditPreview(
        result.candidate,
        result.candidate,
        {
          kind: "PREVIEWED",
          result: {
            baseRevision: requestedRevision,
            candidate: result.candidate,
            validation: result.validation,
            eligibleForConfirmation: result.validation.canConfirm,
            ...(result.legs ? { legs: result.legs } : {}),
            ...(result.saveEligibility ? { saveEligibility: result.saveEligibility } : {}),
            ...(result.uncheckedItems ? { uncheckedItems: result.uncheckedItems } : {}),
            ...(result.journeySummary ? { journeySummary: result.journeySummary } : {}),
          },
        },
        requestedRevision,
      ),
    );
    const changed = result.changedVisitIds;
    setLastAiChange({
      added: new Set(changed?.added ?? result.diff.added.map((v) => v.visitId)),
      updated: new Set(changed?.updated ?? result.diff.updated.map((u) => u.visitId)),
      shifted: new Set(changed?.shifted ?? []),
      appliedDraft: result.candidate,
    });
    const firstChangedDestId =
      result.diff.added[0]?.destinationId ?? result.diff.updated[0]?.after.destinationId ?? null;
    if (firstChangedDestId) {
      setSelectedDestinationId(firstChangedDestId);
      setFocusSelection(true);
    }
    setAiBarState({
      kind: "APPLIED",
      summary,
      canUndo: true,
      ...(decision.correctionNote ? { correctionNote: decision.correctionNote } : {}),
    });
    setToastFeedback({ message: summary, canUndo: true, fromAi: true });
  }

  function handleApplyAdviceSuggestion(suggestion: AdviceSuggestionCard) {
    if (applyInProgress) return;
    if (suggestion.addedPlaceDetails) {
      setPlaceDetailsState((current) => ({
        ...current,
        ...suggestion.addedPlaceDetails,
      }));
    }
    const summary = `Đã áp dụng phương án: ${suggestion.title}`;
    const assistantId = `a-${++aiTurnSeqRef.current}`;
    const assistantEntry: AiConversationEntry = {
      id: assistantId,
      role: "assistant",
      kind: "APPLIED",
      text: summary,
    };
    setAiThread((prev) => [...prev, assistantEntry].slice(-MAX_AI_HISTORY_TURNS));
    void appendTripEditChatMessagesClient(tripId, [
      { role: "assistant", kind: "APPLIED", text: summary },
    ]);
    commitDraft(suggestion.candidate, summary);
    setTimingDrafts({});
    setPreviewState(
      finishEditPreview(
        suggestion.candidate,
        suggestion.candidate,
        {
          kind: "PREVIEWED",
          result: {
            baseRevision: workspace.baseRevision,
            candidate: suggestion.candidate,
            validation: suggestion.validation,
            eligibleForConfirmation: suggestion.validation.canConfirm,
            ...(suggestion.legs ? { legs: suggestion.legs } : {}),
            ...(suggestion.saveEligibility ? { saveEligibility: suggestion.saveEligibility } : {}),
            ...(suggestion.uncheckedItems ? { uncheckedItems: suggestion.uncheckedItems } : {}),
            ...(suggestion.journeySummary ? { journeySummary: suggestion.journeySummary } : {}),
          },
        },
        workspace.baseRevision,
      ),
    );
    setLastAiChange({
      added: new Set(suggestion.changedVisitIds.added),
      updated: new Set(suggestion.changedVisitIds.updated),
      shifted: new Set(suggestion.changedVisitIds.shifted),
      appliedDraft: suggestion.candidate,
    });
    const firstChangedDestId =
      suggestion.diff.added[0]?.destinationId ?? suggestion.diff.updated[0]?.after.destinationId ?? null;
    if (firstChangedDestId) {
      setSelectedDestinationId(firstChangedDestId);
      setFocusSelection(true);
    }
    setAiBarState({
      kind: "APPLIED",
      summary,
      canUndo: true,
    });
    setAnnouncement(`${summary}. Bản nháp đã được cập nhật.`);
    setToastFeedback({ message: summary, canUndo: true, fromAi: true });
  }

  async function handleRequestGpsForAi() {
    if (aiBarState.kind !== "NEEDS_LOCATION" || applyInProgress) return;
    const pendingMessage = aiBarState.pendingMessage;
    const requestingFlow = transitionLocationFlow(aiBarState.locationFlow, {
      type: "REQUEST_GPS",
    });
    setAiBarState({
      ...aiBarState,
      locationFlow: requestingFlow,
      coverageError: null,
    });

    const gpsResult = await requestBrowserLocation(
      typeof navigator !== "undefined" ? navigator.geolocation : null,
    );
    const finishedFlow = transitionLocationFlow(requestingFlow, {
      type: "GPS_RESULT",
      requestId: requestingFlow.requestId,
      result: gpsResult,
    });

    if (gpsResult.status !== "OK") {
      setAiBarState((current) =>
        current.kind === "NEEDS_LOCATION"
          ? {
              ...current,
              locationFlow: finishedFlow,
              manualPickerOpen: true,
            }
          : current,
      );
      return;
    }

    const verifiedLocation = inTripLocationSchema.parse({
      source: "GPS",
      latitude: gpsResult.latitude,
      longitude: gpsResult.longitude,
      accuracyMeters: gpsResult.accuracyMeters,
      capturedAt: new Date(gpsResult.capturedAt).toISOString(),
    });
    setSessionLocation(verifiedLocation);
    void handleAiSubmit(pendingMessage, undefined, verifiedLocation);
  }

  function handleSelectManualLocationForAi(coords: MapCoordinate) {
    if (aiBarState.kind !== "NEEDS_LOCATION" || applyInProgress) return;
    const verifiedLocation = inTripLocationSchema.parse({
      source: "MANUAL",
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: null,
      capturedAt: new Date().toISOString(),
    });
    setSessionLocation(verifiedLocation);
    void handleAiSubmit(aiBarState.pendingMessage, undefined, verifiedLocation);
  }

  function handleAiRetry() {
    if (aiBarState.kind !== "ERROR") return;
    void handleAiSubmit(aiBarState.prompt, aiBarState.resolution);
  }

  function handleUndoAiStep() {
    if (!lastAiChange) {
      handleUndo();
      return;
    }
    if (areEditCandidatesEqual(workingRef.current, lastAiChange.appliedDraft)) {
      handleUndo();
      setAnnouncement("Đã hoàn tác bước chỉnh sửa bằng AI.");
    } else {
      setLastAiChange(null);
      setAiBarState({ kind: "IDLE" });
    }
  }

  async function openConflictRebaseFlow() {
    setConfirmOpen(false);
    setConflictState({ status: "LOADING" });
    setAnnouncement("Phát hiện phiên bản mới hơn từ nơi khác. Đang tải lịch trình mới nhất; bản nháp vẫn được giữ nguyên.");
    const fetched = await fetchTripEditSnapshot(tripId);
    if (fetched.kind === "OK") {
      setConflictState({ status: "READY", snapshot: fetched.snapshot });
    } else {
      setConflictState({ status: "ERROR", message: fetched.message });
    }
  }

  async function runPreviewFor(requestedRevision: string, requestedCandidate: EditCandidate) {
    const requestSequence = ++previewRequestSequence.current;
    setPreviewState(beginEditPreview());
    const outcome = await previewTripEdit(tripId, {
      baseRevision: requestedRevision,
      candidate: requestedCandidate,
    });
    if (requestSequence !== previewRequestSequence.current) return;
    if (outcome.kind === "FAILED") {
      if (outcome.code === "TRIP_REVISION_CONFLICT") {
        setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
        void openConflictRebaseFlow();
        return;
      }
      if (outcome.code === "COMPLETED_VISIT_CHANGED") {
        const lockedIds = extractCompletedVisitIdsFromDetails(outcome.details);
        if (lockedIds.length > 0) setCompletedVisitIds(lockedIds);
      }
    }
    setPreviewState(finishEditPreview(workingRef.current, requestedCandidate, outcome, requestedRevision));
  }

  async function handleCheck() {
    const freshState = clearEditApplyFailure(applyStateRef.current);
    if (freshState.status === "SENDING" || freshState.status === "UNKNOWN") return;
    commitApplyState(freshState);
    await runPreviewFor(freshState.baseRevision, freshState.candidate);
  }

  function handleRebaseConflict() {
    if (conflictState?.status !== "READY") return;
    const { snapshot } = conflictState;
    const rebased = rebaseEditDraft({
      workingDraft: workingRef.current,
      latestBaseline: snapshot.candidate,
      latestTripStatus: snapshot.tripStatus,
      completedVisitIds: snapshot.completedVisitIds ?? [],
    });
    workingRef.current = rebased.rebasedCandidate;
    setLiveTripStatus(snapshot.tripStatus);
    setCompletedVisitIds(snapshot.completedVisitIds ?? []);
    setPlaceDetailsState((current) => ({ ...current, ...snapshot.placeDetails }));
    setWorkspace((current) =>
      rebaseWorkspaceDraft(current, {
        nextRevision: snapshot.baseRevision,
        nextBaseline: snapshot.candidate,
        nextWorkingDraft: rebased.rebasedCandidate,
      }),
    );
    commitApplyState(
      updateEditApplyCandidate(
        createEditApplyState(snapshot.baseRevision, snapshot.candidate),
        rebased.rebasedCandidate,
      ),
    );
    setTimingDrafts({});
    setLastAiChange(null);
    setConflictState(null);
    setAnnouncement(rebased.message);
    if (snapshot.tripStatus !== "COMPLETED") {
      void runPreviewFor(snapshot.baseRevision, rebased.rebasedCandidate);
    }
  }

  function handleDiscardConflict() {
    if (conflictState?.status !== "READY") return;
    const { snapshot } = conflictState;
    workingRef.current = snapshot.candidate;
    setLiveTripStatus(snapshot.tripStatus);
    setCompletedVisitIds(snapshot.completedVisitIds ?? []);
    setPlaceDetailsState((current) => ({ ...current, ...snapshot.placeDetails }));
    setWorkspace(createWorkspaceState(snapshot.baseRevision, snapshot.candidate));
    commitApplyState(createEditApplyState(snapshot.baseRevision, snapshot.candidate));
    setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
    setTimingDrafts({});
    setLastAiChange(null);
    setAiBarState({ kind: "IDLE" });
    setAutoShiftWarning(null);
    setConflictState(null);
    setAnnouncement("Đã tải lại lịch trình chính thức mới nhất.");
  }

  useEffect(() => {
    setUncheckedAckConfirmed(false);
  }, [confirmOpen, draftSerialization]);

  async function handleApply() {
    const current = applyStateRef.current;
    let sending: EditApplyState;

    if (current.status === "UNKNOWN") {
      sending = retryUnknownEditApply(current);
    } else {
      if (current.status !== "IDLE") return;
      if (
        !canProceedToEditConfirmation(current.candidate, previewState) ||
        previewState.result?.baseRevision !== current.baseRevision
      ) {
        return;
      }
      const uncheckedItems = previewState.result?.uncheckedItems ?? [];
      if (uncheckedItems.length > 0 && !uncheckedAckConfirmed) {
        return;
      }
      sending = beginEditApply(
        current,
        createIdempotencyKey(),
        uncheckedItems.length > 0 ? { confirmed: true, items: uncheckedItems } : undefined,
      );
    }
    if (sending.status !== "SENDING" || !sending.pending) return;

    commitApplyState(sending);
    setAnnouncement("");
    const pending = sending.pending;
    const outcome = await applyTripEdit(tripId, pending.payload, pending.idempotencyKey);
    const rejectedValidation =
      outcome.status === "FAILED" && outcome.error.code === "TRIP_VALIDATION_FAILED"
        ? parseTripEditApplyValidation(outcome.error.details)
        : null;
    const finished = finishEditApply(sending, outcome, rejectedValidation);
    commitApplyState(finished);

    if (outcome.status === "SUCCESS") {
      workingRef.current = finished.candidate;
      setWorkspace(syncWorkspaceApplied(finished.baseRevision, finished.candidate));
      setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
      setConfirmOpen(false);
      setAnnouncement("Đã lưu cập nhật vào lịch trình chính thức.");
      setToastFeedback({ message: "Đã lưu cập nhật vào lịch trình chính thức." });
      return;
    }

    if (outcome.status === "UNKNOWN") {
      setAnnouncement(
        "Chưa xác định được kết quả lưu. Hãy bấm Kiểm tra lại kết quả với cùng yêu cầu; không chỉnh sửa bản nháp lúc này.",
      );
      return;
    }

    if (outcome.error.code === "TRIP_REVISION_CONFLICT") {
      setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
      void openConflictRebaseFlow();
      return;
    }
    if (outcome.error.code === "COMPLETED_VISIT_CHANGED") {
      const lockedIds = extractCompletedVisitIdsFromDetails(outcome.error.details);
      if (lockedIds.length > 0) setCompletedVisitIds(lockedIds);
    }

    setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
    setAnnouncement(outcome.error.message);
  }

  function discardAndLeave() {
    const discarded = cancelEditApply(applyStateRef.current);
    if (discarded.pending) return;
    previewRequestSequence.current += 1;
    workingRef.current = discarded.candidate;
    setWorkspace((current) => resetWorkspaceToBaseline(current));
    setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
    commitApplyState(discarded);
    setTimingDrafts({});
    setAutoShiftWarning(null);
    setAnnouncement("");
    markSafeToLeave();
  }

  function handleCancelKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === "Enter") discardAndLeave();
  }

  function labelForDestination(destinationId: string): string {
    const raw =
      placeDetailsState[destinationId]?.name ??
      destinationLabels[destinationId] ??
      "Điểm đến không còn khả dụng";
    return cleanTravelerDisplay(raw) || raw;
  }

  function applyOptionalAutoShift(nextCandidate: EditCandidate, dayIndex: number, startFromIndex: number): EditCandidate {
    if (!autoShiftEnabled) {
      setAutoShiftWarning(null);
      return nextCandidate;
    }
    const shifted = autoShiftDayVisits({
      candidate: nextCandidate,
      dayIndex,
      startFromIndex,
      legMetrics: previewState.result?.legs,
      lockedVisitIds: completedVisitSet,
    });
    setAutoShiftWarning(shifted.overflowMessage);
    return shifted.candidate;
  }

  function handleAutoFixSchedule() {
    if (applyInProgress) return;
    const fixed = autoFixItinerarySchedule({
      candidate: workingRef.current,
      legMetrics: previewState.result?.legs,
      journeySummary: previewState.result?.journeySummary,
      lockedVisitIds: completedVisitSet,
    });
    if (fixed.overflowDays.length > 0) {
      setAutoShiftWarning(
        `Đã tự xếp lại giờ nhưng Ngày ${fixed.overflowDays.join(", ")} chạm giới hạn 23:59. Bạn có thể rút ngắn thời lượng hoặc bớt điểm.`,
      );
    } else {
      setAutoShiftWarning(null);
    }
    if (fixed.changedVisitIds.length === 0) {
      setAnnouncement("Các mốc giờ hiện tại đã khớp với thời gian di chuyển, không có xung đột cần dời.");
      return;
    }
    setTimingDrafts({});
    commitDraft(
      fixed.candidate,
      `Đã tự xếp lại ${fixed.changedVisitIds.length} mốc giờ khớp với thời gian di chuyển.`,
    );
  }

  function handleShiftFromLeg(dayIndex: number, startFromIndex: number) {
    if (applyInProgress) return;
    const shifted = autoShiftDayVisits({
      candidate: workingRef.current,
      dayIndex,
      startFromIndex,
      legMetrics: previewState.result?.legs,
      lockedVisitIds: completedVisitSet,
    });
    setAutoShiftWarning(shifted.overflowMessage);
    if (areEditCandidatesEqual(shifted.candidate, workingRef.current)) {
      setAnnouncement("Các điểm sau đã có đủ khoảng cách di chuyển.");
      return;
    }
    setTimingDrafts({});
    commitDraft(
      shifted.candidate,
      `Đã dời các điểm sau trong Ngày ${dayIndex} để đủ thời gian di chuyển.`,
    );
  }

  function handleNudgeStartMinute(visitId: string, deltaMinutes: number) {
    if (applyInProgress || completedVisitSet.has(visitId)) return;
    const dayEntry = workingRef.current.days.find((d) => d.visits.some((v) => v.visitId === visitId));
    const visit = dayEntry?.visits.find((v) => v.visitId === visitId);
    if (!visit) return;
    const maxStart = Math.max(0, 1439 - visit.plannedDurationMinutes);
    const nextMinute = Math.max(0, Math.min(maxStart, visit.startMinute + deltaMinutes));
    if (nextMinute === visit.startMinute) return;
    setTimingDrafts((prev) => {
      if (!(visitId in prev)) return prev;
      const next = { ...prev };
      delete next[visitId];
      return next;
    });
    commitTiming(visitId, minuteLabel(nextMinute), String(visit.plannedDurationMinutes));
  }

  function commitTiming(visitId: string, nextStart: string, nextDuration: string) {
    const dayEntry = workingDraft.days.find((d) => d.visits.some((v) => v.visitId === visitId));
    const visitIdx = dayEntry?.visits.findIndex((v) => v.visitId === visitId) ?? -1;
    const visit = dayEntry && visitIdx >= 0 ? dayEntry.visits[visitIdx] : undefined;
    if (!dayEntry || !visit) return;
    if (
      nextStart === minuteLabel(visit.startMinute) &&
      nextDuration === String(visit.plannedDurationMinutes)
    ) {
      return;
    }
    try {
      const durationInput = nextDuration.trim() ? Number(nextDuration) : Number.NaN;
      let next = createEditSession(workingDraft);
      if (Number.isInteger(durationInput) && durationInput < visit.plannedDurationMinutes) {
        next = setVisitDurationInEditSession(next, visitId, nextDuration);
        next = setVisitTimeInEditSession(next, visitId, nextStart);
      } else {
        next = setVisitTimeInEditSession(next, visitId, nextStart);
        next = setVisitDurationInEditSession(next, visitId, nextDuration);
      }
      const adjusted = applyOptionalAutoShift(next.candidate, dayEntry.dayIndex, visitIdx);
      commitDraft(adjusted, "Đã cập nhật giờ và thời lượng trong bản nháp.");
      setTimingDrafts((current) => {
        const updated = { ...current };
        delete updated[visitId];
        return updated;
      });
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Giờ bắt đầu hoặc thời lượng không hợp lệ.");
    }
  }

  function handleReorder(visitId: string, direction: "up" | "down") {
    try {
      const currentSession = createEditSession(workingDraft);
      const dayEntry = workingDraft.days.find((d) => d.visits.some((v) => v.visitId === visitId));
      const next =
        direction === "up"
          ? moveVisitUpInEditSession(currentSession, visitId)
          : moveVisitDownInEditSession(currentSession, visitId);
      const adjusted = dayEntry
        ? applyOptionalAutoShift(next.candidate, dayEntry.dayIndex, 0)
        : next.candidate;
      commitDraft(
        adjusted,
        direction === "up" ? "Đã chuyển điểm lên trước." : "Đã chuyển điểm xuống sau.",
      );
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể đổi thứ tự.");
    }
  }

  function handleMoveDay(visitId: string, targetDayIndex: number) {
    try {
      const next = moveVisitToDayInEditSession(createEditSession(workingDraft), visitId, targetDayIndex);
      const targetDay = next.candidate.days.find((d) => d.dayIndex === targetDayIndex);
      const anchor = Math.max(0, (targetDay?.visits.length ?? 1) - 1);
      const adjusted = applyOptionalAutoShift(next.candidate, targetDayIndex, anchor);
      commitDraft(adjusted, `Đã chuyển sang Ngày ${targetDayIndex}.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể chuyển ngày.");
    }
  }

  function handleRemove(visitId: string, dayIndex: number, label: string) {
    try {
      const next = removeVisitFromEditSession(createEditSession(workingDraft), visitId);
      setAutoShiftWarning(null);
      commitDraft(next.candidate, `Đã xóa ${label} khỏi Ngày ${dayIndex}.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể xóa lượt tham quan.");
    }
  }

  function handleConfirmAddVisit(input: {
    dayIndex: number;
    destination: PublicLocation;
    meta: EditCatalogDestinationMeta | null;
    startMinute: number;
    plannedDurationMinutes: number;
  }) {
    try {
      let nextCandidate: EditCandidate;
      let anchorIndex = 0;
      if (drawerTarget?.kind === "replace") {
        nextCandidate = {
          ...workingDraft,
          days: workingDraft.days.map((day) => {
            if (day.dayIndex !== drawerTarget.dayIndex) return day;
            const idx = day.visits.findIndex((v) => v.visitId === drawerTarget.visitId);
            if (idx >= 0) anchorIndex = idx;
            return {
              ...day,
              visits: day.visits.map((v) =>
                v.visitId === drawerTarget.visitId
                  ? {
                      ...v,
                      destinationId: input.destination.id,
                      startMinute: input.startMinute,
                      plannedDurationMinutes: input.plannedDurationMinutes,
                    }
                  : v,
              ),
            };
          }),
        };
      } else {
        const next = addVisitToEditSession(createEditSession(workingDraft), input.dayIndex, {
          visitId: createClientVisitId(input.destination.id),
          destinationId: input.destination.id,
          startMinute: input.startMinute,
          plannedDurationMinutes: input.plannedDurationMinutes,
        });
        nextCandidate = next.candidate;
        anchorIndex = Math.max(
          0,
          (nextCandidate.days.find((d) => d.dayIndex === input.dayIndex)?.visits.length ?? 1) - 1,
        );
      }

      setPlaceDetailsState((current) => ({
        ...current,
        [input.destination.id]: current[input.destination.id] ?? {
          id: input.destination.id,
          name: input.destination.name,
          area: input.destination.area,
          category: input.destination.category,
          ...(input.destination.latitude != null ? { latitude: input.destination.latitude } : {}),
          ...(input.destination.longitude != null ? { longitude: input.destination.longitude } : {}),
          image: input.destination.image ?? null,
          availability: "AVAILABLE",
          external: false,
          suggestedDurationMinutes: input.meta?.suggestedDurationMinutes ?? null,
          minimumDurationMinutes: input.meta?.minimumDurationMinutes ?? null,
          isOutdoor: input.meta?.isOutdoor ?? false,
        },
      }));
      const adjusted = applyOptionalAutoShift(nextCandidate, input.dayIndex, anchorIndex);
      commitDraft(
        adjusted,
        drawerTarget?.kind === "replace"
          ? `Đã thay thế điểm dừng bằng ${input.destination.name} trong Ngày ${input.dayIndex}.`
          : `Đã thêm ${input.destination.name} vào Ngày ${input.dayIndex}.`,
      );
      setSelectedDestinationId(input.destination.id);
      setFocusSelection(true);
      setDrawerTarget(null);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể thêm điểm tham quan.");
    }
  }

  const instantChecks = useMemo(
    () => runInstantClientChecks(workingDraft, placeDetailsState, catalogMeta),
    [workingDraft, placeDetailsState, catalogMeta],
  );
  const mappedValidation = useMemo(
    () => mapValidationToWorkspace(previewState.result?.validation ?? null, workingDraft, placeDetailsState),
    [previewState.result?.validation, workingDraft, placeDetailsState],
  );
  const previewLegsByPair = useMemo(() => {
    const map = new Map<string, PreviewLegMetric>();
    for (const leg of previewState.result?.legs ?? []) {
      map.set(`${leg.fromVisitId}->${leg.toVisitId}`, leg);
    }
    return map;
  }, [previewState.result?.legs]);

  const uncheckedItems = previewState.result?.uncheckedItems ?? [];
  const previewCanConfirm =
    canProceedToEditConfirmation(workingDraft, previewState) &&
    previewState.result?.baseRevision === applyState.baseRevision &&
    instantChecks.unavailableVisits.length === 0;
  const savedVisitCount = workspace.baseline.days.reduce((count, day) => count + day.visits.length, 0);
  const draftVisitCount = workingDraft.days.reduce((count, day) => count + day.visits.length, 0);
  const savedEndDate = tripDayDate(workspace.baseline.startDate, workspace.baseline.durationDays);
  const currentDiff = diffEditCandidate(workspace.baseline, workingDraft);

  const plannerDays = useMemo(
    () => editCandidateToPlannerDays(workingDraft, placeDetailsState, previewState.result?.legs),
    [workingDraft, placeDetailsState, previewState.result?.legs],
  );

  const hasInstantOverlap = useMemo(
    () =>
      Object.values(instantChecks.byVisitId).some((list) =>
        list.some((warning) => warning.code === "SCHEDULE_OVERLAP"),
      ),
    [instantChecks.byVisitId],
  );

  const validationGroupSummary = useMemo(() => {
    const groups = previewState.result?.validation.groups;
    if (!groups) return null;
    const allFindings = [
      ...groups.openingHours.findings,
      ...groups.minimumDuration.findings,
      ...groups.travelTime.findings,
      ...groups.scheduleConflict.findings,
    ];
    return {
      violationCount: allFindings.filter((f) => f.status === "VIOLATION").length,
      insufficientCount: allFindings.filter((f) => f.status === "INSUFFICIENT_DATA").length,
      hasScheduleConflict:
        groups.travelTime.findings.some((f) => f.status === "VIOLATION") ||
        groups.scheduleConflict.findings.some((f) => f.status === "VIOLATION"),
      chips: [
        { key: "openingHours", label: "Giờ mở cửa", status: groups.openingHours.status },
        { key: "minimumDuration", label: "Thời lượng", status: groups.minimumDuration.status },
        { key: "travelTime", label: "Di chuyển", status: groups.travelTime.status },
        { key: "scheduleConflict", label: "Xung đột", status: groups.scheduleConflict.status },
      ],
    };
  }, [previewState.result]);

  // Each blocking finding as one traveler-readable line with a fix request for the assistant.
  const tripIssues = useMemo((): TripIssueHint[] | null => {
    const groups = previewState.result?.validation.groups;
    if (!groups) return null;
    const visitInfo = new Map<string, { name: string; dayIndex: number }>();
    for (const day of workingDraft.days) {
      for (const visit of day.visits) {
        visitInfo.set(visit.visitId, {
          name: placeDetailsState[visit.destinationId]?.name ?? "Một điểm trong lịch",
          dayIndex: day.dayIndex,
        });
      }
    }
    const hints = new Map<string, TripIssueHint>();
    for (const finding of [
      ...groups.openingHours.findings,
      ...groups.minimumDuration.findings,
      ...groups.travelTime.findings,
      ...groups.scheduleConflict.findings,
    ]) {
      if (finding.status !== "VIOLATION") continue;
      const visitId = finding.affectedVisitId ?? finding.visitIds?.[1] ?? finding.toVisitId ?? finding.fromVisitId;
      const visit = visitId ? visitInfo.get(visitId) : undefined;
      // Several findings on one stop (e.g. opening hours twice) become one line.
      const key = visit ? `visit:${visitId}` : `message:${finding.message}`;
      if (hints.has(key)) continue;
      const visitName = visit ? cleanTravelerDisplay(visit.name) || visit.name : "";
      const cleanMessage = cleanTravelerProse(finding.message) || finding.message;
      hints.set(
        key,
        visit
          ? {
              key,
              label: `${visitName} (Ngày ${visit.dayIndex}): ${cleanMessage}`,
              prompt: `Sửa giúp tôi lỗi của ${visitName} ở Ngày ${visit.dayIndex}`,
            }
          : { key, label: cleanMessage, prompt: `Sửa giúp tôi: ${cleanMessage}` },
      );
    }
    return [...hints.values()];
  }, [previewState.result, workingDraft, placeDetailsState]);

  const hasRepairableScheduleConflict =
    hasInstantOverlap || Boolean(validationGroupSummary?.hasScheduleConflict);

  const applyFallbackItems = useMemo(() => {
    if (!applyState.validation) return [];
    return mapValidationToWorkspace(applyState.validation, workingDraft, placeDetailsState).jumpItems;
  }, [applyState.validation, workingDraft, placeDetailsState]);

  function jumpToDomTarget(targetDomId: string) {
    setMobileTab("timeline");
    requestAnimationFrame(() => {
      const el = document.getElementById(targetDomId);
      if (!el) return;
      el.scrollIntoView?.({ behavior: "smooth", block: "center" });
      el.focus?.({ preventScroll: true });
    });
  }

  const journeyEditable = liveTripStatus === "UPCOMING";
  const journeyDiff = hasJourneyChanged(workspace.baseline.journey, workingDraft.journey);

  async function handleRescheduleFromOrigin() {
    if (!journeyEditable || !workingDraft.journey?.origin?.confirmed || applyInProgress) return;
    setReschedulingFromOrigin(true);
    try {
      let summary = previewState.result?.journeySummary;
      let legs = previewState.result?.legs ?? [];
      if (
        !summary ||
        summary.estimatedArrivalAtFirstMinute == null ||
        !canConfirmEditPreview(workingDraft, previewState)
      ) {
        const outcome = await previewTripEdit(tripId, {
          baseRevision: applyStateRef.current.baseRevision,
          candidate: workingDraft,
        });
        if (outcome.kind === "PREVIEWED") {
          summary = outcome.result.journeySummary;
          legs = outcome.result.legs ?? [];
        }
      }
      const result = rescheduleDraftFromOrigin(workingDraft, summary, legs);
      if (result.overflowMessage) setAutoShiftWarning(result.overflowMessage);
      else setAutoShiftWarning(null);
      if (result.candidate !== workingDraft) {
        commitDraft(
          result.candidate,
          "Đã xếp lại giờ tham quan trong bản nháp theo lộ trình từ nơi xuất phát.",
        );
      } else if (result.overflowMessage) {
        setAnnouncement(result.overflowMessage);
      }
    } finally {
      setReschedulingFromOrigin(false);
    }
  }
  const activePlannerDay = useMemo(() => {
    if (plannerDays.length === 0) {
      return { day: 1, date: workingDraft.startDate, stops: [], distanceMeters: null, travelSeconds: null };
    }
    if (activeDayIndex === null) return plannerDays[0]!;
    return plannerDays.find((d) => d.day === activeDayIndex) ?? plannerDays[0]!;
  }, [plannerDays, activeDayIndex, workingDraft.startDate]);

  const visibleDays = activeDayIndex === null
    ? workingDraft.days
    : workingDraft.days.filter((day) => day.dayIndex === activeDayIndex);

  useEffect(() => {
    if (!toastFeedback) return;
    const timer = window.setTimeout(() => setToastFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toastFeedback]);

  function selectModeTab(tab: "assistant" | "timeline" | "map") {
    setDesktopSplit(false);
    setMobileTab(tab);
    setMobileDrawerOpen(false);
    if (tab === "assistant") setAiOpen(true);
  }

  function handleOpenCanvas(rightTab: "timeline" | "map" = "timeline") {
    setSidebarOpen(false);
    setMobileDrawerOpen(false);
    setDesktopSplit(true);
    setSplitRightTab(rightTab);
    setAiOpen(true);
  }

  function handleCloseCanvas() {
    setDesktopSplit(false);
    setSidebarOpen(true);
  }

  function handleMobileTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const order: readonly ("assistant" | "timeline" | "map")[] = ["assistant", "timeline", "map"];
    const currentIdx = order.indexOf(mobileTab);
    let nextIdx = -1;
    if (event.key === "ArrowRight") nextIdx = (currentIdx + 1) % order.length;
    else if (event.key === "ArrowLeft") nextIdx = (currentIdx - 1 + order.length) % order.length;
    else if (event.key === "Home") nextIdx = 0;
    else if (event.key === "End") nextIdx = order.length - 1;
    if (nextIdx === -1) return;
    event.preventDefault();
    const nextTab = order[nextIdx]!;
    selectModeTab(nextTab);
    document.getElementById(`mobile-tab-${nextTab}`)?.focus();
  }

  function handleJumpToTabFromAi(tab: "timeline" | "map") {
    if (desktopSplit) {
      setSplitRightTab(tab);
    } else if (typeof window !== "undefined" && window.innerWidth >= 901 && mobileTab === "assistant") {
      handleOpenCanvas(tab);
    } else {
      selectModeTab(tab);
    }
    if (tab === "timeline" && lastAiChange) {
      const firstChangedVisitId =
        [...lastAiChange.added][0] ??
        [...lastAiChange.updated][0] ??
        [...lastAiChange.shifted][0];
      if (firstChangedVisitId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`visit-card-${firstChangedVisitId}`);
          el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
          el?.focus?.({ preventScroll: true });
        });
      }
    }
  }

  if (liveTripStatus === "COMPLETED") {
    return (
      <main className={styles.page} lang="vi">
        <div className={styles.content}>
          <Link className={styles.backLink} href={`/trips/${tripId}` as Route}>
            <ArrowLeft size={16} aria-hidden="true" />
            Trở về hành trình
          </Link>
          <section className={styles.lockedCard} aria-labelledby="trip-completed-locked-heading">
            <span className={styles.lockedIcon}><CheckCircle2 size={24} aria-hidden="true" /></span>
            <div>
              <p className={styles.eyebrow}>Chế độ chỉ xem</p>
              <h1 id="trip-completed-locked-heading">Chuyến đi đã hoàn thành</h1>
              <p>Hành trình đã hoàn thành nên được khóa chỉnh sửa để bảo toàn lịch sử chuyến đi.</p>
              <Link className={styles.primaryButtonInline} href={`/trips/${tripId}` as Route}>
                Xem lại hành trình
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewModeClass = desktopSplit
    ? `${styles.workspaceGridSplit} ${splitRightTab === "timeline" ? styles.viewSplitTimeline : styles.viewSplitMap}`
    : mobileTab === "assistant"
      ? styles.viewAssistant
      : mobileTab === "timeline"
        ? styles.viewTimeline
        : styles.viewMap;

  const canUndoLastAiStep =
    workspace.undoStack.length > 0 &&
    lastAiChange !== null &&
    areEditCandidatesEqual(workingDraft, lastAiChange.appliedDraft);

  return (
    <main
      className={`${styles.page} ${styles.pageFullscreen} ${editDirty ? styles.pageFullscreenDirty : ""}`}
      lang="vi"
      aria-label="Không gian chỉnh sửa hành trình"
    >
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>

      <div className={styles.mobileTopBar}>
        <button
          type="button"
          className={styles.mobileMenuBtn}
          aria-expanded={mobileDrawerOpen}
          aria-label="Mở thông tin chuyến đi và nút lưu"
          onClick={() => setMobileDrawerOpen(true)}
        >
          <Menu size={16} aria-hidden="true" />
          <span>{workspace.baseline.durationDays} ngày</span>
        </button>

        <div
          className={styles.mobileTabs}
          role="tablist"
          aria-label="Chuyển chế độ xem"
          onKeyDown={handleMobileTabKeyDown}
        >
          <button
            id="mobile-tab-assistant"
            type="button"
            role="tab"
            aria-selected={!desktopSplit && mobileTab === "assistant"}
            aria-controls="assistant-panel-col"
            tabIndex={!desktopSplit && mobileTab === "assistant" ? 0 : -1}
            className={`${styles.mobileTabBtn} ${!desktopSplit && mobileTab === "assistant" ? styles.mobileTabActive : ""}`}
            onClick={() => selectModeTab("assistant")}
          >
            <Sparkles size={14} aria-hidden="true" />
            Trợ lý AI
          </button>
          <button
            id="mobile-tab-timeline"
            type="button"
            role="tab"
            aria-selected={!desktopSplit && mobileTab === "timeline"}
            aria-controls="timeline-panel-col"
            tabIndex={!desktopSplit && mobileTab === "timeline" ? 0 : -1}
            className={`${styles.mobileTabBtn} ${!desktopSplit && mobileTab === "timeline" ? styles.mobileTabActive : ""}`}
            onClick={() => selectModeTab("timeline")}
          >
            <CalendarDays size={14} aria-hidden="true" />
            Lịch trình
          </button>
          <button
            id="mobile-tab-map"
            type="button"
            role="tab"
            aria-selected={!desktopSplit && mobileTab === "map"}
            aria-controls="map-panel-col"
            tabIndex={!desktopSplit && mobileTab === "map" ? 0 : -1}
            className={`${styles.mobileTabBtn} ${!desktopSplit && mobileTab === "map" ? styles.mobileTabActive : ""}`}
            onClick={() => selectModeTab("map")}
          >
            <MapIcon size={14} aria-hidden="true" />
            Bản đồ ({draftVisitCount})
          </button>
        </div>
      </div>

      <div className={styles.workspaceShell}>
        {mobileDrawerOpen && (
          <div
            className={styles.sidebarBackdrop}
            aria-hidden="true"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        <aside
          className={`${styles.tripSidebar} ${!sidebarOpen ? styles.tripSidebarCollapsed : ""} ${
            mobileDrawerOpen ? styles.tripSidebarDrawerOpen : ""
          }`}
          aria-label="Thông tin và điều khiển chuyến đi"
        >
          <div className={styles.sidebarTopRow}>
            <Link className={styles.backLink} href={`/trips/${tripId}` as Route}>
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Trở về hành trình</span>
            </Link>
            <button
              type="button"
              className={styles.sidebarCollapseBtn}
              aria-label="Thu gọn thanh bên"
              title="Thu gọn thanh bên"
              onClick={() => {
                setSidebarOpen(false);
                setMobileDrawerOpen(false);
              }}
            >
              <PanelLeft size={17} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.sidebarScrollArea}>
            <div className={styles.sidebarTripInfo}>
              <h1>Chỉnh sửa lịch trình {workspace.baseline.durationDays} ngày</h1>
              <p className={styles.sidebarSubtitle}>Hỏi / nhờ AI chỉnh lịch trình</p>
              <div className={styles.metaChips}>
                <span className={styles.metaChip}>
                  <CalendarDays size={12} aria-hidden="true" />
                  {dateLabel(workspace.baseline.startDate)} – {dateLabel(savedEndDate)}
                </span>
                <span className={styles.metaChip}>
                  <CarFront size={12} aria-hidden="true" />
                  {workspace.baseline.transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô"}
                </span>
                <span className={styles.metaChip}>
                  <MapPin size={12} aria-hidden="true" />
                  {draftVisitCount} lượt
                </span>
              </div>
            </div>

            <nav className={styles.sidebarNav} aria-label="Chuyển vùng làm việc">
              <button
                type="button"
                className={`${styles.sidebarNavBtn} ${!desktopSplit && mobileTab === "assistant" ? styles.sidebarNavActive : ""}`}
                onClick={() => selectModeTab("assistant")}
              >
                <Sparkles size={16} aria-hidden="true" />
                <span>Trợ lý AI</span>
              </button>
              <button
                type="button"
                className={`${styles.sidebarNavBtn} ${!desktopSplit && mobileTab === "timeline" ? styles.sidebarNavActive : ""}`}
                onClick={() => selectModeTab("timeline")}
              >
                <CalendarDays size={16} aria-hidden="true" />
                <span>Lịch trình ({draftVisitCount})</span>
              </button>
              <button
                type="button"
                className={`${styles.sidebarNavBtn} ${!desktopSplit && mobileTab === "map" ? styles.sidebarNavActive : ""}`}
                onClick={() => selectModeTab("map")}
              >
                <MapIcon size={16} aria-hidden="true" />
                <span>Bản đồ &amp; Kiểm tra</span>
              </button>
            </nav>

            <button
              type="button"
              className={`${styles.canvasToggleCard} ${desktopSplit ? styles.canvasToggleCardActive : ""}`}
              aria-pressed={desktopSplit}
              onClick={() => (desktopSplit ? handleCloseCanvas() : handleOpenCanvas("timeline"))}
            >
              <Columns2 size={16} aria-hidden="true" />
              <div className={styles.canvasToggleCopy}>
                <strong>{desktopSplit ? "Đóng lịch & bản đồ bên cạnh" : "Xem lịch & bản đồ bên cạnh"}</strong>
                <span>Xem lịch hoặc bản đồ ngay cạnh khung chat</span>
              </div>
            </button>

            <div className={styles.sidebarHealthBox}>
              <div className={styles.sidebarHealthRow}>
                <span className={styles.sidebarHealthLabel}>{editDirty ? "Bạn đang chỉnh sửa" : "Lịch trình"}</span>
                <span
                  className={`${styles.statusBadge} ${editDirty ? styles.statusDirty : styles.statusSaved}`}
                  role="status"
                >
                  {editDirty ? `${changeCount} thay đổi chưa lưu` : "Đã lưu"}
                </span>
              </div>
              {validationGroupSummary && (
                <button
                  type="button"
                  className={
                    validationGroupSummary.violationCount > 0
                      ? styles.sidebarHealthWarnBtn
                      : styles.sidebarHealthOkBtn
                  }
                  onClick={() => {
                    if (typeof window !== "undefined" && window.innerWidth >= 901) {
                      handleOpenCanvas("map");
                    } else {
                      selectModeTab("map");
                    }
                  }}
                >
                  {validationGroupSummary.violationCount > 0 ? (
                    <>
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>{validationGroupSummary.violationCount} điểm cần xem lại · Xem</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} aria-hidden="true" />
                      <span>Kiểm tra: Đạt yêu cầu</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className={styles.sidebarFooter}>
            <div className={styles.sidebarUndoRow}>
              <button
                type="button"
                className={styles.toolButtonCompactHeader}
                disabled={applyInProgress || workspace.undoStack.length === 0}
                onClick={handleUndo}
                aria-label="Hoàn tác"
              >
                <Undo2 size={15} aria-hidden="true" />
                <span>Hoàn tác</span>
              </button>
              <button
                type="button"
                className={styles.toolButtonCompactHeader}
                disabled={applyInProgress || workspace.redoStack.length === 0}
                onClick={handleRedo}
                aria-label="Làm lại"
              >
                <Redo2 size={15} aria-hidden="true" />
                <span>Làm lại</span>
              </button>
            </div>

            <button
              type="button"
              className={styles.sidebarPrimarySaveBtn}
              disabled={!editDirty || !previewCanConfirm || applyInProgress}
              onClick={() => {
                setMobileDrawerOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Save size={15} aria-hidden="true" />
              <span>Lưu thay đổi</span>
            </button>

            {applyInProgress ? (
              <button className={styles.sidebarCancelLink} type="button" disabled>
                Hủy chỉnh sửa
              </button>
            ) : (
              <Link
                className={styles.sidebarCancelLink}
                href={`/trips/${tripId}` as Route}
                onPointerDown={(event) => {
                  if (event.button === 0) discardAndLeave();
                }}
                onKeyDown={handleCancelKeyDown}
              >
                Hủy chỉnh sửa
              </Link>
            )}
          </div>
        </aside>

        <div className={styles.workspaceStage}>
          {!sidebarOpen && (
            <div className={styles.floatingBar}>
              <button
                type="button"
                className={styles.floatingIconBtn}
                aria-label="Mở thanh bên thông tin chuyến"
                title="Mở thanh bên (Thu gọn / Mở rộng)"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${styles.floatingPillBtn} ${desktopSplit ? styles.floatingPillActive : ""}`}
                onClick={() => (desktopSplit ? handleCloseCanvas() : handleOpenCanvas("timeline"))}
              >
                <Columns2 size={15} aria-hidden="true" />
                <span>{desktopSplit ? "Đóng lịch bên cạnh" : "Xem lịch & bản đồ"}</span>
              </button>
              {validationGroupSummary && validationGroupSummary.violationCount > 0 && !desktopSplit && (
                <button
                  type="button"
                  className={styles.headerWarnChip}
                  onClick={() => handleOpenCanvas("map")}
                >
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{validationGroupSummary.violationCount} điểm cần xem lại</span>
                </button>
              )}
              {editDirty && (
                <button
                  type="button"
                  className={styles.floatingSaveBtn}
                  disabled={!previewCanConfirm || applyInProgress}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Save size={14} aria-hidden="true" />
                  <span>Lưu ({changeCount})</span>
                </button>
              )}
            </div>
          )}

          {toastFeedback && (
            <div className={styles.toastPill} role="status">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span className={styles.toastText}>{toastFeedback.message}</span>
              {toastFeedback.fromAi && !desktopSplit && (
                <button
                  type="button"
                  className={styles.toastActionBtn}
                  onClick={() => {
                    setToastFeedback(null);
                    handleJumpToTabFromAi("timeline");
                  }}
                >
                  Mở Canvas xem ngay
                </button>
              )}
              {toastFeedback.canUndo && workspace.undoStack.length > 0 && (
                <button
                  type="button"
                  className={styles.toastActionBtn}
                  disabled={applyInProgress}
                  onClick={() => {
                    setToastFeedback(null);
                    if (canUndoLastAiStep) handleUndoAiStep();
                    else handleUndo();
                  }}
                >
                  Hoàn tác
                </button>
              )}
              <button
                type="button"
                className={styles.toastCloseBtn}
                aria-label="Đóng thông báo"
                onClick={() => setToastFeedback(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className={`${styles.content} ${viewModeClass}`}>
            <div
              className={`${styles.workspaceGrid} ${!aiOpen ? styles.workspaceGridCollapsed : ""} ${viewModeClass}`}
            >
              <aside id="assistant-panel-col" className={styles.assistantColumn} aria-label="Khung hội thoại Trợ lý chuyến đi">
                <div className={styles.assistantSticky}>
                  <AiEditBar
                    open={aiOpen}
                    onToggleOpen={() => setAiOpen((current) => !current)}
                    inputValue={aiInput}
                    onInputChange={setAiInput}
                    disabled={applyInProgress}
                    messages={aiThread}
                    tripStatus={liveTripStatus}
                    hasOrigin={Boolean(workingDraft.journey?.origin?.confirmed)}
                    unavailableCount={instantChecks.unavailableVisits.length}
                    issues={tripIssues}
                    autoFocus={entryMode === "in-trip" || (!desktopSplit && mobileTab === "assistant")}
                    tripHeadline={`Trợ lý chuyến đi ${workspace.baseline.durationDays} ngày`}
                    showCollapseToggle={desktopSplit}
                    hasSharedLocation={
                      liveTripStatus === "ONGOING" &&
                      sessionLocation !== null &&
                      isInTripLocationFresh(sessionLocation)
                    }
                    onRequestUpdateLocation={() => {
                      const lastUserMessage = [...aiThread]
                        .reverse()
                        .find((item) => item.role === "user")?.text;
                      setSessionLocation(null);
                      setAiBarState({
                        kind: "NEEDS_LOCATION",
                        prompt: "Chọn cách cập nhật vị trí hiện tại để tính lại câu trả lời.",
                        pendingMessage:
                          lastUserMessage ??
                          (aiInput.trim() || "Cập nhật thông tin quanh vị trí hiện tại"),
                        locationFlow: createLocationFlowState(),
                        manualPickerOpen: false,
                        manualCoords: null,
                        coverageError: null,
                      });
                    }}
                    onClearHistory={() => {
                      aiAbortRef.current?.abort();
                      setAiThread([]);
                      setSessionLocation(null);
                      setAiBarState({ kind: "IDLE" });
                      void clearTripEditChatMessagesClient(tripId);
                    }}
                    state={
                      aiBarState.kind === "APPLIED"
                        ? {
                            ...aiBarState,
                            canUndo: canUndoLastAiStep,
                          }
                        : aiBarState
                    }
                    onSubmitPrompt={(promptText, resolution) => {
                      void handleAiSubmit(promptText, resolution);
                    }}
                    onStopStream={handleStopAiStream}
                    onApplySuggestion={handleApplyAdviceSuggestion}
                    onOpenCanvas={!desktopSplit ? () => handleOpenCanvas("timeline") : undefined}
                    onRequestGps={() => void handleRequestGpsForAi()}
                    onOpenManualLocation={() =>
                      setAiBarState((current) =>
                        current.kind === "NEEDS_LOCATION"
                          ? { ...current, manualPickerOpen: true, coverageError: null }
                          : current,
                      )
                    }
                    onCloseManualLocation={() =>
                      setAiBarState((current) =>
                        current.kind === "NEEDS_LOCATION"
                          ? { ...current, manualPickerOpen: false, coverageError: null }
                          : current,
                      )
                    }
                    onSelectManualCoords={handleSelectManualLocationForAi}
                    onCancelPendingLocation={() => setAiBarState({ kind: "IDLE" })}
                    onRetry={handleAiRetry}
                    onUndoAiStep={handleUndoAiStep}
                    onDismissApplied={() => setAiBarState({ kind: "IDLE" })}
                    onJumpToTab={handleJumpToTabFromAi}
                  />
                </div>
              </aside>

              <div className={styles.secondaryTopControls}>
                {desktopSplit && (
                  <div className={styles.canvasHeaderRow}>
                    <div className={styles.splitRightTabs} role="tablist" aria-label="Chuyển giữa lịch và bản đồ">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={splitRightTab === "timeline"}
                        className={`${styles.splitRightTabBtn} ${splitRightTab === "timeline" ? styles.splitRightTabActive : ""}`}
                        onClick={() => setSplitRightTab("timeline")}
                      >
                        <CalendarDays size={14} aria-hidden="true" />
                        Lịch trình ({draftVisitCount})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={splitRightTab === "map"}
                        className={`${styles.splitRightTabBtn} ${splitRightTab === "map" ? styles.splitRightTabActive : ""}`}
                        onClick={() => setSplitRightTab("map")}
                      >
                        <MapIcon size={14} aria-hidden="true" />
                        Bản đồ &amp; Kiểm tra
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.canvasCloseBtn}
                      aria-label="Đóng lịch & bản đồ bên cạnh"
                      onClick={handleCloseCanvas}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}

                {workingDraft.days.length > 1 && (
                  <nav className={styles.dayTabs} aria-label="Điều hướng các ngày">
                    <button
                      type="button"
                      className={`${styles.dayTab} ${activeDayIndex === null ? styles.dayTabActive : ""}`}
                      onClick={() => setActiveDayIndex(null)}
                    >
                      <Layers size={14} aria-hidden="true" />
                      Tất cả ({workingDraft.days.length} ngày)
                    </button>
                    {workingDraft.days.map((day) => (
                      <button
                        key={day.dayIndex}
                        type="button"
                        className={`${styles.dayTab} ${activeDayIndex === day.dayIndex ? styles.dayTabActive : ""}`}
                        onClick={() => {
                          setActiveDayIndex(day.dayIndex);
                          const first = day.visits[0];
                          if (first) {
                            setSelectedDestinationId(first.destinationId);
                            setFocusSelection(true);
                          }
                        }}
                      >
                        <span
                          className={styles.dayTabDot}
                          style={{ background: `var(--planner-route-${((day.dayIndex - 1) % 3) + 1})` }}
                          aria-hidden="true"
                        />
                        Ngày {day.dayIndex} ({day.visits.length})
                      </button>
                    ))}
                  </nav>
                )}
              </div>

              <section id="timeline-panel-col" className={styles.timelineColumn} aria-label="Bản nháp chỉnh sửa theo ngày" inert={applyInProgress}>
                <p className={styles.fixedNote} style={{ marginBottom: 4 }}>
                  Ngày bắt đầu, số ngày và phương tiện giữ cố định. Lịch trình đã lưu ({savedVisitCount} lượt) chỉ cập nhật sau khi bạn xác nhận lưu.
                </p>

            <div className={styles.autoShiftBar}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={autoShiftEnabled}
                  onChange={(event) => {
                    setAutoShiftEnabled(event.target.checked);
                    if (!event.target.checked) setAutoShiftWarning(null);
                  }}
                />
                Tự động dời giờ các điểm sau (trong cùng ngày)
              </label>
              <div className={styles.autoShiftActions}>
                <span className={styles.fixedNote}>
                  {previewState.status === "CHECKING"
                    ? "Đang kiểm tra máy chủ…"
                    : previewState.status === "PREVIEWED"
                      ? "Đã kiểm tra"
                      : "Tự kiểm tra khi dừng tay"}
                </span>
                <button
                  type="button"
                  className={hasRepairableScheduleConflict ? styles.quickFixCta : styles.toolButtonCompact}
                  disabled={applyInProgress || draftVisitCount === 0}
                  onClick={handleAutoFixSchedule}
                >
                  <Wand2 size={14} aria-hidden="true" />
                  Tự xếp lại giờ khớp di chuyển
                </button>
              </div>
            </div>

            {autoShiftWarning && (
              <p className={styles.warningBanner} role="alert">
                {autoShiftWarning}
              </p>
            )}

            {instantChecks.unavailableVisits.length > 0 && (
              <div className={styles.oqBAlert} role="alert" style={{ marginBottom: 12 }}>
                <p className={styles.oqBAlertText}>
                  Có {instantChecks.unavailableVisits.length} điểm đến đã bị ẩn hoặc ngừng công khai. Bạn cần xóa hoặc thay thế từng điểm bên dưới trước khi lưu.
                </p>
              </div>
            )}

            {visibleDays.map((day) => {
              const localDate = tripDayDate(workingDraft.startDate, day.dayIndex);
              return (
                <section className={styles.daySection} key={day.dayIndex} aria-labelledby={`edit-day-${day.dayIndex}`}>
                  <div className={styles.dayHeading}>
                    <div>
                      <h2 id={`edit-day-${day.dayIndex}`}>Ngày {day.dayIndex}</h2>
                      <p>{weekdayLabel(localDate)}{localDate ? `, ${dateLabel(localDate)}` : ""}</p>
                    </div>
                    <span className={styles.metaChip}>{day.visits.length} lượt tham quan</span>
                  </div>

                  {day.dayIndex === 1 && !workingDraft.journey && journeyEditable && (
                    <div className={styles.journeyBoundaryCard}>
                      <div className={styles.journeyBoundaryHeader}>
                        <div>
                          <h3>Nơi xuất phát &amp; giờ khởi hành</h3>
                          <p className={styles.fixedNote}>
                            Chuyến đi này chưa gắn điểm xuất phát. Bạn vẫn có thể sửa lịch trình bình thường hoặc bổ sung tùy chọn.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.toolButton}
                          disabled={applyInProgress}
                          onClick={() => {
                            setOriginEditorExpanded(true);
                            commitDraft(
                              { ...workingDraft, journey: createEmptyJourney() },
                              "Đã bật phần bổ sung nơi xuất phát và giờ đi/về.",
                            );
                          }}
                        >
                          <Navigation size={14} aria-hidden="true" />
                          Bổ sung nơi xuất phát
                        </button>
                      </div>
                    </div>
                  )}

                  {day.dayIndex === 1 && workingDraft.journey && (
                    <div className={styles.journeyBoundaryCard}>
                      <div className={styles.journeyBoundaryHeader}>
                        <div>
                          <h3>
                            Điểm xuất phát:{" "}
                            {workingDraft.journey.origin?.label ?? "Chưa chọn vị trí"}
                          </h3>
                          <p className={styles.fixedNote}>
                            <Clock size={12} aria-hidden="true" /> Khởi hành Ngày 1:{" "}
                            {minuteClockLabel(workingDraft.journey.departureMinute)} (Asia/Ho_Chi_Minh)
                            {previewState.result?.journeySummary?.outboundDurationSeconds != null &&
                              ` · Chặng đầu khoảng ${Math.ceil(previewState.result.journeySummary.outboundDurationSeconds / 60)} phút` +
                              (previewState.result.journeySummary.outboundRestMinutes > 0
                                ? ` (gồm ${previewState.result.journeySummary.outboundRestMinutes} phút nghỉ)`
                                : "") +
                              ` · Dự kiến tới ${minuteClockLabel(previewState.result.journeySummary.estimatedArrivalAtFirstMinute)}`}
                          </p>
                        </div>
                        <div className={styles.journeyBoundaryActions}>
                          {journeyEditable && (
                            <>
                              <button
                                type="button"
                                className={styles.toolButton}
                                onClick={() => setOriginEditorExpanded((prev) => !prev)}
                              >
                                {originEditorExpanded ? "Thu gọn" : "Chỉnh xuất phát"}
                              </button>
                              <button
                                type="button"
                                className={styles.toolButton}
                                disabled={
                                  !workingDraft.journey.origin?.confirmed ||
                                  reschedulingFromOrigin ||
                                  applyInProgress
                                }
                                onClick={() => void handleRescheduleFromOrigin()}
                              >
                                {reschedulingFromOrigin ? (
                                  <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                                ) : (
                                  <Clock size={14} aria-hidden="true" />
                                )}
                                Tự xếp lại giờ theo lộ trình xuất phát
                              </button>
                              {!workspace.baseline.journey && (
                                <button
                                  type="button"
                                  className={styles.cancelButton}
                                  disabled={applyInProgress}
                                  onClick={() => {
                                    setOriginEditorExpanded(false);
                                    commitDraft(
                                      { ...workingDraft, journey: undefined },
                                      "Đã bỏ phần bổ sung nơi xuất phát trong bản nháp.",
                                    );
                                  }}
                                >
                                  Bỏ xuất phát
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {!journeyEditable && (
                        <p className={styles.fixedNote}>
                          Chuyến đi đang diễn ra — điểm xuất phát và giờ đi/về được cố định.
                        </p>
                      )}

                      {journeyEditable && originEditorExpanded && (
                        <TripJourneyEditor
                          journey={workingDraft.journey}
                          disabled={applyInProgress}
                          returnOnly={(workingDraft.days.at(-1)?.visits.length ?? 0) === 0}
                          onChange={(nextJourney) =>
                            commitDraft(
                              { ...workingDraft, journey: nextJourney },
                              "Đã cập nhật điểm xuất phát và giờ đi/về trong bản nháp.",
                            )
                          }
                        />
                      )}
                    </div>
                  )}

                  {day.visits.length === 0 ? (
                    <p className={styles.emptyDay}>Chưa có lượt tham quan trong ngày này.</p>
                  ) : (
                    <ol className={styles.visitList}>
                      {day.visits.map((visit, visitIdx) => {
                        const place = placeDetailsState[visit.destinationId];
                        const label = labelForDestination(visit.destinationId);
                        const isSelected = selectedDestinationId === visit.destinationId;
                        const draftTiming = timingDrafts[visit.visitId] ?? {
                          startTime: minuteLabel(visit.startMinute),
                          duration: String(visit.plannedDurationMinutes),
                        };
                        const otherDays = workingDraft.days.filter((item) => item.dayIndex !== day.dayIndex);
                        const instantWarnings = instantChecks.byVisitId[visit.visitId] ?? [];
                        const serverFindings = mappedValidation.byVisitId[visit.visitId] ?? [];
                        const nextVisit = day.visits[visitIdx + 1];
                        const legKey = nextVisit ? `${visit.visitId}->${nextVisit.visitId}` : null;
                        const legMetric = legKey ? previewLegsByPair.get(legKey) : undefined;
                        const legFindings = legKey ? (mappedValidation.byLegKey[legKey] ?? []) : [];
                        const isUnavailableCatalog = place?.availability === "UNAVAILABLE" && !place.external;
                        const isLockedVisit = completedVisitSet.has(visit.visitId);
                        const prevVisit = visitIdx > 0 ? day.visits[visitIdx - 1] : undefined;
                        const prevLocked = Boolean(prevVisit && completedVisitSet.has(prevVisit.visitId));
                        const nextLocked = Boolean(nextVisit && completedVisitSet.has(nextVisit.visitId));
                        const aiChangeBadge = lastAiChange?.added.has(visit.visitId)
                          ? "ADDED"
                          : lastAiChange?.updated.has(visit.visitId)
                            ? "UPDATED"
                            : lastAiChange?.shifted.has(visit.visitId)
                              ? "SHIFTED"
                              : null;

                        return (
                          <li
                            id={`visit-card-${visit.visitId}`}
                            tabIndex={-1}
                            key={visit.visitId}
                            className={`${styles.visitCard} ${isSelected ? styles.visitCardSelected : ""} ${isLockedVisit ? styles.visitCardLocked : ""} ${aiChangeBadge ? styles.visitCardAiHighlight : ""}`}
                            onClick={() => {
                              setSelectedDestinationId(visit.destinationId);
                              setFocusSelection(true);
                            }}
                          >
                            <div className={styles.visitTop}>
                              <VisitThumb place={place} order={visit.order} />
                              <div className={styles.visitMeta}>
                                <div className={styles.visitTitleRow}>
                                  <h3>{label}</h3>
                                  <span className={styles.visitTimePill}>
                                    <Clock size={12} aria-hidden="true" />
                                    {minuteLabel(visit.startMinute)} –{" "}
                                    {minuteLabel(visit.startMinute + visit.plannedDurationMinutes)} ·{" "}
                                    {visit.plannedDurationMinutes} phút
                                  </span>
                                </div>
                                {aiChangeBadge === "ADDED" && (
                                  <span className={styles.aiBadgeAdded}>Mới thêm</span>
                                )}
                                {aiChangeBadge === "UPDATED" && (
                                  <span className={styles.aiBadgeUpdated}>Đã chỉnh</span>
                                )}
                                {aiChangeBadge === "SHIFTED" && (
                                  <span className={styles.aiBadgeShifted}>Đã dời</span>
                                )}
                                {isLockedVisit && (
                                  <span className={styles.lockedVisitBadge}>
                                    <Lock size={12} aria-hidden="true" />
                                    Đã hoàn tất · Cố định
                                  </span>
                                )}
                                {place?.area && (
                                  <span className={styles.visitArea}>
                                    <MapPin size={12} aria-hidden="true" />
                                    {place.area}
                                  </span>
                                )}
                                {place?.external && (
                                  <div className={styles.findingBadges}>
                                    <span className={styles.findingBadgeInsufficient}>
                                      Ngoài danh mục · KLTN chưa kiểm
                                    </span>
                                    {place.latitude == null && (
                                      <span className={styles.fixedNote}>
                                        Cache 30 ngày đã hết hạn — dùng nhãn chung và không hiển thị tọa độ cũ trên bản đồ.
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isUnavailableCatalog && (
                                  <div className={styles.oqBAlert} onClick={(e) => e.stopPropagation()}>
                                    <p className={styles.oqBAlertText}>
                                      Điểm đến không còn khả dụng — hãy xóa hoặc thay thế để lưu.
                                    </p>
                                    <div className={styles.quickActionRow}>
                                      <button
                                        type="button"
                                        className={styles.toolButton}
                                        disabled={applyInProgress || isLockedVisit}
                                        onClick={(event) => {
                                          setDrawerOpener(event.currentTarget);
                                          setDrawerTarget({
                                            kind: "replace",
                                            dayIndex: day.dayIndex,
                                            visitId: visit.visitId,
                                            startMinute: visit.startMinute,
                                            plannedDurationMinutes: visit.plannedDurationMinutes,
                                          });
                                        }}
                                      >
                                        <Replace size={14} aria-hidden="true" />
                                        Thay thế nhanh
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.removeActionBtn}
                                        disabled={applyInProgress || isLockedVisit}
                                        onClick={() => handleRemove(visit.visitId, day.dayIndex, label)}
                                      >
                                        <Trash2 size={14} aria-hidden="true" />
                                        Xóa nhanh
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {(instantWarnings.length > 0 || serverFindings.length > 0) && (
                                  <div className={styles.findingBadges}>
                                    {instantWarnings
                                      .filter((w) => !(w.code === "DESTINATION_UNAVAILABLE" && isUnavailableCatalog))
                                      .map((w) => (
                                        <span key={`i-${w.code}`} className={styles.findingBadgeViolation}>
                                          <AlertTriangle size={12} aria-hidden="true" />
                                          {w.message}
                                        </span>
                                      ))}
                                    {serverFindings.map((f, fIdx) => (
                                      <span
                                        key={`s-${fIdx}-${f.reasonCode}`}
                                        className={
                                          f.status === "INSUFFICIENT_DATA"
                                            ? styles.findingBadgeInsufficient
                                            : styles.findingBadgeViolation
                                        }
                                      >
                                        <AlertTriangle size={12} aria-hidden="true" />
                                        {f.message}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className={styles.visitProgressiveWrap} onClick={(e) => e.stopPropagation()}>
                              {!isUnavailableCatalog && (
                                <button
                                  type="button"
                                  className={styles.visitQuickReplaceBtn}
                                  aria-label={`Đổi ${label} sang điểm khác`}
                                  disabled={applyInProgress || isLockedVisit}
                                  onClick={(event) => {
                                    setDrawerOpener(event.currentTarget);
                                    setDrawerTarget({
                                      kind: "replace",
                                      dayIndex: day.dayIndex,
                                      visitId: visit.visitId,
                                      startMinute: visit.startMinute,
                                      plannedDurationMinutes: visit.plannedDurationMinutes,
                                    });
                                  }}
                                >
                                  <Replace size={14} aria-hidden="true" />
                                  <span>Đổi điểm</span>
                                </button>
                              )}

                              <details className={styles.visitControlsDetails}>
                                <summary className={styles.visitControlsSummary}>
                                  <SlidersHorizontal size={13} aria-hidden="true" />
                                  <span>Chỉnh giờ, thời lượng &amp; thứ tự</span>
                                </summary>
                                <div className={styles.visitControls}>
                                  <div className={styles.timeFieldGroup}>
                                    <label className={styles.inlineField}>
                                      <span>Giờ bắt đầu</span>
                                      <input
                                        type="time"
                                        step={60}
                                        disabled={applyInProgress || isLockedVisit}
                                        aria-label={`Giờ bắt đầu ${label}`}
                                        value={draftTiming.startTime}
                                        onChange={(e) => {
                                          const nextTime = e.target.value;
                                          setTimingDrafts((cur) => ({
                                            ...cur,
                                            [visit.visitId]: { ...draftTiming, startTime: nextTime },
                                          }));
                                          if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(nextTime)) {
                                            commitTiming(visit.visitId, nextTime, draftTiming.duration);
                                          }
                                        }}
                                        onBlur={() => commitTiming(visit.visitId, draftTiming.startTime, draftTiming.duration)}
                                      />
                                    </label>
                                    <div className={styles.nudgeGroup} role="group" aria-label={`Chỉnh nhanh giờ ${label}`}>
                                      <button
                                        type="button"
                                        className={styles.nudgeBtn}
                                        aria-label={`Lùi ${label} 15 phút`}
                                        disabled={applyInProgress || isLockedVisit || visit.startMinute === 0}
                                        onClick={() => handleNudgeStartMinute(visit.visitId, -15)}
                                      >
                                        -15p
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.nudgeBtn}
                                        aria-label={`Dời ${label} thêm 15 phút`}
                                        disabled={
                                          applyInProgress ||
                                          isLockedVisit ||
                                          visit.startMinute + 15 > 1439 - visit.plannedDurationMinutes
                                        }
                                        onClick={() => handleNudgeStartMinute(visit.visitId, 15)}
                                      >
                                        +15p
                                      </button>
                                    </div>
                                  </div>

                                  <label className={styles.inlineField}>
                                    <span>Thời lượng (phút)</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={1440}
                                      step={1}
                                      disabled={applyInProgress || isLockedVisit}
                                      aria-label={`Thời lượng ${label}`}
                                      value={draftTiming.duration}
                                      onChange={(e) => {
                                        const nextDuration = e.target.value;
                                        setTimingDrafts((cur) => ({
                                          ...cur,
                                          [visit.visitId]: { ...draftTiming, duration: nextDuration },
                                        }));
                                      }}
                                      onBlur={() => commitTiming(visit.visitId, draftTiming.startTime, draftTiming.duration)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitTiming(visit.visitId, draftTiming.startTime, draftTiming.duration);
                                        }
                                      }}
                                    />
                                  </label>

                                  {otherDays.length > 0 && (
                                    <label className={styles.inlineField}>
                                      <span>Ngày</span>
                                      <select
                                        aria-label={`Chuyển ${label} sang ngày`}
                                        disabled={applyInProgress || isLockedVisit}
                                        value={day.dayIndex}
                                        onChange={(e) => {
                                          const nextDay = Number(e.target.value);
                                          if (nextDay !== day.dayIndex) handleMoveDay(visit.visitId, nextDay);
                                        }}
                                      >
                                        {workingDraft.days.map((d) => (
                                          <option key={d.dayIndex} value={d.dayIndex}>
                                            Ngày {d.dayIndex}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}

                                  <div className={styles.visitButtons}>
                                    <button
                                      type="button"
                                      className={styles.iconActionBtn}
                                      aria-label={`Chuyển ${label} lên trước`}
                                      disabled={applyInProgress || isLockedVisit || prevLocked || visit.order === 1}
                                      onClick={() => handleReorder(visit.visitId, "up")}
                                    >
                                      <ArrowUp size={15} aria-hidden="true" />
                                      Lên
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.iconActionBtn}
                                      aria-label={`Chuyển ${label} xuống sau`}
                                      disabled={
                                        applyInProgress ||
                                        isLockedVisit ||
                                        nextLocked ||
                                        visit.order === day.visits.length
                                      }
                                      onClick={() => handleReorder(visit.visitId, "down")}
                                    >
                                      <ArrowDown size={15} aria-hidden="true" />
                                      Xuống
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.removeActionBtn}
                                      aria-label={`Xóa ${label} khỏi Ngày ${day.dayIndex}`}
                                      disabled={applyInProgress || isLockedVisit}
                                      onClick={() => handleRemove(visit.visitId, day.dayIndex, label)}
                                    >
                                      <Trash2 size={15} aria-hidden="true" />
                                      Xóa
                                    </button>
                                  </div>
                                </div>
                              </details>
                            </div>
                            {nextVisit && (
                              <div
                                id={`leg-${visit.visitId}-${nextVisit.visitId}`}
                                tabIndex={-1}
                                className={styles.legConnector}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <RouteIcon size={13} aria-hidden="true" />
                                <span>
                                  Chặng tới {labelForDestination(nextVisit.destinationId)}:{" "}
                                  <strong>{formatLegMetricLabel(legMetric)}</strong>
                                </span>
                                {legFindings.map((finding, lIdx) => (
                                  <span
                                    key={`lf-${lIdx}-${finding.reasonCode}`}
                                    className={
                                      finding.status === "INSUFFICIENT_DATA"
                                        ? styles.findingBadgeInsufficient
                                        : styles.findingBadgeViolation
                                    }
                                  >
                                    <AlertTriangle size={12} aria-hidden="true" />
                                    {finding.message}
                                  </span>
                                ))}
                                {legFindings.some((f) => f.status === "VIOLATION") && (
                                  <button
                                    type="button"
                                    className={styles.legFixBtn}
                                    disabled={applyInProgress || nextLocked}
                                    onClick={() => handleShiftFromLeg(day.dayIndex, visitIdx)}
                                  >
                                    <Wand2 size={12} aria-hidden="true" />
                                    Dời điểm sau khớp giờ
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  <div className={styles.dayAddFooter}>
                    <button
                      type="button"
                      className={styles.addStopBtn}
                      aria-label={`Thêm điểm dừng vào Ngày ${day.dayIndex}`}
                      disabled={applyInProgress}
                      onClick={(event) => {
                        setDrawerOpener(event.currentTarget);
                        setDrawerTarget({ kind: "add", dayIndex: day.dayIndex });
                      }}
                    >
                      <Plus size={15} aria-hidden="true" />
                      Thêm điểm dừng
                    </button>
                  </div>

                  {day.dayIndex === workingDraft.durationDays && workingDraft.journey && (
                    <div className={`${styles.journeyBoundaryCard} ${styles.journeyBoundaryCardBottom}`}>
                      <div className={styles.journeyBoundaryHeader}>
                        <div>
                          <h3>
                            Chặng về nơi xuất phát:{" "}
                            {workingDraft.journey.origin?.label ?? "Chưa chọn vị trí"}
                          </h3>
                          <p className={styles.fixedNote}>
                            Hạn trở về: {minuteClockLabel(workingDraft.journey.returnDeadlineMinute)}
                            {previewState.result?.journeySummary?.returnDurationSeconds != null &&
                              ` · Chặng về khoảng ${Math.ceil(previewState.result.journeySummary.returnDurationSeconds / 60)} phút` +
                              (previewState.result.journeySummary.returnRestMinutes > 0
                                ? ` (gồm ${previewState.result.journeySummary.returnRestMinutes} phút nghỉ)`
                                : "") +
                              ` · Dự kiến về lúc ${minuteClockLabel(previewState.result.journeySummary.estimatedReturnArrivalMinute)}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </section>

          <aside id="map-panel-col" className={styles.sideColumn} aria-label="Bản đồ và kiểm tra tính hợp lệ">
            <div className={styles.sideSticky}>
              <section className={`${styles.sidePanel} ${styles.healthCard}`} aria-labelledby="validation-box-heading">
                <div className={styles.healthCompactBar}>
                  <div className={styles.healthCompactStatus}>
                    <h2 id="validation-box-heading" className={styles.srOnly}>Kiểm tra tính hợp lệ</h2>
                    {previewState.status === "PREVIEWED" && previewState.result && validationGroupSummary ? (
                      <div
                        className={
                          previewCanConfirm && validationGroupSummary.violationCount === 0 && validationGroupSummary.insufficientCount === 0
                            ? styles.healthBannerOk
                            : previewCanConfirm && uncheckedItems.length > 0
                              ? styles.healthBannerWarn
                              : styles.healthBannerBad
                        }
                        role="status"
                      >
                        {previewCanConfirm && validationGroupSummary.violationCount === 0 && validationGroupSummary.insufficientCount === 0 ? (
                          <>
                            <Check size={15} aria-hidden="true" />
                            <span>Hợp lệ · Sẵn sàng lưu</span>
                          </>
                        ) : previewCanConfirm && uncheckedItems.length > 0 ? (
                          <>
                            <AlertTriangle size={15} aria-hidden="true" />
                            <span>Có {uncheckedItems.length} mục ngoài danh mục — có thể xác nhận lưu</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={15} aria-hidden="true" />
                            <span>
                              Còn {Math.max(1, validationGroupSummary.violationCount)} mục cần điều chỉnh trước khi lưu
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className={styles.fixedNote}>Kiểm tra tính hợp lệ</span>
                    )}
                  </div>

                  <div className={styles.healthCompactActions}>
                    {hasRepairableScheduleConflict && (
                      <button
                        type="button"
                        className={styles.quickFixCta}
                        disabled={applyInProgress || draftVisitCount === 0}
                        onClick={handleAutoFixSchedule}
                      >
                        <Wand2 size={14} aria-hidden="true" />
                        Tự xếp lại giờ khớp di chuyển
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.toolButtonCompact}
                      disabled={previewState.status === "CHECKING" || applyInProgress}
                      onClick={() => void handleCheck()}
                    >
                      <RefreshCw
                        size={13}
                        className={previewState.status === "CHECKING" ? "animate-spin" : undefined}
                        aria-hidden="true"
                      />
                      {previewState.status === "CHECKING" ? "Đang kiểm tra…" : "Kiểm tra lại"}
                    </button>
                  </div>
                </div>

                {(previewState.status === "FAILED" ||
                  previewState.status === "NETWORK_ERROR" ||
                  previewState.status === "TIMEOUT") && (
                  <div role="alert" style={{ display: "grid", gap: 8 }}>
                    <p className={styles.errorText}>
                      {previewState.status === "FAILED" && previewState.error
                        ? previewState.error.message
                        : previewState.status === "NETWORK_ERROR"
                          ? "Mất kết nối khi kiểm tra. Bản nháp vẫn được giữ lại; hãy thử lại."
                          : "Kiểm tra quá thời gian chờ. Bản nháp vẫn được giữ lại; hãy thử lại."}
                    </p>
                  </div>
                )}

                {previewState.status === "PREVIEWED" && previewState.result && validationGroupSummary && (
                  <details className={styles.healthDetails}>
                    <summary className={styles.healthDetailsSummary}>
                      <span>Chi tiết kiểm tra ({mappedValidation.jumpItems.length} mục)</span>
                      <ChevronDown size={15} aria-hidden="true" />
                    </summary>
                    <div className={styles.healthDetailsBody}>
                      <div className={styles.healthStrip}>
                        {validationGroupSummary.chips.map((chip) => (
                          <div
                            key={chip.key}
                            className={
                              chip.status === "SATISFIED"
                                ? styles.healthChipOk
                                : chip.status === "INSUFFICIENT_DATA"
                                  ? styles.healthChipWarn
                                  : styles.healthChipBad
                            }
                          >
                            <span className={styles.healthChipLabel}>{chip.label}</span>
                            <strong>
                              {chip.status === "SATISFIED"
                                ? "Đạt"
                                : chip.status === "INSUFFICIENT_DATA"
                                  ? "Chưa rõ"
                                  : "Cần sửa"}
                            </strong>
                          </div>
                        ))}
                      </div>

                      {previewCanConfirm &&
                        !previewState.result.validation.canConfirm &&
                        uncheckedItems.length > 0 && (
                          <div className={styles.warningBanner}>
                            <p style={{ margin: "0 0 8px" }}>
                              Các mục còn thiếu dữ liệu đều thuộc địa điểm ngoài danh mục. Hãy mở hộp thoại xác nhận để rà soát và xác nhận trước khi lưu.
                            </p>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              disabled={!editDirty || applyInProgress}
                              onClick={() => setConfirmOpen(true)}
                            >
                              <Save size={15} aria-hidden="true" />
                              Xác nhận mục chưa kiểm &amp; Lưu
                            </button>
                          </div>
                        )}

                      {mappedValidation.jumpItems.length > 0 && (
                        <div>
                          <p className={styles.fixedNote}>
                            Bấm vào mục lỗi để nhảy tới vị trí cần sửa:
                          </p>
                          <ul className={styles.jumpList}>
                            {mappedValidation.jumpItems.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  className={styles.jumpBtn}
                                  onClick={() => jumpToDomTarget(item.targetDomId)}
                                >
                                  <strong>{item.label}:</strong> {item.message}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {editDirty && (
                  <details className={styles.healthDetails}>
                    <summary className={styles.healthDetailsSummary}>
                      <span>Tóm tắt thay đổi ({changeCount})</span>
                      <ChevronDown size={15} aria-hidden="true" />
                    </summary>
                    <ul className={styles.diffList} style={{ paddingTop: 8 }}>
                      {currentDiff.added.map((v) => (
                        <li key={`add-${v.visitId}`}>
                          <strong>Thêm:</strong> {labelForDestination(v.destinationId)} (Ngày {v.dayIndex} · {minuteLabel(v.startMinute)})
                        </li>
                      ))}
                      {currentDiff.removed.map((v) => (
                        <li key={`rem-${v.visitId}`}>
                          <strong>Xóa:</strong> {labelForDestination(v.destinationId)} (Ngày {v.dayIndex})
                        </li>
                      ))}
                      {currentDiff.updated.map((u) => (
                        <li key={`upd-${u.visitId}`}>
                          <strong>Điều chỉnh:</strong> {labelForDestination(u.after.destinationId)} (Ngày {u.after.dayIndex} · {minuteLabel(u.after.startMinute)} · {u.after.plannedDurationMinutes} phút)
                        </li>
                      ))}
                      {journeyDiff && (
                        <li key="upd-journey">
                          <strong>Xuất phát / giờ đi–về:</strong> Đã cập nhật thông tin xuất phát hoặc giờ khởi hành / hạn về
                        </li>
                      )}
                    </ul>
                  </details>
                )}

                {applyState.validation && (
                  <div role="alert" style={{ marginTop: 6 }}>
                    <p className={styles.errorText}>{applyState.error?.message}</p>
                    {applyFallbackItems.length > 0 && (
                      <ul className={styles.jumpList} style={{ marginTop: 8 }}>
                        {applyFallbackItems.map((item) => (
                          <li key={`apply-${item.id}`}>
                            <button
                              type="button"
                              className={styles.jumpBtn}
                              onClick={() => jumpToDomTarget(item.targetDomId)}
                            >
                              <strong>{item.label}:</strong> {item.message}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              <div className={`${styles.sidePanel} ${styles.sidePanelMap}`}>
                <ItineraryMap
                  day={activePlannerDay}
                  days={plannerDays}
                  selectedDestinationId={selectedDestinationId}
                  focusSelection={focusSelection}
                  onSelect={(id) => {
                    setSelectedDestinationId(id || null);
                    setFocusSelection(Boolean(id));
                  }}
                  overviewOnly={activeDayIndex === null}
                />
              </div>

              <details className={`${styles.sidePanel} ${styles.weatherAccordion}`}>
                <summary className={styles.weatherSummary}>
                  <div>
                    <strong>Thời tiết và giờ mặt trời</strong>
                    <span className={styles.weatherSummaryHint}>
                      {plannerDays.length} ngày · Bấm xem dự báo theo chặng
                    </span>
                  </div>
                  <ChevronDown size={16} className={styles.weatherChevron} aria-hidden="true" />
                </summary>
                <div className={styles.weatherAccordionBody}>
                  <TripWeatherPanel days={plannerDays} />
                </div>
              </details>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>

      {aiBarState.kind === "APPLIED" && !desktopSplit && mobileTab === "assistant" && (
        <div className={styles.mobileAiJumpBanner} role="status" aria-live="polite">
          <span className={styles.mobileAiJumpText}>Đã cập nhật bản nháp</span>
          <div className={styles.mobileAiJumpActions}>
            <button
              type="button"
              className={styles.toolButtonCompact}
              onClick={() => handleJumpToTabFromAi("timeline")}
            >
              Xem lịch trình
            </button>
            <button
              type="button"
              className={styles.toolButtonCompact}
              onClick={() => handleJumpToTabFromAi("map")}
            >
              Bản đồ
            </button>
            {workspace.undoStack.length > 0 &&
              lastAiChange !== null &&
              areEditCandidatesEqual(workingDraft, lastAiChange.appliedDraft) && (
                <button
                  type="button"
                  className={styles.toolButtonCompact}
                  disabled={applyInProgress}
                  onClick={handleUndoAiStep}
                >
                  <Undo2 size={13} aria-hidden="true" />
                  Hoàn tác
                </button>
              )}
          </div>
        </div>
      )}

      {editDirty && (
        <div className={styles.mobileBottomBar}>
          <span className={`${styles.statusBadge} ${styles.statusDirty}`}>
            {changeCount} thay đổi chưa lưu
          </span>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!previewCanConfirm || applyInProgress}
            onClick={() => setConfirmOpen(true)}
          >
            <Save size={15} aria-hidden="true" />
            Lưu thay đổi
          </button>
        </div>
      )}

      <dialog
        ref={confirmDialogRef}
        className={styles.confirmDialog}
        aria-labelledby="edit-confirm-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && !applyInProgress) {
            setConfirmOpen(false);
          }
        }}
        onCancel={(event) => {
          if (applyInProgress) event.preventDefault();
          else setConfirmOpen(false);
        }}
      >
        <div className={styles.confirmDialogHeader}>
          <div className={styles.confirmDialogHeaderText}>
            <h2 id="edit-confirm-dialog-title">Xác nhận lưu thay đổi?</h2>
            <p className={styles.fixedNote}>
              Thay đổi bên dưới sẽ ghi đè vào lịch trình đã lưu sau khi kiểm tra hợp lệ trên máy chủ.
            </p>
          </div>
          <button
            type="button"
            className={styles.confirmDialogCloseBtn}
            aria-label="Đóng hộp thoại xác nhận"
            disabled={applyInProgress}
            onClick={() => setConfirmOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.confirmDiffBox}>
          <ul className={styles.confirmDiffList}>
            {currentDiff.added.map((v) => (
              <li key={`c-add-${v.visitId}`} className={styles.confirmDiffItem}>
                <span className={styles.confirmDiffTagAdd}>Thêm</span>
                <span>
                  <strong>{labelForDestination(v.destinationId)}</strong> · Ngày {v.dayIndex} · {minuteLabel(v.startMinute)}
                </span>
              </li>
            ))}
            {currentDiff.removed.map((v) => (
              <li key={`c-rem-${v.visitId}`} className={styles.confirmDiffItem}>
                <span className={styles.confirmDiffTagRemove}>Xóa</span>
                <span>
                  <strong>{labelForDestination(v.destinationId)}</strong> · Ngày {v.dayIndex}
                </span>
              </li>
            ))}
            {currentDiff.updated.map((u) => (
              <li key={`c-upd-${u.visitId}`} className={styles.confirmDiffItem}>
                <span className={styles.confirmDiffTagEdit}>Sửa</span>
                <span>
                  <strong>{labelForDestination(u.after.destinationId)}</strong> · Ngày {u.after.dayIndex} · {minuteLabel(u.after.startMinute)} ({u.after.plannedDurationMinutes} phút)
                </span>
              </li>
            ))}
            {journeyDiff && (
              <li key="c-upd-journey" className={styles.confirmDiffItem}>
                <span className={styles.confirmDiffTagJourney}>Xuất phát</span>
                <span>Cập nhật nơi xuất phát hoặc giờ khởi hành / hạn về</span>
              </li>
            )}
          </ul>
        </div>

        {hasCompanionPublication && (
          <p className={styles.companionNotice}>
            Lưu ý: Chuyến đi này đang mở nhóm Tìm bạn đồng hành. Sau khi lưu, hệ thống sẽ tự gửi thông báo cập nhật lịch trình vào nhóm.
          </p>
        )}

        {uncheckedItems.length > 0 && (
          <div className={styles.warningBanner} role="region" aria-label="Xác nhận mục ngoài danh mục chưa kiểm">
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
              Chuyến đi còn địa điểm ngoài danh mục — KLTN chưa thể kiểm tra các mục sau (không được tính là đã đạt):
            </p>
            <ul className={styles.diffList} style={{ marginBottom: 10 }}>
              {uncheckedItems.map((item) => (
                <li key={`${item.check}|${item.reasonCode}|${item.placeId}`}>
                  <strong>{labelForDestination(item.placeId)}:</strong> {uncheckedItemLabel(item)}
                </li>
              ))}
            </ul>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={uncheckedAckConfirmed}
                disabled={applyInProgress}
                onChange={(event) => setUncheckedAckConfirmed(event.target.checked)}
              />
              Tôi đã đọc và xác nhận lưu lịch trình kèm các mục chưa kiểm tra này.
            </label>
          </div>
        )}

        {applyState.status === "FAILED" && applyState.error && (
          <p className={styles.errorText} role="alert" style={{ marginTop: 12 }}>
            {applyState.error.message}
          </p>
        )}

        {applyState.status === "UNKNOWN" && (
          <p className={styles.errorText} role="alert" style={{ marginTop: 12 }}>
            Chưa xác định được kết quả lưu. Hãy bấm &ldquo;Kiểm tra lại kết quả&rdquo; để đối soát bằng cùng yêu cầu đã xác nhận.
          </p>
        )}

        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.cancelButton}
            disabled={applyInProgress}
            onClick={() => setConfirmOpen(false)}
          >
            Quay lại sửa
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={
              applyState.status === "SENDING" ||
              (uncheckedItems.length > 0 &&
                applyState.status !== "UNKNOWN" &&
                !uncheckedAckConfirmed)
            }
            onClick={() => void handleApply()}
          >
            {applyState.status === "SENDING" && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
            {applyState.status === "UNKNOWN" ? (
              <>
                <RotateCcw size={15} aria-hidden="true" />
                Kiểm tra lại kết quả
              </>
            ) : applyState.status === "SENDING" ? (
              "Đang lưu…"
            ) : (
              <>
                <CheckCircle2 size={15} aria-hidden="true" />
                Xác nhận & Lưu
              </>
            )}
          </button>
        </div>
      </dialog>

      <dialog
        ref={conflictDialogRef}
        className={styles.confirmDialog}
        aria-labelledby="edit-conflict-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && conflictState?.status !== "LOADING") {
            setConflictState(null);
          }
        }}
        onCancel={(event) => {
          if (conflictState?.status === "LOADING") event.preventDefault();
          else setConflictState(null);
        }}
      >
        <div className={styles.confirmDialogHeader}>
          <div className={styles.confirmDialogHeaderText}>
            <h2 id="edit-conflict-dialog-title">Hành trình đã có phiên bản mới hơn</h2>
            <p className={styles.fixedNote}>
              Lịch trình đã lưu vừa thay đổi ở một phiên làm việc khác. Toàn bộ chỉnh sửa trong bản nháp hiện tại của bạn vẫn đang được giữ nguyên.
            </p>
          </div>
          <button
            type="button"
            className={styles.confirmDialogCloseBtn}
            aria-label="Đóng hộp thoại xung đột"
            disabled={conflictState?.status === "LOADING"}
            onClick={() => setConflictState(null)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {conflictState?.status === "LOADING" && (
          <p className={styles.fixedNote} style={{ marginTop: 12 }} role="status">
            Đang tải phiên bản mới nhất để đối chiếu…
          </p>
        )}

        {conflictState?.status === "ERROR" && (
          <div role="alert" style={{ marginTop: 12 }}>
            <p className={styles.errorText}>{conflictState.message}</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConflictState(null)}
              >
                Đóng (giữ bản nháp)
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void openConflictRebaseFlow()}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Thử tải lại phiên bản mới
              </button>
            </div>
          </div>
        )}

        {conflictState?.status === "READY" && (
          <>
            {conflictState.snapshot.tripStatus === "COMPLETED" && (
              <p className={styles.errorText} role="alert" style={{ marginTop: 12 }}>
                Lưu ý: Chuyến đi này hiện đã chuyển sang trạng thái hoàn thành nên không còn cho phép lưu thay đổi mới.
              </p>
            )}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleDiscardConflict}
              >
                Bỏ nháp &amp; dùng bản mới nhất
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={conflictState.snapshot.tripStatus === "COMPLETED"}
                onClick={handleRebaseConflict}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Rebase bản nháp lên phiên bản mới
              </button>
            </div>
          </>
        )}
      </dialog>

      <AddVisitDrawer
        open={drawerTarget !== null}
        targetDayIndex={drawerTarget?.dayIndex ?? null}
        targetLocalDate={drawerTarget !== null ? tripDayDate(workingDraft.startDate, drawerTarget.dayIndex) : null}
        targetDayVisits={
          drawerTarget !== null
            ? (workingDraft.days.find((d) => d.dayIndex === drawerTarget.dayIndex)?.visits ?? [])
            : []
        }
        catalogMeta={catalogMeta}
        returnFocusTo={drawerOpener}
        eyebrowText={
          drawerTarget?.kind === "replace"
            ? instantChecks.unavailableVisits.some((u) => u.visitId === drawerTarget.visitId)
              ? `Thay thế điểm không khả dụng (Ngày ${drawerTarget.dayIndex})`
              : `Đổi điểm dừng (Ngày ${drawerTarget.dayIndex})`
            : undefined
        }
        confirmLabel={
          drawerTarget?.kind === "replace"
            ? `Thay vào Ngày ${drawerTarget.dayIndex}`
            : undefined
        }
        onClose={() => setDrawerTarget(null)}
        onConfirmAdd={handleConfirmAddVisit}
      />
    </main>
  );
}
