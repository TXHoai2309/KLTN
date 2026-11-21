import type { Database, Prisma } from "@KLTN/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const { findFirst, findUser, resolveSession } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUser: vi.fn(),
  resolveSession: vi.fn(),
}));

vi.mock("@/modules/trip-read/trip-read-server", () => ({
  tripReadDependencies: {
    database: { trip: { findFirst }, user: { findUnique: findUser } } as unknown as Database,
    resolveSession,
  },
}));

const saved = {
  id: "t/chuyến\" lạ",
  userId: "owner",
  startDate: new Date("2026-12-31T00:00:00Z"),
  durationDays: 1,
  transport: "CAR",
  manuallyCompletedAt: null,
  favorites: [],
  user: { name: "Chủ chuyến" },
  companionPublication: { id: "publication-fixture", title: 'Tên "lạ"\r\nX-Injected: yes' },
  uncheckedChecks: {
    revision: "unchecked-save-v1",
    items: [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:provider-id-fixture" }],
  },
  uncheckedConfirmedAt: new Date("2026-11-22"),
  days: [{
    id: "day-fixture",
    dayIndex: 1,
    localDate: new Date("2026-12-31T00:00:00Z"),
    _count: { visits: 3 },
    visits: [
      {
        order: 1, id: "visit-fixture", startMinute: 480, plannedDurationMinutes: 90,
        destination: {
          id: "catalogue-fixture", name: "Điểm công khai", area: "Hà Giang", address: "Đường A",
          visibility: "VISIBLE", latitude: 23.3612345, longitude: 105.3112345,
        },
        externalPlace: null,
      },
      {
        order: 2, id: "external-visit", startMinute: 600, plannedDurationMinutes: 60,
        destination: null,
        externalPlace: {
          providerPlaceId: "provider-id-fixture", name: "Tên ngoài danh mục chỉ chủ chuyến thấy",
          latitude: 23.712345, longitude: 104.912345, fetchedAt: new Date(),
        },
      },
      { order: 3, id: "untimed-visit", startMinute: null, plannedDurationMinutes: 60,
        destination: { id: "untimed", name: "Điểm thiếu giờ", visibility: "VISIBLE" },
        externalPlace: null,
      },
    ],
  }],
};

function signIn(userId: string, row = saved) {
  resolveSession.mockResolvedValue({ user: { id: userId } });
  findUser.mockResolvedValue({ id: userId, role: "TRAVELER", status: "ACTIVE" });
  const memberships = [
    { userId: "member", state: "ACTIVE" },
    { userId: "former-member", state: "LEFT" },
  ];
  // Evaluate the query from getMyTrip against the same rows for every actor.
  findFirst.mockImplementation(async ({ where }: { where: Prisma.TripWhereInput }) => {
    if (where.id !== row.id) return null;
    const visible = (where.OR ?? []).some(clause => {
      if (clause.userId === row.userId) return true;
      const publication = clause.companionPublication;
      if (!publication || !("memberships" in publication)) return false;
      const member = publication.memberships?.some;
      return member && memberships.some(item => item.userId === member.userId && item.state === member.state);
    });
    return visible ? row : null;
  });
}

function readCalendar(id = saved.id) {
  const request = new Request("https://app.test/api/trips/" + encodeURIComponent(id) + "/calendar");
  return GET(request, { params: Promise.resolve({ id }) });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("GET saved trip calendar", () => {
  it.each([undefined, "false", "TRUE", " true "])("returns 404 before auth with flag %s", async flag => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", flag);
    const response = await readCalendar();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveSession).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("downloads only a saved itinerary for the owner with private headers and a safe ASCII filename", async () => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    signIn("owner");
    const response = await readCalendar();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="hanh-trinh-2026-12-31.ics"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-ics-skipped-stops")).toBe("1");
    expect(response.headers.has("x-injected")).toBe(false);
    const ics = (await response.text()).replace(/\r\n /g, "");
    expect(ics).toContain("LOCATION:Điểm công khai\\, Đường A");
    expect(ics).toContain("SUMMARY:Tên ngoài danh mục chỉ chủ chuyến thấy");
    expect(ics).toContain("Chuyến đi có mục chưa kiểm.");
    expect(ics).not.toMatch(/Điểm thiếu giờ|Chủ chuyến|23\.3612345|105\.3112345|23\.712345|104\.912345|provider-id-fixture|catalogue-fixture|fixture-internal-id/);
  });

  it("reuses the companion projection for an active member", async () => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    signIn("member");
    const response = await readCalendar();
    expect(response.status).toBe(200);
    const ics = (await response.text()).replace(/\r\n /g, "");
    expect(ics).toContain("LOCATION:Điểm công khai\\, Đường A");
    expect(ics).toContain("SUMMARY:Địa điểm ngoài danh mục");
    expect(ics).toContain("Địa điểm ngoài danh mục (chưa kiểm).");
    expect(ics).not.toMatch(/chỉ chủ chuyến thấy|Chuyến đi có mục chưa kiểm|provider-id-fixture|23\.712345/);
  });

  it.each(["stranger", "former-member"])("returns the identical 404 for %s and a missing trip", async user => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    signIn(user);
    const foreign = await readCalendar();
    const missing = await readCalendar("missing");
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.text()).toEqual(await missing.text());
    expect([...foreign.headers]).toEqual([...missing.headers]);
    expect(foreign.headers.get("content-disposition")).toBeNull();
  });

  it("denies a guest without querying trips", async () => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    resolveSession.mockResolvedValue(null);
    expect((await readCalendar()).status).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("reports skipped visits without attaching a calendar with no events", async () => {
    vi.stubEnv("TRIPSAGE_FEATURE_CALENDAR", "true");
    const day = saved.days[0]!;
    signIn("owner", { ...saved, days: [{ ...day, visits: [day.visits[2]!] }] });
    const response = await readCalendar();
    expect(response.status).toBe(422);
    expect(response.headers.get("x-ics-skipped-stops")).toBe("1");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect((await response.json()).error.code).toBe("TRIP_CALENDAR_NO_TIMED_STOPS");
  });
});
