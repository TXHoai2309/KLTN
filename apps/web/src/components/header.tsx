"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mountain } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import "./header.css";

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
    { to: "/culture", label: "Văn hóa" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href="/" aria-label="Hà Giang Travel Assistant - Trang chủ">
          <span className="site-brand-mark" aria-hidden="true"><Mountain size={32} strokeWidth={1.8} /></span>
          <span className="site-brand-copy"><strong>Hà Giang</strong><span>Travel Assistant</span></span>
        </Link>
        <nav className="site-nav" aria-label="Điều hướng chính">
          {links.map(({ to, label }) => {
            const active = to === "/"
              ? pathname === "/"
              : to === "/explore"
                ? pathname === "/explore" || pathname.startsWith("/destinations/")
                : pathname === to || pathname.startsWith(`${to}/`);
            return <Link key={to} href={to} className="site-nav-link" data-active={active || undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
          })}
        </nav>
        <div className="site-header-actions">
          <ModeToggle className="site-theme-toggle" locale="vi" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
