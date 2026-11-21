import { describe, expect, it } from "vitest";

import { generateTripCalendar } from "./trip-calendar";
import type { TripDetail } from "./trip-read-service";

const stamp = new Date("2026-11-21T02:03:04.567Z");
const place = {
  id: "destination-fixture",
  name: "Điểm A",
  area: "Đồng Văn",
  visibility: "VISIBLE",
  availability: "AVAILABLE",
} as const;

const trip = {
  id: "saved-trip",
  startDate: "2026-12-31",
  days: [
    { dayIndex: 1, visits: [
      { order: 1, startMinute: 480, plannedDurationMinutes: 60, destination: place },
      { order: 2, startMinute: 1410, plannedDurationMinutes: 30, destination: place },
    ] },
    { dayIndex: 2, visits: [
      { order: 1, startMinute: 0, plannedDurationMinutes: 30, destination: place },
    ] },
  ],
};

function parseCalendar(ics: string) {
  const properties: Record<string, string> = {};
  const events: Record<string, string>[] = [];
  let event: Record<string, string> | undefined;
  const lines = ics.replace(/\r\n[ \t]/g, "").split("\r\n");
  expect(lines.shift()).toBe("BEGIN:VCALENDAR");
  expect(lines.pop()).toBe("");
  expect(lines.pop()).toBe("END:VCALENDAR");
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      expect(event).toBeUndefined();
      event = {};
    } else if (line === "END:VEVENT") {
      expect(event).toBeDefined();
      events.push(event!);
      event = undefined;
    } else {
      const separator = line.indexOf(":");
      expect(separator).toBeGreaterThan(0);
      (event ?? properties)[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
  expect(event).toBeUndefined();
  return { properties, events };
}

describe("saved trip iCalendar", () => {
  it("exports each timed stop with stable UIDs and converts Vietnam hours to UTC across midnight and New Year", () => {
    const { ics, skippedStops } = generateTripCalendar(trip, stamp);
    const { properties, events } = parseCalendar(ics);
    expect(properties).toMatchObject({ VERSION: "2.0", PRODID: expect.any(String), CALSCALE: "GREGORIAN" });
    expect(skippedStops).toBe(0);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      DTSTAMP: "20261121T020304Z",
      DTSTART: "20261231T010000Z",
      DTEND: "20261231T020000Z",
      SUMMARY: "Điểm A",
      LOCATION: "Điểm A",
    });
    expect(events[0]?.DESCRIPTION).toContain("08:00 – 09:00");
    expect(events[1]).toMatchObject({ DTSTART: "20261231T163000Z", DTEND: "20261231T170000Z" });
    expect(events[1]?.DESCRIPTION).toContain("23:30 – 00:00 (ngày hôm sau)");
    expect(events[2]).toMatchObject({ DTSTART: "20261231T170000Z", DTEND: "20261231T173000Z" });
    const uids = events.map(event => event.UID);
    expect(uids.every(uid => uid && !uid.includes(trip.id))).toBe(true);
    expect(new Set(uids).size).toBe(3);
    const later = generateTripCalendar(trip, new Date("2026-11-22T00:00:00Z"));
    expect(parseCalendar(later.ics).events.map(event => event.UID)).toEqual(uids);
    expect(parseCalendar(generateTripCalendar({ ...trip, id: "other-trip" }, stamp).ics).events[0]?.UID).not.toBe(uids[0]);
  });

  it("escapes text and folds UTF-8 without letting a stop create an event or property", () => {
    const name = "A".repeat(65) + "ệ🙂".repeat(30) + "\r\nBEGIN:VEVENT\nATTENDEE:fake@example.test; , \\";
    const destination = { ...place, name, address: "Phố 1; Xã A,\rĐồng Văn\\B" };
    const input = { ...trip, days: [{ dayIndex: 1, visits: [{ ...trip.days[0]!.visits[0]!, destination }] }] };
    const { ics } = generateTripCalendar(input, stamp);
    expect(ics.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    const lines = ics.split("\r\n");
    expect(lines.some(line => line.startsWith(" "))).toBe(true);
    expect(lines.every(line => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(lines.every(line => Buffer.from(line, "utf8").toString("utf8") === line)).toBe(true);
    const { events } = parseCalendar(ics);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("ATTENDEE");
    const escapedName = "A".repeat(65) + "ệ🙂".repeat(30) + "\\nBEGIN:VEVENT\\nATTENDEE:fake@example.test\\; \\, \\\\";
    expect(events[0]?.SUMMARY).toBe(escapedName);
    expect(events[0]?.LOCATION).toBe(escapedName + "\\, Phố 1\\; Xã A\\,\\nĐồng Văn\\\\B");
  });

  it("counts untimed stops and includes only public location information and the visible warnings", () => {
    const original = trip.days[0]!.visits[0]!;
    const unchecked: TripDetail["unchecked"] = {
      items: [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:private-check-id" }],
      confirmedAt: "2026-11-20T00:00:00Z",
    };
    const input = {
      ...trip,
      unchecked,
      journey: { origin: { label: "Nhà riêng fixture", latitude: 21.000123, longitude: 105.000456 } },
      days: [{ dayIndex: 1, visits: [
        { ...original, destination: { ...place, external: true as const, latitude: 22.000123, longitude: 104.000456 } },
        { ...original, order: 2, startMinute: null },
        { ...original, order: 3, plannedDurationMinutes: undefined },
        { ...original, order: 4, destination: {
          ...place, name: "Điểm ẩn", address: "Địa chỉ điểm ẩn",
          visibility: "HIDDEN" as const, availability: "UNAVAILABLE" as const,
        } },
      ] }],
    };
    const { ics, skippedStops } = generateTripCalendar(input, stamp);
    expect(skippedStops).toBe(2);
    expect(ics).not.toMatch(/Nhà riêng|21\.000123|105\.000456|22\.000123|104\.000456|private-check-id|Địa chỉ điểm ẩn/);
    const { events } = parseCalendar(ics);
    expect(events).toHaveLength(2);
    expect(events[0]?.DESCRIPTION).toContain("ngoài danh mục (chưa kiểm)");
    expect(events[1]?.DESCRIPTION).toContain("Chuyến đi có mục chưa kiểm.");
    expect(events[1]).toMatchObject({ SUMMARY: "Điểm ẩn", LOCATION: "Điểm đến không còn khả dụng công khai" });
  });
});
