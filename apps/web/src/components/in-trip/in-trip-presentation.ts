export const REMAINING_EMPTY_MESSAGE = "Hiện chưa có lượt nào để đề xuất lại";

export function inTripDateLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function inTripVisitStatus(completed: boolean): "Đã qua giờ" | "Sắp tới" {
  return completed ? "Đã qua giờ" : "Sắp tới";
}
