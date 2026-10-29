import type { EditCandidateDiff } from "../trip-edit/edit-candidate";
import type { EditClarification } from "../trip-edit/edit-clarification";
import type { TripValidation } from "../trip-validation/trip-validation";
import type { QaCompletedTurn } from "../ai/qa-contract";
import { fallbackPlanningV2Reply, planningResponsePlan } from "./planning-response";
import { EMPTY_PLANNING_NEEDS } from "../assistant-planning/planning-contract";

export type InTripResponsePlan = {
  mode: "IN_TRIP";
  goal: "READ_TRIP" | "NEXT_VISIT" | "ASK_LOCATION" | "ASK_CLARIFICATION" | "AWAIT_CONFIRMATION" | "APPLY_SUCCESS" | "APPLY_REJECTED" | "APPLY_UNKNOWN" | "FAILED" | "CANCELLED" | "ALL_COMPLETED" | "QA_ANSWER" | "QA_FAILED" | "QA_CLARIFY" | "QA_UNSUPPORTED";
  status?: "PROPOSED" | "NEEDS_CLARIFICATION" | "REJECTED" | "FAILED" | "UNKNOWN" | "SUCCESS";
  code?: string; requiresConfirmation: boolean; currentLocationSource: "GPS" | "MANUAL" | "UNKNOWN";
  affectedDays?: number[]; diff?: EditCandidateDiff; validation?: TripValidation;
  clarification?: EditClarification; nextVisit?: { name: string; day: number };
  labels?: Record<string, string>; qa?: QaCompletedTurn; compound?: boolean;
};
export function inTripReply(plan: InTripResponsePlan) {
  if (plan.goal.startsWith("QA_")) return fallbackPlanningV2Reply({ ...planningResponsePlan(EMPTY_PLANNING_NEEDS), goal: plan.goal as "QA_ANSWER" | "QA_FAILED" | "QA_CLARIFY" | "QA_UNSUPPORTED", qa: plan.qa, compound: plan.compound });
  const name = (id: string) => plan.labels?.[id] ?? "điểm trong lịch";
  switch (plan.goal) {
    case "READ_TRIP": return "Mình đã đọc hành trình đã lưu hiện tại. Bạn muốn xem lượt tiếp theo hay đề xuất chỉnh phần nào?";
    case "NEXT_VISIT": return plan.nextVisit ? `Lượt tiếp theo theo lịch là ${plan.nextVisit.name}, ngày ${plan.nextVisit.day}. Đây là thứ tự trong lịch, chưa xác định từ vị trí hiện tại.` : "Hành trình không còn lượt chưa hoàn thành theo lịch.";
    case "ASK_LOCATION": return "Thay đổi này cần vị trí hiện tại để kiểm tra chặng còn lại. Bạn có thể chủ động dùng GPS hoặc chọn tọa độ thủ công; nếu GPS không dùng được, hãy chọn thủ công.";
    case "ASK_CLARIFICATION": return `${plan.clarification?.prompt ?? "Bạn muốn chỉnh điểm hoặc ngày nào?"}${plan.clarification?.choices?.length ? `\n${plan.clarification.choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n")}` : ""}`;
    case "AWAIT_CONFIRMATION": {
      const changes = [
        ...(plan.diff?.removed.map(v => `bỏ ${name(v.destinationId)} ở ngày ${v.dayIndex}`) ?? []),
        ...(plan.diff?.added.map(v => `thêm ${name(v.destinationId)} ở ngày ${v.dayIndex}`) ?? []),
        ...(plan.diff?.updated.map(v => v.before.destinationId !== v.after.destinationId ? `thay ${name(v.before.destinationId)} bằng ${name(v.after.destinationId)} ở ngày ${v.after.dayIndex}` : `đổi ${name(v.after.destinationId)} ở ngày ${v.before.dayIndex}${v.after.dayIndex !== v.before.dayIndex ? ` sang ngày ${v.after.dayIndex}` : " theo phương án"}`) ?? []),
      ];
      return `Mình đề xuất ${changes.join("; ") || "giữ lịch theo phương án này"}. Phương án chưa được áp dụng. ${plan.requiresConfirmation ? "Các kiểm tra hiện tại đáp ứng; bạn xác nhận áp dụng phương án này không?" : "Phương án còn vi phạm hoặc chưa đủ dữ liệu kiểm tra, nên chưa thể áp dụng."}`;
    }
    case "APPLY_SUCCESS": return "Mình đã áp dụng phương án vào hành trình sau khi hệ thống xác nhận ghi thành công.";
    case "APPLY_UNKNOWN": return "Chưa rõ kết quả áp dụng; cần đối soát đúng yêu cầu và mã cũ. Mình chặn thay đổi tiếp, bạn vẫn có thể hỏi đáp kiến thức.";
    case "APPLY_REJECTED": return "Phương án chưa được áp dụng: hành trình hoặc kết quả kiểm tra đã thay đổi, hoặc phạm vi yêu cầu không được hỗ trợ. Hãy xem lại và đề xuất lại trước khi xác nhận.";
    case "FAILED": return "Chưa hoàn tất bước xử lý. Chưa có xác nhận áp dụng thành công; bạn có thể thử lại bước đọc hoặc tạo đề xuất.";
    case "CANCELLED": return "Mình đã bỏ đề xuất đang chờ; hành trình đã lưu không thay đổi.";
    case "ALL_COMPLETED": return "Hành trình không còn lượt chưa hoàn thành theo lịch để đề xuất lại.";
  }
  return "Chưa hoàn tất bước xử lý hành trình.";
}
