import { z } from "zod";

import { AppError } from "@/server/http/app-error";
import {
  EDIT_INTENT_CLARIFICATION_REASON_VALUES,
  type EditIntentClarificationReason,
  type EditIntentResult,
  type VerifiedEditDestinationId,
  type VerifiedEditVisitId,
} from "./edit-intent-contract";

const entityIdSchema = z.string().min(1).max(128);

export const editResolutionSchema = z
  .object({
    selectedVisitId: entityIdSchema.optional(),
    selectedDestinationId: entityIdSchema.optional(),
  })
  .strict()
  .refine(
    (resolution) =>
      Number(resolution.selectedVisitId !== undefined) +
        Number(resolution.selectedDestinationId !== undefined) ===
      1,
    "Chọn đúng một phương án làm rõ.",
  );

export type EditResolution = z.infer<typeof editResolutionSchema>;

const editClarificationChoiceSchema = z
  .object({
    label: z.string().min(1).max(200),
    resolution: editResolutionSchema,
  })
  .strict();

export const editClarificationSchema = z
  .object({
    code: z.enum(EDIT_INTENT_CLARIFICATION_REASON_VALUES),
    prompt: z.string().min(1).max(500),
    choices: z.array(editClarificationChoiceSchema).max(50).optional(),
  })
  .strict();

export type EditClarification = z.infer<typeof editClarificationSchema>;

export type EditClarificationVisit = {
  visitId: string;
  destinationId: string;
  destinationName: string;
  dayIndex: number;
  startMinute: number;
};

export type EditClarificationDestination = {
  id: string;
  name: string;
};

export type EditClarificationContext = {
  visits: readonly EditClarificationVisit[];
  eligibleDestinations: readonly EditClarificationDestination[];
};

const QUESTION_BY_REASON: Record<EditIntentClarificationReason, string> = {
  MISSING_TARGET: "Bạn muốn chỉnh sửa điểm đến nào trong hành trình?",
  MISSING_TIME: "Bạn muốn dùng giờ bắt đầu hoặc thời lượng nào cho điểm đến này?",
  MISSING_DAY: "Bạn muốn thêm hoặc chuyển điểm đến sang ngày nào trong hành trình?",
  AMBIGUOUS_TARGET: "Bạn muốn chỉnh sửa lượt ghé nào? Chọn một điểm trong hành trình.",
  AMBIGUOUS_DESTINATION: "Bạn muốn chọn điểm đến nào? Chọn một điểm trong danh sách.",
  OUT_OF_SCOPE:
    "Ở đây bạn có thể thêm, xóa, sắp xếp, chuyển ngày, đổi giờ/thời lượng hoặc thay điểm đến. Để đổi ngày bắt đầu, ngân sách hoặc số người, hãy dùng chỉnh sửa thủ công hoặc tạo hành trình mới.",
};

function formatStartTime(startMinute: number): string {
  const hours = Math.floor(startMinute / 60).toString().padStart(2, "0");
  const minutes = (startMinute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Create stable Vietnamese clarification text and choices only from server data. */
export function createEditClarification(
  reason: EditIntentClarificationReason,
  intent: EditIntentResult,
  context: EditClarificationContext,
): EditClarification {
  let choices: EditClarification["choices"];
  if (reason === "AMBIGUOUS_TARGET") {
    const visitsById = new Map(context.visits.map((visit) => [visit.visitId, visit]));
    const candidateVisitIds = intent.targetVisitIds.length > 0
      ? intent.targetVisitIds
      : context.visits.map((visit) => visit.visitId);
    choices = candidateVisitIds.flatMap((visitId) => {
      const visit = visitsById.get(visitId);
      return visit
        ? [{
            label: `${visit.destinationName} · Ngày ${visit.dayIndex} · ${formatStartTime(visit.startMinute)}`,
            resolution: { selectedVisitId: visit.visitId },
          }]
        : [];
    });
  } else if (reason === "AMBIGUOUS_DESTINATION") {
    choices = context.eligibleDestinations.map((destination) => ({
      label: destination.name,
      resolution: { selectedDestinationId: destination.id },
    }));
  }

  return editClarificationSchema.parse({
    code: reason,
    prompt: QUESTION_BY_REASON[reason],
    ...(choices !== undefined ? { choices } : {}),
  });
}

function invalidResolution(): AppError {
  return new AppError("VALIDATION_ERROR", "Lựa chọn làm rõ không hợp lệ.", 400, {
    fieldErrors: { resolution: "Lựa chọn không còn thuộc các phương án được máy chủ xác minh." },
  });
}

/** Reject forged/non-current IDs before another provider request is made. */
export function assertResolutionReferencesServerData(
  rawResolution: EditResolution | undefined,
  context: EditClarificationContext,
): void {
  if (rawResolution === undefined) return;
  const parsed = editResolutionSchema.safeParse(rawResolution);
  if (!parsed.success) throw invalidResolution();
  if (
    parsed.data.selectedVisitId !== undefined &&
    !context.visits.some((visit) => visit.visitId === parsed.data.selectedVisitId)
  ) {
    throw invalidResolution();
  }
  if (
    parsed.data.selectedDestinationId !== undefined &&
    !context.eligibleDestinations.some(
      (destination) => destination.id === parsed.data.selectedDestinationId,
    )
  ) {
    throw invalidResolution();
  }
}

/** Revalidate a submitted choice against this request's newly loaded server context. */
export function resolveEditIntent(
  intent: EditIntentResult,
  rawResolution: EditResolution | undefined,
  context: EditClarificationContext,
): EditIntentResult {
  if (rawResolution === undefined) return intent;
  assertResolutionReferencesServerData(rawResolution, context);
  const parsed = editResolutionSchema.safeParse(rawResolution);
  if (!parsed.success || !intent.needsClarification) throw invalidResolution();

  if (parsed.data.selectedVisitId !== undefined) {
    const visit = context.visits.find((item) => item.visitId === parsed.data.selectedVisitId);
    const candidateVisitIds = intent.targetVisitIds.length > 0
      ? intent.targetVisitIds
      : context.visits.map((item) => item.visitId);
    if (
      intent.clarificationReason !== "AMBIGUOUS_TARGET" ||
      !visit ||
      !candidateVisitIds.includes(parsed.data.selectedVisitId as VerifiedEditVisitId)
    ) {
      throw invalidResolution();
    }
    const visitId = visit.visitId as VerifiedEditVisitId;
    return {
      ...intent,
      targetVisitIds: [visitId],
      affected: {
        visitIds: [...new Set([...intent.affected.visitIds, visitId])],
        dayIndexes: [...new Set([...intent.affected.dayIndexes, visit.dayIndex])].sort(
          (left, right) => left - right,
        ),
      },
      needsClarification: false,
      clarificationReason: null,
    };
  }

  const destinationId = parsed.data.selectedDestinationId;
  const destination = context.eligibleDestinations.find((item) => item.id === destinationId);
  if (intent.clarificationReason !== "AMBIGUOUS_DESTINATION" || !destination) {
    throw invalidResolution();
  }

  return {
    ...intent,
    destinationId: destination.id as VerifiedEditDestinationId,
    needsClarification: false,
    clarificationReason: null,
  };
}
