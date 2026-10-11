import type { QaCompletedTurn, QaPublicCitation } from "../src/modules/ai/qa-contract";

export type CitationFixture = "ONE" | "MULTI" | "LONG" | "MANY";
export function citationFixture(kind: CitationFixture): Extract<QaCompletedTurn, { status: "ANSWERED" }> {
  const count = kind === "MANY" ? 50 : kind === "ONE" ? 1 : 3;
  const citations: QaPublicCitation[] = Array.from({ length: count }, (_, i) => ({
    id: `fixture_c${i + 1}`, sourceId: i < 2 ? "source_fixture_only" : `fixture_source_${i}`,
    title: kind === "LONG" ? `DỮ LIỆU MÔ PHỎNG ${i + 1} — ${"Tài_liệu_kiểm_thử_".repeat(16)}`.slice(0, 300) : `DỮ LIỆU MÔ PHỎNG ${i + 1} — không phải nguồn xác minh`,
    sourceUrl: i === 1 ? "https://example.com/" : null,
    locators: i === 0 ? [] : [{ pageNumber: 3 }, { section: "Mục mô phỏng" }, { pageNumber: 7, section: "Phần kiểm thử" }],
  }));
  return {
    conversationId: "conv_fixture", turnId: "turn_fixture", turnState: "COMPLETED", context: { type: "GENERAL" },
    status: "ANSWERED", unansweredAspects: [], citations: [...citations].reverse(),
    answerParts: [{ text: "DEMO / DỮ LIỆU MÔ PHỎNG. Nội dung kiểm thử citation, không phải dữ kiện du lịch.", citationIds: citations.map((c) => c.id) },
      ...(count > 1 ? [{ text: "Phần mô phỏng tiếp theo dùng lại cùng nguồn; các disclosure hoạt động độc lập.", citationIds: ["fixture_c1", "fixture_c2"] }] : [])],
  };
}
