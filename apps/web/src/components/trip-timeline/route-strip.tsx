"use client";

import type { CSSProperties } from "react";
import { travelerDayColorVar } from "@/components/traveler-ui/traveler-day-tabs";

export interface RouteStripDay {
  dayIndex: number;
  stopCount: number;
  distanceKm?: number | null;
}

export interface RouteStripProps {
  days: readonly RouteStripDay[];
  activeDayIndex: number | null;
  onSelectDay: (dayIndex: number) => void;
  className?: string;
}

/**
 * Horizontal proportional route strip (design §4.2 & §4.4).
 * 8px bar colored by day tokens `--tv-day-N`, clickable to jump to that day.
 */
export function RouteStrip({ days, activeDayIndex, onSelectDay, className }: RouteStripProps) {
  if (days.length === 0) return null;

  const hasAnyDistance = days.some((d) => typeof d.distanceKm === "number" && d.distanceKm > 0);
  const weights = days.map((d) =>
    hasAnyDistance ? Math.max(1, d.distanceKm ?? 0) : Math.max(1, d.stopCount),
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  return (
    <div className={["tv-route-strip", className ?? ""].filter(Boolean).join(" ")} aria-label="Dải cung đường">
      <div className="tv-route-strip-bar" role="group" aria-label="Tỉ lệ quãng đường các ngày">
        {days.map((day, index) => {
          const share = (weights[index]! / totalWeight) * 100;
          const isActive = activeDayIndex === day.dayIndex;
          const colorVar = `var(${travelerDayColorVar(day.dayIndex)})`;
          const summary = [
            `Ngày ${day.dayIndex}`,
            `${day.stopCount} điểm`,
            typeof day.distanceKm === "number" && day.distanceKm > 0
              ? `${Math.round(day.distanceKm)} km`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <button
              key={day.dayIndex}
              type="button"
              className={`tv-route-strip-seg${isActive ? " is-active" : ""}`}
              style={{ width: `${share}%`, "--tv-day-color": colorVar } as CSSProperties}
              aria-label={summary}
              aria-pressed={isActive}
              onClick={() => onSelectDay(day.dayIndex)}
            />
          );
        })}
      </div>

      <div className="tv-route-strip-labels">
        {days.map((day) => {
          const isActive = activeDayIndex === day.dayIndex;
          const colorVar = `var(${travelerDayColorVar(day.dayIndex)})`;
          const kmPart =
            typeof day.distanceKm === "number" && day.distanceKm > 0
              ? ` · ${Math.round(day.distanceKm)} km`
              : "";
          return (
            <button
              key={day.dayIndex}
              type="button"
              className={`tv-route-strip-label${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onSelectDay(day.dayIndex)}
            >
              <span
                className="tv-route-strip-dot"
                style={{ background: colorVar }}
                aria-hidden="true"
              />
              <span>
                Ngày {day.dayIndex} · {day.stopCount} điểm{kmPart}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
