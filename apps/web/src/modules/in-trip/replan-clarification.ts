import {
  createEditClarification,
  editClarificationSchema,
  type EditClarification,
  type EditClarificationContext,
} from "../trip-edit/edit-clarification";
import type {
  EditIntentClarificationReason,
  EditIntentResult,
} from "../trip-edit/edit-intent-contract";

const CLARIFICATION_PROMPTS: Record<EditIntentClarificationReason, string> = {
  MISSING_TARGET: "Bạn muốn thay đổi lượt ghé hoặc chọn điểm nào làm điểm kết thúc bắt buộc?",
  MISSING_TIME: "Bạn muốn dùng giờ nào cho thay đổi hoặc phải đến điểm bắt buộc trước mấy giờ (HH:mm)?",
  MISSING_DAY: "Bạn muốn chọn ngày nào trong phần hành trình còn lại?",
  AMBIGUOUS_TARGET: "Bạn muốn chỉnh sửa lượt ghé nào trong phần hành trình còn lại? Hãy chọn một lượt.",
  AMBIGUOUS_DESTINATION: "Bạn muốn chọn điểm đến nào? Hãy chọn một điểm trong danh sách.",
  OUT_OF_SCOPE:
    "Trợ lý trong chuyến đi chỉ đề xuất thay đổi phần hành trình chưa qua giờ theo lịch. Để sửa ngày bắt đầu, ngân sách hoặc số người, hãy dùng chỉnh sửa thủ công hoặc tạo hành trình mới.",
};

function clarificationIntent(reason: EditIntentClarificationReason): EditIntentResult {
  return {
    intentType: "UNCLEAR",
    targetVisitIds: [],
    destinationId: null,
    params: {
      dayIndex: null,
      position: null,
      startTime: null,
      durationMinutes: null,
    },
    affected: { visitIds: [], dayIndexes: [] },
    needsClarification: true,
    clarificationReason: reason,
  };
}

/** Generate stable Vietnamese clarification text and choices from server data. */
export function createReplanClarification(
  reason: EditIntentClarificationReason,
  context: EditClarificationContext,
): EditClarification {
  const reusableClarification = createEditClarification(
    reason,
    clarificationIntent(reason),
    context,
  );

  return editClarificationSchema.parse({
    ...reusableClarification,
    prompt: CLARIFICATION_PROMPTS[reason],
  });
}
