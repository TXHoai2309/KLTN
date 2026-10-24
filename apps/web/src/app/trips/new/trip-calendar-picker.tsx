"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatVietnameseDate } from "@/lib/date-only";

export type TripCalendarPickerProps = {
  selectedDate: string; // ISO "YYYY-MM-DD" or ""
  onSelectDate: (isoDate: string) => void;
  onClearDate: () => void;
  onClose: () => void;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getDaysInMonth(year: number, month: number): number {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}

export default function TripCalendarPicker({
  selectedDate,
  onSelectDate,
  onClearDate,
  onClose,
}: TripCalendarPickerProps) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const initialYear = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? Number(selectedDate.split("-")[0])
    : today.getFullYear();

  const initialMonth = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? Number(selectedDate.split("-")[1])
    : today.getMonth() + 1;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  // In JS getDay() is 0 for Sunday. Convert so Monday = 0, Sunday = 6
  const firstDayOfWeek = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;

  return (
    <div className="trip-cal-container" role="region" aria-label="Lịch chọn ngày khởi hành">
      {/* Calendar Navigation Header */}
      <div className="trip-cal-header">
        <button
          type="button"
          className="trip-cal-nav-btn"
          onClick={handlePrevMonth}
          aria-label="Tháng trước"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <span className="trip-cal-month-title">
          Tháng {viewMonth}, {viewYear}
        </span>

        <button
          type="button"
          className="trip-cal-nav-btn"
          onClick={handleNextMonth}
          aria-label="Tháng sau"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Weekday Row */}
      <div className="trip-cal-grid" role="row">
        {WEEKDAYS.map((day) => (
          <div key={day} className="trip-cal-weekday" role="columnheader">
            {day}
          </div>
        ))}

        {/* Empty slots for days before 1st of month */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="trip-cal-day-cell" aria-hidden="true" />
        ))}

        {/* Days of Month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const iso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const isSelected = selectedDate === iso;
          const isToday = todayIso === iso;
          const isPast = iso < todayIso;

          return (
            <div key={iso} className="trip-cal-day-cell">
              <button
                type="button"
                className="trip-cal-day-btn"
                data-selected={isSelected}
                data-today={isToday}
                data-past={isPast}
                onClick={() => {
                  onSelectDate(iso);
                }}
                aria-label={`Ngày ${dayNum} tháng ${viewMonth} năm ${viewYear}${isToday ? " (Hôm nay)" : ""}`}
                aria-pressed={isSelected}
              >
                <span>{dayNum}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Calendar Footer: Status and Done */}
      <div className="trip-cal-footer">
        <div className="trip-cal-selected-info">
          {selectedDate ? (
            <div className="trip-cal-selected-row">
              <span className="trip-cal-selected-text">
                Đã chọn: {formatVietnameseDate(selectedDate)}
              </span>
              <button
                type="button"
                className="trip-cal-clear-btn"
                onClick={onClearDate}
                aria-label="Xóa ngày"
              >
                <X size={13} aria-hidden="true" />
                <span>Bỏ chọn</span>
              </button>
            </div>
          ) : (
            <span className="trip-cal-hint-text">Chạm vào ngày bất kỳ để chọn</span>
          )}
        </div>

        <button
          type="button"
          className="trip-cal-done-btn"
          onClick={onClose}
        >
          Xong
        </button>
      </div>
    </div>
  );
}
