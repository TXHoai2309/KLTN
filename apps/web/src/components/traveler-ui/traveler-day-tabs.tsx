"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

export function travelerDayColorVar(dayNumber: number): string {
  const index = (((dayNumber - 1) % 7) + 7) % 7 + 1;
  return `--tv-day-${index}`;
}

export interface TravelerDayTabItem {
  id: string;
  label: string;
  count?: number;
  dayNumber?: number;
  kind?: "all" | "travel" | "trip";
  controlsId?: string;
  tabId?: string;
}

export function TravelerDayTabs({
  tabs,
  activeId,
  onSelect,
  ariaLabel = "Các ngày trong lịch trình",
  className,
  sticky = false,
  useTabRole = true,
}: {
  tabs: readonly TravelerDayTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  sticky?: boolean;
  useTabRole?: boolean;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeId]);

  return (
    <nav
      className={["tv-day-tabs", sticky ? "tv-day-tabs--sticky" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={useTabRole ? "tablist" : undefined}
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const colorVar =
          tab.kind === "trip" && tab.dayNumber != null
            ? `var(${travelerDayColorVar(tab.dayNumber)})`
            : tab.kind === "travel"
              ? "var(--tv-ink-3)"
              : "var(--tv-accent)";
        const style = { "--tv-tab-color": colorVar } as CSSProperties;

        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            id={tab.tabId}
            type="button"
            role={useTabRole ? "tab" : undefined}
            aria-selected={useTabRole ? isActive : undefined}
            aria-pressed={!useTabRole ? isActive : undefined}
            aria-controls={tab.controlsId}
            className={`tv-day-tab${isActive ? " is-active" : ""}`}
            style={style}
            onClick={() => onSelect(tab.id)}
          >
            {tab.kind !== "all" && <span className="tv-day-tab-dot" aria-hidden="true" />}
            <span>{tab.label}</span>
            {typeof tab.count === "number" && (
              <span className="tv-day-tab-count">· {tab.count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
