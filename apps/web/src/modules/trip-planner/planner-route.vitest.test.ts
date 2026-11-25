import { describe, expect, it } from "vitest";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { ORIGIN_FIXTURES } from "../trip-origin/trip-origin-fixtures";
import { candidate } from "./__fixtures__/planner-fixtures";
import type { PlannerCandidate } from "./planner-candidates";
import type { TravelLeg } from "./planner-contract";
import { scenicBufferMinutes, schedulePlannerDays } from "./planner-engine";
import { haversine } from "./planner-geography";
import { arrangeTripRoute, orderRoundTrip } from "./planner-route";

// Coordinates and suggested durations of the production places in conversation fdf35a74 (ADR-55 reference case).
const place = (id: string, name: string, latitude: number, longitude: number, minutes: number) =>
  candidate(id, { name, latitude, longitude, suggestedDurationMinutes: minutes, minimumDurationMinutes: Math.min(minutes, 30) });
const P = {
  quanBa: place("quan-ba", "Cổng trời Quản Bạ", 23.0493, 104.9927, 60),
  nuiDoi: place("nui-doi", "Núi Đôi Cô Tiên", 23.0642, 105.0008, 45),
  yenMinh: place("yen-minh", "Rừng thông Yên Minh", 23.1208, 105.1445, 30),
  vuong: place("vuong", "Dinh thự họ Vương", 23.2563, 105.2621, 90),
  sungLa: place("sung-la", "Sủng Là (Nhà của Pao)", 23.2271, 105.2024, 60),
  dongVan: place("dong-van", "Phố cổ Đồng Văn", 23.2783, 105.3614, 120),
  lungCu: place("lung-cu", "Cột cờ Lũng Cú", 23.3634, 105.3163, 90),
  loLoChai: place("lo-lo-chai", "Lô Lô Chải", 23.3622, 105.3127, 60),
  maPiLeng: place("ma-pi-leng", "Đèo Mã Pì Lèng", 23.24, 105.4, 60),
  nhoQue: place("nho-que", "Sông Nho Quế", 23.1907, 105.4695, 120),
  meoVac: place("meo-vac", "Thị trấn Mèo Vạc", 23.1638, 105.4091, 60),
  paVi: place("pa-vi", "Pả Vi Hạ", 23.2058, 105.4154, 90),
  duGia: place("du-gia", "Du Già", 22.9303, 105.2232, 90),
  lungTam: place("lung-tam", "Làng dệt lanh Lùng Tám", 23.0444, 105.0674, 60),
  haThanh: place("ha-thanh", "Làng văn hóa Hạ Thành", 22.845, 104.9406, 60),
  thamMa: place("tham-ma", "Dốc Thẩm Mã", 23.169, 105.1942, 20),
  phoCao: place("pho-cao", "Làng Phố Cáo", 23.2008, 105.1759, 45),
  chinKhoanh: place("chin-khoanh", "Dốc Chín Khoanh", 23.2099, 105.1952, 15),
  bacSum: place("bac-sum", "Dốc Bắc Sum", 22.9882, 104.9359, 20),
};
const haGiangCity = { latitude: 22.8233, longitude: 104.9836 };
const requirement = tripRequirementInputSchema.parse({
  startDate: "2027-01-02", durationDays: 5, transport: "MOTORCYCLE", pace: "PACKED", interests: [],
  journey: { origin: { ...ORIGIN_FIXTURES.confirmed, label: "TP Hà Giang", ...haGiangCity }, departureMinute: 420, returnDeadlineMinute: 1260, returnDepartureMinute: null },
});
const loopKm = (path: readonly PlannerCandidate[]) => path.reduce((sum, stop, index) => sum + haversine(index ? path[index - 1]! : haGiangCity, stop), 0) + haversine(path.at(-1)!, haGiangCity);
/** The plan the AI sent in the reference conversation (message #17), day by day. */
const reference = [[P.quanBa, P.nuiDoi], [P.yenMinh, P.vuong, P.sungLa, P.dongVan], [P.lungCu, P.loLoChai, P.maPiLeng, P.nhoQue], [P.meoVac, P.paVi, P.duGia], [P.lungTam, P.haThanh]];

describe("ADR-55 server-owned route", () => {
  it("turns the reference day-2 zigzag (Yên Minh → Vương → back to Sủng Là → Đồng Văn) into road order", () => {
    expect(orderRoundTrip([P.yenMinh, P.vuong, P.sungLa, P.dongVan], haGiangCity).map(stop => stop.id)).toEqual(["yen-minh", "sung-la", "vuong", "dong-van"]);
  });

  it("orders the whole reference chain as a loop, at least 20 % shorter than the AI's order", () => {
    const ordered = orderRoundTrip(reference.flat(), haGiangCity);
    expect(new Set(ordered.map(stop => stop.id))).toEqual(new Set(reference.flat().map(stop => stop.id)));
    expect(loopKm(ordered)).toBeLessThan(loopKm(reference.flat()) * 0.8);
  });

  it("keeps the given order on ties instead of shuffling equal stops", () => {
    const same = ["x", "y", "z"].map(id => candidate(id, { latitude: 23, longitude: 105 }));
    expect(orderRoundTrip(same, null).map(stop => stop.id)).toEqual(["x", "y", "z"]);
  });

  it("fills free time with places near the loop, never one the traveler removed, and splits days by time", async () => {
    const pool = Object.values(P);
    const arranged = await arrangeTripRoute({ requirement, days: reference, pool, excludedIds: new Set(["chin-khoanh"]), fill: true, budgetMs: 10_000 });
    const ids = arranged.days.flat().map(stop => stop.id);
    expect(arranged.days).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stop of reference.flat()) expect(ids).toContain(stop.id);
    expect(ids).not.toContain("chin-khoanh");
    expect(arranged.added.length).toBeGreaterThan(0);
    expect(ids.length).toBeGreaterThanOrEqual(18);
    expect(arranged.days.every(day => day.length <= 8)).toBe(true);
  });

  it("does not add anything when filling is off (an edit that removed places)", async () => {
    const arranged = await arrangeTripRoute({ requirement, days: reference, pool: Object.values(P), fill: false });
    expect(arranged.added).toEqual([]);
    expect(arranged.days.flat()).toHaveLength(reference.flat().length);
  });
});

describe("ADR-55 time model", () => {
  it("gives drives of 10+ minutes a roadside photo buffer, capped and longer when relaxed", () => {
    const motorbike = { transport: "MOTORCYCLE" as const, pace: null };
    expect(scenicBufferMinutes(9 * 60, motorbike)).toBe(0);
    expect(scenicBufferMinutes(30 * 60, motorbike)).toBe(5);
    expect(scenicBufferMinutes(60 * 60, { transport: "CAR", pace: null })).toBe(10);
    expect(scenicBufferMinutes(300 * 60, motorbike)).toBe(25);
    expect(scenicBufferMinutes(300 * 60, { ...motorbike, pace: "RELAXED" })).toBe(40);
  });

  it("takes lunch on the way when the drive after a morning visit passes noon, and rounds arrivals up to 5 minutes", () => {
    const a = candidate("a", { suggestedDurationMinutes: 60 }), b = candidate("b", { suggestedDurationMinutes: 60 });
    const leg: TravelLeg = { fromDestinationId: "a", toDestinationId: "b", status: "VERIFIED", reason: null, durationSeconds: 88 * 60, distanceMeters: 50_000, provider: "STADIA_MAPS" };
    const [day] = schedulePlannerDays({ ...requirement, durationDays: 1 }, [[a, b]], new Map([["b", leg]]), { starts: new Map([[1, 600]]), restBefore: new Map([["a", 0], ["b", 0]]) });
    // a 10:00–11:00; drive 88' would arrive 12:28, so lunch 60' first; + 20' photo buffer (20 % of 88, rounded) = 13:48 → 13:50.
    expect(day!.stops.map(stop => [stop.arrivalMinute, stop.departureMinute])).toEqual([[600, 660], [830, 890]]);
  });

  it("starts a day's first drive at 07:30", () => {
    const a = candidate("a"), b = candidate("b");
    const leg: TravelLeg = { fromDestinationId: "a", toDestinationId: "b", status: "VERIFIED", reason: null, durationSeconds: 40 * 60, distanceMeters: 30_000, provider: "STADIA_MAPS" };
    const days = schedulePlannerDays({ ...requirement, durationDays: 2 }, [[a], [b]], new Map([["b", leg]]), { starts: new Map([[1, 480]]), restBefore: new Map([["a", 0], ["b", 0]]) });
    // 07:30 + 40' drive + 10' photo buffer = 08:20.
    expect(days[1]!.stops[0]!.arrivalMinute).toBe(500);
  });
});
