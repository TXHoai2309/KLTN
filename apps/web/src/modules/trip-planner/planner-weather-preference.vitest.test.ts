import { afterEach, describe, expect, it } from "vitest";
import { clearForecastCache } from "../trip-weather/forecast";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import type { PlannerCandidate } from "./planner-candidates";
import { createPlannerService } from "./planner-service";
import { WEATHER_PREFERENCE_WARNING } from "./planner-weather-preference";
import type { RouteProvider } from "./planner-routes";

afterEach(() => {
  clearForecastCache();
});

const allOpen = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({
  dayOfWeek,
  status: "OPEN",
  intervals: [{ opensAtMinute: 480, closesAtMinute: 1200 }],
}));

function makeCandidate(overrides: Partial<PlannerCandidate> & { id: string; name: string }): PlannerCandidate {
  return {
    description: "",
    area: "Đồng Văn",
    category: "Thiên nhiên",
    address: null,
    latitude: 23.27,
    longitude: 105.36,
    image: null,
    visibility: "VISIBLE",
    revision: "1:2026-11-01T00:00:00Z",
    suggestedDurationMinutes: 240,
    minimumDurationMinutes: 60,
    isOutdoor: false,
    openingDays: allOpen,
    ...overrides,
  };
}

function makeFakeRoutes(legSeconds = 600, customLeg?: (fromId: string, toId: string) => number): RouteProvider {
  return {
    async route(req) {
      const dur = customLeg ? customLeg(req.from.id, req.to.id) : legSeconds;
      return { fromDestinationId: req.from.id, toDestinationId: req.to.id, status: "VERIFIED", reason: null, durationSeconds: dur, distanceMeters: dur * 10, provider: "STADIA_MAPS" };
    },
  };
}

function makeReq(overrides: Record<string, unknown>) {
  return tripRequirementInputSchema.parse({
    startDate: "2027-01-10",
    durationDays: 1,
    transport: "CAR",
    pace: "MODERATE",
    interests: ["CULTURE_HISTORY"],
    companions: { type: "SOLO", groupSize: 1 },
    ...overrides,
  });
}

function makeForecastFetcher(hourlyRainByLat: Record<string, (time: string) => number>) {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const lats = (url.searchParams.get("latitude") ?? "").split(",");
    const base = new Date("2026-11-18T00:00:00Z");
    const times: string[] = [];
    for (let d = 0; d < 16; d++) {
      const dt = new Date(base.getTime() + d * 86_400_000).toISOString().slice(0, 10);
      for (let h = 0; h < 24; h++) times.push(`${dt}T${String(h).padStart(2, "0")}:00`);
    }
    const payload = lats.map(lat => {
      const fn = hourlyRainByLat[lat] ?? (() => 10);
      return {
        hourly: {
          time: times,
          temperature_2m: times.map(() => 20),
          precipitation_probability: times.map(fn),
          precipitation: times.map(t => (fn(t) >= 70 ? 6 : 0)),
          visibility: times.map(() => 10_000),
          wind_gusts_10m: times.map(() => 10),
          weather_code: times.map(() => 1),
        },
      };
    });
    return new Response(JSON.stringify(payload.length === 1 ? payload[0] : payload), { status: 200 });
  }) as typeof fetch;
}

describe("planner weather & sunset preference (Form planner)", () => {
  it("reorders an outdoor stop before sunset when a 1-day trip has indoor first and outdoor after sunset", async () => {
    // 330 + 240 + 10 = 580 min -> ends at 17:40 (1060), which is after Jan sunset (~17:27) but within 18:00 window.
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", category: "Văn hóa lịch sử", isOutdoor: false, suggestedDurationMinutes: 330, latitude: 23.27, longitude: 105.36 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo Mã Pí Lèng", category: "Thiên nhiên", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.24, longitude: 105.41 });
    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeFakeRoutes(600),
      forecast: { fetcher: makeForecastFetcher({}), now: () => new Date("2026-11-18T00:00:00Z") },
      // Date beyond 16-day horizon to prove suncalc still works without forecast!
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-sunset-1", makeReq({
      durationDays: 1,
      startDate: "2027-01-10",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("outdoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
  });

  it("prioritizes outdoor stops in the earlier half when startDate is null", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 300 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Điểm ngắm cảnh", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.28, longitude: 105.37 });
    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeFakeRoutes(600),
    });

    const result = await service.propose("user-1", "key-nodate-1", makeReq({
      durationDays: 1,
      startDate: null,
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("outdoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
  });

  it("reorders stops within a day to move outdoor stop out of a rainy afternoon window", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Chợ phiên", isOutdoor: false, suggestedDurationMinutes: 180, latitude: 23.2700, longitude: 105.3600 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Cổng trời", isOutdoor: true, suggestedDurationMinutes: 180, latitude: 23.2800, longitude: 105.3700 });
    // Rain >= 80% from 11:00 onwards on 2026-11-20
    const fetcher = makeForecastFetcher({
      "23.2700": t => (t.startsWith("2026-11-20T") && Number(t.slice(11, 13)) >= 11 ? 85 : 10),
      "23.2800": t => (t.startsWith("2026-11-20T") && Number(t.slice(11, 13)) >= 11 ? 85 : 10),
    });

    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeFakeRoutes(600),
      forecast: { fetcher, now: () => new Date("2026-11-18T00:00:00Z") },
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-rain-swap-1", makeReq({
      durationDays: 1,
      startDate: "2026-11-20",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["FOOD"],
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("outdoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
  });

  it("rejects weather reordering when added travel time exceeds the 20% / 30 min detour cap", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 300, latitude: 23.27, longitude: 105.36 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.28, longitude: 105.37 });
    // Baseline indoor->outdoor = 600s; reversed outdoor->indoor = 3000s (+400% detour -> must reject)
    const routes = makeFakeRoutes(600, (from, to) => (from === "outdoor-1" && to === "indoor-1" ? 3000 : 600));
    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes,
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-detour-cap-1", makeReq({
      durationDays: 1,
      startDate: "2027-01-10",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("indoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(false);
  });

  it("rejects weather reordering if it would introduce a new Constraint Validator VIOLATION", async () => {
    // Indoor only open 08:00-13:00; outdoor open all day. Swapping outdoor first pushes indoor past 13:00 -> VIOLATION.
    const morningOnly = [{ dayOfWeek: "SUNDAY", status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 780 }] }, ...allOpen.slice(0, 6)];
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 240, openingDays: morningOnly });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo", isOutdoor: true, suggestedDurationMinutes: 300, latitude: 23.28, longitude: 105.37 });

    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeFakeRoutes(600),
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-violation-reject-1", makeReq({
      durationDays: 1,
      startDate: "2027-01-10", // Sunday
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("indoor-1");
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(false);
  });

  it("degrades gracefully when Open-Meteo fails or throws and preserves must-visit stops", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", isOutdoor: false, suggestedDurationMinutes: 120 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Lũng Cú", isOutdoor: true, suggestedDurationMinutes: 120, latitude: 23.36, longitude: 105.31 });
    const failingFetcher = (async () => {
      throw new Error("Network down");
    }) as typeof fetch;

    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeFakeRoutes(600),
      forecast: { fetcher: failingFetcher, now: () => new Date("2026-11-18T00:00:00Z") },
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-outage-1", makeReq({
      durationDays: 1,
      startDate: "2026-11-20",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["NATURE"],
    }));

    expect(result.status).toBe("PROPOSAL_READY");
    const ids = result.days.flatMap(d => d.stops.map(s => s.destination.id));
    expect(ids).toContain("indoor-1");
    expect(ids).toContain("outdoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(false);
  });
});

describe("journey weather & sunset preference", () => {
  function makeJourneyRoutes(legSeconds = 600, customCoord?: (fromLat: number, toLat: number) => number): RouteProvider {
    return {
      async route(req) {
        return { fromDestinationId: req.from.id, toDestinationId: req.to.id, status: "VERIFIED", reason: null, durationSeconds: legSeconds, distanceMeters: legSeconds * 10, provider: "STADIA_MAPS" };
      },
      async coordinateRoute(req) {
        const dur = customCoord ? customCoord(req.from.latitude, req.to.latitude) : 1800;
        return { status: "VERIFIED", durationSeconds: dur, distanceMeters: dur * 10, provider: "STADIA_MAPS", reason: null };
      },
    };
  }

  it("reorders an outdoor stop before sunset within journey outbound/return bounds", async () => {
    // Place indoor closer to southern origin (23.24) so journey baseline puts indoor first and outdoor after sunset.
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", category: "Văn hóa lịch sử", isOutdoor: false, suggestedDurationMinutes: 280, latitude: 23.24, longitude: 105.41 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo Mã Pí Lèng", category: "Thiên nhiên", isOutdoor: true, suggestedDurationMinutes: 230, latitude: 23.27, longitude: 105.36 });

    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes: makeJourneyRoutes(600),
      forecast: { fetcher: makeForecastFetcher({}), now: () => new Date("2026-11-18T00:00:00Z") },
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-journey-sunset-1", makeReq({
      durationDays: 1,
      startDate: "2027-01-10",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
      journey: COMPLETE_JOURNEY_FIXTURE,
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("outdoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(true);
    expect(result.journeyPlan).toBeDefined();
  });

  it("rejects journey reordering when outbound/return detour exceeds the 20% / 30 min cap", async () => {
    const indoor = makeCandidate({ id: "indoor-1", name: "Bảo tàng", category: "Văn hóa lịch sử", isOutdoor: false, suggestedDurationMinutes: 300, latitude: 23.24, longitude: 105.41 });
    const outdoor = makeCandidate({ id: "outdoor-1", name: "Đèo", category: "Thiên nhiên", isOutdoor: true, suggestedDurationMinutes: 240, latitude: 23.27, longitude: 105.36 });
    // If outbound goes to outdoor (23.27), coordinateRoute takes 5000s instead of 1800s -> exceeds 20% detour cap
    const routes = makeJourneyRoutes(600, (_fromLat, toLat) => (Math.abs(toLat - 23.27) < 0.001 ? 5000 : 1800));

    const service = createPlannerService({
      repository: { candidates: async () => [indoor, outdoor], recheck: async () => true },
      routes,
      forecast: { fetcher: makeForecastFetcher({}), now: () => new Date("2026-11-18T00:00:00Z") },
      now: () => new Date("2026-11-18T00:00:00Z"),
    });

    const result = await service.propose("user-1", "key-journey-detour-1", makeReq({
      durationDays: 1,
      startDate: "2027-01-10",
      transport: "CAR",
      pace: "MODERATE",
      interests: ["CULTURE_HISTORY"],
      journey: COMPLETE_JOURNEY_FIXTURE,
    }));

    expect(result.days[0]!.stops[0]!.destination.id).toBe("indoor-1");
    expect(result.warnings.some(w => w.code === WEATHER_PREFERENCE_WARNING.code)).toBe(false);
  });
});
