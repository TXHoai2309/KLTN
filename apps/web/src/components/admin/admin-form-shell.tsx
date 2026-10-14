"use client";
import "./admin-form-shell.css";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  ChevronDown,
  X,
  type LucideIcon,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────────────────────── */
export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 'error' | 'done' | undefined */
  status?: "error" | "done";
  statusLabel?: string;
}

/* ── Section Heading ─────────────────────────────────────────────────────── */
export function AdminSectionHead({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: "required" | "optional";
}) {
  return (
    <div className="af-section-head">
      <div className="af-section-icon" aria-hidden="true">
        <Icon size={22} />
      </div>
      <div className="af-section-meta">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {badge && (
        <span className={`af-section-badge is-${badge}`}>
          {badge === "required" ? "* Bắt buộc" : "Tùy chọn"}
        </span>
      )}
    </div>
  );
}

/* ── Collapsible Section Card ────────────────────────────────────────────── */
export function AdminCollapsibleSection({
  id,
  icon: Icon,
  title,
  description,
  badge,
  summary,
  isOpen,
  onToggle,
  defaultOpen = true,
  hasError = false,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: "required" | "optional";
  summary?: ReactNode;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  defaultOpen?: boolean;
  hasError?: boolean;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const toggle = useCallback(() => {
    if (onToggle) onToggle(!open);
    else setInternalOpen(!open);
  }, [onToggle, open]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id === id) {
        if (onToggle) onToggle(true);
        else setInternalOpen(true);
      }
    };
    window.addEventListener("admin:expand-section", handler);
    return () => window.removeEventListener("admin:expand-section", handler);
  }, [id, onToggle]);

  useEffect(() => {
    if (hasError) {
      if (onToggle) onToggle(true);
      else setInternalOpen(true);
    }
  }, [hasError, onToggle]);

  return (
    <section
      id={id}
      className={`af-section af-collapsible-section${open ? " is-expanded" : " is-collapsed"}${hasError ? " has-error" : ""}`}
      aria-labelledby={`${id}-heading`}
    >
      <div className="af-section-header-wrap">
        <div className="af-section-head">
          <div className="af-section-icon" aria-hidden="true">
            <Icon size={22} />
          </div>
          <div className="af-section-meta">
            <h2 id={`${id}-heading`}>{title}</h2>
            <p>{description}</p>
          </div>
          <div className="af-section-head-actions">
            {badge && (
              <span className={`af-section-badge is-${badge}`}>
                {badge === "required" ? "* Bắt buộc" : "Tùy chọn"}
              </span>
            )}
            <button
              type="button"
              className="af-section-toggle-btn"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={`${id}-content`}
              title={open ? "Thu gọn phần này" : "Mở rộng phần này"}
            >
              <ChevronDown
                size={18}
                className={`af-toggle-icon${open ? " is-rotated" : ""}`}
                aria-hidden="true"
              />
              <span className="sr-only">
                {open ? "Thu gọn phần này" : "Mở rộng phần này"}
              </span>
            </button>
          </div>
        </div>
        {!open && summary && (
          <div
            className="af-section-summary"
            onClick={toggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }}
          >
            <span className="af-summary-pill">{summary}</span>
            <span className="af-summary-hint">Bấm để chỉnh sửa</span>
          </div>
        )}
      </div>
      <div
        id={`${id}-content`}
        className="af-section-body"
        style={{ display: open ? "block" : "none" }}
      >
        {children}
      </div>
    </section>
  );
}

/* ── Field helpers ────────────────────────────────────────────────────────── */
export function AdminField({
  children,
  error,
  errorId,
}: {
  children: ReactNode;
  error?: string;
  errorId?: string;
}) {
  return (
    <div className="af-field">
      {children}
      {error && (
        <p id={errorId} className="af-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminLabel({
  htmlFor,
  required,
  optional,
  children,
  tooltip,
}: {
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  tooltip?: string;
}) {
  const helpId = useId();
  return (
    <label htmlFor={htmlFor} className="af-label">
      {children}
      {required && (
        <span className="af-label-required" aria-label="bắt buộc">
          *
        </span>
      )}
      {optional && <span className="af-label-optional">Tùy chọn</span>}
      {tooltip && (
        <span
          className="af-tooltip-wrap"
          tabIndex={0}
          role="img"
          aria-label="Hướng dẫn"
          aria-describedby={helpId}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ color: "#68768c", flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span id={helpId} className="af-tooltip" role="tooltip">
            {tooltip}
          </span>
        </span>
      )}
    </label>
  );
}

export function AdminHelper({ children }: { children: ReactNode }) {
  return <p className="af-helper">{children}</p>;
}

/* ── Visibility Badge ─────────────────────────────────────────────────────── */
export function AdminVisibilityBadge({
  visibility,
}: {
  visibility: "HIDDEN" | "VISIBLE";
}) {
  const Icon = visibility === "VISIBLE" ? Eye : EyeOff;
  return (
    <span
      className={`af-badge ${visibility === "VISIBLE" ? "af-badge-visible" : "af-badge-hidden"}`}
    >
      <Icon size={13} aria-hidden="true" />
      {visibility === "VISIBLE" ? "Đang hiển thị" : "Đang ẩn"}
    </span>
  );
}

/* ── Loading State ────────────────────────────────────────────────────────── */
export function AdminLoadingState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 240,
        gap: 12,
        color: "var(--af-muted)",
      }}
      role="status"
    >
      <LoaderCircle size={28} className="af-spinner" aria-hidden="true" />
      <p style={{ fontSize: 14, margin: 0 }}>{children}</p>
    </div>
  );
}

/* ── Section Nav Sidebar ──────────────────────────────────────────────────── */
export function AdminSectionNav({
  sections,
  activeId,
  onNavigate,
}: {
  sections: NavSection[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="af-sidebar" aria-label="Điều hướng phần">
      <label className="af-mobile-nav">
        Chuyển đến phần
        <select value={activeId} onChange={(e) => onNavigate(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.status === "error"
                ? " — Có lỗi"
                : s.status === "done"
                  ? " — Hoàn tất"
                  : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="af-sidebar-title">Các phần</p>
      <ul className="af-nav-list" role="list">
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <li key={sec.id} className="af-nav-item" role="listitem">
              <button
                type="button"
                className={`af-nav-btn${activeId === sec.id ? " is-active" : ""}`}
                onClick={() => onNavigate(sec.id)}
                aria-current={activeId === sec.id ? "true" : undefined}
              >
                <span className="af-nav-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="af-nav-label">
                  <strong>{sec.label}</strong>
                  {(sec.status || sec.statusLabel) && (
                    <span
                      className={`af-nav-status ${sec.status === "error" ? "has-error" : sec.status === "done" ? "is-done" : ""}`}
                    >
                      <span className="af-nav-dot" aria-hidden="true" />
                      {sec.statusLabel ??
                        (sec.status === "error" ? "Có lỗi" : "Hoàn tất")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Page Header ──────────────────────────────────────────────────────────── */
export function AdminPageHeader({
  breadcrumb,
  title,
  subtitle,
  meta,
}: {
  breadcrumb?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="af-page-header">
      {breadcrumb && (
        <nav className="af-breadcrumb" aria-label="Breadcrumb">
          {breadcrumb}
        </nav>
      )}
      <div className="af-page-title-row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {meta && <div className="af-page-title-meta">{meta}</div>}
      </div>
    </header>
  );
}

/* ── Sticky Actions Bar ───────────────────────────────────────────────────── */
export function AdminStickyActions({
  message,
  children,
}: {
  message?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="af-actions" role="group" aria-label="Hành động biểu mẫu">
      {message && <p className="af-actions-message">{message}</p>}
      <div className="af-actions-buttons">{children}</div>
    </div>
  );
}

/* ── Section scroll + active tracking hook ────────────────────────────────── */
export function useSectionNav(sectionIds: string[]) {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? "");

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const toggleBtn = el.querySelector<HTMLButtonElement>(
        ".af-section-toggle-btn[aria-expanded='false']",
      );
      toggleBtn?.click();
      el.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      setActiveId(id);
      el.tabIndex = -1;
      el.focus({ preventScroll: true });
    }
  }, []);

  const idsKey = sectionIds.join(",");
  useEffect(() => {
    const ids = idsKey.split(",");
    const update = () => {
      const elements = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el);
      const passed = elements.filter(
        (el) => el.getBoundingClientRect().top <= 150,
      );
      const current = passed.at(-1) ?? elements[0];
      if (current) setActiveId(current.id);
    };
    const mutation = new MutationObserver(update);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      mutation.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [idsKey]);

  return { activeId, scrollTo };
}

/* ── Alert component ──────────────────────────────────────────────────────── */
export function AdminAlert({
  variant = "warning",
  icon,
  children,
}: {
  variant?: "warning" | "error";
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`af-alert af-alert-${variant}`} role="alert">
      {icon}
      <div>{children}</div>
    </div>
  );
}

/* ── Chip list ────────────────────────────────────────────────────────────── */
export function AdminChips({
  items,
  onRemove,
  emptyText,
}: {
  items: { id: string; label: string }[];
  onRemove: (id: string) => void;
  emptyText?: string;
}) {
  if (items.length === 0 && emptyText) {
    return (
      <p className="af-helper" style={{ marginTop: 6 }}>
        {emptyText}
      </p>
    );
  }
  return (
    <div className="af-chips" aria-label={`${items.length} mục đã chọn`}>
      {items.map((item) => (
        <span key={item.id} className="af-chip">
          <span>{item.label}</span>
          <button
            type="button"
            className="af-chip-remove"
            aria-label={`Bỏ chọn ${item.label}`}
            onClick={() => onRemove(item.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function focusFormError(path: string, prefix: "cf" | "df") {
  const base = path.split(".")[0];
  const direct = document.getElementById(
    prefix === "cf"
      ? base === "content"
        ? "cf-content-editor"
        : `cf-${base}`
      : `destination-${base}`,
  );
  const field = path.includes("sources")
    ? "sources"
    : path.includes("media")
      ? "media"
      : path.includes("community")
        ? "community"
        : path.includes("areaIds")
          ? "geo"
          : path.includes("cultureIds")
            ? "culture"
            : path.includes("ticket") ||
                path.includes("Visit") ||
                path.includes("visitNotes")
              ? "visit"
              : path.includes("location") || path.includes("googleMaps")
                ? "location"
                : base === "destinationIds"
                  ? "destinations"
                  : "basic";
  const section = document.getElementById(`${prefix}-${field}`);
  if (section) {
    const toggleBtn = section.querySelector<HTMLButtonElement>(
      ".af-section-toggle-btn[aria-expanded='false']",
    );
    toggleBtn?.click();
    section
      .querySelectorAll<HTMLDetailsElement>("details")
      .forEach((d) => (d.open = true));
  }
  const exact = Array.from(
    document.querySelectorAll<HTMLElement>("[data-field-path]"),
  ).find(
    (el) =>
      el.dataset.fieldPath === path ||
      path.startsWith(el.dataset.fieldPath + "."),
  );
  const target =
    exact ??
    direct ??
    section?.querySelector<HTMLElement>(
      "input:not(:disabled),textarea,select,button",
    );
  target?.scrollIntoView({ block: "center" });
  target?.focus({ preventScroll: true });
}

export function AdminValidationSummary({
  errors,
  prefix,
}: {
  errors: Record<string, string>;
  prefix: "cf" | "df";
}) {
  if (!Object.keys(errors).length) return null;
  return (
    <div className="af-alert af-alert-error" role="alert">
      <strong>Cần sửa {Object.keys(errors).length} mục trước khi lưu</strong>
      <ul>
        {Object.entries(errors).map(([path, message]) => (
          <li key={path}>
            <button
              className="af-error-link"
              type="button"
              onClick={() => focusFormError(path, prefix)}
            >
              {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminFormProgress({
  complete,
  total,
}: {
  complete: number;
  total: number;
}) {
  return (
    <div className="af-progress">
      <label>
        Trường bắt buộc hợp lệ: {complete}/{total}
        <progress max={total} value={complete} />
      </label>
      <p className="af-helper">
        Chỉ kiểm tra các trường bắt buộc; chưa xác nhận nguồn, quyền hoặc tính
        chính xác của dữ liệu.
      </p>
    </div>
  );
}

/* ── Accessible Modal Dialog ──────────────────────────────────────────────── */
export function AdminModalDialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 520,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="af-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="af-modal-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="af-modal-title"
      >
        <div className="af-modal-header">
          <div>
            <h2 id="af-modal-title">{title}</h2>
            {description && <div className="af-modal-desc">{description}</div>}
          </div>
          <button
            type="button"
            className="af-modal-close"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="af-modal-content">{children}</div>
      </div>
    </div>
  );
}
