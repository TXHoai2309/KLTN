import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlacePreviewModal } from "@/components/place-preview/place-preview-modal";
import {
  chosenLodgingMapToList,
  pruneChosenLodgings,
  toggleChosenLodging,
  type ChosenLodgingMap,
  type TimelinePart,
  type TimelineSuggestion,
} from "@/modules/tripsage-chat/tripsage-timeline";
import { readConversationState } from "./tripsage-conversation-state";
import { ChosenLodgingButton, TripsageTimelineView } from "./tripsage-timeline-view";

const TIMELINE_3_DAYS: TimelinePart = {
  days: [
    {
      day: 1,
      date: "2026-12-01",
      items: [
        { slotId: "d1-visit-1", kind: "VISIT", startMinute: 480, endMinute: 570, label: "Cổng Trời Quản Bạ", latitude: 23.0468, longitude: 104.9885 },
        { slotId: "d1-overnight", kind: "OVERNIGHT", startMinute: 1020, endMinute: null, label: "Nghỉ đêm khu vực Quản Bạ" },
      ],
    },
    {
      day: 2,
      date: "2026-12-02",
      items: [
        { slotId: "d2-visit-1", kind: "VISIT", startMinute: 480, endMinute: 570, label: "Phố cổ Đồng Văn", latitude: 23.277, longitude: 105.363 },
        { slotId: "d2-overnight", kind: "OVERNIGHT", startMinute: 1020, endMinute: null, label: "Nghỉ đêm khu vực Đồng Văn" },
      ],
    },
    {
      day: 3,
      date: "2026-12-03",
      items: [
        { slotId: "d3-visit-1", kind: "VISIT", startMinute: 480, endMinute: 570, label: "Đèo Mã Pí Lèng", latitude: 23.246, longitude: 105.411 },
      ],
    },
  ],
};

const SUGGESTIONS: TimelineSuggestion[] = [
  { slotId: "d1-overnight", kind: "LODGING", title: "HomeStay Minh Đức", place: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức", distanceKm: 0.3 } },
  { slotId: "d1-overnight", kind: "LODGING", title: "Tom Homestay", place: { placeId: "ChIJ_homestay_2", name: "Tom Homestay", distanceKm: 0.6 } },
  { slotId: "d1-overnight", kind: "EVENING", title: "Dạo phố buổi tối" },
  { slotId: "d2-overnight", kind: "LODGING", title: "Đồng Văn Cliffside", place: { placeId: "ChIJ_homestay_3", name: "Đồng Văn Cliffside", distanceKm: 0.4 } },
];

describe("Ticket 10: chosen lodging per night in proposal", () => {
  it("selects, replaces, and deselects with at most one lodging per night, rejecting ineligible placeIds", () => {
    let chosen: ChosenLodgingMap = {};

    // Select lodging 1 for night 1
    chosen = toggleChosenLodging(chosen, SUGGESTIONS, 1, "ChIJ_homestay_1");
    expect(chosen).toEqual({ 1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" } });

    // Replace with lodging 2 for night 1 -> still max 1 for night 1
    chosen = toggleChosenLodging(chosen, SUGGESTIONS, 1, "ChIJ_homestay_2");
    expect(chosen).toEqual({ 1: { placeId: "ChIJ_homestay_2", name: "Tom Homestay" } });
    expect(chosenLodgingMapToList(chosen)).toHaveLength(1);

    // Reject unknown placeId or lodging belonging to a different night
    expect(toggleChosenLodging(chosen, SUGGESTIONS, 1, "ChIJ_not_attached")).toBe(chosen);
    expect(toggleChosenLodging(chosen, SUGGESTIONS, 1, "ChIJ_homestay_3")).toBe(chosen);

    // Clicking the currently selected lodging deselects it
    chosen = toggleChosenLodging(chosen, SUGGESTIONS, 1, "ChIJ_homestay_2");
    expect(chosen).toEqual({});
  });

  it("prunes chosen lodgings for nights that no longer exist after replanning", () => {
    const initial: ChosenLodgingMap = {
      1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" },
      2: { placeId: "ChIJ_homestay_3", name: "Đồng Văn Cliffside" },
    };
    // Shortened from 3 days (2 nights) to 2 days (1 night): night 2 is dropped
    const pruned = pruneChosenLodgings(initial, 2, SUGGESTIONS);
    expect(pruned).toEqual({ 1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" } });
  });

  it("renders 'Chọn cho đêm N' in both lodging suggestion cards and inside the Place preview modal, and marks chosen lodging 'Không phải đặt phòng'", () => {
    const unselectedHtml = renderToStaticMarkup(
      createElement(TripsageTimelineView, {
        timeline: TIMELINE_3_DAYS,
        suggestions: SUGGESTIONS,
        initialDay: 1,
        chosenLodgings: {},
        onToggleChosenLodging: () => {},
      }),
    );
    expect(unselectedHtml).toContain("Chọn cho đêm 1");
    expect(unselectedHtml).toContain('aria-pressed="false"');
    expect(unselectedHtml).not.toContain("Không phải đặt phòng");
    // Only the two LODGING suggestions on night 1 get the button (not EVENING)
    const buttons = unselectedHtml.match(/tripsage-choose-lodging-btn/g) ?? [];
    expect(buttons).toHaveLength(2);

    const chosenHtml = renderToStaticMarkup(
      createElement(TripsageTimelineView, {
        timeline: TIMELINE_3_DAYS,
        suggestions: SUGGESTIONS,
        initialDay: 1,
        chosenLodgings: { 1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" } },
        onToggleChosenLodging: () => {},
      }),
    );
    expect(chosenHtml).toContain("Đã chọn cho đêm 1");
    expect(chosenHtml).toContain('aria-pressed="true"');
    expect(chosenHtml).toContain("is-chosen-lodging");
    expect(chosenHtml).toContain("Không phải đặt phòng");

    const modalHtml = renderToStaticMarkup(
      createElement(PlacePreviewModal, {
        target: { kind: "GOOGLE_PLACE", name: "HomeStay Minh Đức", placeId: "ChIJ_homestay_1" },
        onClose: () => {},
        embedApiKey: "browser-key",
        footerAction: createElement(ChosenLodgingButton, {
          nightIndex: 1,
          placeName: "HomeStay Minh Đức",
          selected: false,
          onClick: () => {},
        }),
      }),
    );
    expect(modalHtml).toContain('role="dialog"');
    expect(modalHtml).toContain("Chọn cho đêm 1");
  });

  it("restores chosen lodgings from saved conversation parts and prunes them if a newer itinerary has fewer days", () => {
    const restored = readConversationState(
      [
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "data-itinerary", data: { proposalId: "p1", days: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
            { type: "data-suggestions", data: { suggestions: SUGGESTIONS } },
            {
              type: "data-chosen-lodgings",
              data: {
                chosenLodgings: [
                  { nightIndex: 1, placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" },
                  { nightIndex: 2, placeId: "ChIJ_homestay_3", name: "Đồng Văn Cliffside" },
                ],
              },
            },
          ],
        },
      ],
      data => Boolean(data && typeof data === "object" && "proposalId" in data),
    );
    expect(restored.chosenLodgings).toEqual({
      1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" },
      2: { placeId: "ChIJ_homestay_3", name: "Đồng Văn Cliffside" },
    });

    // When a later message replans to 2 days, night 2 is dropped automatically
    const afterReplan = readConversationState(
      [
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "data-itinerary", data: { proposalId: "p1", days: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
            {
              type: "data-chosen-lodgings",
              data: {
                chosenLodgings: [
                  { nightIndex: 1, placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" },
                  { nightIndex: 2, placeId: "ChIJ_homestay_3", name: "Đồng Văn Cliffside" },
                ],
              },
            },
          ],
        },
        {
          id: "a2",
          role: "assistant",
          parts: [
            { type: "data-itinerary", data: { proposalId: "p2", days: [{ day: 1 }, { day: 2 }] } },
          ],
        },
      ],
      data => Boolean(data && typeof data === "object" && "proposalId" in data),
    );
    expect(afterReplan.chosenLodgings).toEqual({
      1: { placeId: "ChIJ_homestay_1", name: "HomeStay Minh Đức" },
    });
  });
});
