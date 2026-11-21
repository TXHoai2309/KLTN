import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TripCalendarPicker from "./trip-calendar-picker";

afterEach(() => vi.useRealTimers());
it("disables yesterday using the Vietnam date even before UTC midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-19T17:00:00Z"));
  const html = renderToStaticMarkup(createElement(TripCalendarPicker, { selectedDate: "", onSelectDate() {}, onClearDate() {}, onClose() {} }));
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  expect(buttons.find(button => button.includes('aria-label="Ngày 19 tháng 11 năm 2026"'))).toContain('disabled=""');
  expect(buttons.find(button => button.includes('aria-label="Ngày 20 tháng 11 năm 2026 (Hôm nay)"'))).not.toContain('disabled=""');
});
