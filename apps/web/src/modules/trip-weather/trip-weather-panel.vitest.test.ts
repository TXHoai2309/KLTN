import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import type { PlannerDay } from "@/modules/trip-planner/planner-contract";
import { computeSunTimes } from "./sun-times";
import type { TripWeather, WeatherAdvisory } from "./trip-weather-service";
import { TripWeatherView, resolveAdvisoryJump } from "./trip-weather-panel";

const DATE_1 = "2026-11-20";
const DATE_2 = "2026-11-21";

function makeStop(id: string, name: string, arrivalMinute: number, departureMinute: number) {
  return {
    order: 1,
    destination: { id, name },
    arrivalMinute,
    departureMinute,
    visitDurationMinutes: departureMinute - arrivalMinute,
    scheduleState: "PLANNED",
    inbound: null,
    validationStatus: "PASS",
  };
}

const plannerDays = [
  {
    day: 1,
    date: DATE_1,
    distanceMeters: null,
    travelSeconds: null,
    stops: [
      makeStop("lungcu", "Cột cờ Lũng Cú", 8 * 60 + 30, 10 * 60),
      makeStop("mapileng", "Đèo Mã Pí Lèng", 15 * 60, 18 * 60 + 15),
    ],
  },
  {
    day: 2,
    date: DATE_2,
    distanceMeters: null,
    travelSeconds: null,
    stops: [makeStop("dongvan", "Phố cổ Đồng Văn", 9 * 60, 11 * 60)],
  },
] as unknown as PlannerDay[];

function baseWeather(overrides: Partial<TripWeather> = {}): TripWeather {
  return {
    days: [
      {
        day: 1,
        date: DATE_1,
        sunTimes: computeSunTimes(23.36, 105.31, DATE_1),
        visits: [
          {
            destinationId: "lungcu",
            isOutdoor: true,
            weather: {
              status: "AVAILABLE",
              summary: {
                fromTime: `${DATE_1}T08:00`,
                toTime: `${DATE_1}T09:00`,
                minTemperatureC: 13.8,
                maxTemperatureC: 16.2,
                maxPrecipitationProbability: 20,
                maxPrecipitationMm: 0,
                minVisibilityM: 12_000,
                maxWindGustKmh: 18,
              },
            },
          },
          {
            destinationId: "mapileng",
            isOutdoor: true,
            weather: {
              status: "AVAILABLE",
              summary: {
                fromTime: `${DATE_1}T15:00`,
                toTime: `${DATE_1}T18:00`,
                minTemperatureC: 11,
                maxTemperatureC: 13,
                maxPrecipitationProbability: 82,
                maxPrecipitationMm: 4.2,
                minVisibilityM: 600,
                maxWindGustKmh: 45,
              },
            },
          },
        ],
      },
      {
        day: 2,
        date: DATE_2,
        sunTimes: computeSunTimes(23.27, 105.36, DATE_2),
        visits: [
          {
            destinationId: "dongvan",
            isOutdoor: false,
            weather: {
              status: "AVAILABLE",
              summary: {
                fromTime: `${DATE_2}T09:00`,
                toTime: `${DATE_2}T10:00`,
                minTemperatureC: 15,
                maxTemperatureC: 15.4,
                maxPrecipitationProbability: 10,
                maxPrecipitationMm: 0,
                minVisibilityM: 1000,
                maxWindGustKmh: 12,
              },
            },
          },
        ],
      },
    ],
    legs: [
      {
        status: "AVAILABLE",
        approximation: "LINEAR_APPROXIMATION",
        samples: [
          {
            latitude: 23.3,
            longitude: 105.33,
            time: `${DATE_1}T13:30`,
            weather: {
              status: "AVAILABLE",
              summary: {
                fromTime: `${DATE_1}T13:00`,
                toTime: `${DATE_1}T13:00`,
                minTemperatureC: 12,
                maxTemperatureC: 12,
                maxPrecipitationProbability: 30,
                maxPrecipitationMm: 0.2,
                minVisibilityM: 500,
                maxWindGustKmh: 28,
              },
            },
          },
        ],
      },
      { status: "INSUFFICIENT_DATA" },
    ],
    advisories: [
      {
        kind: "RAIN",
        day: 1,
        location: { type: "VISIT", destinationId: "mapileng" },
        fromTime: `${DATE_1}T15:00`,
        toTime: `${DATE_1}T18:00`,
        observed: 82,
        threshold: 70,
      },
      {
        kind: "FOG",
        day: 1,
        location: { type: "LEG", legIndex: 0, label: "Cột cờ Lũng Cú → Đèo Mã Pí Lèng" },
        fromTime: `${DATE_1}T13:00`,
        toTime: `${DATE_1}T13:00`,
        observed: 500,
        threshold: 1000,
      },
    ],
    source: { provider: "OPEN_METEO", fetchedAt: "2026-11-18T03:00:00Z" },
    ...overrides,
  };
}

function cssDeclaration(selector: string, property: string) {
  const css = postcss.parse(readFileSync(new URL("./trip-weather.css", import.meta.url), "utf8"));
  let found: string | undefined;
  css.walkRules(rule => {
    if (rule.selector === selector && found === undefined) {
      rule.walkDecls(property, decl => {
        found = decl.value;
      });
    }
  });
  return found;
}

describe("TripWeatherView redesign (Ticket 01)", () => {
  it("renders one card per day with sunrise/sunset in the header and compact visit rows", () => {
    const html = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather: baseWeather(),
        days: plannerDays,
      }),
    );

    expect(html.match(/class="trip-weather-day-card"/g)).toHaveLength(2);
    expect(html).toContain("Ngày 1 · 2026-11-20");
    expect(html).toContain("Ngày 2 · 2026-11-21");
    expect(html.match(/Bình minh \d{2}:\d{2}/g)).toHaveLength(2);
    expect(html.match(/Hoàng hôn \d{2}:\d{2}/g)).toHaveLength(2);

    // Compact stop metrics: temperature and rain chance; wind speed is not shown per stop
    expect(html).toContain("Cột cờ Lũng Cú");
    expect(html).toContain("14–16°C");
    expect(html).toContain("mưa 20%");
    expect(html).not.toMatch(/gió \d+ km\/h/);
  });

  it("shows visibility only when strictly below the fog advisory threshold (< 1000 m)", () => {
    const html = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather: baseWeather(),
        days: plannerDays,
      }),
    );

    // Lũng Cú (12000 m) and Đồng Văn (exact boundary 1000 m) omit visibility; Mã Pí Lèng (600 m) shows it
    expect(html).toContain("tầm nhìn 0.6 km");
    expect(html).not.toContain("tầm nhìn 12.0 km");
    expect(html).not.toContain("≥10 km");
    expect(html).not.toContain("tầm nhìn 1.0 km");

  });

  it("renders advisory chips for visits only, with non-colour text+icon signals that link to visit targets", () => {
    const weather = baseWeather();
    const html = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather,
        days: plannerDays,
      }),
    );

    const hrefs = [...html.matchAll(/class="trip-weather-chip [^"]*"[^>]*href="#([^"]+)"|href="#([^"]+)"[^>]*class="trip-weather-chip [^"]*"/g)]
      .map(m => m[1] ?? m[2]!);
    // The FOG advisory is tied to a leg; legs are not shown, so only the visit advisory is listed
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toMatch(/-visit-1-mapileng$/);
    expect(html).toContain("1 cảnh báo");

    // Every chip href resolves to an actual target id in the rendered block
    for (const targetId of hrefs) {
      expect(html).toContain(`id="${targetId}"`);
    }

    // Non-colour signals: explicit advisory kind text + SVG icon inside each chip
    expect(html).toContain("Mưa 82%");
    expect(html).not.toContain("Sương mù");

    // Jump behavior: a chip highlights its visit row
    expect(resolveAdvisoryJump(hrefs[0]!)).toEqual({ highlightedTarget: hrefs[0] });

    const highlightedHtml = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather,
        days: plannerDays,
        initialHighlightedTarget: hrefs[0],
      }),
    );
    expect(highlightedHtml).toContain('data-highlighted="true"');
  });

  it("does not render per-leg weather or per-stop wind speed", () => {
    const html = renderToStaticMarkup(
      createElement(TripWeatherView, { weather: baseWeather(), days: plannerDays }),
    );

    expect(html).not.toContain("Thời tiết dọc chặng");
    expect(html).not.toContain("Ước lượng theo tốc độ đều");
    expect(html).not.toContain("trip-weather-legs");
    expect(html).not.toContain("Không đủ dữ liệu lộ trình hoặc thời gian");
    expect(html).not.toMatch(/gió \d+ km\/h/);
  });

  it("renders NOT_YET_AVAILABLE and UNAVAILABLE states clearly without 'good' styling", () => {
    const notYet = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather: baseWeather({
          advisories: [],
          legs: [],
          source: { provider: "OPEN_METEO", fetchedAt: "2026-11-18T03:00:00Z" },
          days: [
            {
              day: 1,
              date: "2026-12-20",
              sunTimes: computeSunTimes(23.36, 105.31, "2026-12-20"),
              visits: [{ destinationId: "lungcu", isOutdoor: true, weather: { status: "NOT_YET_AVAILABLE", availableFrom: "2026-12-05" } }],
            },
          ],
        }),
        days: plannerDays,
      }),
    );
    expect(notYet).toContain("Chưa có dự báo, sẽ có từ ngày 2026-12-05");
    expect(notYet).toContain("Chưa có dự báo · Không có cảnh báo");
    expect(notYet).toContain("trip-weather-state--pending");

    const unavailable = renderToStaticMarkup(
      createElement(TripWeatherView, {
        weather: baseWeather({
          advisories: [],
          legs: [],
          source: null,
          days: [
            {
              day: 1,
              date: DATE_1,
              sunTimes: computeSunTimes(23.36, 105.31, DATE_1),
              visits: [{ destinationId: "lungcu", isOutdoor: true, weather: { status: "UNAVAILABLE", reason: "TIMEOUT" } }],
            },
          ],
        }),
        days: plannerDays,
      }),
    );
    expect(unavailable).toContain("Không lấy được dự báo");
    expect(unavailable).toContain("Không lấy được dự báo · Không có cảnh báo");
    expect(unavailable).toContain("trip-weather-summary--unavailable");
    expect(unavailable).toContain("trip-weather-state--unavailable");
  });

  it("defines distinct light and dark theme tokens and mobile-safe wrapping in CSS", () => {
    expect(cssDeclaration(".trip-weather-panel", "--tw-bg")).toBe("#f8faf8");
    expect(cssDeclaration(".dark .trip-weather-panel", "--tw-bg")).toBe("#17201b");
    expect(cssDeclaration(".trip-weather-panel", "--tw-ink")).toBe("#16241c");
    expect(cssDeclaration(".dark .trip-weather-panel", "--tw-ink")).toBe("#eaf1ec");

    // Unavailable state never uses primary/success green
    expect(cssDeclaration(".trip-weather-panel", "--tw-unavail-ink")).toBe("#4b5563");
    expect(cssDeclaration(".dark .trip-weather-panel", "--tw-unavail-ink")).toBe("#c7cfd6");

    // 375px horizontal overflow protection
    expect(cssDeclaration(".trip-weather-panel", "max-width")).toBe("100%");
    expect(cssDeclaration(".trip-weather-visit-row", "flex-wrap")).toBe("wrap");
    expect(cssDeclaration(".trip-weather-panel a.trip-weather-chip", "max-width")).toBe("100%");
  });
});
