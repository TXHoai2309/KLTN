import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AiEditBar, { type AiEditBarProps } from "./ai-edit-bar";
import {
  STREAM_INTERRUPTED_NOTICE,
  STREAM_STOPPED_NOTICE,
} from "@/modules/trip-edit/ai-stream-outcome";

function renderBar(overrides: Partial<AiEditBarProps>) {
  return renderToStaticMarkup(
    createElement(AiEditBar, {
      open: true,
      onToggleOpen: () => {},
      inputValue: "",
      onInputChange: () => {},
      disabled: false,
      state: { kind: "IDLE" },
      onSubmitPrompt: () => {},
      onStopStream: () => {},
      onRetry: () => {},
      onUndoAiStep: () => {},
      onDismissApplied: () => {},
      ...overrides,
    }),
  );
}

describe("Saved-trip assistant streaming UI (ADR-40 Ticket 03)", () => {
  it("renders tool steps, spinner, and Stop button while STREAMING before first text arrives", () => {
    const html = renderBar({
      messages: [{ id: "u-1", role: "user", text: "dời chợ tình Khâu Vai sang hôm khác" }],
      state: {
        kind: "STREAMING",
        prompt: "dời chợ tình Khâu Vai sang hôm khác",
        statusLabel: "Đang chạy thử: Dời Chợ tình Khâu Vai sang sáng ngày 2…",
        steps: ["Xem lịch", "Chạy thử 1 phương án"],
        text: "",
      },
    });

    expect(html).toContain("Đang chạy thử: Dời Chợ tình Khâu Vai sang sáng ngày 2…");
    expect(html).toContain("Chạy thử 1 phương án");
    expect(html).toContain("spinIcon");
    expect(html).toContain('aria-label="Dừng trả lời"');
    expect(html).toContain(">Dừng<");
    expect(html).not.toContain(">Gửi AI<");
  });

  it("collapses steps into a <details> summary line once streamed text starts arriving", () => {
    const html = renderBar({
      messages: [{ id: "u-1", role: "user", text: "sáng muốn nghỉ đến 9h" }],
      state: {
        kind: "STREAMING",
        prompt: "sáng muốn nghỉ đến 9h",
        statusLabel: "Đang soạn câu trả lời…",
        steps: ["Xem lịch", "Chạy thử 2 phương án", "Xem thời tiết"],
        text: "Mình đã thử hai cách để sáng bạn nghỉ đến 9h.",
      },
    });

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Đã xem lịch · chạy thử 2 phương án · xem thời tiết");
    expect(html).toContain("Mình đã thử hai cách để sáng bạn nghỉ đến 9h.");
    expect(html).toContain('aria-label="Dừng trả lời"');
  });

  it("removes advisory badges on ADVISED messages while keeping APPLIED badge and Correction notes", () => {
    const html = renderBar({
      messages: [
        { id: "u-1", role: "user", text: "lịch ổn không" },
        {
          id: "a-1",
          role: "assistant",
          kind: "ADVISED",
          steps: ["Xem lịch", "Xem thời tiết"],
          text: "Lịch ngày 1 khá thoải mái.",
          correctionNote: "Lưu ý: lịch trình hiện vẫn còn 1 điểm chưa đạt kiểm tra tính hợp lệ.",
        },
        { id: "u-2", role: "user", text: "dời điểm A sang 9h" },
        {
          id: "a-2",
          role: "assistant",
          kind: "APPLIED",
          steps: ["Xem lịch", "Chạy thử 1 phương án"],
          text: "Mình đã dời Điểm A sang 09:00 trên bản nháp.",
        },
      ],
      state: { kind: "IDLE" },
    });

    expect(html).not.toContain("Lịch chưa bị thay đổi");
    expect(html).not.toContain("Tư vấn · Lịch chưa bị thay đổi");
    expect(html).toContain("Đã áp dụng");
    expect(html).toContain("Lưu ý: lịch trình hiện vẫn còn 1 điểm chưa đạt kiểm tra tính hợp lệ.");
    expect(html).toContain("Đã xem lịch · xem thời tiết");
  });

  it("keeps partial text and shows notice + Retry button on INTERRUPTED and STOPPED entries", () => {
    const html = renderBar({
      messages: [
        { id: "u-1", role: "user", text: "dời điểm A" },
        {
          id: "a-1",
          role: "assistant",
          kind: "INTERRUPTED",
          text: "Mình đã dời Điểm A sang sáng ngày 2",
          statusNotice: STREAM_INTERRUPTED_NOTICE,
          retryPrompt: "dời điểm A",
        },
        { id: "u-2", role: "user", text: "tư vấn ngày 2" },
        {
          id: "a-2",
          role: "assistant",
          kind: "STOPPED",
          text: "Ngày 2 hiện hơi dày",
          statusNotice: STREAM_STOPPED_NOTICE,
          retryPrompt: "tư vấn ngày 2",
        },
      ],
      state: { kind: "IDLE" },
    });

    expect(html).toContain("Mình đã dời Điểm A sang sáng ngày 2");
    expect(html).toContain(STREAM_INTERRUPTED_NOTICE);
    expect(html).toContain("Ngày 2 hiện hơi dày");
    expect(html).toContain(STREAM_STOPPED_NOTICE);
    expect(html).toContain("Thử lại");
  });
});
