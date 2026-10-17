"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  MoreVertical,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { QaConversationSummary } from "../../modules/ai/qa-contract";
import { groupConversationsByDate } from "./assistant-conversation-groups";

export type AssistantSidebarProps = {
  conversations: QaConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => Promise<boolean>;
  onDeleteConversation: (id: string) => Promise<boolean>;
  onLoadMore: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function AssistantSidebar({
  conversations,
  activeConversationId,
  loading,
  loadingMore,
  hasMore,
  isOpen,
  onClose,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onLoadMore,
  searchQuery,
  onSearchChange,
}: AssistantSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const editInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close menus on outside click or escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (editingId) setEditingId(null);
        if (activeMenuId) setActiveMenuId(null);
        if (deletingId) setDeletingId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId, activeMenuId, deletingId]);

  function startEditing(conv: QaConversationSummary) {
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setActiveMenuId(null);
  }

  async function saveRename(id: string) {
    const trimmed = editTitle.trim();
    if (!trimmed || actionBusy) return;
    setActionBusy(true);
    try {
      const ok = await onRenameConversation(id, trimmed);
      if (ok) setEditingId(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const ok = await onDeleteConversation(id);
      if (ok) {
        setDeletingId(null);
        setActiveMenuId(null);
      }
    } finally {
      setActionBusy(false);
    }
  }

  const groups = groupConversationsByDate(conversations);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`assistant-sidebar-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={sidebarRef}
        className={`assistant-sidebar ${isOpen ? "open" : "collapsed"}`}
        aria-label="Lịch sử hội thoại"
        aria-hidden={!isOpen}
      >
        {/* Top Header */}
        <div className="assistant-sidebar-header">
          <button
            type="button"
            className="assistant-sidebar-new-btn"
            onClick={() => {
              onNewChat();
              // On small screens, close sidebar when starting new chat
              if (window.innerWidth < 1024) onClose();
            }}
            aria-label="Tạo cuộc trò chuyện mới"
          >
            <Plus aria-hidden="true" />
            <span>Đoạn chat mới</span>
          </button>
          <button
            type="button"
            className="assistant-sidebar-toggle-btn"
            onClick={onClose}
            aria-label="Đóng thanh bên lịch sử"
            title="Đóng thanh bên"
          >
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>

        {/* Search bar */}
        <div className="assistant-sidebar-search">
          <Search className="assistant-sidebar-search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Tìm kiếm cuộc trò chuyện…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Tìm kiếm lịch sử trò chuyện"
            className="assistant-sidebar-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="assistant-sidebar-search-clear"
              onClick={() => onSearchChange("")}
              aria-label="Xóa nội dung tìm kiếm"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Conversation List */}
        <div className="assistant-sidebar-list" tabIndex={0} aria-label="Danh sách các cuộc trò chuyện">
          {loading && !conversations.length ? (
            <div className="assistant-sidebar-loading" role="status">
              <Loader2 className="assistant-spinner" aria-hidden="true" />
              <span>Đang tải lịch sử…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="assistant-sidebar-empty">
              <MessageSquare className="assistant-sidebar-empty-icon" aria-hidden="true" />
              <p>
                {searchQuery
                  ? "Không tìm thấy cuộc trò chuyện nào phù hợp."
                  : "Chưa có cuộc trò chuyện nào."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="assistant-sidebar-group">
                <h3 className="assistant-sidebar-group-title">{group.label}</h3>
                <ul className="assistant-sidebar-items" role="list">
                  {group.items.map((conv) => {
                    const isActive = conv.id === activeConversationId;
                    const isEditing = conv.id === editingId;
                    const isMenuOpen = conv.id === activeMenuId;
                    const isDeleting = conv.id === deletingId;

                    return (
                      <li
                        key={conv.id}
                        className={`assistant-sidebar-item-row ${isActive ? "active" : ""}`}
                      >
                        {isEditing ? (
                          <div className="assistant-sidebar-edit-form">
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editTitle}
                              maxLength={120}
                              disabled={actionBusy}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveRename(conv.id);
                                }
                              }}
                              className="assistant-sidebar-edit-input"
                              aria-label="Tên mới cho cuộc trò chuyện"
                            />
                            <button
                              type="button"
                              className="assistant-sidebar-edit-action save"
                              disabled={actionBusy || !editTitle.trim()}
                              onClick={() => void saveRename(conv.id)}
                              aria-label="Lưu tên"
                            >
                              <Check aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="assistant-sidebar-edit-action cancel"
                              disabled={actionBusy}
                              onClick={() => setEditingId(null)}
                              aria-label="Hủy đổi tên"
                            >
                              <X aria-hidden="true" />
                            </button>
                          </div>
                        ) : isDeleting ? (
                          <div className="assistant-sidebar-delete-confirm">
                            <span className="assistant-sidebar-delete-prompt">Xóa đoạn chat này?</span>
                            <button
                              type="button"
                              className="assistant-sidebar-delete-btn confirm"
                              disabled={actionBusy}
                              onClick={() => void confirmDelete(conv.id)}
                              aria-label="Xác nhận xóa"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              className="assistant-sidebar-delete-btn cancel"
                              disabled={actionBusy}
                              onClick={() => setDeletingId(null)}
                              aria-label="Hủy xóa"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="assistant-sidebar-item-btn"
                              onClick={() => {
                                onSelectConversation(conv.id);
                                if (window.innerWidth < 1024) onClose();
                              }}
                              aria-current={isActive ? "page" : undefined}
                              title={conv.title}
                            >
                              <MessageSquare className="assistant-sidebar-item-icon" aria-hidden="true" />
                              <span className="assistant-sidebar-item-title">{conv.title}</span>
                            </button>

                            <div className="assistant-sidebar-item-actions">
                              <button
                                type="button"
                                className="assistant-sidebar-more-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(isMenuOpen ? null : conv.id);
                                }}
                                aria-label={`Tùy chọn cho ${conv.title}`}
                                aria-expanded={isMenuOpen}
                              >
                                <MoreVertical aria-hidden="true" />
                              </button>

                              {isMenuOpen && (
                                <div
                                  className="assistant-sidebar-menu-dropdown"
                                  role="menu"
                                  aria-label="Tùy chọn cuộc trò chuyện"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="assistant-sidebar-menu-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditing(conv);
                                    }}
                                  >
                                    <Pencil aria-hidden="true" />
                                    <span>Đổi tên</span>
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="assistant-sidebar-menu-item delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingId(conv.id);
                                      setActiveMenuId(null);
                                    }}
                                  >
                                    <Trash2 aria-hidden="true" />
                                    <span>Xóa</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}

          {hasMore && (
            <div className="assistant-sidebar-load-more">
              <button
                type="button"
                className="assistant-sidebar-load-more-btn"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="assistant-spinner" aria-hidden="true" />
                    <span>Đang tải thêm…</span>
                  </>
                ) : (
                  <>
                    <ChevronDown aria-hidden="true" />
                    <span>Xem thêm đoạn chat cũ</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
