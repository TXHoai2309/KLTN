import type { QaSourceReview } from "./qa-source-sufficiency";

// Public notices and presentation choices are server-owned, never source prose.
export const QA_ASPECT_KINDS = ["IDENTITY", "LOCATION", "DESIGNATION", "GEOLOGY", "CULTURE", "ADMISSION", "OPENING_HOURS", "CURRENT_VALIDITY", "ACCESSIBILITY", "OTHER"] as const;
export type QaAspectKind = typeof QA_ASPECT_KINDS[number];
export const QA_UNANSWERED_ASPECT = "Một phần câu hỏi chưa có đủ dữ liệu được xác minh để trả lời.";
const notices: Record<QaAspectKind, string> = {
  IDENTITY: "Chưa đủ dữ liệu xác minh thông tin giới thiệu được hỏi.",
  LOCATION: "Chưa đủ dữ liệu xác minh vị trí được hỏi.",
  DESIGNATION: "Chưa đủ dữ liệu xác minh danh hiệu hoặc xếp hạng được hỏi.",
  GEOLOGY: "Chưa đủ dữ liệu xác minh đặc điểm địa chất được hỏi.",
  CULTURE: "Chưa đủ dữ liệu xác minh thông tin văn hóa được hỏi.",
  ADMISSION: "Chưa đủ dữ liệu xác minh giá vé hoặc phạm vi áp dụng được hỏi.",
  OPENING_HOURS: "Chưa đủ dữ liệu xác minh giờ mở cửa được hỏi.",
  CURRENT_VALIDITY: "Chưa xác minh được thông tin trong hồ sơ còn áp dụng tại thời điểm bạn hỏi.",
  ACCESSIBILITY: "Chưa đủ dữ liệu xác minh điều kiện di chuyển hoặc khả năng tiếp cận được hỏi. Bạn cần hạn chế đi bộ, bậc thang hay có yêu cầu nào khác về di chuyển?",
  OTHER: QA_UNANSWERED_ASPECT,
};

export function qaMissingAspectNotices(review?: QaSourceReview): string[] {
  const missing = review?.aspects.filter(aspect => aspect.status === "MISSING") ?? [];
  return [...new Set(missing.map(aspect => notices[aspect.kind ?? "OTHER"]))].slice(0, 10);
}

export const QA_ANSWER_PRESENTATIONS = ["PARAGRAPHS", "LIST", "TABLE"] as const;
export function qaAnswerPresentation(question: string, partCount: number): typeof QA_ANSWER_PRESENTATIONS[number] {
  if (partCount < 2) return "PARAGRAPHS";
  if (/(?:so sánh|khác nhau|đối chiếu)/iu.test(question)) return "TABLE";
  if (/(?:liệt kê|những|các đặc điểm|có gì nổi bật|có gì đặc biệt)/iu.test(question)) return "LIST";
  return "PARAGRAPHS";
}
