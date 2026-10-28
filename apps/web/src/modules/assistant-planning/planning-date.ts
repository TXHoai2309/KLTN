import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { formatVietnameseDate } from "../../lib/date-only";
import type { z } from "zod";
import type { planningDepartureWindowSchema } from "./planning-contract";

export type DepartureWindow = z.infer<typeof planningDepartureWindowSchema>;
export type PlanningDateResolution =
  | { kind: "NONE" }
  | { kind: "EXACT"; date: string }
  | { kind: "WINDOW"; window: DepartureWindow }
  | { kind: "CLARIFY"; message: string; candidateDate?: string };
const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Calendar arithmetic is date-only. The caller supplies the server's Vietnam date,
 * never the browser clock or a date invented by the language model. */
export function resolvePlanningDate(expression: string, anchorDate: string): PlanningDateResolution {
  const value = plain(expression).replace(/\b(?:ngay\s+)?(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?/g, (_m, d, m, y) => `${d}/${m}${y ? `/${y}` : ""}`);
  if (/\b(?:hoac|hay)\b/.test(value) && /\bmai\b|ngay kia|\d+[/.\-]\d+/.test(value)) return { kind: "CLARIFY", message: "Mình thấy bạn đang cân nhắc nhiều ngày. Bạn muốn chọn ngày nào làm ngày khởi hành?" };
  if (/\b(?:khoang|tam|gan)\s+(?:ngay\s+)?\d+[/.\-]\d+/.test(value)) return { kind: "CLARIFY", message: "Mình hiểu đây mới là ngày dự kiến. Bạn muốn chốt ngày đó hay để ngày khởi hành chốt sau và xem bản sơ bộ trước?" };
  if (/\b(?:tuan sau|tuan toi)\b/.test(value)) {
    const weekday = new Date(`${anchorDate}T00:00:00Z`).getUTCDay();
    const from = addDays(anchorDate, 8 - (weekday || 7));
    return { kind: "WINDOW", window: { from, to: addDays(from, 6), anchorDate } };
  }
  if (/\bthu (?:nay|toi|sau|hai|ba|tu|nam|sau|bay|[2-7])\b|\bchu nhat\b/.test(value)) return { kind: "CLARIFY", message: "Bạn cho mình ngày/tháng cụ thể của thứ đó nhé? Mình muốn tránh hiểu lệch giữa tuần này và tuần tới." };
  const matches = [...value.matchAll(/\b(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?)(?![\d/.\-])/g)];
  if (matches.length > 1) return { kind: "CLARIFY", message: "Mình thấy bạn nhắc nhiều ngày. Bạn muốn chọn ngày nào làm ngày khởi hành?" };
  if (matches.length) {
    const m = matches[0]!;
    const year = Number(m[1] ?? m[6] ?? anchorDate.slice(0, 4));
    const month = Number(m[2] ?? m[5]), day = Number(m[3] ?? m[4]);
    const date = iso(year, month, day);
    if (!isValidCalendarDate(date)) return { kind: "CLARIFY", message: `Ngày ${day}/${month}/${year} không có trong lịch. Bạn kiểm tra lại ngày và tháng giúp mình nhé?` };
    if (date < anchorDate) {
      const candidateDate = iso(year + 1, month, day);
      if (!m[1] && !m[6] && isValidCalendarDate(candidateDate)) return { kind: "CLARIFY", candidateDate, message: `${formatVietnameseDate(date)} đã qua. Có phải bạn muốn khởi hành ${formatVietnameseDate(candidateDate)} không?` };
      return { kind: "CLARIFY", message: `${formatVietnameseDate(date)} đã qua. Bạn chọn ngày khởi hành từ ${formatVietnameseDate(anchorDate)} trở đi nhé?` };
    }
    return { kind: "EXACT", date };
  }
  if (/\b(?:ngay kia|ngay mot)\b/.test(value)) return { kind: "EXACT", date: addDays(anchorDate, 2) };
  if (/\b(?:ngay mai|mai)\b/.test(value)) return { kind: "EXACT", date: addDays(anchorDate, 1) };
  if (/\bhom nay\b/.test(value)) return { kind: "EXACT", date: anchorDate };
  if (/\b(?:tuan|thang|cuoi tuan)\b/.test(value)) return { kind: "CLARIFY", message: "Mình chưa xác định được ngày khởi hành từ cách nói này. Bạn cho ngày/tháng cụ thể, hoặc nói “chưa chốt ngày” để xem bản sơ bộ nhé?" };
  return { kind: "NONE" };
}

export const departureWindowLabel = (window: DepartureWindow) => `${formatVietnameseDate(window.from)}–${formatVietnameseDate(window.to)}`;
