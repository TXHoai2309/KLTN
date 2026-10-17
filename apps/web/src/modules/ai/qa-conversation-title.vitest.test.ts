import { describe, expect, it } from "vitest";
import { generateConversationTitle } from "./qa-conversation-title";

describe("generateConversationTitle", () => {
  it("returns fallback for empty or whitespace strings", () => {
    expect(generateConversationTitle("")).toBe("Cuộc hội thoại mới");
    expect(generateConversationTitle("   ")).toBe("Cuộc hội thoại mới");
  });

  it("strips common conversational Vietnamese prefixes", () => {
    expect(generateConversationTitle("Cho mình hỏi về đèo Mã Pí Lèng?")).toBe("Đèo Mã Pí Lèng");
    expect(generateConversationTitle("Bạn ơi cho tôi hỏi hoa tam giác mạch nở tháng mấy?")).toBe("Hoa tam giác mạch nở tháng mấy");
    expect(generateConversationTitle("Giới thiệu ngắn gọn về Cột cờ Lũng Cú")).toBe("Cột cờ Lũng Cú");
    expect(generateConversationTitle("Hãy cho biết về ẩm thực Hà Giang...")).toBe("Ẩm thực Hà Giang");
  });

  it("capitalizes the first character properly in Vietnamese", () => {
    expect(generateConversationTitle("đường đi sông Nho Quế")).toBe("Đường đi sông Nho Quế");
    expect(generateConversationTitle("ăn gì ở Đồng Văn?")).toBe("Ăn gì ở Đồng Văn");
  });

  it("truncates at word boundary without breaking words or unicode", () => {
    const longQuestion = "Thời điểm nào trong năm hoa tam giác mạch ở Hà Giang nở rộ và đẹp nhất cho du khách đi trải nghiệm?";
    const title = generateConversationTitle(longQuestion, 40);
    expect(title.length).toBeLessThanOrEqual(41); // including ellipsis
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("  ");
  });

  it("preserves direct queries", () => {
    expect(generateConversationTitle("Giá vé vào cổng dinh vua Mèo")).toBe("Giá vé vào cổng dinh vua Mèo");
  });
});
