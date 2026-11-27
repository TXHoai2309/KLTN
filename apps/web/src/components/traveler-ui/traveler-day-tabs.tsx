"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";

export function travelerDayColorVar(dayNumber: number): string {
  const index = (((dayNumber - 1) % 7) + 7) % 7 + 1;
  return `--tv-day-${index}`;
}

const WEEKDAY_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function dayTabDateLabel(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const weekday = WEEKDAY_VI[new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).getUTCDay()];
  return `${weekday} ${+m[3]!}/${+m[2]!}`;
}

export interface TravelerDayTabItem {
  id: string;
  label: string;
  count?: number;
  dayNumber?: number;
  /** ISO yyyy-mm-dd; when set, the tab shows a second line "T7 28/11 · N điểm". */
  date?: string | null;
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
  activeId: string | number;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  sticky?: boolean;
  useTabRole?: boolean;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const normalizedActiveId = String(activeId);

  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [normalizedActiveId]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!useTabRole || tabs.length < 2) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onSelect(tabs[next]!.id);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <nav
      className={["tv-day-tabs", sticky ? "tv-day-tabs--sticky" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={useTabRole ? "tablist" : undefined}
      aria-label={ariaLabel}
    >
      {tabs.map((tab, index) => {
        const isActive = String(tab.id) === normalizedActiveId;
        const dateLabel = tab.kind === "trip" && tab.date ? dayTabDateLabel(tab.date) : null;
        const colorVar =
          tab.kind === "trip" && tab.dayNumber != null
            ? `var(${travelerDayColorVar(tab.dayNumber)})`
            : tab.kind === "travel"
              ? "var(--tv-ink-3)"
              : "var(--tv-accent)";
        const underlineVar =
          tab.kind === "trip" && tab.dayNumber != null
            ? `var(${travelerDayColorVar(tab.dayNumber)})`
            : tab.kind === "travel"
              ? "var(--tv-ink)"
              : "var(--tv-accent)";
        const style = {
          "--tv-tab-color": colorVar,
          "--tv-tab-underline": underlineVar,
        } as CSSProperties;

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
            tabIndex={useTabRole ? (isActive ? 0 : -1) : undefined}
            data-active={isActive ? "true" : "false"}
            className={`tv-day-tab${isActive ? " is-active" : ""}${dateLabel ? " tv-day-tab--dated" : ""}`}
            style={style}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.kind !== "all" && <span className="tv-day-tab-dot" aria-hidden="true" />}
            {dateLabel ? (
              <span className="tv-day-tab-stack">
                <span>{tab.label}</span>
                <span className="tv-day-tab-sub">
                  {dateLabel}
                  {typeof tab.count === "number" && ` · ${tab.count} điểm`}
                </span>
              </span>
            ) : (
              <>
                <span>{tab.label}</span>
                {typeof tab.count === "number" && (
                  <span className="tv-day-tab-count">· {tab.count}</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
