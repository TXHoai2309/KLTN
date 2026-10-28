import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
}));

import {
  companionGroupFixture,
  companionCanceledGroupFixture,
} from "@/modules/trip-companions/companion-group-fixtures";
import { companionMembersFixture } from "@/modules/trip-companions/companion-members-fixtures";
import {
  companionCanceledMessageFixture,
  companionHistoryFixture,
  companionSystemMessageFixture,
} from "@/modules/trip-companions/companion-chat-fixtures";
import { CompanionGroupView } from "./companion-group-view";
import type { CompanionGroup } from "@/modules/trip-companions/companion-group-contract";
import type { CompanionHistory } from "@/modules/trip-companions/companion-chat-contract";

describe("CompanionGroupView Component", () => {
  it("renders group header with title, relationship badge, metadata, and breadcrumbs", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
      }),
    );

    expect(html).toContain("Cùng khám phá Hà Giang");
    expect(html).toContain("Bạn là thành viên nhóm");
    expect(html).toContain("Không gian nhóm");
    expect(html).toContain("2 thành viên (bao gồm chủ chuyến)");
    expect(html).toContain("Xem trang giới thiệu");
    expect(html).toContain('href="/trip-companions/synthetic-publication"');
  });

  it("renders itinerary tab by default with days, visits, and timeline", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
      }),
    );

    expect(html).toContain("Lịch trình chi tiết");
    expect(html).toContain("Ngày 1");
    expect(html).toContain("15/11/2030");
    expect(html).toContain("Điểm đến mẫu");
    expect(html).toContain("08:00 – 09:00 (60 phút)");
    expect(html).toContain("Lịch trình chính thức do chủ chuyến cập nhật");
  });

  it("renders unavailable pill when destination availability is UNAVAILABLE", () => {
    const groupWithUnavailable: CompanionGroup = {
      ...companionGroupFixture,
      itinerary: {
        days: [
          {
            dayIndex: 1,
            localDate: "2030-11-15",
            visits: [
              {
                visitId: "v-unavail",
                order: 1,
                startMinute: 600,
                plannedDurationMinutes: 45,
                destination: {
                  destinationId: null,
                  name: "Điểm đến không còn khả dụng",
                  availability: "UNAVAILABLE",
                  latitude: null,
                  longitude: null,
                },
              },
            ],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: groupWithUnavailable,
      }),
    );

    expect(html).toContain("Điểm đến không còn khả dụng");
  });

  it("renders host controls and 'Chỉnh sửa lịch gốc' link when viewer is HOST", () => {
    const hostGroup: CompanionGroup = {
      ...companionGroupFixture,
      relationship: "HOST",
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: hostGroup,
        tripId: "trip-original-123",
      }),
    );

    expect(html).toContain("Bạn là chủ chuyến");
    expect(html).toContain("Chỉnh sửa lịch gốc");
    expect(html).toContain('href="/trips/trip-original-123/edit"');
    expect(html).not.toContain("Rời nhóm chuyến đi");
  });

  it("renders 'Rời nhóm chuyến đi' button in members tab for regular MEMBER", () => {
    const memberGroup: CompanionGroup = {
      ...companionGroupFixture,
      relationship: "MEMBER",
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: memberGroup,
        initialTab: "members",
        initialMembers: companionMembersFixture,
      }),
    );

    expect(html).toContain("Bạn là thành viên nhóm");
    expect(html).toContain("Rời nhóm chuyến đi");
    expect(html).toContain("Chủ chuyến mẫu");
    expect(html).toContain("Thành viên mẫu");
    // Regular member should NOT see ban button
    expect(html).not.toContain("Loại khỏi nhóm");
  });

  it("renders 'Loại khỏi nhóm' button for HOST on active members but NOT on host card", () => {
    const hostGroup: CompanionGroup = {
      ...companionGroupFixture,
      relationship: "HOST",
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: hostGroup,
        tripId: "trip-original-123",
        initialTab: "members",
        initialMembers: companionMembersFixture,
      }),
    );

    expect(html).toContain("Bạn là chủ chuyến");
    expect(html).toContain("Chủ chuyến mẫu");
    expect(html).toContain("Thành viên mẫu");
    // Host sees "Loại khỏi nhóm" for members
    expect(html).toContain("Loại khỏi nhóm");
    expect(html).toContain('data-testid="companion-ban-member-btn-synthetic-member"');
    // Host should NOT see "Rời nhóm chuyến đi"
    expect(html).not.toContain("Rời nhóm chuyến đi");
  });

  it("renders 'Trò chuyện nhóm' tab button in group navigation", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
      }),
    );

    expect(html).toContain("Trò chuyện nhóm");
    expect(html).toContain('data-testid="group-tab-chat"');
  });

  it("renders chat transcript with message content, sender name, and composer when activeTab is chat", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: companionHistoryFixture,
      }),
    );

    expect(html).toContain("Trò chuyện nhóm đồng hành");
    expect(html).toContain("Thành viên mẫu");
    expect(html).toContain("Hẹn trao đổi tuyến đường trong nhóm.");
    expect(html).toContain('data-testid="companion-chat-transcript"');
    expect(html).toContain('data-testid="companion-chat-input"');
    expect(html).toContain('data-testid="companion-chat-send-btn"');
    expect(html).toContain("Gửi tin nhắn");
  });

  it("renders safe clickable links inside message text with target blank and noopener", () => {
    const historyWithLink: CompanionHistory = {
      ...companionHistoryFixture,
      items: [
        {
          id: "msg-link-1",
          sequence: "1",
          kind: "USER",
          text: "Mọi người tham khảo bài viết https://example.com/hagiang-guide nhé!",
          author: {
            userId: "author-1",
            displayName: "Hướng dẫn viên",
            avatarUrl: null,
          },
          createdAt: "2030-11-14T12:00:00.000Z",
        },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: historyWithLink,
      }),
    );

    expect(html).toContain("Mọi người tham khảo bài viết");
    expect(html).toContain('href="https://example.com/hagiang-guide"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("companion-chat-link");
  });

  it("renders system notices for ITINERARY_CHANGED and COMPANION_CANCELED", () => {
    const historyWithSystemNotices: CompanionHistory = {
      ...companionHistoryFixture,
      items: [
        companionSystemMessageFixture,
        companionCanceledMessageFixture,
      ],
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: historyWithSystemNotices,
      }),
    );

    expect(html).toContain("Chủ chuyến đã lưu thay đổi giờ.");
    expect(html).toContain("Đổi giờ");
    expect(html).toContain("Xem lịch trình chi tiết");
    expect(html).toContain('data-testid="companion-chat-view-itinerary-btn"');
    expect(html).toContain("Chủ chuyến đã hủy chuyến đồng hành.");
  });

  it("renders itinerary revision badge when group has itineraryRevision", () => {
    const groupWithRevision: CompanionGroup = {
      ...companionGroupFixture,
      itineraryRevision: "2",
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: groupWithRevision,
        initialTab: "itinerary",
      }),
    );

    expect(html).toContain("Bản cập nhật #2");
  });

  it("renders read-only banner and hides composer when canSend is false", () => {
    const readOnlyHistory: CompanionHistory = {
      ...companionHistoryFixture,
      canSend: false,
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: readOnlyHistory,
      }),
    );

    expect(html).toContain('data-testid="companion-chat-readonly-banner"');
    expect(html).toContain("Chuyến đi này hiện ở chế độ chỉ đọc. Không thể gửi thêm tin nhắn mới.");
    expect(html).not.toContain('data-testid="companion-chat-input"');
    expect(html).not.toContain('data-testid="companion-chat-send-btn"');
  });

  it("renders chat transcript with container ref for scroll preservation during polling delta", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: companionHistoryFixture,
      }),
    );

    expect(html).toContain('data-testid="companion-chat-transcript"');
    expect(html).toContain("Hẹn trao đổi tuyến đường trong nhóm.");
  });

  it("renders group-tab-chat button and opens chat immediately when initialTab is chat", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionGroupFixture,
        initialTab: "chat",
        initialHistory: companionHistoryFixture,
      }),
    );

    expect(html).toContain('data-testid="group-tab-chat"');
    expect(html).toContain("Trò chuyện nhóm");
    expect(html).toContain('data-testid="companion-chat-card"');
    expect(html).not.toContain('data-testid="group-chat-unread-badge"');
  });

  it("renders canceled banner when group has canceledAt", () => {
    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: companionCanceledGroupFixture,
      }),
    );

    expect(html).toContain('data-testid="companion-group-canceled-banner"');
    expect(html).toContain("Chuyến đồng hành này đã bị chủ chuyến hủy");
    expect(html).toContain("Bài đăng đã hủy vào 14/11/2030");
  });

  it("renders completed banner when group is past its end date and not canceled", () => {
    const completedGroup: CompanionGroup = {
      ...companionGroupFixture,
      introduction: {
        ...companionGroupFixture.introduction,
        endDate: "2020-01-01",
      },
    };

    const html = renderToStaticMarkup(
      createElement(CompanionGroupView, {
        group: completedGroup,
      }),
    );

    expect(html).toContain('data-testid="companion-group-completed-banner"');
    expect(html).toContain("Chuyến đi đã hoàn tất hành trình (01/01/2020)");
    expect(html).toContain("Không gian nhóm và trò chuyện vẫn tiếp tục hoạt động bình thường");
  });
});

