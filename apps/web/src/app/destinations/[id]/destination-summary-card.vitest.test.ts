import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { formatPlannerDurationSummary } from "@/modules/destination/public-destination-contract";
import { readPublicDestinationPlannerDuration } from "@/modules/destination/public-destination-duration";
import { DestinationSummaryCard } from "./destination-summary-card";

const baseProps = {
  destinationId: "dest-1",
  destinationName: "Cao nguyên đá Đồng Văn",
  area: "Đồng Văn",
  hours: [],
  ticketPrice: null,
  hasCoordinates: true,
  mapSlot: null,
};

describe("Lỗi 4: formatPlannerDurationSummary & DestinationSummaryCard", () => {
  it("formats planner minimum and suggested duration ranges and single values", () => {
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 60, suggestedDurationMinutes: 120 })).toBe(
      "Khoảng 1–2 giờ",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 90, suggestedDurationMinutes: 120 })).toBe(
      "Khoảng 1,5–2 giờ",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 90, suggestedDurationMinutes: 180 })).toBe(
      "Khoảng 1,5–3 giờ",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 30, suggestedDurationMinutes: 90 })).toBe(
      "Khoảng 30 phút – 1 giờ 30 phút",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 30, suggestedDurationMinutes: 45 })).toBe(
      "Khoảng 30–45 phút",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: null, suggestedDurationMinutes: 60 })).toBe("1 giờ");
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: 45, suggestedDurationMinutes: null })).toBe(
      "45 phút",
    );
    expect(formatPlannerDurationSummary({ minimumDurationMinutes: null, suggestedDurationMinutes: null })).toBeNull();
  });

  it("renders range or single duration when data exists (Lũng Cú, Nho Quế, Mã Pì Lèng) and 'Chưa có' only when truly empty", () => {
    const lungCuHtml = renderToStaticMarkup(
      createElement(DestinationSummaryCard, {
        ...baseProps,
        destinationName: "Cột cờ Lũng Cú",
        minimumDurationMinutes: 90,
        suggestedDurationMinutes: 120,
      }),
    );
    expect(lungCuHtml).toContain("Khoảng 1,5–2 giờ");

    const nhoQueHtml = renderToStaticMarkup(
      createElement(DestinationSummaryCard, {
        ...baseProps,
        destinationName: "Sông Nho Quế",
        minimumDurationMinutes: 90,
        suggestedDurationMinutes: 180,
      }),
    );
    expect(nhoQueHtml).toContain("Khoảng 1,5–3 giờ");

    const maPiLengHtml = renderToStaticMarkup(
      createElement(DestinationSummaryCard, {
        ...baseProps,
        destinationName: "Đèo Mã Pì Lèng",
        minimumDurationMinutes: 30,
        suggestedDurationMinutes: 90,
      }),
    );
    expect(maPiLengHtml).toContain("Khoảng 30 phút – 1 giờ 30 phút");

    const minOnlyHtml = renderToStaticMarkup(
      createElement(DestinationSummaryCard, {
        ...baseProps,
        minimumDurationMinutes: 45,
        suggestedDurationMinutes: null,
      }),
    );
    expect(minOnlyHtml).toContain("<span>Thời lượng gợi ý</span></dt><dd>45 phút</dd>");

    const emptyHtml = renderToStaticMarkup(
      createElement(DestinationSummaryCard, {
        ...baseProps,
        minimumDurationMinutes: null,
        suggestedDurationMinutes: null,
      }),
    );
    expect(emptyHtml).toContain("<span>Thời lượng gợi ý</span></dt><dd>Chưa có</dd>");
    expect(emptyHtml).not.toContain("Chưa có thời lượng gợi ý");
  });

  it("reads minimum and suggested durations safely via readPublicDestinationPlannerDuration", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      suggestedDurationMinutes: 120,
      minimumDurationMinutes: 90,
    });
    const result = await readPublicDestinationPlannerDuration("dest-1", {
      destination: { findFirst },
    } as never);
    expect(result).toEqual({
      suggestedDurationMinutes: 120,
      minimumDurationMinutes: 90,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);

    const mockEmptyDbResult = await readPublicDestinationPlannerDuration("dest-1", {} as never);
    expect(mockEmptyDbResult).toBeNull();
  });
});
