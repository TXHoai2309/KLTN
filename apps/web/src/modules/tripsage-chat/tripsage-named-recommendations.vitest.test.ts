import { describe, expect, it } from "vitest";
import type { PlannerCandidate } from "../trip-planner/planner-candidates";
import { createTripsageChatTools } from "./tripsage-chat-tools";
import { buildTripsageContext, TRIPSAGE_CHAT_INSTRUCTIONS } from "./tripsage-chat-service";

const ALL_OPEN = (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const).map(
  dayOfWeek => ({ dayOfWeek, status: "OPEN" as const, intervals: [{ opensAtMinute: 360, closesAtMinute: 1080 }] }),
);

const QUAN_BA: PlannerCandidate = {
  id: "dest-quan-ba",
  name: "Cổng trời Quản Bạ",
  description: "Điểm ngắm cảnh Quản Bạ",
  area: "khu vực hà giang",
  category: "thiên nhiên – thắng cảnh",
  latitude: 23.0493,
  longitude: 104.9927,
  address: "Xã Quản Bạ, tỉnh Tuyên Quang",
  image: null,
  suggestedDurationMinutes: 60,
  minimumDurationMinutes: 30,
  visibility: "VISIBLE",
  isOutdoor: true,
  openingDays: ALL_OPEN,
};

describe("Point 4 — name recommendations with distances when traveler asks directly (L5)", () => {
  it("returns distanceKm from searchPlaces and attached names + direct-answer note from addSuggestions on L5", async () => {
    const tools = createTripsageChatTools({
      planning: {
        candidates: async () => [QUAN_BA],
        routes: {
          route: async () => ({
            fromDestinationId: "",
            toDestinationId: "",
            status: "INSUFFICIENT_DATA",
            reason: "NOT_CONFIGURED",
            durationSeconds: null,
            distanceMeters: null,
            provider: null,
          }),
        },
        now: () => new Date("2026-11-23T05:00:00Z"),
      },
      emitItinerary: () => {},
      currentItinerary: {
        days: [{ day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 540, departureMinute: 600 }] }],
        distanceKm: 120,
      },
      places: async () => ({
        status: "RESULTS",
        places: [
          { placeId: "ChIJ-eat-1", name: "Nhà Hàng Hương Độ", latitude: 23.0580, longitude: 104.9960 },
          { placeId: "ChIJ-eat-2", name: "Phong Son Restaurant", latitude: 23.0620, longitude: 104.9990 },
        ],
      }),
      latestUserText: "tối ngày 1 bọn mình ăn gì ngon gần chỗ nghỉ?",
    });

    const searched = await tools.searchPlaces.execute!(
      { query: "quán ăn", nearDestinationId: QUAN_BA.id },
      { toolCallId: "s1", messages: [] },
    ) as { ok: boolean; places: { name: string; distanceKm?: number }[] };

    expect(searched.ok).toBe(true);
    expect(searched.places[0]).toMatchObject({ name: "Nhà Hàng Hương Độ" });
    expect(typeof searched.places[0]!.distanceKm).toBe("number");
    expect(searched.places[0]!.distanceKm).toBeGreaterThan(0);

    const added = await tools.addSuggestions.execute!(
      {
        items: [
          { slotId: "d1-visit-1", kind: "MEAL", title: "Nhà Hàng Hương Độ", placeId: "ChIJ-eat-1" },
          { slotId: "d1-visit-1", kind: "MEAL", title: "Phong Son Restaurant", placeId: "ChIJ-eat-2" },
        ],
      },
      { toolCallId: "a1", messages: [] },
    ) as { ok: boolean; attached?: { title: string; distanceKm?: number }[]; note: string };

    expect(added.ok).toBe(true);
    expect(added.attached).toHaveLength(2);
    expect(added.attached!.map(x => x.title)).toEqual(["Nhà Hàng Hương Độ", "Phong Son Restaurant"]);
    expect(typeof added.attached![0]!.distanceKm).toBe("number");
    expect(added.note).toMatch(/nêu\s+tên/iu);
    expect(added.note).toMatch(/khoảng\s+cách/iu);
    expect(added.note).not.toContain("Không nhắc lại toàn bộ");
  });

  it("includes MEAL and ACTIVITY suggestions with distances in buildTripsageContext alongside Tối nay", () => {
    const ctx = buildTripsageContext({
      now: new Date("2026-11-23T05:00:00Z"),
      itinerary: {
        days: [
          { day: 1, stops: [{ id: QUAN_BA.id, name: QUAN_BA.name, arrivalMinute: 540, departureMinute: 600 }] },
          { day: 2, stops: [{ id: "d2", name: "Phố cổ Đồng Văn", arrivalMinute: 540, departureMinute: 660 }] },
        ],
        distanceKm: 180,
      },
      suggestions: [
        { slotId: "d1-overnight", kind: "EVENING", title: "Quán Cà Phê Tam Sơn", place: { placeId: "p1", name: "Quán Cà Phê Tam Sơn", distanceKm: 1.1 } },
        { slotId: "d1-lunch", kind: "MEAL", title: "Nhà Hàng Hương Độ", place: { placeId: "p2", name: "Nhà Hàng Hương Độ", distanceKm: 1.0 } },
        { slotId: "d1-visit-1", kind: "ACTIVITY", title: "Thung lũng Tam Sơn", place: { placeId: "p3", name: "Thung lũng Tam Sơn", distanceKm: 1.8 } },
      ],
    });
    expect(ctx).toContain("Nhà Hàng Hương Độ");
    expect(ctx).toContain("1 km");
    expect(ctx).toContain("Thung lũng Tam Sơn");
    expect(ctx).toContain("1.8 km");
    expect(ctx).toContain("Quán Cà Phê Tam Sơn");
  });

  it("instructs persona to name 2-3 specific suggestions with distances when asked directly", () => {
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/ăn gì|ở đâu|chơi gì/iu);
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).toMatch(/nêu tên 2–3 gợi ý kèm khoảng cách/iu);
    expect(TRIPSAGE_CHAT_INSTRUCTIONS).not.toContain("và không liệt kê lại các địa điểm searchPlaces trong lời văn.");
  });
});
