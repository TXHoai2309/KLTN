import { describe, expect, it } from "vitest";
import { arrangeOvernightAreas, assessTripShape, betweenDayNights, resolveOvernightArea, unmetOvernightAreas } from "./planning-trip-structure";

const areas: Record<string, string> = { a: "Quản Bạ", b: "Đồng Văn", c: "Mèo Vạc", d: "Mèo Vạc", e: "Đồng Văn", f: "Quản Bạ" };
const byId = new Map(Object.entries(areas).map(([id, area]) => [id, { area }]));

describe("V2-09 trip shape and overnight arrangement helpers", () => {
  it("assesses nights only against stated days and never derives them", () => {
    expect(assessTripShape(2, null)).toEqual({ kind: "UNSTATED" });
    expect(assessTripShape(2, 1)).toEqual({ kind: "OK", durationDays: 2, overnightCount: 1 });
    expect(assessTripShape(3, 3)).toMatchObject({ kind: "OK" });
    expect(assessTripShape(2, 5)).toEqual({ kind: "INCONSISTENT", durationDays: 2, overnightCount: 5 });
    expect(betweenDayNights(2, 2)).toBe(1); expect(betweenDayNights(3, 1)).toBe(1);
  });
  it("grounds an area name only in areas some destination belongs to", () => {
    const candidates = Object.values(areas).map(area => ({ area }));
    expect(resolveOvernightArea("mèo vạc", candidates)).toBe("Mèo Vạc"); expect(resolveOvernightArea("Sapa", candidates)).toBeNull();
  });
  it("leaves a day alone when it already ends in the wanted area", () => {
    expect(arrangeOvernightAreas([["a", "b"], ["c", "d"]], [{ afterDay: 1, area: "Đồng Văn" }], byId)).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("reorders inside the day first, so no stop changes day", () => {
    expect(arrangeOvernightAreas([["b", "a"], ["c", "d"]], [{ afterDay: 1, area: "Đồng Văn" }], byId)).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("swaps the day-end stop with a stop of the wanted area from the next day, keeping every day's stop count and every stop", () => {
    const result = arrangeOvernightAreas([["a", "b"], ["c", "d"]], [{ afterDay: 1, area: "Mèo Vạc" }], byId);
    expect(result).toEqual([["a", "c"], ["b", "d"]]);
    expect(result.map(day => day.length)).toEqual([2, 2]); expect(result.flat().sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("does not steal the day-end stop that satisfies another night", () => {
    const result = arrangeOvernightAreas([["a", "b"], ["c", "e"], ["d", "f"]], [{ afterDay: 1, area: "Mèo Vạc" }, { afterDay: 2, area: "Đồng Văn" }], byId);
    expect(unmetOvernightAreas([{ afterDay: 1, area: "Mèo Vạc" }, { afterDay: 2, area: "Đồng Văn" }], result.map(day => day.map(id => byId.get(id)!)))).toEqual([]);
  });
  it("reports an unmet night when no selected stop belongs to the area, without changing the selection", () => {
    const days = [["a", "b"], ["c", "d"]];
    expect(arrangeOvernightAreas(days, [{ afterDay: 1, area: "Lũng Cú" }], byId)).toEqual(days);
    expect(unmetOvernightAreas([{ afterDay: 1, area: "Lũng Cú" }], days.map(day => day.map(id => byId.get(id)!)))).toEqual([{ afterDay: 1, wantedArea: "Lũng Cú", actualArea: "Đồng Văn" }]);
  });
});
