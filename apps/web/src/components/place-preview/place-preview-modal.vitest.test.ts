import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildPlacePreviewEmbedUrl,
  buildPlacePreviewExternalUrl,
  canPreviewPlace,
  type PlacePreviewTarget,
} from "@/lib/place-preview-url";
import { TripsageMarkdown } from "@/components/tripsage-chat/tripsage-markdown";
import { TripsageTimelineView } from "@/components/tripsage-chat/tripsage-timeline-view";
import type { TimelinePart, TimelineSuggestion } from "@/modules/tripsage-chat/tripsage-timeline";
import {
  handlePlacePreviewKeyDown,
  PLACE_PREVIEW_EXTERNAL_LABEL,
  PLACE_PREVIEW_FALLBACK_TEXT,
  PLACE_PREVIEW_NOTICE,
  PlacePreviewModal,
} from "./place-preview-modal";

describe("Ticket 09: Place preview modal, buttons, URLs and accessibility", () => {
  it("renders 'Xem nhanh' only for items with valid coordinates or placeId, never for prose or items missing both", () => {
    const timeline: TimelinePart = {
      days: [
        {
          day: 1,
          date: "2026-12-01",
          items: [
            { slotId: "d1-drive-0", kind: "DRIVE", startMinute: 420, endMinute: 540, label: "Di chuyển" },
            {
              slotId: "d1-visit-1",
              kind: "VISIT",
              startMinute: 540,
              endMinute: 630,
              label: "Cổng Trời Quản Bạ",
              latitude: 23.0468,
              longitude: 104.9885,
              googleMapsUrl: "https://maps.google.com/?q=23.0468,104.9885",
            },
            {
              slotId: "d1-visit-2",
              kind: "VISIT",
              startMinute: 660,
              endMinute: 720,
              label: "Điểm thiếu tọa độ",
            },
            { slotId: "d1-overnight", kind: "OVERNIGHT", startMinute: 1020, endMinute: null, label: "Nghỉ đêm khu vực Quản Bạ" },
          ],
        },
      ],
    };
    const suggestions: TimelineSuggestion[] = [
      {
        slotId: "d1-overnight",
        kind: "LODGING",
        title: "HomeStay Minh Đức",
        place: { placeId: "ChIJ_lodging_123", name: "HomeStay Minh Đức", distanceKm: 0.4 },
      },
      {
        slotId: "d1-overnight",
        kind: "EVENING",
        title: "Dạo phố cổ buổi tối",
      },
    ];

    const timelineHtml = renderToStaticMarkup(createElement(TripsageTimelineView, { timeline, suggestions }));
    expect(timelineHtml).toContain('aria-label="Xem nhanh Cổng Trời Quản Bạ"');
    expect(timelineHtml).toContain('aria-label="Xem nhanh HomeStay Minh Đức"');
    expect(timelineHtml).not.toContain('aria-label="Xem nhanh Điểm thiếu tọa độ"');
    expect(timelineHtml).not.toContain('aria-label="Xem nhanh Dạo phố cổ buổi tối"');
    const previewButtons = timelineHtml.match(/class="tripsage-preview-btn"/g) ?? [];
    expect(previewButtons).toHaveLength(2);


    // Never renders preview buttons for place names written only in assistant prose
    const proseHtml = renderToStaticMarkup(createElement(TripsageMarkdown, { text: "Bạn có thể ghé **Cổng Trời Quản Bạ** hoặc **Homestay A**." }));
    expect(proseHtml).not.toContain("Xem nhanh");
  });

  it("renders accessible dialog with Maps Embed API URL, notice, and safe external Google Maps link", () => {
    const googlePlace: PlacePreviewTarget = { kind: "GOOGLE_PLACE", name: "HomeStay Minh Đức", placeId: "ChIJ_lodging_123" };
    const html = renderToStaticMarkup(
      createElement(PlacePreviewModal, {
        target: googlePlace,
        onClose: () => {},
        embedApiKey: "browser-test-key",
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain(PLACE_PREVIEW_NOTICE);
    expect(html).toContain(PLACE_PREVIEW_EXTERNAL_LABEL);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://www.google.com/maps/embed/v1/place?key=browser-test-key&amp;language=vi&amp;q=place_id%3AChIJ_lodging_123");
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=HomeStay+Minh+%C4%90%E1%BB%A9c&amp;query_place_id=ChIJ_lodging_123");

    const catalogPlace: PlacePreviewTarget = {
      kind: "CATALOG",
      name: "Cổng Trời Quản Bạ",
      latitude: 23.0468,
      longitude: 104.9885,
      verifiedGoogleMapsUrl: "https://maps.google.com/?cid=12345",
    };
    expect(buildPlacePreviewEmbedUrl(catalogPlace, "browser-test-key")).toBe(
      "https://www.google.com/maps/embed/v1/place?key=browser-test-key&language=vi&q=23.0468%2C104.9885",
    );
    expect(buildPlacePreviewExternalUrl(catalogPlace)).toBe("https://maps.google.com/?cid=12345");

    // Non-Google URLs are ignored in favor of system coordinate search URL
    expect(
      buildPlacePreviewExternalUrl({ ...catalogPlace, verifiedGoogleMapsUrl: "https://evil.example/phish" }),
    ).toBe("https://www.google.com/maps/search/?api=1&query=23.0468%2C104.9885");
  });

  it("shows graceful fallback message and still renders the Google Maps link when embed key is absent", () => {
    const html = renderToStaticMarkup(
      createElement(PlacePreviewModal, {
        target: { kind: "GOOGLE_PLACE", name: "Quán Ăn Phố Cổ", placeId: "ChIJ_abc123" },
        onClose: () => {},
        embedApiKey: null,
      }),
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain(PLACE_PREVIEW_FALLBACK_TEXT);
    expect(html).toContain(PLACE_PREVIEW_EXTERNAL_LABEL);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("closes on Escape and traps Tab / Shift+Tab inside the dialog", () => {
    const onClose = vi.fn();
    const first = { focus: vi.fn() };
    const last = { focus: vi.fn() };
    const focusables = [first, last];

    const escEvent = { key: "Escape", preventDefault: vi.fn() };
    handlePlacePreviewKeyDown(escEvent, { onClose, getFocusables: () => focusables, activeElement: first });
    expect(escEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    const tabAtEnd = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    handlePlacePreviewKeyDown(tabAtEnd, { onClose, getFocusables: () => focusables, activeElement: last });
    expect(tabAtEnd.preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(1);

    const shiftTabAtStart = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    handlePlacePreviewKeyDown(shiftTabAtStart, { onClose, getFocusables: () => focusables, activeElement: first });
    expect(shiftTabAtStart.preventDefault).toHaveBeenCalledTimes(1);
    expect(last.focus).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid coordinates or invalid placeIds and never references server or Stadia keys", () => {
    expect(canPreviewPlace({ kind: "CATALOG", name: "X", latitude: Number.NaN, longitude: 105 })).toBe(false);
    expect(canPreviewPlace({ kind: "CATALOG", name: "X", latitude: 95, longitude: 105 })).toBe(false);
    expect(canPreviewPlace({ kind: "GOOGLE_PLACE", name: "X", placeId: "bad id with spaces" })).toBe(false);

    const urlHelperSource = readFileSync(resolve(__dirname, "../../lib/place-preview-url.ts"), "utf8");
    expect(urlHelperSource).toContain("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    expect(urlHelperSource).not.toMatch(/\bGOOGLE_MAPS_API_KEY\b(?<!NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)/);
    expect(urlHelperSource).not.toMatch(/STADIA|OPENAI_|FIRECRAWL/);
  });
});
