import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { companionManageFixture } from "@/modules/trip-companions/companion-management-fixtures";
import { CompanionManagementView } from "./companion-management-view";
import type { CompanionManage } from "@/modules/trip-companions/companion-management-contract";

describe("CompanionManagementView Component", () => {
  it("renders header, status cards, and distinguishes companion management from trip editing", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: companionManageFixture,
      }),
    );

    // Header & Eyebrow
    expect(html).toContain("Bảng quản lý của chủ chuyến");
    expect(html).toContain("Quản lý bài tuyển bạn đồng hành");

    // Distinction notice with link to trip edit
    expect(html).toContain("Chỉnh sửa lịch trình gốc của chuyến đi");
    expect(html).toContain('href="/trips/synthetic-trip/edit"');

    // Status cards
    expect(html).toContain("Trạng thái bài đăng");
    expect(html).toContain("Công khai");
    expect(html).toContain("Đang mở tuyển");
    expect(html).toContain("Sức chứa &amp; Thành viên");
    expect(html).toContain("rev #0");

    // Form inputs
    expect(html).toContain("Tiêu đề bài đăng");
    expect(html).toContain("Cùng khám phá Hà Giang");
    expect(html).toContain("Số chỗ tìm thêm");
    expect(html).toContain("Lời giới thiệu chuyến đi");
  });

  it("renders 'Đã đóng tuyển' and 'Đã gỡ bài' when management is closed and withdrawn", () => {
    const closedWithdrawn: CompanionManage = {
      ...companionManageFixture,
      visibility: "WITHDRAWN",
      recruitmentOpen: false,
    };

    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: closedWithdrawn,
      }),
    );

    expect(html).toContain("Đã gỡ bài");
    expect(html).toContain("Công khai lại bài");
    expect(html).toContain("Đã đóng tuyển");
    expect(html).toContain("Mở nhận người lại");
  });

  it("shows disabled notice when trip has departed or completed (canReopen is false)", () => {
    const departedManagement: CompanionManage = {
      ...companionManageFixture,
      canReopen: false,
      visibility: "WITHDRAWN",
      recruitmentOpen: false,
    };

    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: departedManagement,
      }),
    );

    expect(html).toContain("Chuyến đi đã đến ngày hoặc kết thúc, không thể công khai lại.");
    expect(html).toContain("Chuyến đi đã đến ngày hoặc kết thúc, không thể mở tuyển lại.");
  });

  it("shows active member count and enforces capacity lower bound", () => {
    const withMembers: CompanionManage = {
      ...companionManageFixture,
      activeMemberCount: 2,
      draft: {
        ...companionManageFixture.draft,
        additionalCapacity: 3,
      },
    };

    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: withMembers,
      }),
    );

    expect(html).toContain("1 chỗ còn trống");
    expect(html).toContain("2 người");
    expect(html).toContain("Tối thiểu là 2 chỗ");
  });

  it("renders danger zone with cancel trip button when not canceled", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: companionManageFixture,
      }),
    );

    expect(html).toContain('data-testid="companion-danger-zone"');
    expect(html).toContain('data-testid="companion-open-cancel-modal-btn"');
    expect(html).toContain("Hủy chuyến đồng hành");
    expect(html).not.toContain('data-testid="companion-management-canceled-banner"');
  });

  it("renders canceled banner and disables management controls when publication is canceled", () => {
    const canceledManagement: CompanionManage = {
      ...companionManageFixture,
      canceledAt: "2026-10-28T12:00:00.000Z",
      recruitmentOpen: false,
      visibility: "WITHDRAWN",
    };

    const html = renderToStaticMarkup(
      createElement(CompanionManagementView, {
        management: canceledManagement,
      }),
    );

    expect(html).toContain('data-testid="companion-management-canceled-banner"');
    expect(html).toContain("Chuyến đồng hành này đã bị hủy");
    expect(html).toContain("Bài đăng đã hủy vào 28/10/2026");
    expect(html).not.toContain('data-testid="companion-danger-zone"');
  });
});
