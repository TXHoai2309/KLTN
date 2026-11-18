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
  CheckCircle2,
  Clock,
  Layers,
  LoaderCircle,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  Redo2,
  RefreshCw,
  Replace,
  RotateCcw,
  Route as RouteIcon,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import TripJourneyEditor from "@/components/trip-origin/trip-journey-editor";
import { getDestinationVisual } from "@/lib/destination-visuals";
import { createIdempotencyKey } from "@/lib/mutation-client";
import {
  applyTripEdit,
  extractCompletedVisitIdsFromDetails,
  fetchTripEditSnapshot,
  parseTripEditApplyValidation,
  previewTripEdit,
  requestAiTripEdit,
  type TripEditSnapshot,
} from "@/lib/trip-edit-client";
import type { EditResolution } from "@/modules/trip-edit/edit-clarification";
import {
  MAX_AI_HISTORY_TURN_CHARS,
  MAX_AI_HISTORY_TURNS,
} from "@/modules/trip-edit/ai-workspace-plan";
import AiEditBar, {
  type AiBarUiState,
  type AiConversationEntry,
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
  autoShiftDayVisits,
  formatLegMetricLabel,
  mapValidationToWorkspace,
  runInstantClientChecks,
} from "@/modules/trip-edit/edit-workspace-checks";
import { TripWeatherPanel } from "@/modules/trip-weather/trip-weather-panel";
import { TripValidationPanel } from "@/modules/trip-validation/trip-validation-panel";
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
}: Props) {
  const [liveTripStatus, setLiveTripStatus] = useState<TripStatus>(tripStatus);
  const [completedVisitIds, setCompletedVisitIds] = useState<string[]>(initialCompletedVisitIds);
  const completedVisitSet = useMemo(() => new Set(completedVisitIds), [completedVisitIds]);
  const [placeDetailsState, setPlaceDetailsState] = useState<Record<string, EditPlaceDetail>>(placeDetails);
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [drawerOpener, setDrawerOpener] = useState<HTMLElement | null>(null);
  const [autoShiftEnabled, setAutoShiftEnabled] = useState(false);
  const [autoShiftWarning, setAutoShiftWarning] = useState<string | null>(null);
  const [originEditorExpanded, setOriginEditorExpanded] = useState(Boolean(initialCandidate.journey));
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
  const [mobileTab, setMobileTab] = useState<"timeline" | "map">("timeline");
  const [timingDrafts, setTimingDrafts] = useState<Record<string, { startTime: string; duration: string }>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBarState, setAiBarState] = useState<AiBarUiState>({ kind: "IDLE" });
  const [aiThread, setAiThread] = useState<AiConversationEntry[]>([]);
  const aiTurnSeqRef = useRef(0);
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
    if (statusMessage) setAnnouncement(statusMessage);
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
  }

  async function handleAiSubmit(promptText: string, resolution?: EditResolution) {
    if (applyInProgress || liveTripStatus === "COMPLETED") return;
    const trimmed = promptText.trim();
    if (!trimmed) return;

    const requestedRevision = applyStateRef.current.baseRevision;
    const requestedDraft = workingRef.current;
    const boundedHistory = aiThread
      .slice(-MAX_AI_HISTORY_TURNS)
      .map((item) => ({
        role: item.role,
        content: [...item.text.trim()].slice(0, MAX_AI_HISTORY_TURN_CHARS).join(""),
      }))
      .filter((item) => item.content.length > 0);
    setAiOpen(true);
    setAiBarState({ kind: "LOADING", prompt: trimmed });

    const outcome = await requestAiTripEdit(tripId, {
      baseRevision: requestedRevision,
      message: trimmed,
      ...(resolution ? { resolution } : {}),
      draft: requestedDraft,
      ...(boundedHistory.length > 0 ? { history: boundedHistory } : {}),
    });

    if (outcome.kind === "TIMEOUT") {
      setAiBarState({
        kind: "ERROR",
        prompt: trimmed,
        ...(resolution ? { resolution } : {}),
        message: "Yêu cầu AI quá 15 giây nên đã dừng. Lịch trình và câu lệnh của bạn vẫn được giữ nguyên.",
        canRetry: true,
      });
      return;
    }

    if (outcome.kind === "NETWORK_ERROR") {
      setAiBarState({
        kind: "ERROR",
        prompt: trimmed,
        ...(resolution ? { resolution } : {}),
        message: "Mất kết nối mạng khi gọi AI. Câu lệnh của bạn vẫn được giữ nguyên để thử lại.",
        canRetry: true,
      });
      return;
    }

    if (outcome.kind === "FAILED") {
      if (outcome.code === "TRIP_REVISION_CONFLICT") {
        setAiBarState({ kind: "IDLE" });
        void openConflictRebaseFlow();
        return;
      }
      if (outcome.code === "COMPLETED_VISIT_CHANGED") {
        const lockedIds = extractCompletedVisitIdsFromDetails(outcome.details);
        if (lockedIds.length > 0) setCompletedVisitIds(lockedIds);
        setAiBarState({
          kind: "ERROR",
          prompt: trimmed,
          message: outcome.message,
          canRetry: false,
        });
        return;
      }
      setAiBarState({
        kind: "ERROR",
        prompt: trimmed,
        ...(resolution ? { resolution } : {}),
        message: outcome.message,
        canRetry: true,
      });
      return;
    }

    const result = outcome.result;
    const nextTurnPair = (
      kind: AiConversationEntry["kind"],
      assistantText: string,
    ): AiConversationEntry[] => {
      const userId = `u-${++aiTurnSeqRef.current}`;
      const assistantId = `a-${++aiTurnSeqRef.current}`;
      return [
        { id: userId, role: "user", text: trimmed },
        { id: assistantId, role: "assistant", kind, text: assistantText },
      ];
    };

    if (result.status === "NEEDS_CLARIFICATION") {
      setAiThread((prev) => [...prev, ...nextTurnPair("CLARIFYING", result.clarification.prompt)].slice(-16));
      setAiBarState({
        kind: "CLARIFYING",
        prompt: trimmed,
        clarification: result.clarification,
      });
      setAnnouncement(result.clarification.prompt);
      return;
    }

    if (result.status === "ADVISED") {
      setAiThread((prev) => [...prev, ...nextTurnPair("ADVISED", result.advice)].slice(-16));
      setAiBarState({
        kind: "ADVISED",
        advice: result.advice,
      });
      setAiInput("");
      setAnnouncement(result.advice);
      return;
    }

    if (result.addedPlaceDetails) {
      setPlaceDetailsState((current) => ({
        ...current,
        ...(result.addedPlaceDetails as Record<string, EditPlaceDetail>),
      }));
    }

    const summary = result.aiSummary ?? "AI đã cập nhật bản nháp hiện tại.";
    setAiThread((prev) => [...prev, ...nextTurnPair("APPLIED", summary)].slice(-16));
    setAiInput("");
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
    });
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
    return (
      placeDetailsState[destinationId]?.name
      ?? destinationLabels[destinationId]
      ?? "Điểm đến không còn khả dụng"
    );
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

  return (
    <main className={styles.page} lang="vi">
      <div className={styles.content}>
        <div className={styles.topNavRow}>
          <Link className={styles.backLink} href={`/trips/${tripId}` as Route}>
            <ArrowLeft size={16} aria-hidden="true" />
            Trở về hành trình
          </Link>
        </div>

        <header className={styles.workspaceHeader}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Không gian chỉnh sửa hành trình</p>
            <h1>Chỉnh sửa lịch trình {workspace.baseline.durationDays} ngày</h1>
            <div className={styles.metaChips}>
              <span className={styles.metaChip}>
                <CalendarDays size={14} aria-hidden="true" />
                {dateLabel(workspace.baseline.startDate)} – {dateLabel(savedEndDate)}
              </span>
              <span className={styles.metaChip}>
                <CarFront size={14} aria-hidden="true" />
                {workspace.baseline.transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô"}
              </span>
              <span className={styles.metaChip}>
                <MapPin size={14} aria-hidden="true" />
                {draftVisitCount} lượt tham quan
              </span>
            </div>
            <p className={styles.fixedNote}>
              Ngày bắt đầu, số ngày và phương tiện giữ cố định. Lịch trình đã lưu ({savedVisitCount} lượt) chỉ cập nhật sau khi bạn xác nhận lưu.
            </p>
          </div>

          <div className={styles.headerToolbar}>
            <span
              className={`${styles.statusBadge} ${editDirty ? styles.statusDirty : styles.statusSaved}`}
              role="status"
            >
              {editDirty ? `${changeCount} thay đổi chưa lưu` : "Đã lưu"}
            </span>
            <button
              type="button"
              className={styles.toolButton}
              disabled={applyInProgress || workspace.undoStack.length === 0}
              onClick={handleUndo}
              aria-label="Hoàn tác"
            >
              <Undo2 size={15} aria-hidden="true" />
              Hoàn tác
            </button>
            <button
              type="button"
              className={styles.toolButton}
              disabled={applyInProgress || workspace.redoStack.length === 0}
              onClick={handleRedo}
              aria-label="Làm lại"
            >
              <Redo2 size={15} aria-hidden="true" />
              Làm lại
            </button>
            {applyInProgress ? (
              <button className={styles.cancelButton} type="button" disabled>
                Hủy chỉnh sửa
              </button>
            ) : (
              <Link
                className={styles.cancelButton}
                href={`/trips/${tripId}` as Route}
                onPointerDown={(event) => {
                  if (event.button === 0) discardAndLeave();
                }}
                onKeyDown={handleCancelKeyDown}
              >
                Hủy chỉnh sửa
              </Link>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!editDirty || !previewCanConfirm || applyInProgress}
              onClick={() => setConfirmOpen(true)}
            >
              <Save size={15} aria-hidden="true" />
              Lưu thay đổi
            </button>
          </div>
        </header>

        <p className={styles.announcement} role="status" aria-live="polite">
          {announcement}
        </p>

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

        <div className={styles.mobileTabs} role="tablist" aria-label="Chuyển chế độ xem">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "timeline"}
            className={`${styles.mobileTabBtn} ${mobileTab === "timeline" ? styles.mobileTabActive : ""}`}
            onClick={() => setMobileTab("timeline")}
          >
            <CalendarDays size={15} aria-hidden="true" />
            Lịch trình
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "map"}
            className={`${styles.mobileTabBtn} ${mobileTab === "map" ? styles.mobileTabActive : ""}`}
            onClick={() => setMobileTab("map")}
          >
            <MapIcon size={15} aria-hidden="true" />
            Bản đồ ({draftVisitCount})
          </button>
        </div>

        <div className={`${styles.workspaceGrid} ${mobileTab === "timeline" ? styles.viewTimeline : styles.viewMap}`}>
          <section className={styles.timelineColumn} aria-label="Bản nháp chỉnh sửa theo ngày" inert={applyInProgress}>
            <AiEditBar
              open={aiOpen}
              onToggleOpen={() => setAiOpen((current) => !current)}
              inputValue={aiInput}
              onInputChange={setAiInput}
              disabled={applyInProgress}
              messages={aiThread}
              onClearHistory={() => {
                setAiThread([]);
                setAiBarState({ kind: "IDLE" });
              }}
              state={
                aiBarState.kind === "APPLIED"
                  ? {
                      ...aiBarState,
                      canUndo:
                        workspace.undoStack.length > 0 &&
                        lastAiChange !== null &&
                        areEditCandidatesEqual(workingDraft, lastAiChange.appliedDraft),
                    }
                  : aiBarState
              }
              onSubmitPrompt={(promptText, resolution) => {
                void handleAiSubmit(promptText, resolution);
              }}
              onRetry={handleAiRetry}
              onUndoAiStep={handleUndoAiStep}
              onDismissApplied={() => setAiBarState({ kind: "IDLE" })}
            />

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
              <span className={styles.fixedNote}>
                {previewState.status === "CHECKING"
                  ? "Đang đồng bộ kiểm tra máy chủ…"
                  : previewState.status === "PREVIEWED"
                    ? "Đã kiểm tra theo dữ liệu hiện hành"
                    : "Sửa trực tiếp — tự động kiểm tra sau khi dừng tay"}
              </span>
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
                                <h3>{label}</h3>
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

                            <div className={styles.visitControls} onClick={(e) => e.stopPropagation()}>
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

          <aside className={styles.sideColumn} aria-label="Bản đồ và kiểm tra tính hợp lệ">
            <div className={styles.sideSticky}>
              <div className={styles.sidePanel}>
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

              <section className={styles.sidePanel} aria-labelledby="validation-box-heading">
                <h2 id="validation-box-heading">Kiểm tra tính hợp lệ</h2>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={previewState.status === "CHECKING" || applyInProgress}
                  onClick={() => void handleCheck()}
                >
                  {previewState.status === "CHECKING" ? (
                    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Search size={16} aria-hidden="true" />
                  )}
                  {previewState.status === "CHECKING" ? "Đang kiểm tra…" : "Kiểm tra bản nháp"}
                </button>

                {(previewState.status === "FAILED" ||
                  previewState.status === "NETWORK_ERROR" ||
                  previewState.status === "TIMEOUT") && (
                  <div role="alert" style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <p className={styles.errorText}>
                      {previewState.status === "FAILED" && previewState.error
                        ? previewState.error.message
                        : previewState.status === "NETWORK_ERROR"
                          ? "Mất kết nối khi kiểm tra. Bản nháp vẫn được giữ lại; hãy thử lại."
                          : "Kiểm tra quá thời gian chờ. Bản nháp vẫn được giữ lại; hãy thử lại."}
                    </p>
                    <button
                      type="button"
                      className={styles.toolButton}
                      disabled={applyInProgress}
                      onClick={() => void handleCheck()}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      Kiểm tra lại
                    </button>
                  </div>
                )}

                {previewState.status === "PREVIEWED" && previewState.result && (
                  <>
                    <TripValidationPanel
                      validation={
                        previewState.result.validation.canConfirm
                          ? { ...previewState.result.validation, canConfirm: previewCanConfirm }
                          : previewState.result.validation
                      }
                      actionLabel="Mở xác nhận lưu"
                      onConfirm={() => setConfirmOpen(true)}
                      pending={applyState.status === "SENDING"}
                    />
                    {previewCanConfirm &&
                      !previewState.result.validation.canConfirm &&
                      uncheckedItems.length > 0 && (
                        <div className={styles.warningBanner} style={{ marginTop: 10 }}>
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
                        <p className={styles.fixedNote} style={{ marginTop: 10 }}>
                          Bấm vào mục lỗi để nhảy nhanh tới vị trí cần sửa:
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
                  </>
                )}

                {editDirty && (
                  <div>
                    <h3>Tóm tắt thay đổi ({changeCount})</h3>
                    <ul className={styles.diffList}>
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
                  </div>
                )}

                {applyState.validation && (
                  <div role="alert">
                    <p className={styles.errorText}>{applyState.error?.message}</p>
                    <TripValidationPanel validation={{ ...applyState.validation, canConfirm: false }} />
                  </div>
                )}
              </section>

              <div className={styles.sidePanel}>
                <TripWeatherPanel days={plannerDays} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className={styles.mobileBottomBar}>
        <span className={`${styles.statusBadge} ${editDirty ? styles.statusDirty : styles.statusSaved}`}>
          {editDirty ? `${changeCount} thay đổi` : "Đã lưu"}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!editDirty || !previewCanConfirm || applyInProgress}
          onClick={() => setConfirmOpen(true)}
        >
          <Save size={15} aria-hidden="true" />
          Lưu thay đổi
        </button>
      </div>

      <dialog
        ref={confirmDialogRef}
        className={styles.confirmDialog}
        aria-labelledby="edit-confirm-dialog-title"
        onCancel={(event) => {
          if (applyInProgress) event.preventDefault();
          else setConfirmOpen(false);
        }}
      >
        <h2 id="edit-confirm-dialog-title">Xác nhận lưu thay đổi?</h2>
        <p className={styles.fixedNote}>
          Thay đổi bên dưới sẽ ghi đè vào lịch trình đã lưu sau khi kiểm tra hợp lệ trên máy chủ.
        </p>

        <ul className={styles.diffList} style={{ marginTop: 12 }}>
          {currentDiff.added.map((v) => (
            <li key={`c-add-${v.visitId}`}>
              <strong>Thêm:</strong> {labelForDestination(v.destinationId)} · Ngày {v.dayIndex} · {minuteLabel(v.startMinute)}
            </li>
          ))}
          {currentDiff.removed.map((v) => (
            <li key={`c-rem-${v.visitId}`}>
              <strong>Xóa:</strong> {labelForDestination(v.destinationId)} · Ngày {v.dayIndex}
            </li>
          ))}
          {currentDiff.updated.map((u) => (
            <li key={`c-upd-${u.visitId}`}>
              <strong>Sửa:</strong> {labelForDestination(u.after.destinationId)} · Ngày {u.after.dayIndex} · {minuteLabel(u.after.startMinute)} ({u.after.plannedDurationMinutes} phút)
            </li>
          ))}
          {journeyDiff && (
            <li key="c-upd-journey">
              <strong>Xuất phát / giờ đi–về:</strong> Cập nhật nơi xuất phát hoặc giờ khởi hành / hạn về
            </li>
          )}
        </ul>

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
        onCancel={(event) => {
          if (conflictState?.status === "LOADING") event.preventDefault();
          else setConflictState(null);
        }}
      >
        <h2 id="edit-conflict-dialog-title">Hành trình đã có phiên bản mới hơn</h2>
        <p className={styles.fixedNote}>
          Lịch trình đã lưu vừa thay đổi ở một phiên làm việc khác. Toàn bộ chỉnh sửa trong bản nháp hiện tại của bạn vẫn đang được giữ nguyên.
        </p>

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
            ? `Thay thế điểm không khả dụng (Ngày ${drawerTarget.dayIndex})`
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
