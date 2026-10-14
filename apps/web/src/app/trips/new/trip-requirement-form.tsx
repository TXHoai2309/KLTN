"use client";

import { Button } from "@KLTN/ui/components/button";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import type { ExtractionResult } from "@/modules/preference-extraction/preference-extraction-contract";
import type { TripRequirementInput } from "@/modules/trip-requirement/trip-requirement-contract";
import type { ClarificationRequest } from "@/modules/trip-requirement/trip-clarification-rules";
import NaturalLanguageInput, { type NaturalLanguageInputStatus } from "./natural-language-input";
import TripReviewScreen from "./trip-review-screen";
import TripPlannerFlow from "@/components/trip-planner/trip-planner-screen";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";
import { evaluateTripRequirement } from "@/modules/trip-requirement/trip-requirement-readiness";
import {
  draftFromExtraction,
  draftFromFormFields,
  draftToFormFields,
  draftToCandidate,
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

type EvaluationResult = {
  draft: TripRequirementReviewDraft;
  readiness: TripRequirementReadiness;
  source: "AI" | "FORM";
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
    <div className="trip-ai-suggestion">
      <div>
        <strong>AI gợi ý — chưa xác nhận</strong>
        <small>Bạn viết: “{suggestion.sourceText}”</small>
      </div>
      <button type="button" className="trip-extraction-link-button" onClick={onDismiss}>
        Bỏ gợi ý
      </button>
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
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [naturalLanguageStatus, setNaturalLanguageStatus] = useState<NaturalLanguageInputStatus>({ kind: "idle" });
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
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
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

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
    const nextFields = { ...fields, [field]: value };
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
    if (!claimSubmission(naturalLanguageLock)) return;

    naturalLanguageAbortRef.current?.abort();
    const controller = new AbortController();
    naturalLanguageAbortRef.current = controller;
    const requestSequence = ++naturalLanguageSequenceRef.current;
    setNaturalLanguageStatus({ kind: "analyzing", message: "Đang phân tích nhu cầu…" });
    setExtractionResult(null);
    setExtractionSuggestions({});
    setFeedback(null);

    try {
      const outcome = await analyzeTripNeeds(normalizedText, controller.signal);
      if (!shouldApplyRequestResponse(requestSequence, naturalLanguageSequenceRef.current, mountedRef.current)) return;

      if (outcome.kind === "SUCCESS") {
        const count = Object.values(outcome.result.fields).filter((field) => field.status === "EXTRACTED").length;
        const clarificationText = outcome.result.clarifications.length > 0
          ? `, ${outcome.result.clarifications.length} mục cần làm rõ`
          : "";
        setExtractionResult(outcome.result);
        setExtractionSuggestions({});
        const draft = draftFromExtraction(outcome.result);
        const candidate = draftToCandidate(draft);
        const readiness = evaluateTripRequirement(candidate as TripRequirementInput, new Date());
        setReview({
          draft,
          readiness,
          source: "AI",
          clarificationRequests: outcome.clarificationRequests,
        });
        setNaturalLanguageStatus({ kind: "success", message: `Đã nhận diện ${count}/7 thông tin${clarificationText}.` });
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
      setNaturalLanguageStatus({ kind: "failure", message: `${outcome.message} Bạn vẫn có thể nhập vào biểu mẫu bên dưới. Hãy thử lại.` });
    } finally {
      releaseSubmission(naturalLanguageLock);
      if (shouldApplyRequestResponse(requestSequence, naturalLanguageSequenceRef.current, mountedRef.current)) {
        naturalLanguageAbortRef.current = null;
      }
    }
  }

  function handleFillExtractionForm() {
    if (!extractionResult) return;
    const applied = applyExtractionToForm(fields, extractionResult);
    setFields(applied.fields);
    setExtractionSuggestions(applied.suggestions);
  }

  function handleUseExtractionSuggestion(field: ExtractionSuggestionField) {
    const applied = useExtractionSuggestion(fields, extractionSuggestions, field);
    setFields(applied.fields);
    setExtractionSuggestions(applied.suggestions);
  }

  function handleFillAndEdit(reviewDraft?: TripRequirementReviewDraft) {
    if (reviewDraft) {
      setFields(draftToFormFields(reviewDraft));
      setExtractionSuggestions({});
    } else {
      handleFillExtractionForm();
    }
    setReview(null);
  }

  function handleDismissExtractionSuggestion(field: ExtractionSuggestionField) {
    const dismissed = dismissExtractionSuggestion(fields, extractionSuggestions, field);
    setFields(dismissed.fields);
    setExtractionSuggestions(dismissed.suggestions);
  }

  async function submit() {
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
      if (!shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) return;

      if (decision.action === "SUCCESS") {
        setReview({
          draft: draftFromFormFields(fields),
          readiness: decision.data.readiness,
          source: "FORM",
          clarificationRequests: [],
        });
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
  if (planner) return <TripPlannerFlow confirmed={planner} onBack={() => setPlanner(null)} />;
  if (review) {
    return (
      <TripReviewScreen
        draft={review.draft}
        readiness={review.readiness}
        clarificationRequests={review.clarificationRequests}
        headingRef={reviewHeadingRef}
        onBackToForm={(reviewDraft) => {
          setFields(draftToFormFields(reviewDraft));
          setReview(null);
        }}
        onFillForm={review.source === "AI" ? handleFillAndEdit : undefined}
        onConfirmed={(confirmed, confirmedDraft) => {
          setReview({ ...review, draft: confirmedDraft });
          setPlanner(structuredClone(confirmed));
        }}
      />
    );
  }

  const formError = errors._form;
  const fieldErrorEntries = orderedErrors(errors);
  return (
    <main className="trip-form-page" lang="vi">
      <div className="trip-form-intro">
        <p className="trip-eyebrow">Lập hành trình</p>
        <h1>Chia sẻ nhu cầu chuyến đi</h1>
        <p>Cho chúng tôi biết cách bạn muốn khám phá Hà Giang. Thông tin này chỉ dùng trong phiên hiện tại để tạo đề xuất sơ bộ.</p>
      </div>

      <NaturalLanguageInput
        status={naturalLanguageStatus}
        onAnalyze={(text) => { void analyzeNaturalLanguage(text); }}
        onCancel={cancelNaturalLanguageAnalysis}
      />
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

        <div className="trip-form-grid">
          <div className="trip-field">
            <StartDateEditor
              inputRef={(element) => { fieldRefs.current.startDate = element; }}
              value={fields.startDate}
              onChange={(value) => updateField("startDate", value)}
              onBlur={() => handleFieldBlur("startDate")}
              error={errors.startDate}
              errorId={fieldErrorId("startDate")}
            />
            {extractionSuggestions.startDate?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.startDate} onDismiss={() => handleDismissExtractionSuggestion("startDate")} />}
          </div>

          <div className="trip-field">
            <DurationEditor
              inputRef={(element) => { fieldRefs.current.durationDays = element; }}
              value={fields.durationDays}
              onChange={(value) => updateField("durationDays", value)}
              onBlur={() => handleFieldBlur("durationDays")}
              error={errors.durationDays}
              errorId={fieldErrorId("durationDays")}
            />
            {extractionSuggestions.durationDays?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.durationDays} onDismiss={() => handleDismissExtractionSuggestion("durationDays")} />}
          </div>
        </div>

        <TransportEditor
          inputRef={(element) => { fieldRefs.current.transport = element; }}
          value={fields.transport}
          onChange={(value) => updateField("transport", value)}
          onBlur={() => handleFieldBlur("transport")}
          error={errors.transport}
          errorId={fieldErrorId("transport")}
        />
        <div>
          {extractionSuggestions.transport?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.transport} onDismiss={() => handleDismissExtractionSuggestion("transport")} />}
        </div>

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
        <div>
          {extractionSuggestions.companionType?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.companionType} onDismiss={() => handleDismissExtractionSuggestion("companionType")} />}
          {extractionSuggestions.companionGroupSize?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.companionGroupSize} onDismiss={() => handleDismissExtractionSuggestion("companionGroupSize")} />}
        </div>

        <InterestsEditor
          inputRef={(element) => { if (!fieldRefs.current.interests) fieldRefs.current.interests = element; }}
          value={fields.interests}
          onChange={(value) => updateField("interests", value)}
          onBlur={() => handleFieldBlur("interests")}
          error={errors.interests}
          errorId={fieldErrorId("interests")}
        />
        <div>
          {extractionSuggestions.interests?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.interests} onDismiss={() => handleDismissExtractionSuggestion("interests")} />}
        </div>

        <PaceEditor
          inputRef={(element) => { if (!fieldRefs.current.pace) fieldRefs.current.pace = element; }}
          value={fields.pace}
          onChange={(value) => updateField("pace", value)}
          onBlur={() => handleFieldBlur("pace")}
          error={errors.pace}
          errorId={fieldErrorId("pace")}
        />
        <div>
          {extractionSuggestions.pace?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.pace} onDismiss={() => handleDismissExtractionSuggestion("pace")} />}
        </div>

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
        <div>
          {extractionSuggestions.mobilityFlags?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.mobilityFlags} onDismiss={() => handleDismissExtractionSuggestion("mobilityFlags")} />}
          {extractionSuggestions.mobilityNote?.status === "APPLIED" && <AppliedSuggestionNote suggestion={extractionSuggestions.mobilityNote} onDismiss={() => handleDismissExtractionSuggestion("mobilityNote")} />}
        </div>

        {feedback && <p className="trip-form-feedback" role="alert">{feedback}</p>}
        <div className="trip-form-actions">
          <Button type="submit" className="trip-submit-button" disabled={button.disabled} aria-busy={button.ariaBusy}>
            {pending && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
            {button.label}
          </Button>
        </div>
      </form>
    </main>
  );
}
