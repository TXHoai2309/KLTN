"use client";

import { Button } from "@KLTN/ui/components/button";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Compass,
  Gauge,
  LoaderCircle,
  MapPinned,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { formatVietnameseDate } from "@/lib/date-only";
import { COMPANION_OPTIONS, INTEREST_OPTIONS, PACE_OPTIONS } from "@/modules/trip-requirement/trip-requirement-contract";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { analyzeTripNeeds } from "@/lib/preference-extraction-client";
import {
  applyExtractionToForm,
  dismissExtractionSuggestion,
  removeExtractionSuggestion,
  useExtractionSuggestion,
  type ExtractionSuggestion,
  type ExtractionSuggestionField,
  type ExtractionSuggestions,
} from "@/modules/preference-extraction/apply-extraction";
import type { ClarificationRequest } from "@/modules/trip-requirement/trip-clarification-rules";
import NaturalLanguageInput, { type NaturalLanguageInputStatus } from "./natural-language-input";
import TripReviewDialog from "./trip-review-dialog";
import TripPlannerFlow from "@/components/trip-planner/trip-planner-screen";
import { isTripSaveNavigationLocked, type SaveState } from "@/modules/trip-save/trip-save-state";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";
import {
  draftFromFormFields,
  draftToFormFields,
  type TripRequirementReviewDraft,
  type ConfirmedTripRequirement,
} from "@/modules/trip-requirement/trip-requirement-review";
import {
  buildPayload,
  decideEvaluateResponse,
  getSubmitButtonState,
  shouldApplyRequestResponse,
  validateRequiredFields,
  type TripRequirementFormFields,
} from "@/modules/trip-requirement/trip-requirement-form-logic";
import {
  CompanionsEditor,
  DurationEditor,
  InterestsEditor,
  MobilityEditor,
  PaceEditor,
  StartDateEditor,
  TransportEditor,
} from "./trip-field-editors";

type FieldErrors = Record<string, string>;

type TripFlowTab = "details" | "planner";

const FLOW_TABS: ReadonlyArray<{
  id: TripFlowTab;
  label: string;
  description: string;
  icon: typeof SlidersHorizontal;
}> = [
  { id: "details", label: "Thông tin chuyến đi", description: "Điền và kiểm tra trước khi tiếp tục", icon: SlidersHorizontal },
  { id: "planner", label: "Lịch trình đề xuất", description: "Khám phá hành trình của bạn", icon: MapPinned },
];

const FLOW_TAB_INDEX: Record<TripFlowTab, number> = {
  details: 0,
  planner: 1,
};

function FlowTabs({
  activeTab,
  plannerUnlocked,
  locked = false,
  onChange,
}: {
  activeTab: TripFlowTab;
  plannerUnlocked: boolean;
  locked?: boolean;
  onChange: (tab: TripFlowTab) => void;
}) {
  const isUnlocked = (tab: TripFlowTab) => tab === "details" || plannerUnlocked;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: TripFlowTab) {
    if (locked) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const start = FLOW_TAB_INDEX[tab];
    for (let offset = 1; offset <= FLOW_TABS.length; offset += 1) {
      const candidate = FLOW_TABS[(start + direction * offset + FLOW_TABS.length) % FLOW_TABS.length];
      if (candidate && isUnlocked(candidate.id)) {
        onChange(candidate.id);
        document.getElementById(`trip-tab-${candidate.id}`)?.focus();
        return;
      }
    }
  }

  return (
    <nav className="trip-flow-tabs" aria-label="Các bước lập hành trình">
      <div className="trip-flow-tablist" role="tablist" aria-label="Các bước lập hành trình">
        {FLOW_TABS.map((tab, index) => {
          const unlocked = isUnlocked(tab.id);
          const selected = activeTab === tab.id;
          const completed = unlocked && !selected && FLOW_TAB_INDEX[tab.id] < FLOW_TAB_INDEX[activeTab];
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`trip-tab-${tab.id}`}
              className="trip-flow-tab"
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`trip-tabpanel-${tab.id}`}
              aria-label={`${index + 1}. ${tab.label}: ${tab.description}`}
              disabled={locked || !unlocked}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? "true" : "false"}
              data-completed={completed ? "true" : "false"}
              data-locked={locked || !unlocked ? "true" : "false"}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
            >
              <span className="trip-flow-tab-icon" aria-hidden="true">
                {completed ? <Check size={17} /> : <Icon size={17} />}
              </span>
              <span className="trip-flow-tab-copy">
                <strong><span className="trip-flow-tab-index">0{index + 1}</span>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
              <span className="trip-flow-tab-state" aria-hidden="true">
                {selected ? "Đang ở đây" : completed ? "Đã xong" : unlocked ? "Mở" : "Chưa mở"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="trip-flow-tabs-hint" aria-live="polite">
        Bước {FLOW_TAB_INDEX[activeTab] + 1}/{FLOW_TABS.length} · {FLOW_TABS[FLOW_TAB_INDEX[activeTab]]?.description}
      </p>
    </nav>
  );
}

type EvaluationResult = {
  draft: TripRequirementReviewDraft;
  readiness: TripRequirementReadiness;
  clarificationRequests: ClarificationRequest[];
};

const INITIAL_FIELDS: TripRequirementFormFields = {
  startDate: "",
  durationDays: "",
  transport: "",
  companionType: "",
  companionGroupSize: "",
  interests: [],
  pace: "",
  mobilityFlags: [],
  mobilityNote: "",
};

const FIELD_LABELS: Record<string, string> = {
  startDate: "Ngày bắt đầu",
  durationDays: "Số ngày chuyến đi",
  transport: "Phương tiện di chuyển",
  "companions.type": "Loại nhóm đồng hành",
  "companions.groupSize": "Số người trong nhóm",
  interests: "Sở thích chuyến đi",
  pace: "Nhịp độ chuyến đi",
  "mobilityConstraints.flags": "Ràng buộc di chuyển",
  "mobilityConstraints.note": "Ghi chú di chuyển",
};

const ERROR_ORDER = [
  "durationDays",
  "transport",
  "startDate",
  "companions.type",
  "companions.groupSize",
  "interests",
  "pace",
  "mobilityConstraints.flags",
  "mobilityConstraints.note",
] as const;

function fieldErrorId(field: string): string {
  return `trip-error-${field.replaceAll(".", "-")}`;
}

function orderedErrors(errors: FieldErrors): Array<[string, string]> {
  const ordered: Array<[string, string]> = [];
  for (const field of ERROR_ORDER) {
    if (errors[field]) ordered.push([field, errors[field]]);
  }
  for (const [field, message] of Object.entries(errors)) {
    if (field !== "_form" && !ERROR_ORDER.includes(field as (typeof ERROR_ORDER)[number])) {
      ordered.push([field, message]);
    }
  }
  return ordered;
}

function fieldTargetId(field: string): string {
  return {
    durationDays: "trip-duration",
    transport: "trip-transport",
    startDate: "trip-start-date",
    "companions.type": "trip-companion-type",
    "companions.groupSize": "trip-group-size",
    interests: "trip-interest-first",
    pace: "trip-pace",
    "mobilityConstraints.flags": "trip-mobility-first",
    "mobilityConstraints.note": "trip-mobility-note",
  }[field] ?? "trip-form";
}

function AppliedSuggestionNote({
  suggestion,
  onDismiss,
}: {
  suggestion: ExtractionSuggestion;
  onDismiss: () => void;
}) {
  return (
    <div className="trip-ai-assigned-note" role="note">
      <div className="trip-ai-assigned-pill">
        <Sparkles size={13} aria-hidden="true" />
        <span>AI tự gán</span>
      </div>
      {suggestion.sourceText && (
        <span className="trip-ai-assigned-source">
          từ: “{suggestion.sourceText}”
        </span>
      )}
      <button
        type="button"
        className="trip-ai-assigned-dismiss"
        onClick={onDismiss}
        title="Bỏ gán trường này"
        aria-label="Bỏ gán trường này"
      >
        Bỏ gán
      </button>
    </div>
  );
}

function PendingSuggestionNote({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: ExtractionSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="trip-ai-pending-note" role="note">
      <div className="trip-ai-pending-pill">
        <Sparkles size={13} aria-hidden="true" />
        <span>Gợi ý từ mô tả: “{suggestion.sourceText}”</span>
      </div>
      <div className="trip-ai-pending-actions">
        <button type="button" className="trip-ai-pending-apply" onClick={onApply}>
          Dùng gợi ý này
        </button>
        <button type="button" className="trip-ai-pending-dismiss" onClick={onDismiss}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}

function clearFieldErrors(errors: FieldErrors, field: string): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => key !== field && !key.startsWith(`${field}.`)),
  );
}

export default function TripRequirementForm() {
  const [fields, setFields] = useState<TripRequirementFormFields>(INITIAL_FIELDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState<EvaluationResult | null>(null);
  const [planner, setPlanner] = useState<ConfirmedTripRequirement | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveLock = useRef(false);
  const saveNavigationLocked = isTripSaveNavigationLocked(saveState);
  const handleSaveStateChange = useCallback((state: SaveState) => {
    saveLock.current = isTripSaveNavigationLocked(state);
    setSaveState(state);
  }, []);
  const [activeTab, setActiveTab] = useState<TripFlowTab>("details");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [naturalLanguageStatus, setNaturalLanguageStatus] = useState<NaturalLanguageInputStatus>({ kind: "idle" });
  const [extractionSuggestions, setExtractionSuggestions] = useState<ExtractionSuggestions>({});
  const submissionLock = useRef(false);
  const naturalLanguageLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const naturalLanguageAbortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const naturalLanguageSequenceRef = useRef(0);
  const mountedRef = useRef(false);
  const focusFirstErrorRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const aiHelperRef = useRef<HTMLDetailsElement>(null);
  const reviewTriggerRef = useRef<HTMLElement | null>(null);
  const previousTabRef = useRef<TripFlowTab | null>(null);
  const [activeGroup, setActiveGroup] = useState<"core" | "style" | "notes">("core");

  useEffect(() => {
    if (activeTab !== "details") return;

    const handleScroll = () => {
      const coreEl = document.getElementById("trip-group-core-section");
      const styleEl = document.getElementById("trip-group-style-section");
      const notesEl = document.getElementById("trip-group-notes-section");

      if (!coreEl || !styleEl || !notesEl) return;

      const triggerPoint = window.innerHeight * 0.42;
      const notesTop = notesEl.getBoundingClientRect().top;
      const styleTop = styleEl.getBoundingClientRect().top;

      if (notesTop <= triggerPoint) {
        setActiveGroup("notes");
      } else if (styleTop <= triggerPoint) {
        setActiveGroup("style");
      } else {
        setActiveGroup("core");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "details") return;
    const targetRow = document.querySelector<HTMLElement>(`.trip-passport-row[data-group="${activeGroup}"]`);
    const listContainer = document.querySelector<HTMLElement>(".trip-passport-details-list");
    if (targetRow && listContainer) {
      const rowTop = targetRow.offsetTop;
      listContainer.scrollTo({ top: Math.max(0, rowTop - 20), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [activeGroup, activeTab]);

  function scrollToGroup(group: "core" | "style" | "notes") {
    const targetId =
      group === "core"
        ? "trip-group-core-section"
        : group === "style"
        ? "trip-group-style-section"
        : "trip-group-notes-section";
    const el = document.getElementById(targetId);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
      setActiveGroup(group);
    }
  }

  function scrollToField(fieldKey: string) {
    const targetId = fieldTargetId(fieldKey);
    const el = document.getElementById(targetId);
    if (el) {
      const yOffset = -100;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      (el.matches("input, textarea, button") ? el : el.querySelector<HTMLElement>("input, textarea, button"))?.focus({ preventScroll: true });
    }
  }

  function changeTab(nextTab: TripFlowTab) {
    if (saveLock.current) return;
    if (nextTab === activeTab) return;
    setTabDirection(FLOW_TAB_INDEX[nextTab] >= FLOW_TAB_INDEX[activeTab] ? "forward" : "backward");
    setActiveTab(nextTab);
  }

  function advanceTo(nextTab: TripFlowTab) {
    if (saveLock.current) return;
    setTabDirection(FLOW_TAB_INDEX[nextTab] >= FLOW_TAB_INDEX[activeTab] ? "forward" : "backward");
    setActiveTab(nextTab);
  }

  useEffect(() => {
    const previousTab = previousTabRef.current;
    previousTabRef.current = activeTab;
    if (previousTab === null || previousTab === activeTab) return;
    window.setTimeout(() => {
      const panel = document.getElementById(`trip-tabpanel-${activeTab}`);
      panel?.querySelector<HTMLElement>("h1, h2, [data-trip-panel-heading]")?.focus();
    }, 0);
  }, [activeTab]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      naturalLanguageAbortRef.current?.abort();
      naturalLanguageSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!focusFirstErrorRef.current) return;
    focusFirstErrorRef.current = false;
    const firstField = orderedErrors(errors)[0]?.[0];
    if (!firstField) return;
    const element = fieldRefs.current[firstField] ?? fieldRefs.current[firstField.split(".")[0]!];
    element?.focus();
  }, [errors]);

  function updateField<K extends keyof TripRequirementFormFields>(
    field: K,
    value: TripRequirementFormFields[K],
    errorField = String(field),
  ) {
    if (saveLock.current) return;
    const nextFields = { ...fields, [field]: value };
    if (review || planner) {
      setReview(null);
      setPlanner(null);
    }
    setFields(nextFields);
    setExtractionSuggestions((current) => removeExtractionSuggestion(current, errorField));
    if (hasSubmitted) {
      setErrors(validateRequiredFields(nextFields));
    } else if (touched.has(errorField)) {
      const nextValidation = validateRequiredFields(nextFields);
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, errorField);
        if (nextValidation[errorField]) nextErrors[errorField] = nextValidation[errorField];
        return nextErrors;
      });
    } else {
      setErrors((current) => clearFieldErrors(current, errorField));
    }
    setFeedback(null);
  }

  function handleFieldBlur(field: string) {
    setTouched((current) => new Set(current).add(field));
    const nextValidation = validateRequiredFields(fields);
    if (hasSubmitted || !nextValidation[field]) {
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, field);
        if (nextValidation[field]) nextErrors[field] = nextValidation[field];
        return nextErrors;
      });
    } else {
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, field);
        nextErrors[field] = nextValidation[field];
        return nextErrors;
      });
    }
  }

  function cancelNaturalLanguageAnalysis() {
    naturalLanguageSequenceRef.current += 1;
    naturalLanguageAbortRef.current?.abort();
    naturalLanguageAbortRef.current = null;
    releaseSubmission(naturalLanguageLock);
    if (mountedRef.current) setNaturalLanguageStatus({ kind: "idle" });
  }

  async function analyzeNaturalLanguage(normalizedText: string) {
    if (saveLock.current) return;
    if (!claimSubmission(naturalLanguageLock)) return;

    naturalLanguageAbortRef.current?.abort();
    const controller = new AbortController();
    naturalLanguageAbortRef.current = controller;
    const requestSequence = ++naturalLanguageSequenceRef.current;
    setNaturalLanguageStatus({ kind: "analyzing", message: "Đang phân tích nhu cầu…" });
    setExtractionSuggestions({});
    setReview(null);
    setPlanner(null);
    setFeedback(null);

    try {
      const outcome = await analyzeTripNeeds(normalizedText, controller.signal);
      if (saveLock.current || !shouldApplyRequestResponse(requestSequence, naturalLanguageSequenceRef.current, mountedRef.current)) return;

      if (outcome.kind === "SUCCESS") {
        const count = Object.values(outcome.result.fields).filter((field) => field.status === "EXTRACTED").length;
        const clarificationText = outcome.result.clarifications.length > 0
          ? `, ${outcome.result.clarifications.length} mục cần làm rõ`
          : "";
        const applied = applyExtractionToForm(fields, outcome.result);
        setFields(applied.fields);
        setExtractionSuggestions(applied.suggestions);
        if (aiHelperRef.current) aiHelperRef.current.open = false;
        advanceTo("details");
        window.requestAnimationFrame(() => scrollToField("durationDays"));
        setNaturalLanguageStatus({ kind: "success", message: `Đã nhận diện nhu cầu chuyến đi${clarificationText}.` });
        return;
      }

      if (outcome.kind === "NETWORK_ERROR") {
        setNaturalLanguageStatus({ kind: "failure", message: "Không thể kết nối tới dịch vụ phân tích. Bạn vẫn có thể nhập vào biểu mẫu bên dưới. Hãy thử lại." });
        return;
      }

      if (outcome.status === 401 || outcome.code === "UNAUTHENTICATED") {
        setNaturalLanguageStatus({ kind: "failure", message: "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại; bạn sẽ cần nhập lại nhu cầu." });
        window.location.assign(buildAuthLoginHref("/trips/new"));
        return;
      }
      if (outcome.status === 403 || outcome.code === "FORBIDDEN") {
        setNaturalLanguageStatus({ kind: "failure", message: authorizationFeedback(403) ?? outcome.message });
        return;
      }
      if (outcome.status === 400 || outcome.code === "VALIDATION_ERROR") {
        setNaturalLanguageStatus({ kind: "invalid", message: outcome.fieldErrors?.text ?? outcome.message });
        return;
      }
      setNaturalLanguageStatus({ kind: "failure", message: `${outcome.message} Hãy thử lại.` });
    } finally {
      releaseSubmission(naturalLanguageLock);
      if (shouldApplyRequestResponse(requestSequence, naturalLanguageSequenceRef.current, mountedRef.current)) {
        naturalLanguageAbortRef.current = null;
      }
    }
  }

  function handleUseExtractionSuggestion(field: ExtractionSuggestionField) {
    if (saveLock.current) return;
    const applied = useExtractionSuggestion(fields, extractionSuggestions, field);
    setFields(applied.fields);
    setExtractionSuggestions(applied.suggestions);
  }

  function handleFillAndEdit(reviewDraft: TripRequirementReviewDraft) {
    if (saveLock.current) return;
    setFields(draftToFormFields(reviewDraft));
    setExtractionSuggestions({});
    setReview(null);
    setPlanner(null);
    setReviewOpen(false);
    advanceTo("details");
  }

  function continueWithForm() {
    if (saveLock.current) return;
    if (aiHelperRef.current) aiHelperRef.current.open = false;
    advanceTo("details");
    scrollToField("durationDays");
  }

  function handleDismissExtractionSuggestion(field: ExtractionSuggestionField) {
    if (saveLock.current) return;
    const dismissed = dismissExtractionSuggestion(fields, extractionSuggestions, field);
    setFields(dismissed.fields);
    setExtractionSuggestions(dismissed.suggestions);
  }

  async function submit() {
    if (saveLock.current) return;
    if (!claimSubmission(submissionLock)) return;

    const clientErrors = validateRequiredFields(fields);
    if (Object.keys(clientErrors).length > 0) {
      setHasSubmitted(true);
      setErrors(clientErrors);
      setFeedback(null);
      focusFirstErrorRef.current = true;
      releaseSubmission(submissionLock);
      return;
    }

    reviewTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (naturalLanguageAbortRef.current) cancelNaturalLanguageAnalysis();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = ++sequenceRef.current;
    setPending(true);
    setFeedback(null);
    setErrors({});

    try {
      const response = await fetch("/api/trip-requirements/evaluate", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(fields)),
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const decision = decideEvaluateResponse({ kind: "http", status: response.status, body });
      if (saveLock.current || !shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) return;

      if (decision.action === "SUCCESS") {
        setReview({
          draft: draftFromFormFields(fields),
          readiness: decision.data.readiness,
          clarificationRequests: [],
        });
        setPlanner(null);
        setReviewOpen(true);
        return;
      }
      if (decision.action === "VALIDATION_ERROR") {
        setHasSubmitted(true);
        setErrors(decision.fieldErrors);
        setFeedback(decision.message);
        focusFirstErrorRef.current = true;
        return;
      }
      if (decision.action === "LOGIN") {
        setFeedback(decision.message);
        window.location.assign(buildAuthLoginHref("/trips/new"));
        return;
      }
      if (decision.action === "FORBIDDEN") {
        setFeedback(authorizationFeedback(403) ?? decision.message);
        return;
      }
      if ("message" in decision) setFeedback(decision.message);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) {
        const decision = decideEvaluateResponse({ kind: "network" });
        if ("message" in decision) setFeedback(decision.message);
      }
    } finally {
      releaseSubmission(submissionLock);
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) setPending(false);
    }
  }

  const button = getSubmitButtonState(pending);

  const formError = errors._form;
  const fieldErrorEntries = orderedErrors(errors);
  const appliedCount = Object.values(extractionSuggestions).filter(
    (suggestion) => suggestion?.status === "APPLIED",
  ).length;

  const filledCount = [
    fields.startDate.trim() !== "",
    fields.durationDays.trim() !== "",
    fields.transport.trim() !== "",
    fields.companionType.trim() !== "",
    fields.interests.length > 0,
    fields.pace.trim() !== "",
    fields.mobilityFlags.length > 0 || fields.mobilityNote.trim() !== "",
  ].filter(Boolean).length;
  const progressPercent = Math.round((filledCount / 7) * 100);

  const companionNames = Object.fromEntries(COMPANION_OPTIONS.map(option => [option.value, option.label]));
  const paceNames = Object.fromEntries(PACE_OPTIONS.map(option => [option.value, option.label]));
  const interestNames = Object.fromEntries(INTEREST_OPTIONS.map(option => [option.value, option.label]));

  return (
    <main className="trip-form-page" lang="vi" data-trip-step={activeTab}>
      <div className="trip-form-intro">
        <h1>Lập hành trình Hà Giang</h1>
        <p>Điền thông tin chuyến đi, kiểm tra lại và khám phá lịch trình phù hợp với bạn.</p>
      </div>

      <FlowTabs
        activeTab={activeTab}
        plannerUnlocked={planner !== null}
        locked={saveNavigationLocked}
        onChange={changeTab}
      />

      <div className="trip-flow-viewport">
        <div
          id="trip-tabpanel-details"
          inert={saveNavigationLocked}
          className={`trip-flow-panel trip-flow-panel-${tabDirection}`}
          role="tabpanel"
          aria-labelledby="trip-tab-details"
          data-active={activeTab === "details" ? "true" : "false"}
          hidden={activeTab !== "details"}
        >
          <section className="trip-details-intro" aria-labelledby="trip-details-title">
            <div className="trip-section-heading">
              <div className="trip-heading-icon" aria-hidden="true"><SlidersHorizontal size={20} /></div>
              <div>
                <h2 id="trip-details-title" data-trip-panel-heading tabIndex={-1}>Thông tin chuyến đi</h2>
              </div>
            </div>
            <p>Chọn số ngày và phương tiện để bắt đầu. Bạn sẽ kiểm tra lại thông tin trong cửa sổ xác nhận trước khi xem lịch trình.</p>
            {appliedCount > 0 && (
              <div className="trip-ai-banner" role="status" aria-live="polite">
                <span className="trip-ai-banner-badge">
                  <Sparkles size={14} aria-hidden="true" />
                  AI đã tự gán {appliedCount} thông tin
                </span>
                <span className="trip-ai-banner-text">
                  Dữ liệu từ mô tả đã được tự động điền sẵn. Bạn chỉ cần hoàn thiện các ô còn lại bên dưới.
                </span>
              </div>
            )}
          </section>

          <details ref={aiHelperRef} className="trip-ai-helper">
            <summary><Sparkles size={18} aria-hidden="true" />Muốn điền nhanh bằng AI?</summary>
            <NaturalLanguageInput
              status={naturalLanguageStatus}
              onAnalyze={(text) => { void analyzeNaturalLanguage(text); }}
              onCancel={cancelNaturalLanguageAnalysis}
              onContinueManually={continueWithForm}
            />
          </details>

          <form className="trip-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
            {fieldErrorEntries.length > 0 && (
              <div className="trip-error-summary" role="alert" aria-live="polite">
                <p>Có {fieldErrorEntries.length} trường cần kiểm tra.</p>
                <ul>
                  {fieldErrorEntries.map(([field]) => (
                    <li key={field}>
                      <a href={`#${fieldTargetId(field)}`}>
                        {FIELD_LABELS[field] ?? field}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {formError && <p className="trip-form-error" role="alert">{formError}</p>}

            <div className="trip-details-columns">
              {/* Cột trái: Unified Form Deck cuộn độc lập */}
              <div className="trip-details-form-column">
                <div className="trip-unified-form-deck">
                  {/* Nhóm 1: Thông tin cốt lõi bắt buộc */}
                  <section id="trip-group-core-section" className="trip-form-section" aria-labelledby="trip-group-core-title">
                    <div className="trip-section-header">
                      <span className="trip-section-step-badge">01</span>
                      <div className="trip-section-header-text">
                        <h3 id="trip-group-core-title" className="trip-section-title">Thời gian & Phương tiện</h3>
                        <p className="trip-section-desc">Quyết định cung đường đèo và thời gian di chuyển lý tưởng</p>
                      </div>
                    </div>

                    <div className="trip-field-wrapper">
                      <StartDateEditor
                        inputRef={(element) => { fieldRefs.current.startDate = element; }}
                        value={fields.startDate}
                        onChange={(value) => updateField("startDate", value)}
                        onBlur={() => handleFieldBlur("startDate")}
                        error={errors.startDate}
                        errorId={fieldErrorId("startDate")}
                      />
                      {extractionSuggestions.startDate?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.startDate} onDismiss={() => handleDismissExtractionSuggestion("startDate")} />}
                      {extractionSuggestions.startDate?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.startDate} onApply={() => handleUseExtractionSuggestion("startDate")} onDismiss={() => handleDismissExtractionSuggestion("startDate")} />}
                    </div>

                    <div className="trip-field-wrapper">
                      <DurationEditor
                        inputRef={(element) => { fieldRefs.current.durationDays = element; }}
                        value={fields.durationDays}
                        onChange={(value) => updateField("durationDays", value)}
                        onBlur={() => handleFieldBlur("durationDays")}
                        error={errors.durationDays}
                        errorId={fieldErrorId("durationDays")}
                      />
                      {extractionSuggestions.durationDays?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.durationDays} onDismiss={() => handleDismissExtractionSuggestion("durationDays")} />}
                      {extractionSuggestions.durationDays?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.durationDays} onApply={() => handleUseExtractionSuggestion("durationDays")} onDismiss={() => handleDismissExtractionSuggestion("durationDays")} />}
                    </div>

                    <div className="trip-field-wrapper">
                      <TransportEditor
                        inputRef={(element) => { fieldRefs.current.transport = element; }}
                        value={fields.transport}
                        onChange={(value) => updateField("transport", value)}
                        onBlur={() => handleFieldBlur("transport")}
                        error={errors.transport}
                        errorId={fieldErrorId("transport")}
                      />
                      {extractionSuggestions.transport?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.transport} onDismiss={() => handleDismissExtractionSuggestion("transport")} />}
                      {extractionSuggestions.transport?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.transport} onApply={() => handleUseExtractionSuggestion("transport")} onDismiss={() => handleDismissExtractionSuggestion("transport")} />}
                    </div>
                  </section>

                  <div className="trip-section-divider" aria-hidden="true" />

                  {/* Nhóm 2: Đồng hành & Phong cách trải nghiệm */}
                  <section id="trip-group-style-section" className="trip-form-section" aria-labelledby="trip-group-style-title">
                    <div className="trip-section-header">
                      <span className="trip-section-step-badge">02</span>
                      <div className="trip-section-header-text">
                        <h3 id="trip-group-style-title" className="trip-section-title">Người đồng hành & Sở thích</h3>
                        <p className="trip-section-desc">Để AI cá nhân hóa điểm dừng chân và nhịp độ thư giãn</p>
                      </div>
                    </div>

                    <div className="trip-field-wrapper">
                      <CompanionsEditor
                        errorId={fieldErrorId("companions")}
                        typeRef={(element) => { if (!fieldRefs.current["companions.type"]) fieldRefs.current["companions.type"] = element; }}
                        groupSizeRef={(element) => { fieldRefs.current["companions.groupSize"] = element; }}
                        typeValue={fields.companionType}
                        groupSizeValue={fields.companionGroupSize}
                        onTypeChange={(value) => updateField("companionType", value, "companions.type")}
                        onGroupSizeChange={(value) => updateField("companionGroupSize", value, "companions.groupSize")}
                        onTypeBlur={() => handleFieldBlur("companions.type")}
                        onGroupSizeBlur={() => handleFieldBlur("companions.groupSize")}
                        typeError={errors["companions.type"]}
                        typeErrorId={fieldErrorId("companions.type")}
                        groupSizeError={errors["companions.groupSize"]}
                        groupSizeErrorId={fieldErrorId("companions.groupSize")}
                      />
                      <div className="trip-ai-note-group">
                        {extractionSuggestions.companionType?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.companionType} onDismiss={() => handleDismissExtractionSuggestion("companionType")} />}
                        {extractionSuggestions.companionType?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.companionType} onApply={() => handleUseExtractionSuggestion("companionType")} onDismiss={() => handleDismissExtractionSuggestion("companionType")} />}
                        {extractionSuggestions.companionGroupSize?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.companionGroupSize} onDismiss={() => handleDismissExtractionSuggestion("companionGroupSize")} />}
                        {extractionSuggestions.companionGroupSize?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.companionGroupSize} onApply={() => handleUseExtractionSuggestion("companionGroupSize")} onDismiss={() => handleDismissExtractionSuggestion("companionGroupSize")} />}
                      </div>
                    </div>

                    <div className="trip-field-wrapper">
                      <InterestsEditor
                        inputRef={(element) => { if (!fieldRefs.current.interests) fieldRefs.current.interests = element; }}
                        value={fields.interests}
                        onChange={(value) => updateField("interests", value)}
                        onBlur={() => handleFieldBlur("interests")}
                        error={errors.interests}
                        errorId={fieldErrorId("interests")}
                      />
                      {extractionSuggestions.interests?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.interests} onDismiss={() => handleDismissExtractionSuggestion("interests")} />}
                      {extractionSuggestions.interests?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.interests} onApply={() => handleUseExtractionSuggestion("interests")} onDismiss={() => handleDismissExtractionSuggestion("interests")} />}
                    </div>

                    <div className="trip-field-wrapper">
                      <PaceEditor
                        inputRef={(element) => { if (!fieldRefs.current.pace) fieldRefs.current.pace = element; }}
                        value={fields.pace}
                        onChange={(value) => updateField("pace", value)}
                        onBlur={() => handleFieldBlur("pace")}
                        error={errors.pace}
                        errorId={fieldErrorId("pace")}
                      />
                      {extractionSuggestions.pace?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.pace} onDismiss={() => handleDismissExtractionSuggestion("pace")} />}
                      {extractionSuggestions.pace?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.pace} onApply={() => handleUseExtractionSuggestion("pace")} onDismiss={() => handleDismissExtractionSuggestion("pace")} />}
                    </div>
                  </section>

                  <div className="trip-section-divider" aria-hidden="true" />

                  {/* Nhóm 3: Lưu ý & Ràng buộc di chuyển */}
                  <section id="trip-group-notes-section" className="trip-form-section" aria-labelledby="trip-group-notes-title">
                    <div className="trip-section-header">
                      <span className="trip-section-step-badge">03</span>
                      <div className="trip-section-header-text">
                        <h3 id="trip-group-notes-title" className="trip-section-title">Ràng buộc & Ghi chú thêm</h3>
                        <p className="trip-section-desc">Đảm bảo sức khỏe và điều kiện đặc thù trên các cung đường đèo</p>
                      </div>
                    </div>

                    <div className="trip-field-wrapper">
                      <MobilityEditor
                        errorId={fieldErrorId("mobilityConstraints")}
                        inputRef={(element) => { if (!fieldRefs.current["mobilityConstraints.flags"]) fieldRefs.current["mobilityConstraints.flags"] = element; }}
                        noteRef={(element) => { fieldRefs.current["mobilityConstraints.note"] = element; }}
                        flags={fields.mobilityFlags}
                        note={fields.mobilityNote}
                        onFlagsChange={(value) => updateField("mobilityFlags", value, "mobilityConstraints.flags")}
                        onNoteChange={(value) => updateField("mobilityNote", value, "mobilityConstraints.note")}
                        onFlagsBlur={() => handleFieldBlur("mobilityConstraints.flags")}
                        onNoteBlur={() => handleFieldBlur("mobilityConstraints.note")}
                        flagsError={errors["mobilityConstraints.flags"]}
                        flagsErrorId={fieldErrorId("mobilityConstraints.flags")}
                        noteError={errors["mobilityConstraints.note"]}
                        noteErrorId={fieldErrorId("mobilityConstraints.note")}
                      />
                      <div className="trip-ai-note-group">
                        {extractionSuggestions.mobilityFlags?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.mobilityFlags} onDismiss={() => handleDismissExtractionSuggestion("mobilityFlags")} />}
                        {extractionSuggestions.mobilityFlags?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.mobilityFlags} onApply={() => handleUseExtractionSuggestion("mobilityFlags")} onDismiss={() => handleDismissExtractionSuggestion("mobilityFlags")} />}
                        {extractionSuggestions.mobilityNote?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.mobilityNote} onDismiss={() => handleDismissExtractionSuggestion("mobilityNote")} />}
                        {extractionSuggestions.mobilityNote?.status === "PENDING" && <PendingSuggestionNote suggestion={extractionSuggestions.mobilityNote} onApply={() => handleUseExtractionSuggestion("mobilityNote")} onDismiss={() => handleDismissExtractionSuggestion("mobilityNote")} />}
                      </div>
                    </div>
                  </section>

                  {feedback && <p className="trip-form-feedback" role="alert">{feedback}</p>}

                  {/* Primary Action Button (Bottom of form) */}
                  <div className="trip-form-actions">
                    <Button type="submit" className="trip-submit-button" disabled={button.disabled} aria-busy={button.ariaBusy}>
                      {pending && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
                      {button.label}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Cột phải: Tóm tắt hành trình ghim cứng (Sticky Passport Card) */}
              <aside className="trip-details-sidebar" aria-label="Tóm tắt nhu cầu chuyến đi">
                <div className="trip-passport-card">
                  <div className="trip-passport-header">
                    <div className="trip-passport-eyebrow">HÀ GIANG ROADTRIP</div>
                    <h3 className="trip-passport-heading">Hành trình của bạn</h3>
                    <p className="trip-passport-subheading">Cập nhật trực tiếp khi bạn chọn</p>
                  </div>

                  <div className="trip-passport-progress-box">
                    <div className="trip-passport-progress-label">
                      <span>Trạng thái</span>
                      <strong>
                        {fields.durationDays && fields.transport
                          ? "Đủ điều kiện tạo đề xuất"
                          : "Cần chọn ngày & phương tiện"}
                      </strong>
                    </div>
                    <div className="trip-passport-progress-track">
                      <div
                        className="trip-passport-progress-fill"
                        style={{
                          width: fields.durationDays && fields.transport ? "100%" : "35%",
                        }}
                      />
                    </div>
                  </div>

                  <div className="trip-passport-details-list">
                    {/* Nhóm 1: Thời gian & Phương tiện */}
                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "core" ? "trip-passport-row-active" : ""}`}
                      data-group="core"
                      onClick={() => scrollToField("durationDays")}
                      title="Bấm để cuộn đến phần Thời lượng"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Clock size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Thời lượng</span>
                          {activeGroup === "core" && <span className="trip-passport-active-badge">Đang điền</span>}
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.durationDays ? `${fields.durationDays} ngày (${Number(fields.durationDays) > 1 ? `${fields.durationDays}N${Number(fields.durationDays) - 1}Đ` : "1 ngày"})` : "Chưa chọn"}
                        </strong>
                      </div>
                    </button>

                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "core" ? "trip-passport-row-active" : ""}`}
                      data-group="core"
                      onClick={() => scrollToField("startDate")}
                      title="Bấm để cuộn đến phần Khởi hành"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Calendar size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Khởi hành</span>
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.startDate ? formatVietnameseDate(fields.startDate) : "Chưa chọn ngày"}
                        </strong>
                      </div>
                    </button>

                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "core" ? "trip-passport-row-active" : ""}`}
                      data-group="core"
                      onClick={() => scrollToField("transport")}
                      title="Bấm để cuộn đến phần Phương tiện"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Compass size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Phương tiện</span>
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.transport === "MOTORCYCLE" ? "Xe máy phượt đèo" : fields.transport === "CAR" ? "Ô tô du lịch" : "Chưa chọn phương tiện"}
                        </strong>
                      </div>
                    </button>

                    {/* Nhóm 2: Đồng hành & Sở thích */}
                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "style" ? "trip-passport-row-active" : ""}`}
                      data-group="style"
                      onClick={() => scrollToField("companions.type")}
                      title="Bấm để cuộn đến phần Người đồng hành"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Users size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Đồng hành</span>
                          {activeGroup === "style" && <span className="trip-passport-active-badge">Đang điền</span>}
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.companionType ? `${companionNames[fields.companionType] ?? fields.companionType}${fields.companionGroupSize ? ` · ${fields.companionGroupSize} người` : ""}` : "Chưa chọn"}
                        </strong>
                      </div>
                    </button>

                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "style" ? "trip-passport-row-active" : ""}`}
                      data-group="style"
                      onClick={() => scrollToField("interests")}
                      title="Bấm để cuộn đến phần Sở thích"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Sparkles size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Sở thích ({fields.interests.length})</span>
                        </div>
                        <div className="trip-passport-interests-wrap">
                          {fields.interests.length > 0 ? (
                            fields.interests.map((item) => (
                              <span key={item} className="trip-passport-mini-tag">
                                {interestNames[item] ?? item}
                              </span>
                            ))
                          ) : (
                            <span className="trip-passport-dimmed">Chưa chọn sở thích</span>
                          )}
                        </div>
                      </div>
                    </button>

                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "style" ? "trip-passport-row-active" : ""}`}
                      data-group="style"
                      onClick={() => scrollToField("pace")}
                      title="Bấm để cuộn đến phần Nhịp độ"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <Gauge size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Nhịp độ</span>
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.pace ? (paceNames[fields.pace] ?? fields.pace) : "Chưa chọn nhịp độ"}
                        </strong>
                      </div>
                    </button>

                    {/* Nhóm 3: Ràng buộc & Ghi chú */}
                    <button type="button"
                      className={`trip-passport-row ${activeGroup === "notes" ? "trip-passport-row-active" : ""}`}
                      data-group="notes"
                      onClick={() => scrollToField("mobilityConstraints.flags")}
                      title="Bấm để cuộn đến phần Ràng buộc & Ghi chú"
                    >
                      <span className="trip-passport-row-icon-box" aria-hidden="true">
                        <AlertTriangle size={15} strokeWidth={2.2} />
                      </span>
                      <div className="trip-passport-row-content">
                        <div className="trip-passport-row-header-line">
                          <span className="trip-passport-row-label">Ràng buộc & Lưu ý</span>
                          {activeGroup === "notes" && <span className="trip-passport-active-badge">Đang điền</span>}
                        </div>
                        <strong className="trip-passport-row-val">
                          {fields.mobilityFlags.length > 0
                            ? `${fields.mobilityFlags.length} lưu ý sức khỏe/địa hình`
                            : fields.mobilityNote.trim()
                            ? "Có ghi chú riêng"
                            : "Không có ràng buộc đặc biệt"}
                        </strong>
                      </div>
                    </button>
                  </div>

                  <div className="trip-passport-action-box">
                    <Button
                      type="submit"
                      className="trip-submit-button trip-passport-submit-btn"
                      disabled={button.disabled}
                      aria-busy={button.ariaBusy}
                    >
                      {pending && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
                      {button.label}
                    </Button>
                    <p className="trip-passport-helper">
                      Chọn số ngày và phương tiện để xem lại nhu cầu. Các thông tin khác có thể bổ sung sau.
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            {/* Thanh điều hướng cố định trên thiết bị di động (Mobile Sticky Bar) */}
            <div className="trip-mobile-dock" aria-label="Tiến độ trên di động">
              <div className="trip-mobile-dock-info">
                <span className="trip-mobile-dock-progress">Đã cung cấp {filledCount}/7 mục</span>
                <span className="trip-mobile-dock-summary">
                  {fields.durationDays ? `${fields.durationDays} ngày` : "Chưa chọn số ngày"} · {fields.transport === "MOTORCYCLE" ? "Xe máy" : fields.transport === "CAR" ? "Ô tô" : "Chưa chọn xe"}
                </span>
              </div>
              <Button
                type="submit"
                className="trip-submit-button trip-mobile-dock-btn"
                disabled={button.disabled}
                aria-busy={button.ariaBusy}
              >
                {pending && <LoaderCircle className="trip-spinner" size={16} aria-hidden="true" />}
                {button.label}
              </Button>
            </div>
          </form>
        </div>

          {reviewOpen && review && (
            <TripReviewDialog
              returnFocusRef={reviewTriggerRef}
              draft={review.draft}
              readiness={review.readiness}
              clarificationRequests={review.clarificationRequests}
              onBackToForm={handleFillAndEdit}
              onConfirmed={(confirmed, confirmedDraft) => {
                if (saveLock.current) return;
                setFields(draftToFormFields(confirmedDraft));
                setReview({ ...review, draft: confirmedDraft });
                setPlanner(structuredClone(confirmed));
                setReviewOpen(false);
                advanceTo("planner");
              }}
            />
          )}

        <div
          id="trip-tabpanel-planner"
          className={`trip-flow-panel trip-flow-panel-${tabDirection}`}
          role="tabpanel"
          aria-labelledby="trip-tab-planner"
          data-active={activeTab === "planner" ? "true" : "false"}
          hidden={activeTab !== "planner"}
        >
          {planner && (
            <TripPlannerFlow
              embedded
              confirmed={planner}
              onSaveStateChange={handleSaveStateChange}
              onBack={() => {
                if (saveLock.current) return;
                setPlanner(null);
                advanceTo("details");
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
