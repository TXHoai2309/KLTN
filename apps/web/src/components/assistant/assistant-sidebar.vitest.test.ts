import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AssistantSidebar,
  readSidebarPreference,
  resolveDesktopSidebarOpen,
  writeSidebarPreference,
} from "./assistant-sidebar";
import type { QaConversationSummary } from "../../modules/ai/qa-contract";

describe("AssistantSidebar", () => {
  it("shows a recoverable read error instead of claiming history is empty", () => {
    const html = renderToStaticMarkup(createElement(AssistantSidebar, {
      conversations: [], activeConversationId: null, loading: false,
      loadingMore: false, hasMore: false, isOpen: true,
      onClose: () => {}, onNewChat: () => {}, onSelectConversation: () => {},
      onRenameConversation: async () => true, onDeleteConversation: async () => true,
      onLoadMore: () => {}, searchQuery: "", onSearchChange: () => {},
      error: "Không thể tải lịch sử hội thoại.", onRetry: () => {},
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Không thể tải lịch sử hội thoại.");
    expect(html).toContain("Thử tải lại lịch sử");
    expect(html).not.toContain("Chưa có cuộc trò chuyện nào.");
  });
  const dummyConversations: QaConversationSummary[] = [
    {
      id: "conv-today-1",
      title: "Hỏi về Cột cờ Lũng Cú",
      context: { type: "GENERAL" },
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    },
    {
      id: "conv-yesterday-1",
      title: "Đèo Mã Pí Lèng",
      context: { type: "GENERAL" },
      createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      lastActivityAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
  ];

  it("renders empty state when there are no conversations", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: [],
        activeConversationId: null,
        loading: false,
        loadingMore: false,
        hasMore: false,
        isOpen: true,
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onLoadMore: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      })
    );

    expect(html).toContain("Chưa có cuộc trò chuyện nào");
    expect(html).toContain("Đoạn chat mới");
  });

  it("renders grouped conversations by date", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: dummyConversations,
        activeConversationId: "conv-today-1",
        loading: false,
        loadingMore: false,
        hasMore: false,
        isOpen: true,
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onLoadMore: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      })
    );

    expect(html).toContain("Hôm nay");
    expect(html).toContain("Hỏi về Cột cờ Lũng Cú");
    expect(html).toContain("Hôm qua");
    expect(html).toContain("Đèo Mã Pí Lèng");
    expect(html).toContain("active");
  });

  it("renders search input with value", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: [dummyConversations[0]!],
        activeConversationId: null,
        loading: false,
        loadingMore: false,
        hasMore: false,
        isOpen: true,
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onLoadMore: () => {},
        searchQuery: "Lũng Cú",
        onSearchChange: () => {},
      })
    );

    expect(html).toContain('value="Lũng Cú"');
    expect(html).toContain("Xóa nội dung tìm kiếm");
  });

  it("renders load more button when hasMore is true", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: dummyConversations,
        activeConversationId: null,
        loading: false,
        loadingMore: false,
        hasMore: true,
        isOpen: true,
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onLoadMore: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      })
    );

    expect(html).toContain("Xem thêm đoạn chat cũ");
  });

  it("A1: uses compact sm new-chat button, moves delete-all out of footer into header overflow trigger, and renders 48px desktop rail when collapsed", () => {
    const htmlOpen = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: dummyConversations,
        activeConversationId: "conv-today-1",
        loading: false,
        loadingMore: false,
        hasMore: false,
        isOpen: true,
        railOnDesktop: true,
        onOpen: () => {},
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onDeleteAll: async () => true,
        onLoadMore: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      }),
    );
    expect(htmlOpen).toContain("tv-btn--sm");
    expect(htmlOpen).toContain("Đoạn chat mới");
    expect(htmlOpen).not.toContain("assistant-sidebar-footer");
    expect(htmlOpen).not.toContain("Xóa tất cả");
    expect(htmlOpen).toContain("Tùy chọn lịch sử");
    expect(htmlOpen).toContain('aria-haspopup="menu"');

    const htmlRail = renderToStaticMarkup(
      createElement(AssistantSidebar, {
        conversations: dummyConversations,
        activeConversationId: "conv-today-1",
        loading: false,
        loadingMore: false,
        hasMore: false,
        isOpen: false,
        railOnDesktop: true,
        onOpen: () => {},
        onClose: () => {},
        onNewChat: () => {},
        onSelectConversation: () => {},
        onRenameConversation: async () => true,
        onDeleteConversation: async () => true,
        onDeleteAll: async () => true,
        onLoadMore: () => {},
        searchQuery: "",
        onSearchChange: () => {},
      }),
    );
    expect(htmlRail).toContain("assistant-sidebar-rail");
    expect(htmlRail).toContain('aria-label="Mở thanh lịch sử"');
    expect(htmlRail).toContain('aria-label="Tạo cuộc trò chuyện mới"');
    expect(htmlRail).toContain('aria-label="Tìm kiếm cuộc trò chuyện"');
    expect(htmlRail).not.toMatch(/<aside[^>]*aria-hidden="true"/);
  });

  it("A1: auto-collapses sidebar on desktop when plan is open unless user chose open, with safe localStorage wrappers", () => {
    expect(resolveDesktopSidebarOpen({ hasOpenPlan: false, storedPreference: null })).toBe(true);
    expect(resolveDesktopSidebarOpen({ hasOpenPlan: false, storedPreference: "collapsed" })).toBe(false);
    expect(resolveDesktopSidebarOpen({ hasOpenPlan: true, storedPreference: null })).toBe(false);
    expect(resolveDesktopSidebarOpen({ hasOpenPlan: true, storedPreference: "open" })).toBe(true);
    expect(resolveDesktopSidebarOpen({ hasOpenPlan: true, storedPreference: "collapsed" })).toBe(false);

    const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readSidebarPreference(throwingStorage)).toBeNull();
    expect(() => writeSidebarPreference(throwingStorage, "open")).not.toThrow();

    const backing = new Map<string, string>();
    const memStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
    };
    writeSidebarPreference(memStorage, "open");
    expect(readSidebarPreference(memStorage)).toBe("open");
  });
});
