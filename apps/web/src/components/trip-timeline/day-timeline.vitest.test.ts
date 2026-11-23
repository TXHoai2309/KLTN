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

  it("sorts stops chronologically and drops overlapping lunch breaks (Bug C)", () => {
    const outOfOrderDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v4",
          destinationId: "s4",
          order: 4,
          name: "Rừng thông Yên Minh",
          startMinute: 884, // 14:44
          durationMinutes: 60,
        },
        {
          id: "v2",
          destinationId: "s2",
          order: 2,
          name: "Núi Đôi Quản Bạ",
          startMinute: 576, // 09:36 - 10:06
          durationMinutes: 30,
          // Bogus overlapping 12:00-13:00 lunch attached to stop 2 -> overlaps Nặm Đăm (10:14-12:14) and must be dropped
          lunchAfter: { fromMinute: 720, toMinute: 780, durationMinutes: 60 },
        },
        {
          id: "v3",
          destinationId: "s3",
          order: 3,
          name: "Làng văn hóa Nặm Đăm",
          startMinute: 614, // 10:14 - 12:14
          durationMinutes: 120,
          lunchAfter: { fromMinute: 734, toMinute: 794, durationMinutes: 60 },
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(DayTimeline, { day: outOfOrderDay, variant: "full" }));
    expect(html).toContain("12:14 – 13:14");
    expect(html).not.toContain("12:00 – 13:00");
    const i2 = html.indexOf("Núi Đôi Quản Bạ");
    const i3 = html.indexOf("Làng văn hóa Nặm Đăm");
    const iLunch = html.indexOf("Nghỉ trưa");
    const i4 = html.indexOf("Rừng thông Yên Minh");
    expect(i2).toBeGreaterThan(-1);
    expect(i3).toBeGreaterThan(i2);
    expect(iLunch).toBeGreaterThan(i3);
    expect(i4).toBeGreaterThan(iLunch);
  });

  it("clamps long stop descriptions via CSS line-clamp (3 full, 2 compact) with 'Xem thêm' while keeping full source text (Bug F)", () => {
    const longDesc =
      "Cổng trời Quản Bạ nằm ở độ cao hơn 1.500 m so với mực nước biển, là cửa ngõ mở vào Công viên địa chất toàn cầu Cao nguyên đá Đồng Văn với tầm nhìn bao quát thung lũng Tam Sơn và Núi Đôi Cô Tiên nổi tiếng khắp vùng Tây Bắc.";
    const longDay: DayTimelineDay = {
      dayIndex: 1,
      localDate: "2026-12-13",
      stops: [
        {
          id: "v-long-1",
          destinationId: "d-long-1",
          order: 1,
          name: "Cổng trời Quản Bạ",
          startMinute: 492,
          durationMinutes: 60,
          description: longDesc,
          previewTarget: {
            kind: "CATALOG",
            name: "Cổng trời Quản Bạ",
            latitude: 23.0493,
            longitude: 104.9927,
            description: longDesc,
          },
        },
      ],
    };

    for (const variant of ["full", "compact"] as const) {
      const html = renderToStaticMarkup(createElement(DayTimeline, { day: longDay, variant, onPreview: () => {} }));
      expect(html).toContain(longDesc); // Never truncates underlying source data
      expect(html).toContain("dt-visit-more-link");
      expect(html).toContain("Xem thêm");
    }

    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).toMatch(/\.dt-visit-desc\s*\{[^}]*-webkit-line-clamp\s*:\s*3/);
    expect(css).toMatch(/\.dt-day--compact\s+\.dt-visit-desc\s*\{[^}]*-webkit-line-clamp\s*:\s*2/);
  });

  it("keeps day-timeline.css compliant with --tv-* tokens (no hardcoded hex, no 650/700+, no card shadows)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/trip-timeline/day-timeline.css"), "utf8");
    expect(css).not.toMatch(/font-weight\s*:\s*(650|700|750|800|900)\b/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\bInter\b/);
    expect(css).toContain("@media (max-width: 480px)");
  });
});
