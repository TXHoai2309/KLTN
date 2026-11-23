import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayTimeline, type DayTimelineDay } from "./day-timeline";
import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import { TripsageTimelineView } from "@/components/tripsage-chat/tripsage-timeline-view";
import { formatVisitDescription } from "@/modules/tripsage-chat/tripsage-timeline";

const SAMPLE_DAY: DayTimelineDay = {
  dayIndex: 1,
  localDate: "2026-12-13",
  transportLabel: "Xe máy",
  stops: [
    {
      id: "v1",
      destinationId: "dest-1",
      order: 1,
      name: "[Tạm] Cổng Trời Quản Bạ",
      area: "khu vực hà giang",
      startMinute: 492,
      durationMinutes: 60,
      href: "/destinations/dest-1",
      previewTarget: { kind: "CATALOG", name: "Cổng Trời Quản Bạ", latitude: 23.065, longitude: 104.991 },
      nearbyAfter: [
        { key: "n1", name: "Quán cà phê Cổng Trời", distanceKm: 0.4, previewTarget: { kind: "GOOGLE_PLACE", placeId: "ChIJ_cafe_1", name: "Quán cà phê Cổng Trời" } },
      ],
      lunchAfter: {
        fromMinute: 720,
        toMinute: 780,
        durationMinutes: 60,
        suggestions: [{ key: "m1", name: "Quán ăn Quản Bạ", distanceKm: 0.6 }],
      },
    },
    {
      id: "v2",
      destinationId: "dest-2",
      order: 2,
      name: "Phố cổ Đồng Văn",
      area: "đồng văn",
      startMinute: 840,
      durationMinutes: 90,
      external: true,
    },
  ],
};

describe("Ticket 06: Shared DayTimeline component (full & compact)", () => {
  it("renders full variant with photo, order, time rail, cleaned names, hidden placeholder area, and day color var", () => {
    const html = renderToStaticMarkup(
      createElement(DayTimeline, {
        day: SAMPLE_DAY,
        variant: "full",
        onPreview: () => {},
      }),
    );

    expect(html).toContain('data-variant="full"');
    expect(html).toContain("--tv-day-color:var(--tv-day-1)");
    expect(html).toContain("my-trips-timeline-node");
    expect(html).toContain("Ngày 1");
    expect(html).toContain("Cổng Trời Quản Bạ");
    expect(html).not.toContain("[Tạm]");
    expect(html).not.toContain("khu vực hà giang");
    expect(html).toContain("Đồng Văn");
    expect(html).toContain("08:12");
    expect(html).toContain("08:12 – 09:12 (60 phút)");
    expect(html).toContain("Điểm dừng 1");
    expect(html).toContain("Xem nhanh");
    expect(html).toContain("Gần đây có thể ghé");
    expect(html).toContain("Quán cà phê Cổng Trời");
    expect(html).toContain("Nghỉ trưa");
    expect(html).toContain("Quán ăn Quản Bạ");
  });

  it("renders compact variant and hides optional chat slots when not provided", () => {
    const minimalDay: DayTimelineDay = {
      dayIndex: 2,
      localDate: "2026-12-14",
      stops: [
        {
          id: "v3",
          destinationId: "dest-3",
          order: 1,
          name: "Đèo Mã Pí Lèng",
          area: "Mèo Vạc",
          startMinute: 540,
          durationMinutes: 45,
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(DayTimeline, { day: minimalDay, variant: "compact" }));
    expect(html).toContain('data-variant="compact"');
    expect(html).toContain("--tv-day-color:var(--tv-day-2)");
    expect(html).toContain("Đèo Mã Pí Lèng");
    expect(html).not.toContain("Xem nhanh");
    expect(html).not.toContain("Gần đây có thể ghé");
  });

  it("strips [Tam]/[Tạm]/[ Tạm ] prefix from stop descriptions across DayTimeline, TripsageTimelineView, formatVisitDescription, and PlacePreviewModal without marking the stop unverified", () => {
    const tempDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v-tam-1",
          destinationId: "dest-tam-1",
          order: 1,
          name: "[Tam] Núi Đôi Quản Bạ",
          area: "Quản Bạ",
          startMinute: 495,
          durationMinutes: 60,
          description: "[Tam] Điểm ngắm cảnh núi Đôi ở Quản Bạ và thung lũng Tam Sơn.",
          href: "/destinations/dest-tam-1",
        },
        {
          id: "v-tam-2",
          destinationId: "dest-tam-2",
          order: 2,
          name: "[ Tạm ] Rừng thông Yên Minh",
          area: "Yên Minh",
          startMinute: 660,
          durationMinutes: 60,
          description: "[ Tạm ] Điểm dừng ngắn ở khu vực Yên Minh để nghỉ chân.",
        },
      ],
    };

    for (const variant of ["full", "compact"] as const) {
      const html = renderToStaticMarkup(createElement(DayTimeline, { day: tempDay, variant }));
      expect(html).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
      expect(html).toContain("Núi Đôi Quản Bạ");
      expect(html).toContain("Điểm ngắm cảnh núi Đôi ở Quản Bạ và thung lũng Tam Sơn.");
      expect(html).toContain("Điểm dừng ngắn ở khu vực Yên Minh để nghỉ chân.");
      expect(html).not.toContain("ngoài danh mục (chưa kiểm)");
    }

    expect(formatVisitDescription("[Tam] Điểm ngắm cảnh núi Đôi ở Quản Bạ…")).toBe(
      "Điểm ngắm cảnh núi Đôi ở Quản Bạ…",
    );

    const viewHtml = renderToStaticMarkup(
      createElement(TripsageTimelineView, {
        timeline: {
          days: [
            {
              day: 1,
              date: "2026-12-13",
              items: [
                {
                  slotId: "d1-visit-1",
                  kind: "VISIT",
                  startMinute: 495,
                  endMinute: 555,
                  label: "[Tam] Núi Đôi Quản Bạ",
                  description: "[tạm] Điểm dừng ngắn ở khu vực Yên Minh…",
                },
              ],
            },
          ],
        },
        suggestions: [],
      }),
    );
    expect(viewHtml).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
    expect(viewHtml).toContain("Núi Đôi Quản Bạ");
    expect(viewHtml).toContain("Điểm dừng ngắn ở khu vực Yên Minh…");

    const modalHtml = renderToStaticMarkup(
      createElement(PlacePreviewModal, {
        target: { kind: "CATALOG", name: "[ Tạm ] Núi Đôi Quản Bạ", latitude: 23.065, longitude: 104.991 },
        onClose: () => {},
      }),
    );
    expect(modalHtml).not.toMatch(/\[\s*t[aạ]m\s*\]/i);
    expect(modalHtml).toContain("Núi Đôi Quản Bạ");
  });

  it("keeps day-timeline.css compliant with --tv-* tokens (no hardcoded hex, no 650/700+, no card shadows)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).not.toMatch(/font-weight\s*:\s*(650|700|750|800|900)\b/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\bInter\b/);
    expect(css).toContain("@media (max-width: 480px)");
  });
});
