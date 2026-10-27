import type { PlanningNeeds, PlanningPreferenceField } from "./planning-contract";
import { normalizePlanningReply } from "./planning-reply-normalization";

export function statedPlanningGroupSize(text: string) {
  const value = normalizePlanningReply(text);
  const digits = value.match(/\b(\d{1,2})\s+nguoi\b/);
  if (digits) { const count = Number(digits[1]); return count >= 1 && count <= 20 ? count : undefined; }
  const words = ["mot", "hai", "ba", "bon", "nam", "sau", "bay", "tam", "chin", "muoi", "muoi mot", "muoi hai", "muoi ba", "muoi bon", "muoi lam", "muoi sau", "muoi bay", "muoi tam", "muoi chin", "hai muoi"];
  const token = "(?:mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi)";
  const phrase = value.match(new RegExp(`(?:^| )((?:${token} ){0,3}${token}) nguoi(?: |$)`))?.[1];
  const index = words.indexOf(phrase ?? "");
  if (index !== -1) return index + 1;
  return undefined;
}

const questions: Record<PlanningPreferenceField, string> = {
  interests: "Trải nghiệm bạn thích: thiên nhiên, văn hóa, ẩm thực, chụp ảnh hay mạo hiểm?",
  pace: "Nhịp đi: bạn muốn thư thả, vừa phải hay trải nghiệm nhiều nhất có thể?",
  companions: "Đi cùng: bạn đi một mình hay cùng ai?",
  mobility: "Lưu ý di chuyển: bạn hoặc người đi cùng có cần lưu ý gì không? Ví dụ: hạn chế đi bộ, dễ say xe, có trẻ nhỏ hoặc người lớn tuổi.",
  destinations: "Điểm muốn ghé: có nơi nào nhất định phải đến hoặc muốn tránh không? Nếu chưa có, bạn có thể để mình gợi ý.",
};

export function missingPlanningPreferences(needs: PlanningNeeds): PlanningPreferenceField[] {
  const r = needs.requirement;
  const answered: Record<PlanningPreferenceField, boolean> = {
    interests: !!r.interests?.length, pace: !!r.pace, companions: !!r.companions,
    mobility: !!r.mobilityConstraints,
    destinations: !!(needs.requiredDestinationIds.length || needs.preferredDestinationIds.length || needs.excludedDestinationIds?.length),
  };
  return (Object.keys(questions) as PlanningPreferenceField[]).filter(field => !answered[field] && !needs.skippedPreferences?.includes(field));
}

export function planningPreferenceGuidance(needs: PlanningNeeds) {
  const field = currentPlanningPreference(needs);
  const companions = needs.companionDraft;
  const question = field === "companions" && companions?.type ? `Nhóm mình đi tổng cộng bao nhiêu người?` : field === "companions" && companions?.groupSize ? `Nhóm ${companions.groupSize} người của bạn là gia đình, bạn bè hay đi cùng ai?` : field ? questions[field] : "";
  return question ? `${question}\nBạn có thể bỏ qua câu này nếu chưa chốt.` : "";
}

export const currentPlanningPreference = (needs: PlanningNeeds) => missingPlanningPreferences(needs)[0];
export function skipPlanningPreference(needs: PlanningNeeds, field: PlanningPreferenceField): PlanningNeeds {
  return { ...needs, skippedPreferences: [...new Set([...(needs.skippedPreferences ?? []), field])] };
}
export const isPreferenceSkipReply = (text: string) => /^(?:(?:toi|minh) )?(?:bo qua(?: cau nay| muc nay)?|de ai goi y|ban cu goi y|tuy ban|chua biet)$/.test(normalizePlanningReply(text));

export function asksPlanningGuidance(text: string) {
  return /^(?:(?:vay|the|con|a|ua) )?(?:khong (?:can|co) luu y gi (?:ha|a|sao|khong)|co can luu y gi (?:khong|nua khong)|can luu y gi|(?:toi|minh) (?:can|phai) tra loi (?:nhung gi|gi|them gi)|con (?:thong tin|cau hoi) (?:gi|nao)(?: can bo sung)?|ban (?:khong hoi|chua hoi) (?:ve )?(?:luu y|nguoi di cung|nhip di))$/.test(normalizePlanningReply(text));
}

export function explicitlySkipsPreferences(text: string) {
  const value = normalizePlanningReply(text);
  return /^(?:(?:toi|minh) )?bo qua (?:het|tat ca|phan con lai|cac cau con lai)$/.test(value)
    || /(?:^| )(?:(?:phan|cac y|cac phan) )?con lai (?:thi )?(?:tuy (?:ban|ai)|(?:de (?:ai|ban)|ban cu) goi y|(?:minh|toi) chua biet)(?: nhe)?$/.test(value)
    || /(?:^| )bo qua (?:phan|cac y|cac cau) con lai(?: nhe)?$/.test(value);
}

/** Record an explicit no/skip without inventing a preference or a restriction. */
export function explicitPreferenceSkips(text: string): PlanningPreferenceField[] {
  const value = normalizePlanningReply(text);
  if (text.trim().endsWith("?") || /\b(?:ha|sao|hay khong)$/.test(value)) return [];
  const skips: PlanningPreferenceField[] = [];
  const negative = "(?:khong co|khong can|khong yeu cau|chua co|chua biet|bo qua)";
  if (new RegExp(`${negative} (?:han che|luu y)(?: (?:gi|khi|ve|di chuyen|suc khoe))?`).test(value)) skips.push("mobility");
  if (new RegExp(`${negative} (?:diem|noi)(?: den| ghe| nao| bat buoc)?|(?:diem den|diem ghe|diem bat buoc) (?:thi )?(?:chua co|chua chot|tuy ban|de ai goi y)`).test(value)) skips.push("destinations");
  if (new RegExp(`(?:bo qua|chua biet) (?:nhip|toc do)|(?:nhip di|nhip do) (?:thi )?(?:tuy ban|chua biet)`).test(value)) skips.push("pace");
  if (new RegExp(`(?:bo qua|chua biet) (?:nguoi di cung|di cung ai|so nguoi)`).test(value)) skips.push("companions");
  if (new RegExp(`${negative} so thich|(?:so thich|trai nghiem) (?:thi )?(?:tuy ban|chua biet)|bo qua so thich`).test(value)) skips.push("interests");
  return skips;
}

export type PlanningPreferenceReply = { label: string; text: string; interest?: string; exclusive?: "pace" | "companions" };
const quickReplies: Record<PlanningPreferenceField, PlanningPreferenceReply[]> = {
  interests: [{ label: "Thiên nhiên", text: "Mình thích trải nghiệm thiên nhiên", interest: "thiên nhiên" }, { label: "Văn hóa", text: "Mình thích trải nghiệm văn hóa", interest: "văn hóa" }, { label: "Thích mạo hiểm", text: "Mình thích trải nghiệm mạo hiểm", interest: "mạo hiểm" }],
  pace: [{ label: "Đi thư thả", text: "Mình muốn đi thư thả", exclusive: "pace" }, { label: "Đi vừa phải", text: "Mình muốn nhịp đi vừa phải", exclusive: "pace" }, { label: "Nhiều trải nghiệm", text: "Mình muốn trải nghiệm nhiều nhất có thể", exclusive: "pace" }],
  companions: [{ label: "Đi một mình", text: "Mình đi một mình, 1 người", exclusive: "companions" }, { label: "Đi với người yêu", text: "Mình đi với người yêu", exclusive: "companions" }, { label: "Đi với gia đình", text: "Mình đi với gia đình", exclusive: "companions" }, { label: "Đi với bạn bè", text: "Mình đi với bạn bè", exclusive: "companions" }, { label: "Nhóm khác", text: "Mình đi cùng một nhóm khác", exclusive: "companions" }],
  mobility: [{ label: "Không có lưu ý di chuyển", text: "Không có lưu ý di chuyển" }],
  destinations: [{ label: "Để AI gợi ý điểm đến", text: "Mình chưa có điểm đến bắt buộc, bạn gợi ý giúp mình" }],
};
export const planningExclusiveTexts = (group: NonNullable<PlanningPreferenceReply["exclusive"]>) => quickReplies[group].map(reply => reply.text);
export const planningPreferenceReplies = (needs: PlanningNeeds) => {
  const field = currentPlanningPreference(needs);
  if (field === "companions" && needs.companionDraft?.type) return [2, 3, 4, 5, 6].map(size => ({ label: `${size} người`, text: `Nhóm mình có ${size} người`, exclusive: "companions" as const }));
  return field ? quickReplies[field] : [];
};
