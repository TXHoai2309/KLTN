"use client";
import { mvpFeatures } from "@/lib/mvp-features";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import type { Route } from "next";
import {
  Menu,
  X,
  Home,
  Compass,
  Sparkles,
  Heart,
  PlusCircle,
  CalendarDays,
  LayoutDashboard,
  BookOpen,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import "./header.css";

export default function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Detect scroll to toggle transparent crystal top vs elevated opaque frosted glass
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
        toggleBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  // Prevent background scroll while mobile menu is open without locking permanently
  useEffect(() => {
    if (isMobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      closeBtnRef.current?.focus();
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobileMenuOpen]);

  if (pathname === "/login") {
    return (
      <header className="auth-header">
        <Link className="auth-brand" href="/" aria-label="Hà Giang Travel Assistant - Trang chủ">
          <span className="auth-brand-mark" aria-hidden="true">
            <BrandLogo size={36} />
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

  interface HeaderNavLink {
    to: string;
    label: string;
    icon: typeof Home;
    isAi?: boolean;
  }

  const links: HeaderNavLink[] = [
    { to: "/", label: "Trang chủ", icon: Home },
    { to: "/explore", label: "Khám phá", icon: Compass },
    ...(mvpFeatures.culture ? [{ to: "/culture", label: "Văn hóa", icon: BookOpen }] : []),
    { to: "/assistant", label: "Trợ lý AI", icon: Sparkles, isAi: true },
    { to: "/favorites", label: "Yêu thích", icon: Heart },
    { to: "/trips/new", label: "Lập hành trình", icon: PlusCircle },
    { to: "/trips", label: "Chuyến đi của tôi", icon: CalendarDays },
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

  const isLinkActive = (to: string) => {
    if (to === "/") return pathname === "/";
    if (to === "/explore") return pathname === "/explore" || pathname.startsWith("/destinations/");
    if (to === "/trips") return pathname === "/trips" || (pathname.startsWith("/trips/") && !pathname.startsWith("/trips/new"));
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <header className={`site-header ${isScrolled ? "is-scrolled" : "is-top"}`}>
      <div className="site-header-inner">
        {/* Left: Branding */}
        <Link className="site-brand" href="/" aria-label="Hà Giang Travel Assistant - Trang chủ">
          <span className="site-brand-mark" aria-hidden="true">
            <BrandLogo size={38} />
          </span>
          <span className="site-brand-copy">
            <strong>Hà Giang</strong>
            <span>Travel Assistant</span>
          </span>
        </Link>

        {/* Center: Desktop Navigation */}
        <nav className="site-nav" aria-label="Điều hướng chính">
          {links.map(({ to, label, isAi }) => {
            const active = to === "/"
              ? pathname === "/"
              : to === "/explore"
                ? pathname === "/explore" || pathname.startsWith("/destinations/")
                : to === "/trips"
                  ? pathname === "/trips" || (pathname.startsWith("/trips/") && !pathname.startsWith("/trips/new"))
                : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                href={to as Route}
                className={`site-nav-link ${isAi ? "site-nav-link-ai" : ""}`}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                <span>{label}</span>
                {isAi && <span className="site-nav-ai-pill">AI</span>}
              </Link>
            );
          })}
        </nav>

        {/* Right: Controls & Actions */}
        <div className="site-header-actions">
          <ModeToggle className="site-theme-toggle" locale="vi" />
          <UserMenu />
          <button
            ref={toggleBtnRef}
            type="button"
            className="site-mobile-toggle"
            aria-expanded={isMobileMenuOpen}
            aria-controls="site-mobile-drawer"
            aria-label={isMobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer & Backdrop */}
      <div
        className={`site-mobile-overlay ${isMobileMenuOpen ? "site-mobile-overlay-open" : ""}`}
        aria-hidden={!isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      <aside
        id="site-mobile-drawer"
        className={`site-mobile-drawer ${isMobileMenuOpen ? "site-mobile-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu điều hướng di động"
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="site-mobile-drawer-header">
          <Link
            className="site-brand"
            href="/"
            aria-label="Hà Giang Travel Assistant - Trang chủ"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span className="site-brand-mark" aria-hidden="true">
              <BrandLogo size={34} />
            </span>
            <span className="site-brand-copy">
              <strong>Hà Giang</strong>
              <span>Travel Assistant</span>
            </span>
          </Link>
          <button
            ref={closeBtnRef}
            type="button"
            className="site-mobile-drawer-close"
            aria-label="Đóng menu"
            onClick={() => {
              setIsMobileMenuOpen(false);
              toggleBtnRef.current?.focus();
            }}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="site-mobile-nav" aria-label="Điều hướng di động">
          {links.map(({ to, label, icon: Icon, isAi }) => {
            const active = isLinkActive(to);
            return (
              <Link
                key={to}
                href={to as Route}
                className="site-mobile-nav-link"
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="site-mobile-nav-icon">
                  <Icon className="size-4" />
                </span>
                <span className="site-mobile-nav-label">{label}</span>
                {isAi && <span className="site-mobile-ai-badge">AI</span>}
              </Link>
            );
          })}
        </nav>

        <div className="site-mobile-drawer-footer">
          <div className="site-mobile-drawer-footer-row">
            <span className="site-mobile-footer-text">Giao diện sáng / tối</span>
            <ModeToggle className="site-theme-toggle" locale="vi" />
          </div>
        </div>
      </aside>
    </header>
  );
}
