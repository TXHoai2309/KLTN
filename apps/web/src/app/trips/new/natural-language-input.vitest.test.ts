import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import NaturalLanguageInput from "./natural-language-input";

describe("US-40 natural-language graceful degradation", () => {
  it("shows a distinct AI failure, working retry label and manual path", () => {
    const html = renderToStaticMarkup(createElement(NaturalLanguageInput, {
      status: { kind: "failure", message: "Dịch vụ AI hiện tạm thời không khả dụng." },
      onAnalyze: vi.fn(),
      onContinueManually: vi.fn(),
    }));

    expect(html).toContain("Trợ lý AI tạm thời không khả dụng");
    expect(html).toContain("Dịch vụ AI hiện tạm thời không khả dụng.");
    expect(html).toContain("Thử lại");
    expect(html).toContain("Nhập bằng biểu mẫu");
    expect(html).toContain('role="alert"');
  });
});
