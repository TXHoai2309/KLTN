import { describe, expect, it } from "vitest";
import { resolvePlanningDate } from "./planning-date";

const anchor = "2026-10-27";
describe("Vietnam departure dates retain the meaning of the original turn", () => {
  it.each([
    ["31/10", "2026-10-31"], ["mai", "2026-10-28"], ["ngày kia", "2026-10-29"],
    ["hôm nay", "2026-10-27"], ["31/10/2026", "2026-10-31"],
    ["15 tháng 11", "2026-11-15"], ["ngày 15 tháng 11", "2026-11-15"], ["15 tháng 11 năm 2026", "2026-11-15"],
  ])("resolves %s without asking the same date question", (text, date) => {
    expect(resolvePlanningDate(text, anchor)).toEqual({ kind: "EXACT", date });
  });
  it("uses Monday–Sunday for next week without choosing a departure day", () => {
    expect(resolvePlanningDate("khoảng tuần sau", anchor)).toEqual({ kind: "WINDOW", window: { from: "2026-11-02", to: "2026-11-08", anchorDate: anchor } });
  });
  it("does not roll a past missing-year date forward without confirmation", () => {
    expect(resolvePlanningDate("1/10", anchor)).toMatchObject({ kind: "CLARIFY", candidateDate: "2027-10-01" });
    expect(resolvePlanningDate("1/10/2026", anchor)).not.toHaveProperty("candidateDate");
  });
  it.each(["31/11", "29/2/2027", "thứ này", "thứ sáu tới", "31/10 hoặc 1/11"])("clarifies %s specifically", text => {
    expect(resolvePlanningDate(text, anchor).kind).toBe("CLARIFY");
  });
  it("handles leap years, the Vietnam midnight boundary and year-end relative dates", () => {
    expect(resolvePlanningDate("29/2/2028", anchor)).toEqual({ kind: "EXACT", date: "2028-02-29" });
    expect(resolvePlanningDate("mai", "2026-12-31")).toEqual({ kind: "EXACT", date: "2027-01-01" });
  });
  it("never interprets duration, unrelated numbers or an unknown expression as a date", () => {
    for (const text of ["3", "3 ngày", "Xe máy", "khi nào đẹp thì đi"]) expect(resolvePlanningDate(text, anchor).kind).toBe("NONE");
  });
});
