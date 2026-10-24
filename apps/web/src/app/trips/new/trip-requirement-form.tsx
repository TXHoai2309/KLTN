"use client";

import { Button } from "@KLTN/ui/components/button";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  MapPinned,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

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
  confirmDraft,
  draftFromFormFields,
  draftToFormFields,
  type TripRequirementReviewDraft,
  type ConfirmedTripRequirement,
  type ReviewFieldKey,
} from "@/modules/trip-requirement/trip-requirement-review";
import type { CheckIssue } from "@/modules/trip-requirement/trip-requirement-check";
import { checkTripRequirement } from "@/lib/trip-requirement-check-client";
import {
  buildPayload,
  decideEvaluateResponse,
  decideSubmitRouting,
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
  icon: typeof SlidersHorizontal;
}> = [
  { id: "details", label: "Thông tin chuyến đi", icon: SlidersHorizontal },
  { id: "planner", label: "Lịch trình đề xuất", icon: MapPinned },
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
              aria-label={`${index + 1}. ${tab.label}`}
              disabled={locked || !unlocked}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? "true" : "false"}
              data-completed={completed ? "true" : "false"}
              data-locked={locked || !unlocked ? "true" : "false"}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
            >
              <span className="trip-flow-tab-icon" aria-hidden="true">
                {completed ? <Check size={16} /> : <Icon size={16} />}
              </span>
              <span className="trip-flow-tab-copy">
                <strong><span className="trip-flow-tab-index">0{index + 1}</span>{tab.label}</strong>
              </span>
              <span className="trip-flow-tab-state" aria-hidden="true">
                {selected ? "Đang ở đây" : completed ? "Đã xong" : unlocked ? "Mở" : "Chưa mở"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="trip-sr-only" aria-live="polite">
        Bước {FLOW_TAB_INDEX[activeTab] + 1}/{FLOW_TABS.length} · {FLOW_TABS[FLOW_TAB_INDEX[activeTab]]?.label}
      </p>
    </nav>
  );
}

type EvaluationResult = {
  draft: TripRequirementReviewDraft;
  readiness: TripRequirementReadiness | null;
  clarificationRequests: ClarificationRequest[];
  issues?: CheckIssue[];
  initialEditingKey?: ReviewFieldKey | null;
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
  durationDays: "Thời lượng chuyến đi",
  transport: "Phương tiện di chuyển",
  "companions.type": "Người đồng hành",
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

const companionNames = Object.fromEntries(COMPANION_OPTIONS.map(option => [option.value, option.label]));
const interestNames = Object.fromEntries(INTEREST_OPTIONS.map(option => [option.value, option.label]));

function getDockSummary(fields: TripRequirementFormFields): string {
  if (!fields.durationDays.trim() || !fields.transport.trim()) {
    return "Chọn số ngày và phương tiện để tiếp tục";
  }
  const parts: string[] = [];
  parts.push(`${fields.durationDays} ngày`);
  parts.push(fields.transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô");
  if (fields.interests.length > 0) {
    const first = interestNames[fields.interests[0]!] ?? fields.interests[0]!;
    parts.push(fields.interests.length > 1 ? `${first} +${fields.interests.length - 1}` : first);
  } else if (fields.companionType) {
    parts.push(companionNames[fields.companionType] ?? fields.companionType);
  }
  return parts.join(" · ");
}

function markAiFieldsInDraft(
  draft: TripRequirementReviewDraft,
  suggestions: ExtractionSuggestions,
) {
  if (suggestions.startDate?.status === "APPLIED") {
    draft.fields.startDate = { ...draft.fields.startDate, origin: "AI" };
  }
  if (suggestions.durationDays?.status === "APPLIED") {
    draft.fields.durationDays = { ...draft.fields.durationDays, origin: "AI" };
  }
  if (suggestions.transport?.status === "APPLIED") {
    draft.fields.transport = { ...draft.fields.transport, origin: "AI" };
  }
  if (suggestions.companionType?.status === "APPLIED" || suggestions.companionGroupSize?.status === "APPLIED") {
    draft.fields.companions = { ...draft.fields.companions, origin: "AI" };
  }
  if (suggestions.interests?.status === "APPLIED") {
    draft.fields.interests = { ...draft.fields.interests, origin: "AI" };
  }
  if (suggestions.pace?.status === "APPLIED") {
    draft.fields.pace = { ...draft.fields.pace, origin: "AI" };
  }
  if (suggestions.mobilityFlags?.status === "APPLIED" || suggestions.mobilityNote?.status === "APPLIED") {
    draft.fields.mobilityConstraints = { ...draft.fields.mobilityConstraints, origin: "AI" };
  }
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

  // AI helper section state: closed by default per PO decision
  const [aiSectionOpen, setAiSectionOpen] = useState(false);

  // Collapsible sections state: closed by default
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [specialNotesOpen, setSpecialNotesOpen] = useState(false);

  const submissionLock = useRef(false);
  const naturalLanguageLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const naturalLanguageAbortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const naturalLanguageSequenceRef = useRef(0);
  const mountedRef = useRef(false);
  const focusFirstErrorRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const reviewTriggerRef = useRef<HTMLElement | null>(null);
  const previousTabRef = useRef<TripFlowTab | null>(null);

  // Auto-open sections if they contain user or AI values
  const hasPersonalizeValues = Boolean(
    fields.companionType || fields.interests.length > 0 || fields.pace
  );
  const hasSpecialNotesValues = Boolean(
    fields.mobilityFlags.length > 0 || fields.mobilityNote.trim()
  );

  useEffect(() => {
    if (hasPersonalizeValues) setPersonalizeOpen(true);
  }, [hasPersonalizeValues]);

  useEffect(() => {
    if (hasSpecialNotesValues) setSpecialNotesOpen(true);
  }, [hasSpecialNotesValues]);

  function scrollToField(fieldKey: string) {
    if (fieldKey.startsWith("companions") || fieldKey === "interests" || fieldKey === "pace") {
      setPersonalizeOpen(true);
    }
    if (fieldKey.startsWith("mobilityConstraints")) {
      setSpecialNotesOpen(true);
    }
    window.requestAnimationFrame(() => {
      const targetId = fieldTargetId(fieldKey);
      const el = document.getElementById(targetId);
      if (el) {
        const yOffset = -100;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        (el.matches("input, textarea, button") ? el : el.querySelector<HTMLElement>("input, textarea, button"))?.focus({ preventScroll: true });
      }
    });
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
    if (firstField.startsWith("companions") || firstField === "interests" || firstField === "pace") {
      setPersonalizeOpen(true);
    }
    if (firstField.startsWith("mobilityConstraints")) {
      setSpecialNotesOpen(true);
    }
    window.requestAnimationFrame(() => {
      const element = fieldRefs.current[firstField] ?? fieldRefs.current[firstField.split(".")[0]!];
      element?.focus();
    });
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

  // Compatibility helper for preference-extraction-fixtures source contract
  function handleFillExtractionForm(result?: Parameters<typeof applyExtractionToForm>[1]) {
    if (saveLock.current || !result) return;
    const applied = applyExtractionToForm(fields, result);
    setFields(applied.fields);
    setExtractionSuggestions(applied.suggestions);
    advanceTo("details");
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
        const clarificationText = outcome.result.clarifications.length > 0
          ? `, ${outcome.result.clarifications.length} mục cần làm rõ`
          : "";
        const applied = applyExtractionToForm(fields, outcome.result);
        setFields(applied.fields);
        setExtractionSuggestions(applied.suggestions);

        // Auto-collapse AI helper section per PO decision
        setAiSectionOpen(false);

        // Auto-open sections if AI assigned values inside them
        if (applied.fields.companionType || applied.fields.interests.length > 0 || applied.fields.pace) {
          setPersonalizeOpen(true);
        }
        if (applied.fields.mobilityFlags.length > 0 || applied.fields.mobilityNote.trim()) {
          setSpecialNotesOpen(true);
        }

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
      const candidate = buildPayload(fields);
      const outcome = await checkTripRequirement(candidate as any, controller.signal);
      if (saveLock.current || !shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) return;

      if (outcome.kind === "NETWORK_ERROR") {
        setFeedback("Không thể kết nối tới máy chủ. Dữ liệu của bạn được giữ nguyên, hãy thử lại.");
        return;
      }

      if (outcome.kind === "FAILED") {
        if (outcome.status === 401) {
          setFeedback(outcome.message);
          window.location.assign(buildAuthLoginHref("/trips/new"));
          return;
        }
        if (outcome.status === 403) {
          setFeedback(authorizationFeedback(403) ?? outcome.message);
          return;
        }
        setFeedback(outcome.message);
        return;
      }

      // outcome.kind === "CHECKED"
      const checkResult = outcome.result;
      const hasUnreviewedAiAssignments = Object.values(extractionSuggestions).some(
        (s) => s?.status === "APPLIED",
      );
      const firstErr = checkResult.issues.find((issue) => issue.severity === "ERROR");

      const routing = decideSubmitRouting({
        hasUnreviewedAiAssignments,
        confirmable: checkResult.confirmable,
        clarificationRequestsCount: checkResult.clarificationRequests?.length ?? 0,
        firstErrorField: firstErr?.field,
      });

      // Only open review dialog in 3 cases per PO decision (2026-10-24):
      // (a) AI assigned field exists and has not been unassigned
      // (b) Server check is not confirmable or has mandatory clarifications
      // (c) Otherwise: skip review dialog and go directly to proposal!
      if (routing.action === "OPEN_REVIEW") {
        const draft = draftFromFormFields(fields);
        if (hasUnreviewedAiAssignments) {
          markAiFieldsInDraft(draft, extractionSuggestions);
        }

        setReview({
          draft,
          readiness: checkResult.readiness,
          clarificationRequests: checkResult.clarificationRequests || [],
          issues: checkResult.issues,
          initialEditingKey: routing.initialEditingKey as ReviewFieldKey | null,
        });
        setPlanner(null);
        setReviewOpen(true);
        return;
      }

      // Case (c): Pure manual entry or all AI unassigned, server confirmed -> Go directly to planner
      const confirmed = confirmDraft(draftFromFormFields(fields), checkResult, new Date());
      if (confirmed.confirmation.snapshot) {
        setPlanner(structuredClone(confirmed.confirmation.snapshot));
        setReviewOpen(false);
        advanceTo("planner");
      } else {
        setReview({
          draft: draftFromFormFields(fields),
          readiness: checkResult.readiness,
          clarificationRequests: checkResult.clarificationRequests || [],
          issues: checkResult.issues,
        });
        setPlanner(null);
        setReviewOpen(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) {
        setFeedback("Hệ thống chưa thể kiểm tra nhu cầu lúc này. Dữ liệu vẫn được giữ lại, hãy thử lại.");
      }
    } finally {
      releaseSubmission(submissionLock);
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) setPending(false);
    }
  }

  const button = getSubmitButtonState(pending);
  const canSubmit = Boolean(fields.durationDays.trim() && fields.transport.trim());
  const formError = errors._form;
  const fieldErrorEntries = orderedErrors(errors);
  const appliedCount = Object.values(extractionSuggestions).filter(
    (suggestion) => suggestion?.status === "APPLIED",
  ).length;

  return (
    <main className="trip-form-page" lang="vi" data-trip-step={activeTab}>
      <div className="trip-form-intro">
        <h1>Lập hành trình Hà Giang</h1>
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
          <h2 id="trip-details-title" data-trip-panel-heading tabIndex={-1} className="trip-sr-only">
            Thông tin chuyến đi
          </h2>

          {appliedCount > 0 && (
            <div className="trip-ai-banner" role="status" aria-live="polite">
              <span className="trip-ai-banner-badge">
                <Sparkles size={14} aria-hidden="true" />
                AI đã tự gán {appliedCount} thông tin
              </span>
              <span className="trip-ai-banner-text">
                Dữ liệu từ mô tả đã được tự động điền sẵn. Bạn có thể kiểm tra hoặc điều chỉnh bên dưới.
              </span>
            </div>
          )}

          <form className="trip-form trip-streamlined-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
            {fieldErrorEntries.length > 0 && (
              <div className="trip-error-summary" role="alert" aria-live="polite">
                <p>Có {fieldErrorEntries.length} trường cần kiểm tra:</p>
                <ul>
                  {fieldErrorEntries.map(([field]) => (
                    <li key={field}>
                      <a
                        href={`#${fieldTargetId(field)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToField(field);
                        }}
                      >
                        {FIELD_LABELS[field] ?? field}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {formError && <p className="trip-form-error" role="alert">{formError}</p>}

            {/* 1. Khối bắt buộc: Số ngày, Phương tiện & Ngày khởi hành tùy chọn */}
            <section className="trip-required-block" aria-labelledby="trip-required-heading">
              <h3 id="trip-required-heading" className="trip-sr-only">Thông tin bắt buộc</h3>

              <div className="trip-field-wrapper">
                <DurationEditor
                  inputRef={(element) => { fieldRefs.current.durationDays = element; }}
                  value={fields.durationDays}
                  onChange={(value) => updateField("durationDays", value)}
                  onBlur={() => handleFieldBlur("durationDays")}
                  error={errors.durationDays}
                  errorId={fieldErrorId("durationDays")}
                />
                {extractionSuggestions.durationDays?.status === "APPLIED" && (
                  <AppliedSuggestionNote suggestion={extractionSuggestions.durationDays} onDismiss={() => handleDismissExtractionSuggestion("durationDays")} />
                )}
                {extractionSuggestions.durationDays?.status === "PENDING" && (
                  <PendingSuggestionNote suggestion={extractionSuggestions.durationDays} onApply={() => handleUseExtractionSuggestion("durationDays")} onDismiss={() => handleDismissExtractionSuggestion("durationDays")} />
                )}
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
                {extractionSuggestions.transport?.status === "APPLIED" && (
                  <AppliedSuggestionNote suggestion={extractionSuggestions.transport} onDismiss={() => handleDismissExtractionSuggestion("transport")} />
                )}
                {extractionSuggestions.transport?.status === "PENDING" && (
                  <PendingSuggestionNote suggestion={extractionSuggestions.transport} onApply={() => handleUseExtractionSuggestion("transport")} onDismiss={() => handleDismissExtractionSuggestion("transport")} />
                )}
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
                {extractionSuggestions.startDate?.status === "APPLIED" && (
                  <AppliedSuggestionNote suggestion={extractionSuggestions.startDate} onDismiss={() => handleDismissExtractionSuggestion("startDate")} />
                )}
                {extractionSuggestions.startDate?.status === "PENDING" && (
                  <PendingSuggestionNote suggestion={extractionSuggestions.startDate} onApply={() => handleUseExtractionSuggestion("startDate")} onDismiss={() => handleDismissExtractionSuggestion("startDate")} />
                )}
              </div>
            </section>

            {/* 2. Thanh dưới: Trong DOM nằm sau khối bắt buộc để tabbing <= 4 lần, hiển thị fixed trên desktop */}
            {/* 2. Thanh dưới: Trong DOM nằm sau khối bắt buộc để tabbing <= 4 lần, hiển thị fixed trên desktop */}
            <div className="trip-bottom-dock" aria-label="Thao tác tạo lịch trình">
              <div className="trip-bottom-dock-inner">
                <div className="trip-bottom-dock-info">
                  <span className="trip-bottom-dock-summary">
                    {getDockSummary(fields)}
                  </span>
                  {!canSubmit && (
                    <span className="trip-bottom-dock-hint" aria-live="polite">
                      (Cần chọn số ngày và phương tiện)
                    </span>
                  )}
                </div>
                <Button
                  type="submit"
                  className="trip-submit-button trip-bottom-dock-btn"
                  disabled={button.disabled || !canSubmit}
                  aria-busy={button.ariaBusy}
                  title={!canSubmit ? "Vui lòng chọn số ngày và phương tiện để tiếp tục" : undefined}
                >
                  {pending && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
                  {button.label}
                </Button>
              </div>
            </div>

            {/* 3. Ô AI: Thu gọn mặc định, mở khi người dùng bấm, tự thu gọn sau khi điền */}
            <details
              className="trip-ai-accordion"
              open={aiSectionOpen}
              onToggle={(e) => setAiSectionOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="trip-ai-accordion-summary">
                <div className="trip-ai-accordion-header">
                  <Sparkles size={18} className="trip-ai-sparkle-icon" aria-hidden="true" />
                  <div className="trip-ai-accordion-titles">
                    <strong className="trip-ai-accordion-title">Muốn điền nhanh bằng AI?</strong>
                    <span className="trip-ai-accordion-sub">Gõ một câu, AI điền giúp bạn</span>
                  </div>
                </div>
                <div className="trip-ai-accordion-toggle">
                  <span className="trip-ai-accordion-state-label">{aiSectionOpen ? "Đóng" : "Mở"}</span>
                  <ChevronDown size={18} className="trip-ai-accordion-chevron" aria-hidden="true" />
                </div>
              </summary>
              <div className="trip-ai-accordion-body">
                <NaturalLanguageInput
                  status={naturalLanguageStatus}
                  onAnalyze={(text) => { void analyzeNaturalLanguage(text); }}
                  onCancel={cancelNaturalLanguageAnalysis}
                  onContinueManually={continueWithForm}
                />
              </div>
            </details>

            {/* 4. Hai mục thu gọn: Mặc định đóng, đều ghi rõ "Không bắt buộc" */}
            <div className="trip-optional-sections">
              {/* Mục thu gọn 1: Cá nhân hóa thêm */}
              <details
                className="trip-collapsible-section"
                open={personalizeOpen}
                onToggle={(e) => setPersonalizeOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="trip-collapsible-summary">
                  <div className="trip-collapsible-header">
                    <span className="trip-collapsible-title">Cá nhân hóa thêm</span>
                    <span className="trip-optional">Không bắt buộc</span>
                  </div>
                  <ChevronDown size={18} className="trip-collapsible-chevron" aria-hidden="true" />
                </summary>

                <div className="trip-collapsible-body">
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
                </div>
              </details>

              {/* Mục thu gọn 2: Lưu ý đặc biệt */}
              <details
                className="trip-collapsible-section"
                open={specialNotesOpen}
                onToggle={(e) => setSpecialNotesOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="trip-collapsible-summary">
                  <div className="trip-collapsible-header">
                    <span className="trip-collapsible-title">Lưu ý đặc biệt</span>
                    <span className="trip-optional">Không bắt buộc</span>
                  </div>
                  <ChevronDown size={18} className="trip-collapsible-chevron" aria-hidden="true" />
                </summary>

                <div className="trip-collapsible-body">
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
                </div>
              </details>
            </div>

            {feedback && <p className="trip-form-feedback" role="alert">{feedback}</p>}
          </form>
        </div>

        {reviewOpen && review && (
          <TripReviewDialog
            returnFocusRef={reviewTriggerRef}
            draft={review.draft}
            readiness={review.readiness}
            clarificationRequests={review.clarificationRequests}
            initialIssues={review.issues}
            initialEditingKey={review.initialEditingKey}
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
              onUpdateStartDate={(newDate) => {
                setFields((prev) => ({ ...prev, startDate: newDate }));
                if (planner) {
                  setPlanner({
                    ...planner,
                    requirement: { ...planner.requirement, startDate: newDate },
                  });
                }
              }}
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
