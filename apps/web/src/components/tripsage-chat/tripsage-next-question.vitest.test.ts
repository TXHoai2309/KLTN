import { describe, expect, it } from "vitest";

import { splitTrailingQuestion } from "./tripsage-chat-client";

describe("splitTrailingQuestion", () => {
  it("lifts a bold closing question and keeps the rest of the prose", () => {
    expect(splitTrailingQuestion("Lịch 5 ngày qua Đồng Văn.\n\n**Bạn muốn xuất phát từ đâu?**")).toEqual({ body: "Lịch 5 ngày qua Đồng Văn.\n", question: "Bạn muốn xuất phát từ đâu?" });
  });

  it("leaves prose alone when the last line is not a question", () => {
    const text = "Bạn muốn đi mấy ngày? Mình gợi ý 4 ngày.";
    expect(splitTrailingQuestion(text)).toEqual({ body: text, question: null });
  });

  it("returns an empty body when the whole answer is the question", () => {
    expect(splitTrailingQuestion("Bạn đi mấy người?")).toEqual({ body: "", question: "Bạn đi mấy người?" });
  });
});
