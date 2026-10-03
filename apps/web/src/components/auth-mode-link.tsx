"use client";

import type { ReactNode } from "react";

export default function AuthModeLink({
  children,
  href,
  onSwitch,
}: {
  children: ReactNode;
  href: string;
  onSwitch: () => void;
}) {
  return (
    <a
      href={href}
      className="auth-text-button"
      onClick={(event) => {
        event.preventDefault();
        onSwitch();
      }}
    >
      {children}
    </a>
  );
}
