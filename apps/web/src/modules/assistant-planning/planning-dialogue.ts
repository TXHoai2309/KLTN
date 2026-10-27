import type { PlanningAnalysis, PlanningEdit, PlanningGenerated, PlanningNeeds } from "./planning-contract";
import { COMPANION_OPTIONS, INTEREST_OPTIONS, MOBILITY_CONSTRAINT_OPTIONS, PACE_OPTIONS } from "../trip-requirement/trip-requirement-contract";
import { formatVietnameseDate } from "../../lib/date-only";
import { departureWindowLabel } from "./planning-date";
import { missingPlanningPreferences, planningPreferenceGuidance } from "./planning-preferences";
import { normalizePlanningReply } from "./planning-reply-normalization";
export { normalizePlanningReply } from "./planning-reply-normalization";

export type NeedsField = "durationDays" | "transport" | "startDate" | "preferences";
export type PlanningPrompt =
  | { kind: "NEED"; field: NeedsField }
  | { kind: "RECAP" }
  | { kind: "REGENERATE" }
  | { kind: "DATE_CHANGE"; needs: PlanningNeeds }
  | { kind: "OPTIONS"; operation: NonNullable<PlanningAnalysis["operation"]>; choices: NonNullable<PlanningAnalysis["options"]>; version: number; required: boolean }
  | { kind: "CHANGE"; edit: PlanningEdit; version: number }
  | { kind: "APPLY_CHANGE"; version: number }
  | { kind: "SAVE"; version: number };

export function planningReply(text: string) {
  const reply = normalizePlanningReply(text);
  if (/^(co|co nhe|dong y|toi dong y|ok|okay|oke|duoc|duoc nhe|dung roi|dung roi tao di|tao di|lap di|tao hanh trinh|bat dau|them di|thay di|luu di|luu chuyen di|luu chuyen nay|xac nhan)$/.test(reply)) return "CONFIRM";
  if (/^(khong|khong nhe|thoi|huy|huy thay doi|khong doi nua|thoi khong doi nua|giu nguyen|giu nhu cu)$/.test(reply)) return "CANCEL";
  if (/^(bo qua|bo qua cau nay|bo qua muc nay|bo qua phan con lai|de ai goi y|chua biet|chua chot|chua chot ngay|chua co ngay|de sau|ban cu goi y|tuy ban)$/.test(reply)) return "SKIP";
  return null;
}
export function explicitlyDefersPlanningDate(text: string, askedForDate: boolean) {
  const value = normalizePlanningReply(text);
  return (askedForDate && planningReply(text) === "SKIP") || /\bchua (?:chot|co|biet|xac dinh) (?:duoc )?(?:ngay|lich|khi nao|bao gio)\b|\b(?:ngay di|ngay khoi hanh|lich di) (?:thi )?chua (?:chot|co|biet|xac dinh)\b/.test(value);
}
export function choiceIndex(text: string, choices: readonly { id: string; name: string }[]) {
  const value = normalizePlanningReply(text);
  const quoted = text.trim().match(/^(?:chọn\s+)?(\d+)[.):]\s*(.+)$/iu);
  if (quoted) {
    const index = Number(quoted[1]) - 1, choice = choices[index];
    if (choice) {
      const quotedName = normalizePlanningReply(quoted[2]!), name = normalizePlanningReply(choice.name);
      if (quotedName === name || quotedName.startsWith(`${name} `)) return index;
    }
  }
  const number = value.match(/^(?:(?:chon|them|thay|diem|phuong an|so)\s+)*(\d+)$/);
  if (number) return Number(number[1]) - 1;
  return choices.findIndex(c => value === normalizePlanningReply(c.name) || value === `chon ${normalizePlanningReply(c.name)}`);
}
export function needsRecap(needs: PlanningNeeds) {
  const r = needs.requirement;
  const label = (options: readonly { value: string; label: string }[], value: string | null | undefined) => options.find(o => o.value === value)?.label ?? "Chưa nêu";
  const interests = (r.interests ?? []).map(v => label(INTEREST_OPTIONS, v)).join(", ") || "Chưa nêu";
  const mobility = (r.mobilityConstraints?.flags ?? []).map(v => label(MOBILITY_CONSTRAINT_OPTIONS, v)).join(", ");
  const names = (ids: string[]) => ids.map(id => needs.destinationNames[id] ?? id).join(", ");
  return ["Mình tổng hợp lại chuyến đi của bạn nhé:", `${r.durationDays ?? "Chưa rõ"} ngày · ${r.transport === "CAR" ? "Ô tô" : r.transport === "MOTORCYCLE" ? "Xe máy" : "Chưa rõ phương tiện"}`, `Khởi hành: ${r.startDate ? formatVietnameseDate(r.startDate) : (needs.departureWindow ? `Dự kiến ${departureWindowLabel(needs.departureWindow)} — chưa chốt ngày cụ thể, chỉ tạo sơ bộ` : "Chưa chốt — chỉ tạo đề xuất sơ bộ, chưa thể lưu")}`, r.pace ? `Nhịp độ: ${label(PACE_OPTIONS, r.pace)}` : "", r.interests?.length ? `Bạn muốn trải nghiệm: ${interests}` : "", r.companions ? `Đi cùng: ${label(COMPANION_OPTIONS, r.companions.type)}, ${r.companions.groupSize} người` : needs.companionDraft ? `Đi cùng: ${label(COMPANION_OPTIONS, needs.companionDraft.type)}, ${needs.companionDraft.groupSize ? `${needs.companionDraft.groupSize} người` : "chưa chốt số người"}` : "", r.mobilityConstraints ? `Lưu ý khi di chuyển: ${[mobility, r.mobilityConstraints.note].filter(Boolean).join("; ")}` : "", needs.requiredDestinationIds.length ? `Nhất định ghé: ${names(needs.requiredDestinationIds)}` : "", needs.preferredDestinationIds.length ? `Muốn ghé thêm: ${names(needs.preferredDestinationIds)}` : "", needs.excludedDestinationIds?.length ? `Không đưa vào: ${names(needs.excludedDestinationIds)}` : "", "Bạn xem đã đúng ý chưa? Cần sửa gì cứ nhắn mình, hoặc nói “tạo đi” để mình lên lịch nhé."].filter(Boolean).join("\n");
}
export function nextNeedsPrompt(needs: PlanningNeeds, dateDeferred: boolean, preferencesDone: boolean, today?: string): { prompt: PlanningPrompt; message: string } {
  const r = needs.requirement;
  if (!r.durationDays) return { prompt: { kind: "NEED", field: "durationDays" }, message: "Bạn muốn đi mấy ngày?" };
  if (!r.transport) return { prompt: { kind: "NEED", field: "transport" }, message: `Chuyến ${r.durationDays} ngày nhé. Bạn sẽ đi ô tô hay xe máy?` };
  if (r.startDate && today && r.startDate < today) return { prompt: { kind: "NEED", field: "startDate" }, message: `Ngày ${formatVietnameseDate(r.startDate)} đã qua. Bạn muốn đổi sang ngày khởi hành nào?` };
  if (!r.startDate && needs.departureWindow && today && needs.departureWindow.to < today) return { prompt: { kind: "NEED", field: "startDate" }, message: `Khoảng ${departureWindowLabel(needs.departureWindow)} đã qua. Bạn dự tính đi vào ngày hoặc khoảng thời gian nào?` };
  if (!r.startDate && !dateDeferred && !needs.dateDeferred) return { prompt: { kind: "NEED", field: "startDate" }, message: needs.departureWindow ? `Mình hiểu bạn dự tính đi trong khoảng ${departureWindowLabel(needs.departureWindow)}, chưa chốt ngày cụ thể. Bạn muốn khởi hành ngày nào trong khoảng này, hay xem bản sơ bộ trước?` : "Bạn dự định khởi hành ngày nào? Nếu chưa chốt, bạn cứ nói chưa chốt ngày nhé." };
  if (!preferencesDone && !needs.preferencesDone && missingPlanningPreferences(needs).length) return { prompt: { kind: "NEED", field: "preferences" }, message: planningPreferenceGuidance(needs) };
  return { prompt: { kind: "RECAP" }, message: needsRecap(needs) };
}

export function proposalReply(generated: PlanningGenerated) {
  return generated.proposal.eligibleForFinalConfirmation
    ? "Mình đã lên lịch bên dưới và các bước kiểm tra đều đáp ứng. Bạn muốn chỉnh gì thêm hay lưu vào Chuyến đi của tôi?"
    : !generated.proposal.requirement.startDate
      ? "Mình lên bản sơ bộ bên dưới để bạn xem trước nhé. Khi chốt được ngày đi, bạn nhắn mình để kiểm tra giờ mở cửa và hoàn thiện trước khi lưu. Bạn muốn thêm hay đổi điểm nào không?"
      : "Mình đã lên bản đề xuất bên dưới, nhưng còn mục chưa đáp ứng hoặc thiếu dữ liệu kiểm tra nên chưa thể lưu. Bạn có thể xem chi tiết kiểm tra hoặc nhắn mình điều muốn chỉnh nhé.";
}
export function selectionNames(generated: PlanningGenerated) {
  return Object.fromEntries(generated.proposal.days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name])));
}
export function otherDayTimingChanges(before: PlanningGenerated, after: PlanningGenerated, editedDay: number) {
  const clock = (minute: number | null) => minute === null ? "chưa rõ" : `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
  return after.proposal.days.filter(day => day.day !== editedDay).flatMap(day => day.stops.flatMap(stop => {
    const prior = before.proposal.days.find(d => d.day === day.day)?.stops.find(s => s.destination.id === stop.destination.id);
    return prior && prior.arrivalMinute !== stop.arrivalMinute ? [`Ngày ${day.day}, ${stop.destination.name}: ${clock(prior.arrivalMinute)} → ${clock(stop.arrivalMinute)}`] : [];
  }));
}
export function editNeeds(needs: PlanningNeeds, edit: PlanningEdit, names: Record<string, string>): PlanningNeeds {
  const next = structuredClone(needs);
  const excluded = new Set(next.excludedDestinationIds ?? []);
  if ((edit.kind === "REMOVE" || edit.kind === "REPLACE") && edit.targetId) {
    excluded.add(edit.targetId);
    next.requiredDestinationIds = next.requiredDestinationIds.filter(id => id !== edit.targetId);
    next.preferredDestinationIds = next.preferredDestinationIds.filter(id => id !== edit.targetId);
  }
  if (edit.destinationId) {
    excluded.delete(edit.destinationId);
    if (edit.required) {
      if (!next.requiredDestinationIds.includes(edit.destinationId)) next.requiredDestinationIds.push(edit.destinationId);
      next.preferredDestinationIds = next.preferredDestinationIds.filter(id => id !== edit.destinationId);
    } else if (!next.preferredDestinationIds.includes(edit.destinationId) && !next.requiredDestinationIds.includes(edit.destinationId)) next.preferredDestinationIds.push(edit.destinationId);
  }
  next.excludedDestinationIds = [...excluded];
  next.destinationNames = { ...next.destinationNames, ...names };
  return next;
}
