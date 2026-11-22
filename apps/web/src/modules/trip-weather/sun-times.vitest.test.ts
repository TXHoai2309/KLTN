import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppError } from "@/server/http/app-error";
import { computeSunTimes, formatMinute, parseLocalDate, todayInVietnam } from "./sun-times";
import { SunTimesView } from "./destination-weather-card";
import { getDestinationWeather } from "./destination-weather-service";

const DONG_VAN = { latitude: 23.2667, longitude: 105.3667 };
const near = (actual: number | null, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - (h! * 60 + m!))).toBeLessThanOrEqual(2);
};

describe("sun times", () => {
  it("matches reference sunrise/sunset for Đồng Văn at both solstices (±2 min)", () => {
    const june = computeSunTimes(DONG_VAN.latitude, DONG_VAN.longitude, "2026-06-21");
    near(june.sunriseMinute, "05:14"); near(june.sunsetMinute, "18:48");
    const december = computeSunTimes(DONG_VAN.latitude, DONG_VAN.longitude, "2026-12-21");
    near(december.sunriseMinute, "06:36"); near(december.sunsetMinute, "17:18");
  });

  it("orders golden hours inside daylight", () => {
    const t = computeSunTimes(DONG_VAN.latitude, DONG_VAN.longitude, "2026-11-18");
    expect(t.sunriseMinute!).toBeLessThan(t.morningGoldenEndMinute!);
    expect(t.morningGoldenEndMinute!).toBeLessThan(t.eveningGoldenStartMinute!);
    expect(t.eveningGoldenStartMinute!).toBeLessThan(t.sunsetMinute!);
  });

  it("uses the Vietnam calendar date for today", () => {
    expect(todayInVietnam(new Date("2026-11-17T17:30:00Z"))).toBe("2026-11-18");
    expect(todayInVietnam(new Date("2026-11-17T16:59:00Z"))).toBe("2026-11-17");
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of ["2026-02-30", "18/11/2026", "", 20261118]) expect(() => parseLocalDate(bad)).toThrow(AppError);
    expect(formatMinute(305)).toBe("05:05");
    expect(formatMinute(null)).toBe("—");
  });

  it("renders the four sun-time rows", () => {
    const html = renderToStaticMarkup(createElement(SunTimesView, { sunTimes: computeSunTimes(DONG_VAN.latitude, DONG_VAN.longitude, "2026-06-21") }));
    for (const label of ["Bình minh", "Giờ vàng sáng", "Giờ vàng chiều", "Hoàng hôn"]) expect(html).toContain(label);
  });
});

describe("destination weather service", () => {
  const row = { id: "d1", name: "Đồng Văn", description: "Cao nguyên đá.", area: "Đồng Văn", category: "thiên nhiên", latitude: DONG_VAN.latitude, longitude: DONG_VAN.longitude, suggestedDurationMinutes: 60, cultureLinks: [],
    openingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] })) };
  const database = (visible: unknown, exists: unknown) => ({ destination: { findUnique: async ({ where }: { where: Record<string, unknown> }) => (Object.keys(where).length > 1 ? visible : exists) } }) as never;

  it("returns sun times for a public destination", async () => {
    const result = await getDestinationWeather("d1", "2026-06-21", database(row, { id: "d1" }), { fetcher: async () => new Response("{}", { status: 500 }) });
    expect(result.destinationId).toBe("d1");
    near(result.sunTimes.sunriseMinute, "05:14");
  });

  it("does not expose hidden or missing destinations", async () => {
    await expect(getDestinationWeather("d1", "2026-06-21", database(null, { id: "d1" }))).rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE" });
    await expect(getDestinationWeather("d1", "2026-06-21", database(null, null))).rejects.toMatchObject({ code: "DESTINATION_NOT_FOUND" });
  });

  it("rejects an invalid date before reading the destination", async () => {
    await expect(getDestinationWeather("d1", "bad", database(row, row))).rejects.toMatchObject({ code: "INVALID_DATE" });
  });
});
