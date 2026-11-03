import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const searchParamsMock = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh() {} }),
  usePathname: () => "/trip-companions",
  useSearchParams: () => searchParamsMock,
}));

import { publicCompanionFixture } from "@/modules/trip-companions/companion-fixtures";
import { CompanionDiscoveryView } from "./companion-discovery-view";
import type { CompanionList } from "@/modules/trip-companions/companion-contract";

describe("CompanionDiscoveryView Component", () => {
  const sampleList: CompanionList = {
    items: [publicCompanionFixture],
    total: 1,
    nextCursor: null,
  };

  const sampleListWithCursor: CompanionList = {
    items: [publicCompanionFixture],
    total: 5,
    nextCursor: "cursor-page-2",
  };

  it("renders hero title, eyebrow, and Đăng chuyến đi CTA button pointing to /trips", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "explore",
      }),
    );

    expect(html).toContain("Tìm bạn đồng hành Hà Giang");
    expect(html).toContain("Cộng đồng đồng hành");
    expect(html).toContain("Đăng chuyến đi");
    expect(html).toContain('href="/trips"');
    expect(html).toContain("Chọn từ Chuyến đi đã lưu để công khai tìm bạn");
  });

  it("renders all three scope tabs: Khám phá chuyến, Chuyến tôi đăng, and Tôi tham gia", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "explore",
      }),
    );

    expect(html).toContain("Khám phá chuyến");
    expect(html).toContain("Chuyến tôi đăng");
    expect(html).toContain("Tôi tham gia");
    expect(html).toContain('data-testid="tab-explore"');
    expect(html).toContain('data-testid="tab-mine"');
    expect(html).toContain('data-testid="tab-joined"');
  });

  it("renders filter controls: keyword search, date range, transport, and availability checkbox", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "explore",
      }),
    );

    // Search input
    expect(html).toContain('data-testid="companion-search-input"');
    expect(html).toContain("Tìm tiêu đề hoặc điểm đến trong tuyến...");

    // Date inputs
    expect(html).toContain('data-testid="companion-from-date"');
    expect(html).toContain('data-testid="companion-to-date"');

    // Transport select
    expect(html).toContain('data-testid="companion-transport-select"');
    expect(html).toContain("Tất cả phương tiện");
    expect(html).toContain("Ô tô");
    expect(html).toContain("Xe máy");

    // Availability checkbox
    expect(html).toContain('data-testid="companion-available-checkbox"');
    expect(html).toContain("Chỉ hiện chuyến còn chỗ");
  });

  it("renders companion card with full details: title, host, dates, transport, places, route, and CTA", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "explore",
      }),
    );

    // Title
    expect(html).toContain("Cùng khám phá Hà Giang");

    // Capacity tag
    expect(html).toContain("Còn 2 chỗ tìm thêm");

    // Date & Duration & Transport
    expect(html).toContain("15 – 16/11/2030");
    expect(html).toContain("2 ngày");
    expect(html).toContain("Xe máy");

    // Route summary
    expect(html).toContain("Điểm đến mẫu");

    // Host
    expect(html).toContain("Chủ chuyến mẫu");
    expect(html).toContain("Chủ chuyến");

    // CTA
    expect(html).toContain("Xem chuyến");
    expect(html).toContain('href="/trip-companions/synthetic-publication"');
  });

  it("renders empty state when there are 0 items", () => {
    const emptyList: CompanionList = {
      items: [],
      total: 0,
      nextCursor: null,
    };

    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: emptyList,
        initialTab: "explore",
      }),
    );

    expect(html).toContain("Không tìm thấy chuyến đi nào phù hợp");
    expect(html).toContain('data-testid="companion-empty-state"');
  });

  it("renders load-more button when nextCursor is available", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleListWithCursor,
        initialTab: "explore",
      }),
    );

    expect(html).toContain("Tải thêm chuyến đi");
    expect(html).toContain('data-testid="companion-load-more-btn"');
  });

  it("does not render load-more button when nextCursor is null", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "explore",
      }),
    );

    expect(html).not.toContain("Tải thêm chuyến đi");
    expect(html).not.toContain('data-testid="companion-load-more-btn"');
  });

  it("renders Vào nhóm CTA button pointing to /group when tab is joined", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionDiscoveryView, {
        initialData: sampleList,
        initialTab: "joined",
      }),
    );

    expect(html).toContain("Vào nhóm");
    expect(html).toContain('href="/trip-companions/synthetic-publication/group"');
    expect(html).toContain("Đã tham gia");
  });
});
