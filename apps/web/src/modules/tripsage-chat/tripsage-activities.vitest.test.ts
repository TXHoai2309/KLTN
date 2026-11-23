import { describe, expect, it, vi } from "vitest";

import type { PlannerResult } from "../trip-planner/planner-contract";
import { ACTIVITY_MAX_ANCHORS, ACTIVITY_PER_SLOT, OVERNIGHT_TOWN_CENTERS, activityAnchors, isLodgingPlace, nearbyActivitySuggestions } from "./tripsage-activities";
import type { PlacesSearch } from "./tripsage-places";

const stop = (name: string, latitude: number, longitude: number, departureMinute = 840) => ({ departureMinute, destination: { id: name, name, latitude, longitude } });
const plan = { days: [
  { day: 1, stops: [stop("Quản Bạ", 23.07, 104.98), stop("Yên Minh", 23.1, 105.15)] },
  { day: 2, stops: [stop("Đồng Văn", 23.28, 105.36)] },
] } as unknown as PlannerResult;

describe("tripsage-activities (ADR-45)", () => {
  it("anchors every stop, then free afternoons and nights except the last day, at the day's last stop", () => {
    const { anchors, stopNames } = activityAnchors(plan);
    expect(anchors.map(a => a.slotId)).toEqual(["d1-visit-1", "d1-visit-2", "d2-visit-1", "d1-free", "d1-overnight"]);
    expect(anchors.find(a => a.slotId === "d1-free")).toMatchObject({ kind: "FREE", latitude: 23.1, longitude: 105.15 });
    expect(anchors.at(-1)).toMatchObject({ kind: "EVENING", anchorSource: "town_center", ...OVERNIGHT_TOWN_CENTERS["Yên Minh"] });
    expect(stopNames).toEqual(["Quản Bạ", "Yên Minh", "Đồng Văn"]);
  });

  it("returns at most five nearest places per slot, skips itinerary stops, and uses each place once", async () => {
    const { anchors, stopNames } = activityAnchors(plan);
    const places: PlacesSearch = vi.fn(async (_q, _s, near) => ({
      status: "RESULTS" as const,
      places: [
        { placeId: "stop", name: "Quản Bạ", latitude: near!.latitude, longitude: near!.longitude },
        ...Array.from({ length: 8 }, (_, i) => ({ placeId: `p${i}`, name: `Chỗ chơi ${i}`, latitude: near!.latitude + i * 0.002, longitude: near!.longitude })),
      ],
    }));
    const out = await nearbyActivitySuggestions({ places, anchors: anchors.slice(0, 2), stopNames, now: () => 1 });
    const first = out.filter(s => s.slotId === "d1-visit-1");
    expect(first).toHaveLength(ACTIVITY_PER_SLOT);
    expect(first.map(s => s.place?.placeId)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(out.some(s => s.place?.placeId === "stop")).toBe(false);
    // the second slot cannot reuse places already shown on the first
    expect(new Set(out.map(s => s.place?.placeId)).size).toBe(out.length);
  });

  it("does not anchor a free afternoon when the day already ends late", () => {
    const late = { days: [{ day: 1, stops: [stop("Quản Bạ", 23.07, 104.98, 1020)] }, { day: 2, stops: [stop("Đồng Văn", 23.28, 105.36)] }] } as unknown as PlannerResult;
    expect(activityAnchors(late).anchors.map(a => a.slotId)).toEqual(["d1-visit-1", "d2-visit-1", "d1-overnight"]);
  });

  it("shows free-afternoon places as ACTIVITY and lets a night reuse a place the day already showed", async () => {
    const { anchors, stopNames } = activityAnchors(plan);
    const places: PlacesSearch = async (_q, _s, near) => ({ status: "RESULTS", places: [{ placeId: "same", name: "Chợ đêm", latitude: near!.latitude, longitude: near!.longitude + 0.001 }] });
    const out = await nearbyActivitySuggestions({ places, anchors: anchors.filter(a => a.slotId === "d1-free" || a.slotId === "d1-overnight"), stopNames, now: () => 3e9 });
    expect(out.map(s => [s.slotId, s.kind])).toEqual([["d1-free", "ACTIVITY"], ["d1-overnight", "EVENING"]]);
  });

  it("treats a failed or unavailable lookup as no suggestions for that slot", async () => {
    const { anchors, stopNames } = activityAnchors(plan);
    const places: PlacesSearch = async () => { throw new Error("boom"); };
    await expect(nearbyActivitySuggestions({ places, anchors, stopNames, now: () => 5e9 })).resolves.toEqual([]);
    const unavailable: PlacesSearch = async () => ({ status: "UNAVAILABLE" });
    await expect(nearbyActivitySuggestions({ places: unavailable, anchors, stopNames, now: () => 6e9 })).resolves.toEqual([]);
  });

  it("excludes hotels, homestays, resorts, campgrounds and generic names across ACTIVITY/FREE/EVENING while keeping ACTIVITY_MAX_ANCHORS at 16", async () => {
    expect(ACTIVITY_MAX_ANCHORS).toBe(16);
    expect(isLodgingPlace({ name: "Balana Hà Giang", types: ["lodging", "resort_hotel"] })).toBe(true);
    expect(isLodgingPlace({ name: "H'mong Village Resort", types: ["point_of_interest"] })).toBe(true);
    expect(isLodgingPlace({ name: "Homestay Tommy house" })).toBe(true);
    expect(isLodgingPlace({ name: "Cắm trại Suối Thầu", types: ["campground"] })).toBe(true);
    expect(isLodgingPlace({ name: "Cà phê Phố Cổ", types: ["cafe", "point_of_interest"] })).toBe(false);

    const { anchors, stopNames } = activityAnchors(plan);
    const places: PlacesSearch = async (_q, _s, near) => ({
      status: "RESULTS" as const,
      places: [
        { placeId: "lodging-1", name: "Balana Hà Giang", latitude: near!.latitude + 0.001, longitude: near!.longitude, types: ["lodging", "hotel"] },
        { placeId: "lodging-2", name: "H'mong Village Resort", latitude: near!.latitude + 0.002, longitude: near!.longitude, types: ["resort_hotel"] },
        { placeId: "lodging-3", name: "Homestay Tommy house", latitude: near!.latitude + 0.002, longitude: near!.longitude },
        { placeId: "generic-1", name: "Khu Vui Chơi", latitude: near!.latitude + 0.001, longitude: near!.longitude, types: ["point_of_interest"] },
        { placeId: "good-1", name: "[Tạm] Chợ đêm Phố Cổ", latitude: near!.latitude + 0.003, longitude: near!.longitude, types: ["market", "tourist_attraction"] },
      ],
    });
    const out = await nearbyActivitySuggestions({ places, anchors: [anchors[0]!, anchors[3]!, anchors[4]!], stopNames, now: () => 9e9 });
    expect(out.map(s => s.place?.name)).toEqual(["Chợ đêm Phố Cổ", "Chợ đêm Phố Cổ"]);
    expect(out.every(s => !/Balana|H'mong Village Resort|Homestay Tommy|Khu Vui Chơi|\[Tạm\]/u.test(s.title))).toBe(true);
  });
});
