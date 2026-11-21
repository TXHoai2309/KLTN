import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { COMPLETE_JOURNEY_FIXTURE } from "../../modules/trip-origin/trip-origin-fixtures";
import { EMPTY_REQUIREMENT_DRAFT } from "../../modules/tripsage-chat/tripsage-chat-context";
import type { TripsageRequirement } from "../../modules/tripsage-chat/tripsage-chat-context";
import { TripsageChatClient } from "./tripsage-chat-client";
import { canConfirmTripInfo, TripsageTripInfoDialog } from "./tripsage-trip-info-dialog";
import { TripsageTripSummary } from "./tripsage-trip-summary";

const REQUIREMENT: TripsageRequirement = { transport: "MOTORCYCLE", durationDays: 3, startDate: "2026-11-02", interests: ["NATURE", "FOOD"] };
const dialog = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(TripsageTripInfoDialog, { open: true, requirement: null, journey: null, onClose: vi.fn(), onConfirm: vi.fn(), ...props } as never));

describe("trip info dialog", () => {
  it("renders nothing when closed", () => { expect(dialog({ open: false })).toBe(""); });

  it("is an accessible Vietnamese modal with every field", () => {
    const html = dialog();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    for (const text of ["Thông tin chuyến đi", "Phương tiện", "Xe máy", "Ô tô", "Số ngày", "Ngày bắt đầu", "Sở thích", "Thiên nhiên", "Văn hóa - lịch sử", "Bản làng dân tộc", "Chụp ảnh", "Ẩm thực", "Khám phá", "Thư giãn", "Điểm xuất phát", "Đóng"]) expect(html, text).toContain(text);
  });

  it("locks the confirm button while anything is missing and unlocks it when complete", () => {
    expect(dialog()).toMatch(/<button[^>]*\sdisabled=""[^>]*>Xác nhận và lập hành trình/);
    expect(canConfirmTripInfo(EMPTY_REQUIREMENT_DRAFT, null)).toBe(false);
    const draft = { transport: "CAR", durationDays: "2", startDate: "2026-11-02", interests: ["NATURE"] } as const;
    expect(canConfirmTripInfo({ ...draft, interests: [...draft.interests] }, null)).toBe(false);
    expect(canConfirmTripInfo({ ...draft, interests: [...draft.interests] }, { ...COMPLETE_JOURNEY_FIXTURE, origin: { ...COMPLETE_JOURNEY_FIXTURE.origin!, confirmed: false } })).toBe(false);
    expect(canConfirmTripInfo({ ...draft, interests: [...draft.interests] }, COMPLETE_JOURNEY_FIXTURE)).toBe(true);
    const html = dialog({ requirement: REQUIREMENT, journey: COMPLETE_JOURNEY_FIXTURE });
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Xác nhận và lập hành trình/);
  });
});

describe("trip summary strip", () => {
  it("lists transport, days, date, interests and origin with an edit button", () => {
    const html = renderToStaticMarkup(createElement(TripsageTripSummary, { requirement: REQUIREMENT, journey: COMPLETE_JOURNEY_FIXTURE, onEdit: vi.fn() }));
    for (const text of ["Xe máy", "3 ngày", "02/11/2026", "Thiên nhiên", "Ẩm thực", COMPLETE_JOURNEY_FIXTURE.origin!.label, "Sửa thông tin"]) expect(html, text).toContain(text);
  });
  it("locks the edit button while saving or unknown", () => {
    const html = renderToStaticMarkup(createElement(TripsageTripSummary, { requirement: REQUIREMENT, journey: COMPLETE_JOURNEY_FIXTURE, onEdit: vi.fn(), disabled: true }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>/);
  });
  it("shows a prominent fill-in button when there is no requirement", () => {
    const html = renderToStaticMarkup(createElement(TripsageTripSummary, { requirement: null, journey: null, onEdit: vi.fn() }));
    expect(html).toContain("Điền thông tin chuyến đi");
  });
});

describe("chat client layout", () => {
  const html = renderToStaticMarkup(createElement(TripsageChatClient));
  it("opens the info dialog on first entry and drops the bottom origin panel", () => {
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("tripsage-journey-panel");
    expect(html).toContain("Điền thông tin chuyến đi");
  });
});
