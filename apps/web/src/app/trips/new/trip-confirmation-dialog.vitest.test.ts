import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TripConfirmationDialog from "./trip-confirmation-dialog";

describe("TripConfirmationDialog", () => {
  it("renders minimal trip with no personalization cleanly without repetitive 'Chưa chọn'", () => {
    const html = renderToStaticMarkup(
      createElement(TripConfirmationDialog, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        durationDays: "3",
        transport: "CAR",
        startDate: "",
        companionType: "",
        companionGroupSize: "",
        interests: [],
        pace: "",
        mobilityFlags: [],
        mobilityNote: "",
      }),
    );

    expect(html).toContain("Sẵn sàng tạo hành trình");
    expect(html).toContain("3 ngày · Ô tô");
    expect(html).toContain("Chưa chốt ngày");
    expect(html).toContain("Chưa thêm tùy chọn cá nhân hóa.");
    expect(html).not.toMatch(/Người đi cùng: Chưa chọn/);
    expect(html).not.toMatch(/Sở thích: Chưa chọn/);
    expect(html).toContain("Quay lại chỉnh sửa");
    expect(html).toContain("Tạo bằng AI");
  });

  it("renders filled personalization and explicit start date", () => {
    const html = renderToStaticMarkup(
      createElement(TripConfirmationDialog, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        durationDays: "4",
        transport: "MOTORCYCLE",
        startDate: "2026-10-27",
        companionType: "FRIENDS",
        companionGroupSize: "4",
        interests: ["NATURE", "PHOTOGRAPHY"],
        pace: "MODERATE",
        mobilityFlags: [],
        mobilityNote: "",
      }),
    );

    expect(html).toContain("4 ngày · Xe máy");
    expect(html).toContain("Khởi hành 27/10/2026");
    expect(html).toContain("Bạn bè (4 người)");
    expect(html).toContain("Thiên nhiên");
    expect(html).toContain("Chụp ảnh");
    expect(html).toContain("Vừa phải");
    expect(html).not.toContain("Chưa thêm tùy chọn cá nhân hóa.");
  });

  it("disables actions and renders spinner while isSubmitting is true", () => {
    const html = renderToStaticMarkup(
      createElement(TripConfirmationDialog, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        isSubmitting: true,
        durationDays: "3",
        transport: "CAR",
        startDate: "",
        companionType: "",
        companionGroupSize: "",
        interests: [],
        pace: "",
        mobilityFlags: [],
        mobilityNote: "",
      }),
    );

    expect(html).toContain("Đang chuẩn bị…");
    expect(html).toContain('disabled=""');
  });

  it("renders accessible dialog semantics", () => {
    const html = renderToStaticMarkup(
      createElement(TripConfirmationDialog, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        durationDays: "2",
        transport: "CAR",
        startDate: "",
        companionType: "",
        companionGroupSize: "",
        interests: [],
        pace: "",
        mobilityFlags: [],
        mobilityNote: "",
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="trip-confirm-dialog-title"');
    expect(html).toContain('aria-describedby="trip-confirm-dialog-desc"');
  });

  it("renders nothing when isOpen is false", () => {
    const html = renderToStaticMarkup(
      createElement(TripConfirmationDialog, {
        isOpen: false,
        onClose: () => {},
        onConfirm: () => {},
        durationDays: "2",
        transport: "CAR",
        startDate: "",
        companionType: "",
        companionGroupSize: "",
        interests: [],
        pace: "",
        mobilityFlags: [],
        mobilityNote: "",
      }),
    );

    expect(html).toBe("");
  });
});
