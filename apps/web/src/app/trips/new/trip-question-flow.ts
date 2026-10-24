import {
  validateRequiredFields,
  type TripRequirementFormFields,
} from "@/modules/trip-requirement/trip-requirement-form-logic";

/**
 * Pure presentation helpers for the one-question-at-a-time `/trips/new` flow.
 * Business validation remains owned by `validateRequiredFields` and the server.
 */
export const REQUIRED_QUESTION_IDS = ["duration", "transport"] as const;
export const OPTIONAL_QUESTION_IDS = [
  "companions",
  "interests",
  "pace",
  "mobility",
] as const;

export type RequiredQuestionId = (typeof REQUIRED_QUESTION_IDS)[number];
export type OptionalQuestionId = (typeof OPTIONAL_QUESTION_IDS)[number];
export type QuestionId = RequiredQuestionId | OptionalQuestionId;
export type TripFlowView = QuestionId | "ready";

const REQUIRED_LABELS: Record<RequiredQuestionId, string> = {
  duration: "Câu 1/2",
  transport: "Câu 2/2",
};

export function isOptionalQuestion(view: TripFlowView): view is OptionalQuestionId {
  return (OPTIONAL_QUESTION_IDS as readonly string[]).includes(view);
}

export function questionProgress(
  view: TripFlowView,
): { index: number; total: number; label: string } | null {
  if (view === "ready") return null;
  if (view === "duration" || view === "transport") {
    return {
      index: REQUIRED_QUESTION_IDS.indexOf(view) + 1,
      total: REQUIRED_QUESTION_IDS.length,
      label: REQUIRED_LABELS[view],
    };
  }
  return {
    index: OPTIONAL_QUESTION_IDS.indexOf(view) + 1,
    total: OPTIONAL_QUESTION_IDS.length,
    label: `Tùy chọn ${OPTIONAL_QUESTION_IDS.indexOf(view) + 1}/${OPTIONAL_QUESTION_IDS.length}`,
  };
}

/** The first required answer still missing or invalid, else the ready summary. */
export function firstIncompleteView(fields: TripRequirementFormFields): TripFlowView {
  const errors = validateRequiredFields(fields);
  if (errors.durationDays) return "duration";
  if (errors.transport) return "transport";
  return "ready";
}

export function nextQuestion(view: TripFlowView): TripFlowView {
  if (view === "duration") return "transport";
  if (view === "transport") return "ready";
  if (view === "ready") return "ready";
  const index = OPTIONAL_QUESTION_IDS.indexOf(view);
  return OPTIONAL_QUESTION_IDS[index + 1] ?? "ready";
}

export function nextOptionalQuestion(view: OptionalQuestionId): OptionalQuestionId | "ready" {
  const index = OPTIONAL_QUESTION_IDS.indexOf(view);
  return OPTIONAL_QUESTION_IDS[index + 1] ?? "ready";
}

/** Maps a validation/check field to the question that owns it. */
export function viewForField(field: string): TripFlowView | null {
  if (field === "durationDays") return "duration";
  if (field === "transport") return "transport";
  if (field === "startDate") return "ready";
  if (field.startsWith("companions")) return "companions";
  if (field === "interests") return "interests";
  if (field === "pace") return "pace";
  if (field.startsWith("mobilityConstraints")) return "mobility";
  return null;
}

/** Maps the shared check result's root field names to form field keys. */
export function formFieldForCheckField(field: string): string {
  if (field === "companions") return "companions.type";
  if (field === "mobilityConstraints") return "mobilityConstraints.flags";
  return field;
}

export function questionAnnouncement(view: TripFlowView): string {
  const progress = questionProgress(view);
  return progress ? progress.label : "Thông tin chuyến đi đã sẵn sàng";
}
