"use client";

import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { authorizationFeedback } from "@/lib/authorization-feedback";
import { formatVietnameseDate } from "@/lib/date-only";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { checkTripRequirement, shouldApplyCheckResponse } from "@/lib/trip-requirement-check-client";
import TripClarificationPanel from "./trip-clarification-panel";
import TripReadinessStatus from "./trip-readiness-status";
import {
  CompanionsEditor,
  DurationEditor,
  InterestsEditor,
  MobilityEditor,
  PaceEditor,
  StartDateEditor,
  TransportEditor,
} from "./trip-field-editors";
import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
} from "@/modules/trip-requirement/trip-requirement-contract";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";
import { evaluateTripRequirement } from "@/modules/trip-requirement/trip-requirement-readiness";
import type { TripRequirementInput } from "@/modules/trip-requirement/trip-requirement-contract";
import type { CheckIssue } from "@/modules/trip-requirement/trip-requirement-check";
import type { ClarificationRequest } from "@/modules/trip-requirement/trip-clarification-rules";
import { CLARIFICATION_REASON_VALUES } from "@/modules/preference-extraction/preference-extraction-contract";
import {
  advisoryCount,
  blockingCount,
  canConfirm,
  firstBlockingFieldKey,
  mergeClarificationRequests,
  resetDismissedAdvisoriesForField,
} from "@/modules/trip-requirement/trip-clarification-logic";
import {
  applyFieldEdit,
  confirmDraft,
  countReviewIssues,
  countReviewValues,
  countUnactionedAiFields,
  draftToCandidate,
  invalidateConfirmation,
  hasUserTransportNormalizationMismatch,
  restoreAiValue,
  REVIEW_FIELD_KEYS,
  reviewFieldLabel,
  type ConfirmedTripRequirement,
  type ReviewConfirmation,
  type ReviewField,
  type ReviewFieldKey,
  type ReviewRawFieldValue,
  type ReviewValueMap,
  type TripRequirementReviewDraft,
} from "@/modules/trip-requirement/trip-requirement-review";
import {
  UNRESOLVED_TRANSPORT_AI_NOTE,
  unresolvedTransportMessage,
} from "@/modules/trip-requirement/transport-safety";

export type TripReviewScreenProps = {
  draft: TripRequirementReviewDraft;
  readiness: TripRequirementReadiness;
  clarificationRequests?: ClarificationRequest[];
  embedded?: boolean;
  onBackToForm: (draft: TripRequirementReviewDraft) => void;
  onFillForm?: (draft: TripRequirementReviewDraft) => void;
  onConfirmed?: (confirmed: ConfirmedTripRequirement, draft: TripRequirementReviewDraft) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

function fieldErrorId(field: string): string {
  return `trip-review-error-${field.replaceAll(".", "-")}`;
}

function rawValueForField(draft: TripRequirementReviewDraft, key: ReviewFieldKey): ReviewRawFieldValue {
  const value = draft.fields[key].value;
  switch (key) {
    case "startDate":
      return (value as ReviewValueMap["startDate"] | null) ?? "";
    case "durationDays":
      return value as ReviewValueMap["durationDays"] === null ? "" : String(value as ReviewValueMap["durationDays"]);
    case "transport":
      return (value as ReviewValueMap["transport"] | null) ?? "";
    case "companions":
      {
        const companions = value as ReviewValueMap["companions"] | null;
        return companions === null ? null : { type: companions.type, groupSize: String(companions.groupSize) };
      }
    case "interests":
      return value ? [...(value as ReviewValueMap["interests"])] : [];
    case "pace":
      return (value as ReviewValueMap["pace"] | null) ?? "";
    case "mobilityConstraints":
      {
        const mobility = value as ReviewValueMap["mobilityConstraints"] | null;
        return mobility === null ? null : { flags: [...mobility.flags], note: mobility.note ?? "" };
      }
  }
}

function simpleError(errors: Record<string, string>, key: ReviewFieldKey): string | undefined {
  return errors[key];
}

function serverErrorsForField(issues: CheckIssue[], key: ReviewFieldKey): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.severity !== "ERROR" || issue.field !== key) continue;
    if (key === "companions") errors["companions.type"] = issue.message;
    else if (key === "mobilityConstraints") errors["mobilityConstraints.flags"] = issue.message;
    else errors[key] = issue.message;
  }
  return errors;
}

function issueIsForField(issue: CheckIssue, key: ReviewFieldKey): boolean {
  return issue.field === key;
}

function reviewKeyFromIssue(issue: CheckIssue): ReviewFieldKey | null {
  return issue.field === "_form" ? null : issue.field;
}

function isLegacyClarificationIssue(issue: { code: string }): boolean {
  return (CLARIFICATION_REASON_VALUES as readonly string[]).includes(issue.code);
}

function formatAnnouncement(key: ReviewFieldKey, draft: TripRequirementReviewDraft): string {
  const value = formatValue(key, draft.fields[key].value);
  return `Đã cập nhật ${reviewFieldLabel(key)}: ${value ?? "đã xóa"}`;
}

function optionLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatValue<K extends ReviewFieldKey>(key: K, value: ReviewValueMap[K] | null): string | null {
  if (value === null) return null;

  switch (key) {
    case "startDate":
      return formatVietnameseDate(String(value));
    case "durationDays":
      return `${String(value)} ngày`;
    case "companions": {
      const companions = value as ReviewValueMap["companions"];
      return `${optionLabel(COMPANION_OPTIONS, companions.type)} · ${companions.groupSize} người`;
    }
    case "interests":
      return (value as ReviewValueMap["interests"])
        .map((item) => optionLabel(INTEREST_OPTIONS, item))
        .join(", ");
    case "pace":
      return optionLabel(PACE_OPTIONS, String(value));
    case "transport":
      return optionLabel(TRANSPORT_OPTIONS, String(value));
    case "mobilityConstraints": {
      const mobility = value as ReviewValueMap["mobilityConstraints"];
      return [
        mobility.flags.map((item) => optionLabel(MOBILITY_CONSTRAINT_OPTIONS, item)).join(", "),
        mobility.note,
      ].filter(Boolean).join(" · ") || "Không có ghi chú";
    }
  }
}

function sourceBadge(field: ReviewField) {
  if (field.origin === "AI") {
    return <span className="trip-review-badge trip-review-badge-ai"><Sparkles size={15} aria-hidden="true" /> AI gợi ý</span>;
  }
  if (field.origin === "USER") {
    return <span className="trip-review-badge trip-review-badge-user"><UserRound size={15} aria-hidden="true" /> Bạn nhập</span>;
  }
  return <span className="trip-review-badge trip-review-badge-empty"><CircleHelp size={15} aria-hidden="true" /> Chưa có thông tin</span>;
}

function statusBadge(field: ReviewField) {
  if (field.aiStatus === "AMBIGUOUS") {
    return <span className="trip-review-status trip-review-status-warning"><AlertCircle size={15} aria-hidden="true" /> Cần làm rõ</span>;
  }
  if (field.aiStatus === "UNSUPPORTED") {
    return <span className="trip-review-status trip-review-status-error"><Ban size={15} aria-hidden="true" /> Chưa hỗ trợ</span>;
  }
  if (field.aiStatus === "MISSING") {
    return <span className="trip-review-status"><CircleHelp size={15} aria-hidden="true" /> Chưa nhận diện</span>;
  }
  if (field.origin === "AI") {
    return <span className="trip-review-status trip-review-status-success"><CheckCircle2 size={15} aria-hidden="true" /> Đã nhận diện</span>;
  }
  return null;
}

function needsRequiredLabel(key: ReviewFieldKey, field: ReviewField): boolean {
  return (key === "durationDays" || key === "transport") && field.value === null;
}

const EMPTY_CLARIFICATION_REQUESTS: ClarificationRequest[] = [];

export default function TripReviewScreen({
  draft,
  readiness,
  clarificationRequests,
  embedded = false,
  onBackToForm,
  onFillForm,
  onConfirmed,
  headingRef,
}: TripReviewScreenProps) {
  const initialClarificationRequests = clarificationRequests ?? EMPTY_CLARIFICATION_REQUESTS;
  const [editableDraft, setEditableDraft] = useState(draft);
  const [editingKey, setEditingKey] = useState<ReviewFieldKey | null>(null);
  const [editorValue, setEditorValue] = useState<ReviewRawFieldValue>(null);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});
  const [liveMessage, setLiveMessage] = useState("");
  const [confirmation, setConfirmation] = useState<ReviewConfirmation>({
    state: "NOT_CONFIRMED",
    snapshot: null,
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [serverIssues, setServerIssues] = useState<CheckIssue[]>([]);
  const [serverClarificationRequests, setServerClarificationRequests] = useState<ClarificationRequest[]>([]);
  const [dismissedAdvisoryIds, setDismissedAdvisoryIds] = useState<string[]>([]);
  const [choiceErrors, setChoiceErrors] = useState<Record<string, string>>({});
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [normalizedFromServer, setNormalizedFromServer] = useState(false);
  const editButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const editorInputRef = useRef<HTMLElement | null>(null);
  const confirmationRef = useRef<HTMLElement | null>(null);
  const checkAbortRef = useRef<AbortController | null>(null);
  const checkInFlightRef = useRef(false);
  const checkSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    headingRef?.current?.focus();
  }, [draft, headingRef]);

  useEffect(() => {
    setEditableDraft(draft);
    setEditingKey(null);
    setEditorErrors({});
    setConfirmation(invalidateConfirmation());
    setAcknowledged(false);
    setServerIssues([]);
    setServerClarificationRequests(initialClarificationRequests);
    setDismissedAdvisoryIds([]);
    setChoiceErrors({});
    setCheckError(null);
    setNormalizedFromServer(false);
  }, [draft, initialClarificationRequests]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      checkInFlightRef.current = false;
      checkAbortRef.current?.abort();
      checkSequenceRef.current += 1;
    };
  }, []);

  function focusEditButton(key: ReviewFieldKey) {
    window.setTimeout(() => editButtonRefs.current[key]?.focus(), 0);
  }

  function goToClarificationField(key: ReviewFieldKey) {
    window.setTimeout(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      document.getElementById(`trip-review-field-${key}`)?.scrollIntoView({ block: "center", behavior });
      if (editingKey === key) editorInputRef.current?.focus();
      else editButtonRefs.current[key]?.focus();
    }, 0);
  }

  function clearDismissedForField(key: ReviewFieldKey): string[] {
    const allRequests = [...initialClarificationRequests, ...serverClarificationRequests];
    const nextDismissed = resetDismissedAdvisoriesForField(allRequests, dismissedAdvisoryIds, key);
    setDismissedAdvisoryIds(nextDismissed);
    return nextDismissed;
  }

  function applyClarificationEdit(request: ClarificationRequest, rawValue: ReviewRawFieldValue) {
    const result = applyFieldEdit(editableDraft, request.field, rawValue, new Date());
    if (!result.ok) {
      setChoiceErrors((current) => ({
        ...current,
        [request.id]: Object.values(result.errors)[0] ?? "Giá trị chưa hợp lệ. Vui lòng kiểm tra lại.",
      }));
      setLiveMessage("Giá trị chưa hợp lệ. Vui lòng kiểm tra lại mục đang làm rõ.");
      return;
    }

    setEditableDraft(result.draft);
    if (confirmation.state === "CONFIRMED") {
      checkAbortRef.current?.abort();
      checkSequenceRef.current += 1;
      setConfirmation(invalidateConfirmation());
      setAcknowledged(false);
      setNormalizedFromServer(false);
    } else {
      setConfirmation({ state: result.confirmation, snapshot: null });
    }
    setServerIssues((current) => current.filter((issue) => issue.field !== request.field));
    setChoiceErrors((current) => {
      const next = { ...current };
      delete next[request.id];
      return next;
    });
    const nextDismissed = clearDismissedForField(request.field);
    const remaining = mergeClarificationRequests(
      initialClarificationRequests,
      serverClarificationRequests,
      { draft: result.draft, dismissedAdvisoryIds: nextDismissed },
    );
    setLiveMessage(
      blockingCount(remaining) === 0
        ? "Đã làm rõ đủ thông tin bắt buộc."
        : formatAnnouncement(request.field, result.draft),
    );
  }

  function openClarificationField(key: ReviewFieldKey) {
    if (editingKey !== null && editingKey !== key) {
      setLiveMessage(`Bạn đang sửa ${reviewFieldLabel(editingKey)}. Hãy lưu hoặc hủy mục đó trước.`);
      goToClarificationField(key);
      return;
    }
    startEditing(key);
    window.setTimeout(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      document.getElementById(`trip-review-field-${key}`)?.scrollIntoView({ block: "center", behavior });
      editorInputRef.current?.focus();
    }, 0);
  }

  function dismissAdvisory(request: ClarificationRequest) {
    if (request.severity !== "ADVISORY") return;
    setDismissedAdvisoryIds((current) => current.includes(request.id) ? current : [...current, request.id]);
    setLiveMessage(`Đã bỏ qua mục khuyến nghị về ${reviewFieldLabel(request.field)}.`);
  }

  function startEditing(key: ReviewFieldKey) {
    if (isChecking) return;
    setEditingKey(key);
    setEditorValue(rawValueForField(editableDraft, key));
    setEditorErrors({});
    setLiveMessage("");
  }

  function cancelEditing() {
    if (!editingKey) return;
    const key = editingKey;
    setEditingKey(null);
    setEditorErrors({});
    setLiveMessage("Đã hủy chỉnh sửa.");
    focusEditButton(key);
  }

  function saveEditing() {
    if (!editingKey) return;
    const key = editingKey;
    const result = applyFieldEdit(editableDraft, key, editorValue, new Date());
    if (!result.ok) {
      setEditorErrors(result.errors);
      setLiveMessage("Giá trị chưa hợp lệ. Vui lòng kiểm tra lại trường đang sửa.");
      return;
    }

    setEditableDraft(result.draft);
    if (confirmation.state === "CONFIRMED") {
      checkAbortRef.current?.abort();
      checkSequenceRef.current += 1;
      setConfirmation(invalidateConfirmation());
      setAcknowledged(false);
      setNormalizedFromServer(false);
      setLiveMessage("Bạn đã chỉnh sửa thông tin; cần kiểm tra và xác nhận lại.");
    } else {
      setConfirmation({ state: result.confirmation, snapshot: null });
    }
    setServerIssues((current) => current.filter((issue) => issue.field !== key));
    const nextDismissed = clearDismissedForField(key);
    setEditorErrors({});
    setEditingKey(null);
    const remaining = mergeClarificationRequests(
      initialClarificationRequests,
      serverClarificationRequests,
      { draft: result.draft, dismissedAdvisoryIds: nextDismissed },
    );
    setLiveMessage(
      blockingCount(remaining) === 0
        ? "Đã làm rõ đủ thông tin bắt buộc."
        : formatAnnouncement(key, result.draft),
    );
    focusEditButton(key);
  }

  function restoreSuggestion() {
    if (!editingKey) return;
    const key = editingKey;
    const restored = restoreAiValue(editableDraft, key);
    if (restored === editableDraft) return;
    setEditableDraft(restored);
    checkAbortRef.current?.abort();
    checkSequenceRef.current += 1;
    setConfirmation(invalidateConfirmation());
    setAcknowledged(false);
    setNormalizedFromServer(false);
    setServerIssues((current) => current.filter((issue) => issue.field !== key));
    clearDismissedForField(key);
    setEditingKey(null);
    setEditorErrors({});
    setLiveMessage(`Đã khôi phục gợi ý AI cho ${reviewFieldLabel(key)}.`);
    focusEditButton(key);
  }

  function focusConfirmation() {
    window.setTimeout(() => confirmationRef.current?.focus(), 0);
  }

  async function confirmCurrentDraft() {
    if (
      checkInFlightRef.current ||
      isChecking ||
      editingKey !== null ||
      !canConfirm(mergedClarificationRequests, { acknowledged, editingKey, isChecking })
    ) return;

    checkInFlightRef.current = true;
    const requestSequence = checkSequenceRef.current + 1;
    checkSequenceRef.current = requestSequence;
    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    const candidate = draftToCandidate(editableDraft);
    setIsChecking(true);
    setConfirmation({ state: "CHECKING", snapshot: null });
    setCheckError(null);
    setLiveMessage("Đang kiểm tra nhu cầu với dữ liệu đã chuẩn hóa…");

    try {
      const outcome = await checkTripRequirement(candidate, controller.signal);
      if (!shouldApplyCheckResponse(requestSequence, checkSequenceRef.current, mountedRef.current)) return;

      if (outcome.kind === "CHECKED") {
        if (outcome.result.confirmable) {
          setServerClarificationRequests(outcome.result.clarificationRequests);
          if (
            outcome.result.requirement &&
            hasUserTransportNormalizationMismatch(editableDraft, outcome.result.requirement)
          ) {
            setConfirmation(invalidateConfirmation());
            setAcknowledged(false);
            setNormalizedFromServer(false);
            setServerIssues(outcome.result.issues);
            setCheckError("Máy chủ trả về phương tiện khác với lựa chọn của bạn. Lựa chọn của bạn được giữ lại; hãy thử kiểm tra lại.");
            setLiveMessage("Chưa xác nhận được phương tiện; lựa chọn của bạn chưa bị thay đổi.");
            return;
          }
          const confirmed = confirmDraft(editableDraft, outcome.result, new Date());
          setEditableDraft(confirmed.draft);
          setConfirmation(confirmed.confirmation);
          setAcknowledged(true);
          setServerIssues([]);
          setServerClarificationRequests(outcome.result.clarificationRequests);
          setCheckError(null);
          setNormalizedFromServer(
            JSON.stringify(candidate) !== JSON.stringify(confirmed.confirmation.snapshot?.requirement),
          );
          setLiveMessage("Nhu cầu đã được kiểm tra và xác nhận theo phản hồi của máy chủ.");
          if (confirmed.confirmation.snapshot) onConfirmed?.(confirmed.confirmation.snapshot, confirmed.draft);
          focusConfirmation();
        } else {
          const errors = outcome.result.issues.filter((issue) => issue.severity === "ERROR");
          setConfirmation(invalidateConfirmation());
          setAcknowledged(false);
          setServerIssues(outcome.result.issues);
          setServerClarificationRequests(outcome.result.clarificationRequests);
          setCheckError(null);
          setLiveMessage(`Có ${errors.length} mục cần sửa trước khi xác nhận.`);
          const firstIssue = errors[0];
          const firstKey = firstIssue ? reviewKeyFromIssue(firstIssue) : null;
          if (firstKey) {
            setEditingKey(firstKey);
            setEditorValue(rawValueForField(editableDraft, firstKey));
            setEditorErrors(serverErrorsForField(outcome.result.issues, firstKey));
          }
        }
        return;
      }

      setConfirmation(invalidateConfirmation());
      if (outcome.kind === "FAILED" && outcome.status === 401) {
        setLiveMessage("Phiên đăng nhập không còn hiệu lực; bạn sẽ cần nhập lại nhu cầu sau khi đăng nhập.");
        window.location.assign(buildAuthLoginHref("/trips/new"));
        return;
      }
      if (outcome.kind === "FAILED" && outcome.status === 403) {
        setCheckError(authorizationFeedback(403) ?? outcome.message);
      } else if (outcome.kind === "FAILED") {
        setCheckError(outcome.message);
      } else {
        setCheckError("Chưa xác nhận được kết quả kiểm tra. Dữ liệu vẫn được giữ lại, hãy thử lại.");
      }
      setLiveMessage("Chưa xác nhận được kết quả kiểm tra; chưa có thay đổi nào được áp dụng.");
    } finally {
      if (shouldApplyCheckResponse(requestSequence, checkSequenceRef.current, mountedRef.current)) {
        checkInFlightRef.current = false;
        setIsChecking(false);
        checkAbortRef.current = null;
      }
    }
  }

  function renderEditor(key: ReviewFieldKey) {
    const common = { autoFocus: true };
    const inputRef = (element: HTMLInputElement | null) => { editorInputRef.current = element; };
    const noteRef = (element: HTMLTextAreaElement | null) => { editorInputRef.current = element; };
    switch (key) {
      case "startDate":
        return (
          <StartDateEditor
            {...common}
            inputRef={inputRef}
            value={typeof editorValue === "string" ? editorValue : ""}
            onChange={setEditorValue}
            error={simpleError(editorErrors, "startDate")}
            errorId={fieldErrorId("startDate")}
          />
        );
      case "durationDays":
        return (
          <DurationEditor
            {...common}
            inputRef={inputRef}
            value={typeof editorValue === "string" ? editorValue : ""}
            onChange={setEditorValue}
            error={simpleError(editorErrors, "durationDays")}
            errorId={fieldErrorId("durationDays")}
          />
        );
      case "transport":
        return (
          <TransportEditor
            {...common}
            inputRef={undefined}
            containerRef={(element) => { editorInputRef.current = element; }}
            value={typeof editorValue === "string" ? editorValue : ""}
            onChange={setEditorValue}
            error={simpleError(editorErrors, "transport")}
            errorId={fieldErrorId("transport")}
          />
        );
      case "companions": {
        const value = editorValue && !Array.isArray(editorValue) && typeof editorValue === "object" && "type" in editorValue
          ? editorValue
          : { type: "", groupSize: "" };
        return (
          <CompanionsEditor
            {...common}
            errorId={fieldErrorId("companions")}
            typeValue={value.type}
            groupSizeValue={value.groupSize}
            onTypeChange={(type) => setEditorValue({ ...value, type })}
            onGroupSizeChange={(groupSize) => setEditorValue({ ...value, groupSize })}
            typeError={editorErrors["companions.type"]}
            typeErrorId={fieldErrorId("companions.type")}
            groupSizeError={editorErrors["companions.groupSize"]}
            groupSizeErrorId={fieldErrorId("companions.groupSize")}
            typeRef={inputRef}
            groupSizeRef={inputRef}
          />
        );
      }
      case "interests":
        return (
          <InterestsEditor
            {...common}
            inputRef={inputRef}
            value={Array.isArray(editorValue) ? editorValue : []}
            onChange={setEditorValue}
            error={editorErrors.interests}
            errorId={fieldErrorId("interests")}
          />
        );
      case "pace":
        return (
          <PaceEditor
            {...common}
            inputRef={inputRef}
            value={typeof editorValue === "string" ? editorValue : ""}
            onChange={setEditorValue}
            error={editorErrors.pace}
            errorId={fieldErrorId("pace")}
          />
        );
      case "mobilityConstraints": {
        const value = editorValue && !Array.isArray(editorValue) && typeof editorValue === "object" && "flags" in editorValue
          ? editorValue
          : { flags: [], note: "" };
        return (
          <MobilityEditor
            {...common}
            errorId={fieldErrorId("mobilityConstraints")}
            inputRef={inputRef}
            noteRef={noteRef}
            flags={value.flags}
            note={value.note}
            onFlagsChange={(flags) => setEditorValue({ ...value, flags })}
            onNoteChange={(note) => setEditorValue({ ...value, note })}
            flagsError={editorErrors["mobilityConstraints.flags"]}
            flagsErrorId={fieldErrorId("mobilityConstraints.flags")}
            noteError={editorErrors["mobilityConstraints.note"]}
            noteErrorId={fieldErrorId("mobilityConstraints.note")}
          />
        );
      }
    }
  }

  const derivedReadiness = evaluateTripRequirement(
    draftToCandidate(editableDraft) as TripRequirementInput,
    new Date(),
  );
  const currentReadiness = editableDraft === draft ? readiness : derivedReadiness;

  const valueCount = countReviewValues(editableDraft);
  const serverErrorFields = new Set(
    serverIssues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.field),
  );
  const issueCount = countReviewIssues(editableDraft) + serverErrorFields.size;
  const uneditedAiCount = countUnactionedAiFields(editableDraft);
  const serverErrors = serverIssues.filter((issue) => issue.severity === "ERROR");
  const mergedClarificationRequests = mergeClarificationRequests(
    initialClarificationRequests,
    serverClarificationRequests,
    { draft: editableDraft, dismissedAdvisoryIds: dismissedAdvisoryIds },
  );
  const clarificationBlockingCount = blockingCount(mergedClarificationRequests);
  const clarificationAdvisoryCount = advisoryCount(mergedClarificationRequests);
  const firstClarificationField = firstBlockingFieldKey(mergedClarificationRequests);
  const clarificationGateOpen = canConfirm(mergedClarificationRequests, {
    acknowledged,
    editingKey,
    isChecking,
  });
  const confirmDisabledReason = isChecking
    ? "Đang kiểm tra nhu cầu…"
    : editingKey !== null
      ? "Hãy lưu hoặc hủy chỉnh sửa đang mở trước."
      : clarificationBlockingCount > 0
        ? `Còn ${clarificationBlockingCount} mục bắt buộc cần làm rõ.`
      : !acknowledged
        ? "Hãy xác nhận rằng bạn đã kiểm tra các thông tin trên."
        : null;

  const ReviewContainer = embedded ? "div" : "main";

  return (
    <ReviewContainer className="trip-form-page trip-review-page" lang="vi">
      <div className="trip-form-intro">
        <p className="trip-eyebrow">Kiểm tra trước khi tiếp tục</p>
        <h1 ref={headingRef} tabIndex={-1}>Kiểm tra nhu cầu chuyến đi</h1>
        <p>AI chỉ gợi ý — hãy kiểm tra từng mục trước khi xác nhận.</p>
      </div>

      <section
        className="trip-review-screen"
        aria-labelledby="trip-review-title"
        data-confirmation={confirmation.state}
        data-clarification-advisory-count={clarificationAdvisoryCount}
        data-first-blocking-field={firstClarificationField ?? undefined}
      >
        <div className="trip-review-summary" id="trip-review-title" role="status" aria-live="polite">
          <div className="trip-heading-icon" aria-hidden="true"><Sparkles size={20} /></div>
          <div>
            <strong>{valueCount}/7 thông tin đã có, {issueCount} mục cần xử lý</strong>
            {uneditedAiCount > 0 && <p>{uneditedAiCount} thông tin đang là gợi ý AI chưa được bạn chỉnh sửa.</p>}
          </div>
        </div>

        <TripClarificationPanel
          requests={mergedClarificationRequests}
          onOpenField={openClarificationField}
          onGoToField={goToClarificationField}
          onResolveChoice={applyClarificationEdit}
          onDismissAdvisory={dismissAdvisory}
          choiceErrors={choiceErrors}
        />

        {serverErrors.length > 0 && (
          <div className="trip-review-error-summary" role="alert">
            <strong>Có {serverErrors.length} mục cần sửa trước khi xác nhận.</strong>
            <ul>
              {serverErrors.map((issue, index) => {
                const key = reviewKeyFromIssue(issue);
                return (
                  <li key={`${issue.code}-${index}`}>
                    {key ? <a href={`#trip-review-field-${key}`}>{reviewFieldLabel(key)}: {issue.message}</a> : issue.message}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="trip-review-field-list">
          {REVIEW_FIELD_KEYS.map((key) => {
            const field = editableDraft.fields[key];
            const visibleFieldIssues = field.issues.filter((issue) => !isLegacyClarificationIssue(issue));
            const value = formatValue(key, field.value);
            const required = needsRequiredLabel(key, field);
            const isEditing = editingKey === key;
            return (
              <article
                className="trip-review-field"
                key={key}
                id={`trip-review-field-${key}`}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && isEditing) {
                    event.preventDefault();
                    cancelEditing();
                  }
                }}
              >
                <div className="trip-review-field-heading">
                  <h2>{reviewFieldLabel(key)}</h2>
                  <div className="trip-review-badges">
                    {sourceBadge(field)}
                    {statusBadge(field)}
                    {required && <span className="trip-review-required">Bắt buộc</span>}
                  </div>
                </div>

                {isEditing ? (
                  <div className="trip-review-editor">
                    {renderEditor(key)}
                    {field.aiStatus === "EXTRACTED" && field.aiValue !== null && (
                      <p className="trip-review-source">Gợi ý ban đầu của AI: {formatValue(key, field.aiValue)}</p>
                    )}
                    <div className="trip-review-editor-actions">
                      <Button type="button" className="trip-submit-button" onClick={saveEditing}>Lưu thay đổi</Button>
                      <Button type="button" variant="outline" className="trip-secondary-button" onClick={cancelEditing}>Hủy</Button>
                      {field.aiStatus === "EXTRACTED" && field.aiValue !== null && (
                        <Button type="button" variant="outline" className="trip-secondary-button" onClick={restoreSuggestion}>
                          Khôi phục gợi ý AI
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className={`trip-review-value${value ? "" : " trip-review-value-empty"}`}>
                    {value ?? "Chưa có thông tin"}
                  </p>
                )}

                {field.sourceText && (
                  <p className="trip-review-source">Bạn viết: “{field.sourceText}”</p>
                )}
                {key === "transport" && field.aiStatus !== null && field.aiStatus !== "EXTRACTED" && field.origin !== "USER" && (
                  <p className="trip-review-transport-warning" role="status">
                    <AlertCircle size={16} aria-hidden="true" /> {unresolvedTransportMessage(field.sourceText)}
                  </p>
                )}
                {key === "transport" && field.aiStatus !== null && field.aiStatus !== "EXTRACTED" && field.origin === "USER" && (
                  <p className="trip-review-source">{UNRESOLVED_TRANSPORT_AI_NOTE}</p>
                )}
                {field.aiNote && <p className="trip-review-note">{field.aiNote}</p>}
                {field.edited && field.aiValue !== null && (
                  <p className="trip-review-source">Gợi ý ban đầu của AI: {formatValue(key, field.aiValue)}</p>
                )}
                {(visibleFieldIssues.length > 0 || serverIssues.some((issue) => issueIsForField(issue, key))) && (
                  <ul
                    className="trip-review-issues"
                    role={visibleFieldIssues.some((issue) => issue.severity === "ERROR") || serverIssues.some((issue) => issueIsForField(issue, key) && issue.severity === "ERROR") ? "alert" : "status"}
                  >
                    {visibleFieldIssues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                    {serverIssues.filter((issue) => issueIsForField(issue, key)).map((issue, index) => (
                      <li key={`server-${issue.code}-${index}`}>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {field.edited && <p className="trip-review-edited">Bạn đã chỉnh sửa giá trị này.</p>}
                <div className="trip-review-field-actions">
                  <Button
                    ref={(element) => { editButtonRefs.current[key] = element; }}
                    type="button"
                    variant="outline"
                    className="trip-secondary-button"
                    aria-label={`Sửa ${reviewFieldLabel(key)}`}
                    aria-expanded={isEditing}
                    disabled={isChecking || (editingKey !== null && !isEditing)}
                    onClick={() => startEditing(key)}
                  >
                    Sửa
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <section
          ref={confirmationRef}
          className="trip-review-confirmation"
          aria-labelledby="trip-review-confirmation-title"
          aria-busy={isChecking}
          tabIndex={-1}
          data-state={confirmation.state}
        >
          <div className="trip-review-confirmation-heading">
            <div>
              <p className="trip-eyebrow">Bước kiểm tra cuối</p>
              <h2 id="trip-review-confirmation-title">Xác nhận nhu cầu chuyến đi</h2>
            </div>
            {confirmation.state === "CONFIRMED" && <CheckCircle2 size={22} aria-hidden="true" />}
          </div>

          {confirmation.state === "CONFIRMED" && confirmation.snapshot ? (
            <div className="trip-review-confirmed" role="status" aria-live="polite">
              <strong>Nhu cầu đã được kiểm tra.</strong>
              {normalizedFromServer && <p>Đã chuẩn hóa một số giá trị theo dữ liệu máy chủ.</p>}
              <p>
                {confirmation.snapshot.eligibleForFinalConfirmation
                  ? "Thông tin đã đủ điều kiện cho bước xác nhận chính thức tiếp theo."
                  : "Đây là bản kiểm tra sơ bộ; vẫn cần ngày bắt đầu trước khi xác nhận và lưu chính thức. Hành trình có thể dùng Ngày 1, Ngày 2…"
                }
              </p>
              <dl className="trip-review-confirmed-summary">
                {REVIEW_FIELD_KEYS.map((key) => (
                  <div key={key}>
                    <dt>{reviewFieldLabel(key)}</dt>
                    <dd>{formatValue(key, confirmation.snapshot?.requirement[key] as ReviewValueMap[typeof key] | null) ?? "Chưa có thông tin"}</dd>
                  </div>
                ))}
              </dl>
              {confirmation.snapshot.warnings.length > 0 && (
                <ul className="trip-review-issues" role="status">
                  {confirmation.snapshot.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
                </ul>
              )}
              <p className="trip-review-next-step">Bước tạo hành trình sẽ có ở chức năng tiếp theo.</p>
            </div>
          ) : (
            <>
              <p className="trip-review-confirmation-copy">
                Kiểm tra này chỉ xác nhận dữ liệu cho phiên hiện tại; chưa lưu hoặc tạo hành trình.
              </p>
              <label className="trip-review-acknowledgement">
                <input
                  type="checkbox"
                  required
                  checked={acknowledged}
                  disabled={isChecking}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>Tôi đã kiểm tra các thông tin trên</span>
              </label>
              {confirmDisabledReason && <p className="trip-review-confirmation-reason">{confirmDisabledReason}</p>}
              <Button
                type="button"
                className="trip-submit-button"
                disabled={!clarificationGateOpen}
                aria-busy={isChecking}
                onClick={confirmCurrentDraft}
              >
                {isChecking && <LoaderCircle className="trip-spinner" size={17} aria-hidden="true" />}
                {isChecking ? "Đang kiểm tra…" : "Xác nhận nhu cầu"}
              </Button>
            </>
          )}

          {checkError && confirmation.state !== "CONFIRMED" && (
            <div className="trip-review-check-error" role="alert">
              <p>{checkError}</p>
              {!isChecking && acknowledged && editingKey === null && (
                <Button type="button" variant="outline" className="trip-secondary-button" onClick={confirmCurrentDraft}>
                  Thử lại
                </Button>
              )}
            </div>
          )}
        </section>
      </section>

      <TripReadinessStatus readiness={currentReadiness} />
      <p className="trip-sr-only" aria-live="polite">{liveMessage}</p>
      <p className="trip-review-relative-days">
        {editableDraft.fields.startDate.value === null
          ? "Chưa có ngày bắt đầu: đề xuất có thể dùng Ngày 1, Ngày 2…; cần ngày bắt đầu trước khi xác nhận/lưu hành trình chính thức."
          : "Ngày bắt đầu hiện được hiển thị để bạn kiểm tra trước bước xác nhận chính thức."}
      </p>

      <div className="trip-review-actions">
        {onFillForm && (
          <Button type="button" className="trip-submit-button" onClick={() => onFillForm(editableDraft)}>
            Điền gợi ý vào biểu mẫu
          </Button>
        )}
        <Button type="button" variant="outline" className="trip-secondary-button" onClick={() => onBackToForm(editableDraft)}>
          <ArrowLeft size={17} aria-hidden="true" /> Quay lại chỉnh sửa trong biểu mẫu
        </Button>
      </div>
    </ReviewContainer>
  );
}
