import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantSidebar } from "./assistant-sidebar";
import type { QaConversationSummary } from "../../modules/ai/qa-contract";

describe("AssistantSidebar", () => {
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
});
