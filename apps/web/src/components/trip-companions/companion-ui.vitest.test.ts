import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/favorite-button", () => ({
  default: ({ targetId, initialIsFavorite }: { targetId: string; initialIsFavorite: boolean }) =>
    createElement(
      "button",
      { type: "button", "data-trip-heart": targetId, "aria-pressed": initialIsFavorite },
      initialIsFavorite ? "Bỏ chuyến đi khỏi yêu thích" : "Thêm chuyến đi vào yêu thích",
    ),
}));

import { publicCompanionFixture, companionFormFixture } from "@/modules/trip-companions/companion-fixtures";
import { CompanionIntroductionView } from "./companion-introduction-view";
import { PublicationFormClient } from "@/app/trips/[id]/publication/publication-form-client";
import { TripDetailView } from "@/app/trips/trips-view";
import type { TripDetail } from "@/modules/trip-read/trip-read-service";

describe("Companion UI Components", () => {
  describe("CompanionIntroductionView", () => {
    it("renders host, dates, transport, route, and capacity correctly", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          publicationId: "pub-123",
        }),
      );

      // Host & Title
      expect(html).toContain("Chủ chuyến mẫu");
      expect(html).toContain("Chủ chuyến");
      expect(html).toContain("Cùng khám phá Hà Giang");

      // Dates & Duration & Transport
      expect(html).toContain("15 – 16/11/2030");
      expect(html).toContain("2 ngày");
      expect(html).toContain("Xe máy");

      // Route
      expect(html).toContain("Điểm đến mẫu");

      // Capacity spotlight and label
      expect(html).toContain("Còn 2 chỗ tìm thêm");
      expect(html).toContain("Số chỗ tìm thêm: 2 (chưa tính chủ chuyến)");

      // Member-only disclosure
      expect(html).toContain("Lịch trình chi tiết và thảo luận nhóm dành cho thành viên");

      // Image
      expect(html).toContain('src="https://example.invalid/companion-fixture.jpg"');
      expect(html).toContain('alt="Ảnh điểm đến mẫu"');

      // No fake approval CTA button
      expect(html).not.toContain("Gửi yêu cầu tham gia");
      expect(html).not.toContain("Chờ duyệt");
    });

    it("renders cleanly without image when image is null", () => {
      const introWithoutImage = {
        ...publicCompanionFixture.introduction,
        image: null,
      };

      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: introWithoutImage,
        }),
      );

      expect(html).not.toContain("companion-hero-image");
      expect(html).toContain("Về chuyến đi");
      expect(html).toContain("Còn 2 chỗ tìm thêm");
    });

    it("escapes user-authored introduction as plain text without executing markup", () => {
      const injectionIntro = {
        ...publicCompanionFixture.introduction,
        introduction: "<b>In đậm</b> <script>alert(1)</script>",
      };

      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: injectionIntro,
        }),
      );

      // React escapes HTML tags in text content
      expect(html).toContain("&lt;b&gt;In đậm&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
    });

    it("renders preview indicator banner when isPreview is true", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          isPreview: true,
        }),
      );

      expect(html).toContain("Góc nhìn người xem trước");
      expect(html).toContain("giao diện người dùng và khách sẽ nhìn thấy");
    });

    it("renders 'Đăng nhập để tham gia' CTA when viewer is a Guest", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          publicationId: "pub-123",
          isGuest: true,
        }),
      );

      expect(html).toContain("Đăng nhập để tham gia");
      expect(html).toContain('href="/login?returnTo=%2Ftrip-companions%2Fpub-123"');
      expect(html).toContain("data-testid=\"companion-guest-login-cta\"");
    });

    it("renders 'Tham gia chuyến đi' button when viewer is an outsider candidate", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          publicationId: "pub-123",
          isGuest: false,
          isHost: false,
          isMember: false,
        }),
      );

      expect(html).toContain("Tham gia chuyến đi");
      expect(html).toContain("data-testid=\"companion-join-btn\"");
      expect(html).toContain("Không cần xét duyệt");
    });

    it("renders 'Vào nhóm chuyến' and member badge when viewer is a confirmed Member", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          publicationId: "pub-123",
          isMember: true,
        }),
      );

      expect(html).toContain("Bạn đã là thành viên của chuyến đi");
      expect(html).toContain("Vào nhóm chuyến");
      expect(html).toContain('href="/trip-companions/pub-123/group"');
    });

    it("shows return-to-management link and enter-group link when viewer is the host", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          publicationId: "pub-123",
          isHost: true,
          tripId: "trip-456",
        }),
      );

      expect(html).toContain("Quay lại quản lý chuyến đi");
      expect(html).toContain("/trips/trip-456");
      expect(html).toContain("Vào nhóm chuyến");
      expect(html).toContain('href="/trip-companions/pub-123/group"');
    });

    it("does not show return-to-management link when viewer is not host", () => {
      const html = renderToStaticMarkup(
        createElement(CompanionIntroductionView, {
          introduction: publicCompanionFixture.introduction,
          isHost: false,
        }),
      );

      expect(html).not.toContain("Quay lại quản lý chuyến đi");
    });
  });

  describe("PublicationFormClient", () => {
    it("renders form fields, read-only baseline, and helper copy for unpublished trip", () => {
      const html = renderToStaticMarkup(
        createElement(PublicationFormClient, {
          tripId: "trip-789",
          context: companionFormFixture,
        }),
      );

      // Read-only baseline
      expect(html).toContain("Hành trình đã lưu (Chỉ đọc)");
      expect(html).toContain("2030-11-15 – 2030-11-16");
      expect(html).toContain("2 ngày");
      expect(html).toContain("Xe máy");
      expect(html).toContain("Điểm đến mẫu");

      // Form inputs and labels
      expect(html).toContain("Tiêu đề bài đăng");
      expect(html).toContain("Số chỗ tìm thêm");
      expect(html).toContain("Không tính bạn và những người đã đi cùng sẵn có. Mỗi tài khoản tham gia dùng một chỗ.");
      expect(html).toContain("Lời giới thiệu chuyến đi");
      expect(html).toContain("Không dùng ảnh");

      // Actions
      expect(html).toContain("Xem trước");
      expect(html).toContain("Xem trước để công khai");
      expect(html).not.toContain("Xác nhận công khai");
    });

    it("renders already-published notice with link to public introduction", () => {
      const alreadyPublishedContext = {
        ...companionFormFixture,
        publication: {
          publicationId: "pub-already",
          draft: {
            title: "Chuyến đi đã xuất bản",
            introduction: "Đã đăng trước đó",
            additionalCapacity: 3,
            imageMediaId: null,
          },
        },
      };

      const html = renderToStaticMarkup(
        createElement(PublicationFormClient, {
          tripId: "trip-789",
          context: alreadyPublishedContext,
        }),
      );

      expect(html).toContain("Chuyến đi đã được công khai");
      expect(html).toContain("Xem bài giới thiệu công khai");
      expect(html).toContain("/trip-companions/pub-already");
      expect(html).toContain("Quay lại chi tiết chuyến đi");
    });
  });

  describe("TripDetailView entry integration", () => {
    it("renders link to /trips/[id]/publication when trip is UPCOMING or ONGOING", () => {
      const trip: TripDetail = {
        id: "trip-sample",
        status: "UPCOMING",
        startDate: "2030-11-15",
        endDate: "2030-11-16",
        durationDays: 2,
        transport: "MOTORCYCLE",
        isFavorite: false,
        visitCount: 1,
        manuallyCompletedAt: null,
        days: [],
      };

      const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));

      expect(html).toContain("/trips/trip-sample/publication");
      expect(html).toContain("Tìm bạn đồng hành");
    });

    it("does not render companion link when trip is COMPLETED", () => {
      const trip: TripDetail = {
        id: "trip-completed",
        status: "COMPLETED",
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        durationDays: 2,
        transport: "CAR",
        isFavorite: false,
        visitCount: 1,
        manuallyCompletedAt: "2026-01-02T10:00:00Z",
        days: [],
      };

      const html = renderToStaticMarkup(createElement(TripDetailView, { trip }));
      expect(html).not.toContain("/trips/trip-completed/publication");
    });
  });
});
