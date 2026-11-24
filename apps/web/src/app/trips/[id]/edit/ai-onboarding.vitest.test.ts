import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AiEditBar, { type AiEditBarProps, type TripIssueHint } from "./ai-edit-bar";

function render(overrides: Partial<AiEditBarProps>) {
  return renderToStaticMarkup(createElement(AiEditBar, {
    open: true,
    onToggleOpen: () => {},
    inputValue: "",
    onInputChange: () => {},
    disabled: false,
    state: { kind: "IDLE" },
    onSubmitPrompt: () => {},
    onRetry: () => {},
    onUndoAiStep: () => {},
    onDismissApplied: () => {},
    ...overrides,
  }));
}

const issue: TripIssueHint = {
  key: "visit:v4",
  label: "Chợ tình Khâu Vai (Ngày 2): Lượt tham quan nằm ngoài giờ hoạt động.",
  prompt: "Sửa giúp tôi lỗi của Chợ tình Khâu Vai ở Ngày 2",
};

describe("Saved-trip assistant onboarding", () => {
  it("names each blocking issue with a one-tap fix and plain wording", () => {
    const html = render({ issues: [issue] });

    expect(html).toContain("Lịch đã lưu có 1 điểm cần xem lại");
    expect(html).toContain("Chợ tình Khâu Vai (Ngày 2): Lượt tham quan nằm ngoài giờ hoạt động.");
    expect(html).toContain("Sửa giúp tôi");
    expect(html).not.toContain("bản nháp chỉnh sửa");
    expect(html).not.toContain("16 lượt");
  });

  it("says the trip is fine once the check passes, and stays quiet while it is still running", () => {
    expect(render({ issues: [] })).toContain("Lịch của bạn hiện ổn");
    const pending = render({ issues: null });
    expect(pending).not.toContain("Lịch của bạn hiện ổn");
    expect(pending).not.toContain("điểm cần xem lại");
  });

  it("shows quick suggestion chips on initial view with trip fixes first, and hides them during chat or location prompts", () => {
    const emptyHtml = render({
      issues: [issue],
      messages: [],
    });

    const chips = emptyHtml.split('aria-label="Gợi ý câu hỏi nhanh"')[1] ?? "";
    expect(chips.indexOf("Sửa giúp tôi lỗi của Chợ tình Khâu Vai ở Ngày 2")).toBeGreaterThanOrEqual(0);
    expect(chips.indexOf("Sửa giúp tôi lỗi của Chợ tình Khâu Vai")).toBeLessThan(chips.indexOf("Tôi đi thế này được không?"));
    expect(emptyHtml).not.toContain("Gợi ý câu hỏi</button>");

    const activeChatHtml = render({
      issues: [issue],
      messages: [{ id: "m1", role: "user", text: "chào" }, { id: "m2", role: "assistant", kind: "ADVISED", text: "Chào bạn" }],
    });
    expect(activeChatHtml).not.toContain('aria-label="Gợi ý câu hỏi nhanh"');

    const locationPromptHtml = render({
      issues: [issue],
      messages: [],
      state: {
        kind: "NEEDS_LOCATION",
        prompt: "Yêu cầu này cần vị trí hiện tại.",
        pendingMessage: "Quán ăn gần đây?",
        locationFlow: { status: "idle", requestId: 0 },
        manualPickerOpen: false,
        manualCoords: null,
        coverageError: null,
      },
    });
    expect(locationPromptHtml).not.toContain('aria-label="Gợi ý câu hỏi nhanh"');
  });
});
