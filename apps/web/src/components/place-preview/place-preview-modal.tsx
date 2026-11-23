"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  buildPlacePreviewEmbedUrl,
  buildPlacePreviewExternalUrl,
  canPreviewPlace,
  type PlacePreviewTarget,
} from "@/lib/place-preview-url";
import { cleanPlaceDisplayName } from "@/lib/traveler-display-clean";
import "./place-preview-modal.css";

export const PLACE_PREVIEW_NOTICE = "Thông tin từ Google Maps, ứng dụng chưa kiểm tra";
export const PLACE_PREVIEW_EXTERNAL_LABEL = "Xem đánh giá đầy đủ trên Google Maps";
export const PLACE_PREVIEW_FALLBACK_TEXT =
  "Không thể hiển thị bản đồ xem nhanh lúc này. Bạn vẫn có thể mở địa điểm trực tiếp trên Google Maps bên dưới.";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type PlacePreviewModalProps = {
  target: PlacePreviewTarget | null;
  onClose: () => void;
  /** Trigger element to restore focus to when closed. */
  returnFocusTo?: HTMLElement | null;
  /** Optional extra action rendered in the footer (e.g., "Chọn cho đêm N"). */
  footerAction?: ReactNode;
  /** Optional override for the browser Google Maps Embed key (used in tests). */
  embedApiKey?: string | null;
};

/** Pure keyboard handler for Escape close and Tab focus trap; exported for deterministic tests. */
export function handlePlacePreviewKeyDown(
  event: { key: string; shiftKey?: boolean; preventDefault: () => void },
  options: {
    onClose: () => void;
    getFocusables: () => readonly { focus: () => void }[];
    activeElement: unknown;
  },
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    options.onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = options.getFocusables();
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  if (event.shiftKey) {
    if (options.activeElement === first || !focusables.includes(options.activeElement as never)) {
      event.preventDefault();
      last.focus();
    }
  } else if (options.activeElement === last || !focusables.includes(options.activeElement as never)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Shared accessible Place preview modal (Ticket 09).
 * Uses Maps Embed API v1 place mode with the browser key only; never calls Places Details or server APIs.
 */
export function PlacePreviewModal({
  target,
  onClose,
  returnFocusTo,
  footerAction,
  embedApiKey,
}: PlacePreviewModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const previewable = canPreviewPlace(target) ? target : null;
  const targetKey = previewable
    ? previewable.kind === "GOOGLE_PLACE"
      ? `g:${previewable.placeId}`
      : `c:${previewable.latitude},${previewable.longitude}`
    : null;
  const iframeFailed = targetKey !== null && failedKey === targetKey;

  useEffect(() => {
    if (!previewable) return;
    const prevFocus = returnFocusTo ?? (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);
    const prevOverflow = typeof document !== "undefined" ? document.body.style.overflow : "";
    if (typeof document !== "undefined") document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      handlePlacePreviewKeyDown(event, {
        onClose: () => onCloseRef.current(),
        getFocusables: () =>
          dialogRef.current
            ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            : [],
        activeElement: typeof document !== "undefined" ? document.activeElement : null,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (typeof document !== "undefined") document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [previewable, returnFocusTo]);

  if (!previewable) return null;

  const displayName = cleanPlaceDisplayName(previewable.name) || previewable.name;
  const embedUrl = buildPlacePreviewEmbedUrl(previewable, embedApiKey);
  const externalUrl = buildPlacePreviewExternalUrl(previewable);

  return (
    <div
      className="place-preview-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="place-preview-dialog"
      >
        <div className="place-preview-header">
          <h3 id={titleId} className="place-preview-title">
            {displayName}
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="place-preview-close"
            aria-label="Đóng xem nhanh địa điểm"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="place-preview-body">
          {embedUrl && !iframeFailed ? (
            <iframe
              className="place-preview-iframe"
              title={`Xem nhanh ${displayName} trên Google Maps`}
              src={embedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              onError={() => setFailedKey(targetKey)}
            />
          ) : (
            <div className="place-preview-fallback" role="status">
              <p>{PLACE_PREVIEW_FALLBACK_TEXT}</p>
            </div>
          )}
        </div>

        <div className="place-preview-footer">
          <p className="place-preview-notice">{PLACE_PREVIEW_NOTICE}</p>
          <div className="place-preview-actions">
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="place-preview-external-link"
              >
                <span>{PLACE_PREVIEW_EXTERNAL_LABEL}</span>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
            {footerAction}
          </div>
        </div>
      </div>
    </div>
  );
}
