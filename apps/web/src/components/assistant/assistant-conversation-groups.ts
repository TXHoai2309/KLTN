import type { QaConversationSummary } from "../../modules/ai/qa-contract";

export type ConversationGroup = {
  label: string;
  items: QaConversationSummary[];
};

export function groupConversationsByDate(
  conversations: readonly QaConversationSummary[],
  now = new Date()
): ConversationGroup[] {
  const today: QaConversationSummary[] = [];
  const yesterday: QaConversationSummary[] = [];
  const last7Days: QaConversationSummary[] = [];
  const older: QaConversationSummary[] = [];

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

  for (const c of conversations) {
    const time = new Date(c.lastActivityAt).getTime();
    if (time >= startOfToday) {
      today.push(c);
    } else if (time >= startOfYesterday) {
      yesterday.push(c);
    } else if (time >= startOf7Days) {
      last7Days.push(c);
    } else {
      older.push(c);
    }
  }

  const groups: ConversationGroup[] = [];
  if (today.length > 0) groups.push({ label: "Hôm nay", items: today });
  if (yesterday.length > 0) groups.push({ label: "Hôm qua", items: yesterday });
  if (last7Days.length > 0) groups.push({ label: "7 ngày trước", items: last7Days });
  if (older.length > 0) groups.push({ label: "Cũ hơn", items: older });
  return groups;
}
