"use client";

import { forwardRef, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import type { Permission } from "@/lib/authorization-capabilities";
import type { AuthIntent } from "@/lib/auth-intent-config";
import { useAuthRequired } from "./auth-required-provider";

export interface ProtectedLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  intent?: AuthIntent;
  requiredPermission?: Permission;
  onGuestIntercept?: () => void;
  children?: ReactNode;
}

export const ProtectedLink = forwardRef<HTMLAnchorElement, ProtectedLinkProps>(
  function ProtectedLink(
    {
      href,
      intent,
      requiredPermission = "traveler",
      onGuestIntercept,
      onClick,
      children,
      ...rest
    },
    ref
  ) {
    const { isAuthenticated, canUseTraveler, executeProtectedAction } = useAuthRequired();

    // Derive intent from href if not explicitly specified
    const resolvedIntent: AuthIntent =
      intent ??
      (href.startsWith("/favorites")
        ? "favorites"
        : href.startsWith("/trips/new")
        ? "planner"
        : href.startsWith("/trips")
        ? "trips"
        : href.startsWith("/dashboard")
        ? "dashboard"
        : href.startsWith("/account")
        ? "account"
        : "generic");

    function handleClick(e: MouseEvent<HTMLAnchorElement>) {
      // Allow user to open in new tab with modifier keys or middle click
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.shiftKey
      ) {
        return;
      }

      // If user has permission, let normal Next.js navigation proceed
      if (isAuthenticated && canUseTraveler) {
        onClick?.(e);
        return;
      }

      // Otherwise intercept and trigger AuthRequiredDialog
      e.preventDefault();
      onGuestIntercept?.();

      void executeProtectedAction({
        intent: resolvedIntent,
        requiredPermission,
        returnTo: href,
        triggerElement: e.currentTarget,
      });

      onClick?.(e);
    }

    return (
      <Link
        ref={ref}
        href={href as Route}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </Link>
    );
  }
);
