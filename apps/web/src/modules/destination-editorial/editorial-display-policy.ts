import type { EditorialContext } from "./editorial-contract";

// Exact empty-field sentinels only. Never strip a phrase from genuine prose.
export function editorialValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return /^(?:chưa có dữ liệu|đang cập nhật|không có thông tin|n\/?a|undefined|null|[-–—])\.?$/iu.test(text) ? "" : text;
}
export const hasEditorialDuration = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
export function hasEditorialCoordinates(data: { latitude: unknown; longitude: unknown }): data is { latitude: number; longitude: number } {
  return typeof data.latitude === "number" && typeof data.longitude === "number" && Number.isFinite(data.latitude) && Number.isFinite(data.longitude) && Math.abs(data.latitude) <= 90 && Math.abs(data.longitude) <= 180;
}
const dayNames: Record<string, string> = { MONDAY: "Thứ Hai", TUESDAY: "Thứ Ba", WEDNESDAY: "Thứ Tư", THURSDAY: "Thứ Năm", FRIDAY: "Thứ Sáu", SATURDAY: "Thứ Bảy", SUNDAY: "Chủ Nhật" };
export function editorialVisitData(data: Pick<EditorialContext, "area" | "suggestedDurationMinutes" | "openingDays">) {
  const hours = data.openingDays.flatMap(day => {
    if (!dayNames[day.dayOfWeek]) return [];
    if (day.status === "CLOSED") return [{ label: dayNames[day.dayOfWeek]!, value: "Đóng cửa" }];
    const intervals = day.intervals.filter(i => /^([01]\d|2[0-3]):[0-5]\d$/.test(i.opensAt) && (/^([01]\d|2[0-3]):[0-5]\d$/.test(i.closesAt) || i.closesAt === "24:00") && i.opensAt < i.closesAt);
    return day.status === "OPEN" && intervals.length ? [{ label: dayNames[day.dayOfWeek]!, value: intervals.map(i => `${i.opensAt}–${i.closesAt}`).join(", ") }] : [];
  });
  return { area: editorialValue(data.area), duration: hasEditorialDuration(data.suggestedDurationMinutes) ? data.suggestedDurationMinutes : null, hours };
}
export function hasEditorialFacts(data: Pick<EditorialContext, "area" | "category" | "suggestedDurationMinutes">) {
  return Boolean(editorialValue(data.area) || editorialValue(data.category) || hasEditorialDuration(data.suggestedDurationMinutes));
}
export const AI_LAYOUT_PRESERVED = "AI chưa tạo được đề xuất hợp lệ. Bố cục hiện tại đã được giữ nguyên. Bạn có thể thử lại hoặc sử dụng Tự động dàn trang.";
