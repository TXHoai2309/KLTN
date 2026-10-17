import { describe, expect, it } from "vitest";
import { groupConversationsByDate } from "./assistant-conversation-groups";
import type { QaConversationSummary } from "../../modules/ai/qa-contract";

describe("groupConversationsByDate", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  const makeSummary = (id: string, dateStr: string): QaConversationSummary => ({
    id,
    title: `Chat ${id}`,
    context: { type: "GENERAL" },
    createdAt: dateStr,
    lastActivityAt: dateStr,
  });

  it("returns empty array for empty conversations", () => {
    expect(groupConversationsByDate([], now)).toEqual([]);
  });

  it("correctly groups conversations into today, yesterday, 7 days, older", () => {
    const list: QaConversationSummary[] = [
      makeSummary("1", "2026-10-17T08:00:00Z"), // Today
      makeSummary("2", "2026-10-16T15:00:00Z"), // Yesterday
      makeSummary("3", "2026-10-14T10:00:00Z"), // 3 days ago (within 7 days)
      makeSummary("4", "2026-10-01T12:00:00Z"), // Older
    ];

    const groups = groupConversationsByDate(list, now);
    expect(groups).toHaveLength(4);
    expect(groups[0]?.label).toBe("Hôm nay");
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["1"]);
    expect(groups[1]?.label).toBe("Hôm qua");
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["2"]);
    expect(groups[2]?.label).toBe("7 ngày trước");
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["3"]);
    expect(groups[3]?.label).toBe("Cũ hơn");
    expect(groups[3]?.items.map((i) => i.id)).toEqual(["4"]);
  });

  it("omits empty groups", () => {
    const list: QaConversationSummary[] = [
      makeSummary("1", "2026-10-17T11:00:00Z"),
    ];

    const groups = groupConversationsByDate(list, now);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Hôm nay");
  });
});
