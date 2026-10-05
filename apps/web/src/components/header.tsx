"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mountain } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <header className="auth-header">
        <Link className="auth-brand" href="/" aria-label="Hà Giang Travel Assistant - Trang chủ">
          <span className="auth-brand-mark" aria-hidden="true">
            <Mountain size={36} strokeWidth={1.7} />
          </span>
          <span className="auth-brand-copy">
            <strong>Hà Giang</strong>
            <span>Travel Assistant</span>
          </span>
        </Link>
        <nav className="auth-header-nav" aria-label="Điều hướng chính">
          <Link href="/">Trang chủ</Link>
        </nav>
        <ModeToggle className="auth-theme-toggle" locale="vi" />
      </header>
    );
  }

  const links = [
    { to: "/", label: "Trang chủ" },
    { to: "/explore", label: "Khám phá" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row flex-wrap items-center justify-between gap-2 px-2 py-1">
        <nav className="flex flex-wrap gap-3 text-sm sm:text-lg" aria-label="Điều hướng chính">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} href={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
