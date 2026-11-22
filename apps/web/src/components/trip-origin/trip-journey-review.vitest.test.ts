import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  changeOriginSelection,
  missingJourneyFields,
  type OriginSelection,
  type TripJourney,
} from "@/modules/trip-origin/trip-origin-contract";
import {
  formatMinuteLabel,
  minuteToTimeString,
  timeStringToMinute,
} from "@/modules/trip-origin/journey-time-utils";
import {
  confirmDraft,
  draftFromFormFields,
  invalidateConfirmation,
  updateDraftJourney,
  type TripRequirementReviewDraft,
} from "@/modules/trip-requirement/trip-requirement-review";
import TripJourneyReviewSection from "./trip-journey-review-section";
import TripJourneyEditor from "./trip-journey-editor";
import { COMPLETE_JOURNEY_FIXTURE, ORIGIN_FIXTURES } from "@/modules/trip-origin/trip-origin-fixtures";

describe("Trip Journey Review & Editor components", () => {
  const baseDraft: TripRequirementReviewDraft = draftFromFormFields({
    startDate: "2026-11-10",
    durationDays: "3",
    transport: "MOTORCYCLE",
    companionType: "",
    companionGroupSize: "",
    interests: [],
    pace: "",
    mobilityFlags: [],
    mobilityNote: "",
  });

  describe("Time utilities", () => {
    it("converts minute to formatted time string", () => {
      expect(minuteToTimeString(0)).toBe("00:00");
      expect(minuteToTimeString(360)).toBe("06:00");
      expect(minuteToTimeString(480)).toBe("08:00");
      expect(minuteToTimeString(1260)).toBe("21:00");
      expect(minuteToTimeString(1439)).toBe("23:59");
      expect(minuteToTimeString(null)).toBe("");
      expect(minuteToTimeString(undefined)).toBe("");
    });

    it("converts time string to minute of day", () => {
      expect(timeStringToMinute("00:00")).toBe(0);
      expect(timeStringToMinute("06:00")).toBe(360);
      expect(timeStringToMinute("08:00")).toBe(480);
      expect(timeStringToMinute("21:00")).toBe(1260);
      expect(timeStringToMinute("23:59")).toBe(1439);
      expect(timeStringToMinute("invalid")).toBeNull();
      expect(timeStringToMinute("")).toBeNull();
      expect(timeStringToMinute("25:00")).toBeNull();
    });

    it("formats minute label for display", () => {
      expect(formatMinuteLabel(360)).toBe("06:00");
      expect(formatMinuteLabel(null)).toBe("Chưa chọn giờ");
    });
  });

  describe("Origin and Journey contract rules", () => {
    it("invalidates confirmation on any selection change", () => {
      const confirmedOrigin: OriginSelection = {
        label: "Hà Nội",
        latitude: 21.028511,
        longitude: 105.804817,
        source: "MANUAL",
        confirmed: true,
      };

      const moved = changeOriginSelection(confirmedOrigin, {
        latitude: 21.03,
      });
      expect(moved.confirmed).toBe(false);
      expect(moved.latitude).toBe(21.03);
      expect(moved.longitude).toBe(105.804817);

      const relabeled = changeOriginSelection(confirmedOrigin, {
        label: "Bến xe Mỹ Đình",
      });
      expect(relabeled.confirmed).toBe(false);
      expect(relabeled.label).toBe("Bến xe Mỹ Đình");
    });

    it("accurately detects missing fields for unconfirmed or partial journeys", () => {
      expect(missingJourneyFields(null)).toEqual([
        "origin",
        "departureMinute",
        "returnDeadlineMinute",
      ]);

      const unconfirmedJourney: TripJourney = {
        origin: { ...ORIGIN_FIXTURES.unconfirmed },
        departureMinute: 360,
        returnDeadlineMinute: 1260,
        returnDepartureMinute: null,
      };
      expect(missingJourneyFields(unconfirmedJourney)).toEqual(["originConfirmation"]);

      const completeJourney: TripJourney = { ...COMPLETE_JOURNEY_FIXTURE };
      expect(missingJourneyFields(completeJourney)).toEqual([]);
    });

    it("updateDraftJourney drops existing confirmation snapshot", () => {
      const draft = { ...baseDraft, journey: COMPLETE_JOURNEY_FIXTURE };
      const updated = updateDraftJourney(draft, {
        ...COMPLETE_JOURNEY_FIXTURE,
        departureMinute: 420,
      });

      expect(updated.draft.journey?.departureMinute).toBe(420);
      expect(updated.confirmation).toEqual({ state: "NOT_CONFIRMED", snapshot: null });
    });
  });

  describe("TripJourneyReviewSection rendering", () => {
    it("renders complete confirmed journey details", () => {
      const draftWithCompleteJourney: TripRequirementReviewDraft = {
        ...baseDraft,
        journey: {
          origin: {
            label: "Hà Nội",
            latitude: 21.028511,
            longitude: 105.804817,
            source: "MANUAL",
            confirmed: true,
          },
          departureMinute: 360,
          returnDeadlineMinute: 1260,
          returnDepartureMinute: null,
        },
      };

      const html = renderToStaticMarkup(
        createElement(TripJourneyReviewSection, {
          draft: draftWithCompleteJourney,
          onJourneyChange: vi.fn(),
        }),
      );

      expect(html).toContain("Nơi xuất phát &amp; Lịch trình đi/về");
      expect(html).toContain("Hà Nội");
      expect(html).toContain("Đã xác nhận");
      expect(html).toContain("06:00");
      expect(html).toContain("21:00");
      expect(html).not.toContain("Lưu ý: Chưa hoàn thành đủ thông tin");
    });

    it("renders missing-data warning when origin is missing or unconfirmed", () => {
      const draftWithUnconfirmedJourney: TripRequirementReviewDraft = {
        ...baseDraft,
        journey: {
          origin: {
            label: "Điểm chưa xác nhận",
            latitude: 21.0,
            longitude: 105.8,
            source: "MANUAL",
            confirmed: false,
          },
          departureMinute: null,
          returnDeadlineMinute: null,
          returnDepartureMinute: null,
        },
      };

      const html = renderToStaticMarkup(
        createElement(TripJourneyReviewSection, {
          draft: draftWithUnconfirmedJourney,
          onJourneyChange: vi.fn(),
        }),
      );

      expect(html).toContain("Chưa xác nhận ghim");
      expect(html).toContain("Lưu ý: Chưa hoàn thành đủ thông tin chặng đi/về");
      expect(html).toContain("preliminary proposal");
    });

    it("renders empty origin state gracefully", () => {
      const draftWithoutJourney: TripRequirementReviewDraft = {
        ...baseDraft,
        journey: null,
      };

      const html = renderToStaticMarkup(
        createElement(TripJourneyReviewSection, {
          draft: draftWithoutJourney,
          onJourneyChange: vi.fn(),
        }),
      );

      expect(html).toContain("Chưa chọn điểm xuất phát");
      expect(html).toContain("Chưa có");
      expect(html).toContain("Lưu ý: Chưa hoàn thành đủ thông tin chặng đi/về");
    });
  });

  describe("TripJourneyEditor rendering", () => {
    it("renders inputs for departure and return deadline times without defaulting to 08:00", () => {
      const html = renderToStaticMarkup(
        createElement(TripJourneyEditor, {
          journey: null,
          onChange: vi.fn(),
        }),
      );

      expect(html).toContain("Giờ khởi hành ngày đầu");
      expect(html).toContain("Hạn trở về ngày cuối");
      expect(html).toContain('value=""');
      expect(html).not.toContain('value="08:00"');
      expect(html).toContain("Thông tin chặng đi/về cần hoàn thiện");
    });

    it("renders existing times when supplied", () => {
      const html = renderToStaticMarkup(
        createElement(TripJourneyEditor, {
          journey: {
            origin: null,
            departureMinute: 420, // 07:00
            returnDeadlineMinute: 1200, // 20:00
            returnDepartureMinute: null,
          },
          onChange: vi.fn(),
        }),
      );

      expect(html).toContain('value="07:00"');
      expect(html).toContain('value="20:00"');
    });
  });
});

