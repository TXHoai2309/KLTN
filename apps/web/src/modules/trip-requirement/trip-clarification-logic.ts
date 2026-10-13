import {
  CLARIFICATION_FIELD_VALUES,
  type ClarificationField,
  type ClarificationRequest,
} from "./trip-clarification-rules";
import {
  isValidCalendarDate,
  tripRequirementInputSchema,
} from "./trip-requirement-contract";
import {
  vietnamDateOf,
} from "./trip-requirement-readiness";
import {
  draftToCandidate,
  draftToFormFields,
  type ReviewFieldKey,
  type TripRequirementReviewDraft,
} from "./trip-requirement-review";
import { validateRequiredFields } from "./trip-requirement-form-logic";
import { checkTripRequirement } from "./trip-requirement-check";

export type ClarificationLocalDraftState = {
  draft: TripRequirementReviewDraft;
  /** IDs are kept in memory only. The review screen clears them when a field changes. */
  dismissedAdvisoryIds?: readonly string[];
};

export type ClarificationConfirmationState = {
  acknowledged: boolean;
  editingKey: ReviewFieldKey | null;
  isChecking: boolean;
};

const FIELD_ORDER = new Map<ClarificationField, number>(
  CLARIFICATION_FIELD_VALUES.map((field, index) => [field, index]),
);

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function fieldValueIsValid(
  request: ClarificationRequest,
  draft: TripRequirementReviewDraft,
  now: Date,
): boolean {
  const candidate = draftToCandidate(draft);
  const value = candidate[request.field];

  // A blocking request must not disappear merely because an optional field is
  // represented by null/[] in the canonical draft.
  if (request.severity === "BLOCKING" && !hasValue(value)) return false;

  if (request.field === "durationDays" || request.field === "transport") {
    const errors = validateRequiredFields(draftToFormFields(draft));
    return !errors[request.field];
  }

  if (request.field === "startDate") {
    return typeof value === "string" &&
      isValidCalendarDate(value) &&
      value >= vietnamDateOf(now);
  }

  const parsed = tripRequirementInputSchema.partial().safeParse({
    [request.field]: value,
  });
  if (!parsed.success) return false;

  if (request.severity === "BLOCKING") {
    const complete = tripRequirementInputSchema.safeParse(candidate);
    if (complete.success) {
      const check = checkTripRequirement(complete.data, now);
      if (check.issues.some((issue) => issue.field === request.field && issue.severity === "ERROR")) {
        return false;
      }
    }
  }

  return true;
}

function requestSort(left: ClarificationRequest, right: ClarificationRequest): number {
  const severity = left.severity === right.severity ? 0 : left.severity === "BLOCKING" ? -1 : 1;
  return severity ||
    (FIELD_ORDER.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
      (FIELD_ORDER.get(right.field) ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id);
}

/**
 * Combines the AI response with the latest authoritative check response.
 * Later sources win for the same ID, so server/check data wins over AI data.
 * Blocking requests disappear only after the current draft value is valid.
 */
export function mergeClarificationRequests(
  fromAnalyze: readonly ClarificationRequest[],
  fromCheck: readonly ClarificationRequest[],
  localDraftState: ClarificationLocalDraftState,
  now = new Date(),
): ClarificationRequest[] {
  const byId = new Map<string, ClarificationRequest>();
  for (const request of fromAnalyze) byId.set(request.id, request);
  for (const request of fromCheck) byId.set(request.id, request);

  const dismissed = new Set(localDraftState.dismissedAdvisoryIds ?? []);
  return [...byId.values()]
    .filter((request) => {
      if (request.severity === "BLOCKING") {
        return !fieldValueIsValid(request, localDraftState.draft, now);
      }
      return !dismissed.has(request.id);
    })
    .sort(requestSort);
}

export function blockingCount(requests: readonly ClarificationRequest[]): number {
  return requests.filter((request) => request.severity === "BLOCKING").length;
}

export function advisoryCount(requests: readonly ClarificationRequest[]): number {
  return requests.filter((request) => request.severity === "ADVISORY").length;
}

export function firstBlockingFieldKey(
  requests: readonly ClarificationRequest[],
): ReviewFieldKey | null {
  return requests.find((request) => request.severity === "BLOCKING")?.field ?? null;
}

/**
 * The confirmation button is enabled only when clarification and US-26 review
 * gates are all clear. The final server check remains authoritative.
 */
export function canConfirm(
  requests: readonly ClarificationRequest[],
  state: ClarificationConfirmationState,
): boolean {
  return blockingCount(requests) === 0 &&
    state.acknowledged &&
    state.editingKey === null &&
    !state.isChecking;
}

export function resetDismissedAdvisoriesForField(
  requestIds: readonly ClarificationRequest[],
  dismissedIds: readonly string[],
  field: ReviewFieldKey,
): string[] {
  const fieldIds = new Set(requestIds.filter((request) => request.field === field).map((request) => request.id));
  return dismissedIds.filter((id) => !fieldIds.has(id));
}

