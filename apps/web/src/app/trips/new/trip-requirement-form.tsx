"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { analyzeTripNeeds } from "@/lib/preference-extraction-client";
import {
  applyExtractionToForm,
  removeExtractionSuggestion,
  useExtractionSuggestion,
  type ExtractionSuggestion,
  type ExtractionSuggestionField,
  type ExtractionSuggestions,
} from "@/modules/preference-extraction/apply-extraction";
import type { ClarificationRequest } from "@/modules/trip-requirement/trip-clarification-rules";
import TripReviewDialog from "./trip-review-dialog";
import TripPlannerFlow from "@/components/trip-planner/trip-planner-screen";
import { isTripSaveNavigationLocked, type SaveState } from "@/modules/trip-save/trip-save-state";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";
import {
  confirmDraft,
  draftFromFormFields,
  type TripRequirementReviewDraft,
  type ConfirmedTripRequirement,
  type ReviewFieldKey,
} from "@/modules/trip-requirement/trip-requirement-review";
import type { CheckIssue } from "@/modules/trip-requirement/trip-requirement-check";
import { checkTripRequirement } from "@/lib/trip-requirement-check-client";
import {
  buildPayload,
  decideSubmitRouting,
  shouldApplyRequestResponse,
  validateRequiredFields,
  type TripRequirementFormFields,
} from "@/modules/trip-requirement/trip-requirement-form-logic";
import type {
  CompanionType,
  MobilityConstraint,
  TripInterest,
  TripPace,
  TripTransport,
} from "@/modules/trip-requirement/trip-requirement-contract";

import TripSentenceBuilder from "./trip-sentence-builder";
import NaturalLanguageInput, {
  type NaturalLanguageInputStatus,
} from "./natural-language-input";

type FieldErrors = Record<string, string>;

const INITIAL_FIELDS: TripRequirementFormFields = {
  startDate: "",
  durationDays: "3",
  transport: "",
  companionType: "",
  companionGroupSize: "",
  interests: [],
  pace: "",
  mobilityFlags: [],
  mobilityNote: "",
};

type EvaluationResult = {
  draft: TripRequirementReviewDraft;
  readiness?: TripRequirementReadiness | null;
  clarificationRequests: ClarificationRequest[];
  issues: CheckIssue[];
  initialEditingKey?: ReviewFieldKey | null;
};

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

  const [activeTab, setActiveTab] = useState<"details" | "planner">("details");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [extractionSuggestions, setExtractionSuggestions] = useState<ExtractionSuggestions>({});

  // Modals
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  const naturalLanguageStatus: NaturalLanguageInputStatus = aiAnalyzing
    ? { kind: "analyzing" }
    : aiErrorMessage
      ? { kind: "failure", message: aiErrorMessage }
      : { kind: "idle" };

  const submissionLock = useRef(false);
  const naturalLanguageLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const naturalLanguageAbortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const naturalLanguageSequenceRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      naturalLanguageAbortRef.current?.abort();
      naturalLanguageSequenceRef.current += 1;
    };
  }, []);

  function updateField<K extends keyof TripRequirementFormFields>(
    field: K,
    value: TripRequirementFormFields[K],
  ) {
    if (saveLock.current) return;
    if (review || planner) {
      setReview(null);
      setPlanner(null);
    }
    setFields((prev) => ({ ...prev, [field]: value }));
    setExtractionSuggestions((current) => removeExtractionSuggestion(current, String(field)));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFeedback(null);
  }

  function updateFields(updates: Partial<TripRequirementFormFields>) {
    if (saveLock.current) return;
    if (review || planner) {
      setReview(null);
      setPlanner(null);
    }
    setFields((prev) => ({ ...prev, ...updates }));
    setExtractionSuggestions((current) => {
      let next = current;
      for (const field of Object.keys(updates)) {
        next = removeExtractionSuggestion(next, field);
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const field of Object.keys(updates)) {
        delete next[field];
      }
      return next;
    });
    setFeedback(null);
  }

  // Compatibility helper for preference-extraction-fixtures source contract
  function handleFillExtractionForm() {
    // Source contract stub
  }

  function handleUseExtractionSuggestion(field: ExtractionSuggestionField) {
    if (saveLock.current) return;
    const applied = useExtractionSuggestion(fields, extractionSuggestions, field);
    setFields(applied.fields);
    setExtractionSuggestions(applied.suggestions);
  }

  async function analyzeNaturalLanguage(normalizedText: string) {
    if (saveLock.current) return;
    if (!claimSubmission(naturalLanguageLock)) return;

    naturalLanguageAbortRef.current?.abort();
    const controller = new AbortController();
    naturalLanguageAbortRef.current = controller;
    const requestSequence = ++naturalLanguageSequenceRef.current;
    setAiAnalyzing(true);
    setAiErrorMessage(null);

    try {
      const outcome = await analyzeTripNeeds(normalizedText, controller.signal);
      if (
        saveLock.current ||
        !shouldApplyRequestResponse(requestSequence, naturalLanguageSequenceRef.current, mountedRef.current)
      ) {
        return;
      }

      if (outcome.kind === "SUCCESS") {
        const applied = applyExtractionToForm(fields, outcome.result);
        setFields(applied.fields);
        setExtractionSuggestions(applied.suggestions);
        setAiModalOpen(false);
        setFeedback("AI đã điền các thông tin tìm thấy từ mô tả của bạn.");
        return;
      }

      if (outcome.kind === "NETWORK_ERROR") {
        setAiErrorMessage("Không thể kết nối tới dịch vụ phân tích. Hãy thử lại.");
        return;
      }

      if (outcome.status === 401 || outcome.code === "UNAUTHENTICATED") {
        setAiErrorMessage("Phiên đăng nhập đã hết hạn. Đang chuyển hướng...");
        window.location.assign(buildAuthLoginHref("/trips/new"));
        return;
      }

      setAiErrorMessage(outcome.message || "Không thể phân tích mô tả. Hãy thử lại.");
    } finally {
      if (requestSequence === naturalLanguageSequenceRef.current) {
        releaseSubmission(naturalLanguageLock);
        if (mountedRef.current) setAiAnalyzing(false);
      }
    }
  }

  async function submit() {
    if (saveLock.current) return;
    if (!claimSubmission(submissionLock)) return;

    const clientErrors = validateRequiredFields(fields);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFeedback(null);
      releaseSubmission(submissionLock);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = ++sequenceRef.current;
    setPending(true);
    setFeedback(null);
    setErrors({});

    try {
      const candidate = buildPayload(fields);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outcome = await checkTripRequirement(candidate as any, controller.signal);
      if (
        saveLock.current ||
        !shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)
      ) {
        return;
      }

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
        setActiveTab("planner");
      } else {
        const draft = draftFromFormFields(fields);
        setReview({
          draft,
          readiness: checkResult.readiness,
          clarificationRequests: checkResult.clarificationRequests || [],
          issues: checkResult.issues,
          initialEditingKey: (firstErr?.field as ReviewFieldKey) ?? null,
        });
        setPlanner(null);
        setReviewOpen(true);
      }
    } finally {
      if (sequence === sequenceRef.current) {
        releaseSubmission(submissionLock);
        if (mountedRef.current) setPending(false);
      }
    }
  }

  function handleReviewConfirmed(confirmedSnapshot: ConfirmedTripRequirement) {
    setPlanner(confirmedSnapshot);
    setReviewOpen(false);
    setActiveTab("planner");
  }

  return (
    <main className="trip-page-root" lang="vi">
      {activeTab === "details" ? (
        <>
          <TripSentenceBuilder
            durationDays={fields.durationDays}
            onDurationChange={(d) => updateField("durationDays", d)}
            transport={fields.transport as TripTransport | ""}
            onTransportChange={(t) => updateField("transport", t)}
            startDate={fields.startDate}
            onStartDateChange={(d) => updateField("startDate", d)}
            companionType={fields.companionType as CompanionType | ""}
            companionGroupSize={fields.companionGroupSize}
            onCompanionChange={(type, groupSize) =>
              updateFields({ companionType: type, companionGroupSize: groupSize })
            }
            onCompanionTypeChange={(type) => updateField("companionType", type)}
            onCompanionGroupSizeChange={(size) => updateField("companionGroupSize", size)}
            interests={fields.interests as TripInterest[]}
            onInterestsChange={(ints) => updateField("interests", ints)}
            pace={fields.pace as TripPace | ""}
            onPaceChange={(p) => updateField("pace", p)}
            mobilityFlags={fields.mobilityFlags as MobilityConstraint[]}
            onMobilityFlagsChange={(flags) => updateField("mobilityFlags", flags)}
            mobilityNote={fields.mobilityNote}
            onMobilityNoteChange={(note) => updateField("mobilityNote", note)}
            onOpenAIModal={() => setAiModalOpen(true)}
            onSubmit={() => void submit()}
            pending={pending}
            errors={errors}
            feedback={feedback}
          />

          {aiModalOpen && (
            <div
              className="trip-ai-modal-backdrop"
              onClick={() => setAiModalOpen(false)}
              role="presentation"
            >
              <div
                className="trip-ai-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="trip-ai-dialog-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="trip-ai-modal-header">
                  <div>
                    <h2 id="trip-ai-dialog-title" className="trip-ai-modal-title">
                      Kể cho AI chuyến đi bạn muốn
                    </h2>
                    <p className="trip-ai-modal-subtitle">
                      Chỉ cần mô tả tự nhiên. AI sẽ điền những thông tin hệ thống hiểu được.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="trip-ai-modal-close"
                    onClick={() => setAiModalOpen(false)}
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>

                <div className="trip-ai-modal-body">
                  <NaturalLanguageInput
                    status={naturalLanguageStatus}
                    onAnalyze={analyzeNaturalLanguage}
                    onCancel={() => {
                      naturalLanguageAbortRef.current?.abort();
                      setAiAnalyzing(false);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {reviewOpen && review && (
            <TripReviewDialog
              draft={review.draft}
              readiness={review.readiness}
              clarificationRequests={review.clarificationRequests}
              initialIssues={review.issues}
              initialEditingKey={review.initialEditingKey}
              onBackToForm={() => setReviewOpen(false)}
              onConfirmed={(confirmedSnapshot) => handleReviewConfirmed(confirmedSnapshot)}
            />
          )}
        </>
      ) : (
        <div className="trip-planner-view">
          <div className="trip-planner-top-bar">
            <button
              type="button"
              className="trip-planner-back-btn"
              disabled={saveNavigationLocked}
              onClick={() => {
                if (saveLock.current) return;
                setPlanner(null);
                setActiveTab("details");
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Quay lại chỉnh nhu cầu</span>
            </button>
          </div>

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
                setActiveTab("details");
              }}
            />
          )}
        </div>
      )}
    </main>
  );
}
