"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  X,
  Heart,
  PlusCircle,
  CalendarDays,
  Bookmark,
  LayoutDashboard,
  User,
  Clock,
  Sparkles,
} from "lucide-react";

import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { buildAuthModeHref } from "@/lib/auth-mode-href";
import {
  resolveAuthIntentConfig,
  type AuthIntent,
} from "@/lib/auth-intent-config";

export interface AuthRequiredDialogProps {
  open: boolean;
  intent?: AuthIntent;
  returnTo: string;
  onClose: () => void;
  triggerElement?: HTMLElement | null;
}

function renderIntentIcon(iconName: string) {
  switch (iconName) {
    case "heart":
      return <Heart className="size-5" aria-hidden="true" />;
    case "plus_circle":
      return <PlusCircle className="size-5" aria-hidden="true" />;
    case "calendar":
      return <CalendarDays className="size-5" aria-hidden="true" />;
    case "bookmark":
      return <Bookmark className="size-5" aria-hidden="true" />;
    case "layout":
      return <LayoutDashboard className="size-5" aria-hidden="true" />;
    case "user":
      return <User className="size-5" aria-hidden="true" />;
    case "clock":
      return <Clock className="size-5" aria-hidden="true" />;
    case "sparkles":
    default:
      return <Sparkles className="size-5" aria-hidden="true" />;
  }
}

export function AuthRequiredDialog({
  open,
  intent = "generic",
  returnTo,
  onClose,
  triggerElement,
}: AuthRequiredDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descId = useId();

  const config = resolveAuthIntentConfig(intent);
  const loginHref = buildAuthLoginHref(returnTo);
  const signUpHref = buildAuthModeHref("signup", returnTo);

  // Manage focus, scroll lock, and Escape key
  useEffect(() => {
    if (!open) return;

    // Save previous active element to restore later
    previousActiveElementRef.current =
      triggerElement ?? (document.activeElement as HTMLElement | null);

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus primary button inside dialog
    const timer = setTimeout(() => {
      const primaryBtn = cardRef.current?.querySelector<HTMLElement>("[data-primary-auth]");
      if (primaryBtn) {
        primaryBtn.focus();
      } else {
        cardRef.current?.focus();
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && cardRef.current) {
        const focusables = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href]:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusableArray = Array.from(focusables);
        if (focusableArray.length === 0) return;

        const first = focusableArray[0];
        const last = focusableArray[focusableArray.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      // Restore focus
      if (previousActiveElementRef.current?.isConnected) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [open, onClose, triggerElement]);

  if (!open) return null;

  return (
    <div
      className="auth-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="auth-modal-card"
        tabIndex={-1}
      >
        <div className="auth-modal-header">
          <div className="auth-modal-icon-badge" aria-hidden="true">
            {renderIntentIcon(config.iconName)}
          </div>
          <button
            type="button"
            className="auth-modal-close-btn"
            aria-label="Đóng cửa sổ"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="auth-modal-body">
          <h2 id={titleId} className="auth-modal-title">
            {config.title}
          </h2>
          <p id={descId} className="auth-modal-desc">
            {config.description}
          </p>
        </div>

        <div className="auth-modal-actions">
          <Link
            href={loginHref as Route}
            data-primary-auth
            className="auth-modal-btn auth-modal-btn-primary"
            onClick={onClose}
          >
            Đăng nhập
          </Link>
          <Link
            href={signUpHref as Route}
            className="auth-modal-btn auth-modal-btn-secondary"
            onClick={onClose}
          >
            Tạo tài khoản
          </Link>
          <button
            type="button"
            className="auth-modal-btn auth-modal-btn-tertiary"
            onClick={onClose}
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
