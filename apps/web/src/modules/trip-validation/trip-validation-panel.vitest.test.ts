import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateItinerary } from "./trip-validation";
import { TripValidationPanel } from "./trip-validation-panel";

const reference = new Date("2026-10-15T00:00:00.000Z");
const visit = { visitId: "day-1-visit-1", dayIndex: 1, order: 1, localDate: "2026-10-20", startMinute: 480, plannedDurationMinutes: 60, minimumDurationMinutes: 30, openingDays: [{ dayOfWeek: "TUESDAY" as const, status: "OPEN" as const, intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }] };

describe("US-29C result UI", () => {
  it("renders exactly four named groups and an enabled confirmation when all satisfy", () => {
    const html = renderToStaticMarkup(createElement(TripValidationPanel, { validation: validateItinerary([visit], [], reference), onConfirm: () => undefined }));
    for (const label of ["Giờ hoạt động", "Thời lượng tham quan tối thiểu", "Thời gian di chuyển", "Xung đột thời gian"]) expect(html).toContain(label);
    expect(html.match(/<li\b/g)).toHaveLength(4);
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });
  it("renders missing data and disables confirmation", () => {
    const html = renderToStaticMarkup(createElement(TripValidationPanel, { validation: validateItinerary([{ ...visit, minimumDurationMinutes: null }], [], reference), onConfirm: () => undefined }));
    expect(html).toContain("Chưa đủ dữ liệu để kiểm tra");
    expect(html).toContain("Thiếu thời lượng tham quan tối thiểu");
    expect(html).toMatch(/<button[^>]*\sdisabled(?:\s|=|>)/);
  });
  it("names the affected visit when a check violates", () => {
    const html = renderToStaticMarkup(createElement(TripValidationPanel, { validation: validateItinerary([{ ...visit, minimumDurationMinutes: 90 }], [], reference), onConfirm: () => undefined }));
    expect(html).toContain("day-1-visit-1");
    expect(html).toContain("Vi phạm");
  });
});
