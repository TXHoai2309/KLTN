import { describe, expect, it } from "vitest";

import {
  addVisit,
  createEditCandidate,
  diffEditCandidate,
  EditCandidateOperationError,
  editCandidateSchema,
  MAX_EDIT_VISITS_PER_DAY,
  moveVisit,
  removeVisit,
  replaceVisit,
  setVisitDuration,
  setVisitTime,
  type EditCandidate,
} from "./edit-candidate";

const candidate = (): EditCandidate => ({
  startDate: "2026-10-20",
  durationDays: 2,
  transport: "CAR",
  days: [
    {
      dayIndex: 1,
      visits: [
        { visitId: "visit-a", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
        { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 60, order: 2 },
      ],
    },
    {
      dayIndex: 2,
      visits: [
        { visitId: "visit-c", destinationId: "destination-c", startMinute: 540, plannedDurationMinutes: 90, order: 1 },
      ],
    },
  ],
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("editCandidateSchema", () => {
  it("accepts the saved itinerary shape with stable visit IDs and rejects unknown fields", () => {
    expect(editCandidateSchema.parse(candidate())).toEqual(candidate());
    expect(() => editCandidateSchema.parse({ ...candidate(), ownerId: "user-1" })).toThrow();
    expect(() => editCandidateSchema.parse({
      ...candidate(),
      days: [{
        dayIndex: 1,
        visits: [{
          ...candidate().days[0]!.visits[0]!,
          destination: { id: "destination-a", visibility: "VISIBLE" },
        }],
      }, candidate().days[1]],
    })).toThrow();
  });

  it("enforces consecutive day/order values, visit identity, schedule bounds and per-day limits", () => {
    const base = candidate();
    expect(() => editCandidateSchema.parse({ ...base, days: [{ ...base.days[0]!, dayIndex: 2 }, base.days[1]] })).toThrow();
    expect(() => editCandidateSchema.parse({ ...base, days: [{ ...base.days[0]!, visits: [{ ...base.days[0]!.visits[0]!, order: 2 }, base.days[0]!.visits[1]!] }, base.days[1]] })).toThrow();
    expect(() => editCandidateSchema.parse({ ...base, days: [{ ...base.days[0]!, visits: [{ ...base.days[0]!.visits[0]!, visitId: "visit-c" }, base.days[0]!.visits[1]!] }, base.days[1]] })).toThrow();
    expect(() => editCandidateSchema.parse({ ...base, days: [{ ...base.days[0]!, visits: [{ ...base.days[0]!.visits[0]!, startMinute: 1430 }, base.days[0]!.visits[1]!] }, base.days[1]] })).toThrow();

    const tooMany = Array.from({ length: MAX_EDIT_VISITS_PER_DAY + 1 }, (_, index) => ({
      visitId: `visit-${index}`,
      destinationId: `destination-${index}`,
      startMinute: index * 10,
      plannedDurationMinutes: 5,
      order: index + 1,
    }));
    expect(() => editCandidateSchema.parse({ ...base, days: [{ dayIndex: 1, visits: tooMany }, base.days[1]] })).toThrow();
  });
});

describe("createEditCandidate", () => {
  it("maps persisted IDs into stable visitId values and returns an independent ordered copy", () => {
    const savedTrip = deepFreeze({
      startDate: new Date("2026-10-20T00:00:00.000Z"),
      durationDays: 2,
      transport: "CAR" as const,
      days: [
        { dayIndex: 2, visits: [{ id: "persisted-c", destinationId: "destination-c", startMinute: 540, plannedDurationMinutes: 90, order: 1 }] },
        {
          dayIndex: 1,
          visits: [
            { id: "persisted-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 60, order: 2 },
            { id: "persisted-a", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          ],
        },
      ],
    });

    const result = createEditCandidate(savedTrip);
    expect(result).toEqual({
      startDate: "2026-10-20",
      durationDays: 2,
      transport: "CAR",
      days: [
        { dayIndex: 1, visits: [
          { visitId: "persisted-a", destinationId: "destination-a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "persisted-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 60, order: 2 },
        ] },
        { dayIndex: 2, visits: [{ visitId: "persisted-c", destinationId: "destination-c", startMinute: 540, plannedDurationMinutes: 90, order: 1 }] },
      ],
    });
    expect(result.days[0]).not.toBe(savedTrip.days[1]);
    expect(savedTrip.days[1]!.visits[0]!.id).toBe("persisted-b");
  });
});

describe("candidate edit operations", () => {
  it("adds by destinationId, inserts at the requested position, renumbers, and preserves the source", () => {
    const source = deepFreeze(candidate());
    const result = addVisit(source, 1, {
      visitId: "visit-new",
      destinationId: "destination-new",
      startMinute: 720,
      plannedDurationMinutes: 45,
    }, 2);

    expect(result.days[0]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-a", 1], ["visit-new", 2], ["visit-b", 3],
    ]);
    expect(result.days[0]!.visits[1]).toMatchObject({ destinationId: "destination-new" });
    expect(source).toEqual(candidate());
    expect(result.days).not.toBe(source.days);
    expect(result.days[0]!.visits).not.toBe(source.days[0]!.visits);
    expect(result.days[0]!.visits[0]).not.toBe(source.days[0]!.visits[0]);
    expect(() => addVisit(source, 1, {
      visitId: "visit-bad",
      destinationId: "destination-bad",
      startMinute: 720,
      plannedDurationMinutes: 45,
      destination: { id: "destination-bad", visibility: "VISIBLE" },
    } as never)).toThrow();
  });

  it("removes one visit and renumbers the remaining visits without mutating the original", () => {
    const source = deepFreeze(candidate());
    const result = removeVisit(source, "visit-a");
    expect(result.days[0]!.visits).toEqual([
      { visitId: "visit-b", destinationId: "destination-b", startMinute: 600, plannedDurationMinutes: 60, order: 1 },
    ]);
    expect(source).toEqual(candidate());
    expect(result.days[1]).not.toBe(source.days[1]);
  });

  it("moves between days and positions while updating both days' order values", () => {
    const source = deepFreeze(candidate());
    const result = moveVisit(source, "visit-b", 2, 1);
    expect(result.days.map((day) => day.visits.map((visit) => [visit.visitId, visit.order]))).toEqual([
      [["visit-a", 1]],
      [["visit-b", 1], ["visit-c", 2]],
    ]);
    expect(source).toEqual(candidate());
  });

  it("moves within a day using the final 1-based insertion position", () => {
    const source = deepFreeze(candidate());
    const result = moveVisit(source, "visit-a", 1, 2);
    expect(result.days[0]!.visits.map((visit) => [visit.visitId, visit.order])).toEqual([
      ["visit-b", 1], ["visit-a", 2],
    ]);
    expect(source).toEqual(candidate());
  });

  it("sets time and duration on copies and enforces a single-day visit window", () => {
    const source = deepFreeze(candidate());
    const timed = setVisitTime(source, "visit-a", 510);
    const lengthened = setVisitDuration(timed, "visit-a", 75);
    expect(lengthened.days[0]!.visits[0]).toMatchObject({ startMinute: 510, plannedDurationMinutes: 75, order: 1 });
    expect(source).toEqual(candidate());
    expect(() => setVisitTime(source, "visit-a", 1430)).toThrow();
    expect(() => setVisitDuration(source, "visit-a", 1440)).toThrow();
  });

  it("replaces editable fields but preserves stable visitId and position", () => {
    const source = deepFreeze(candidate());
    const result = replaceVisit(source, "visit-b", {
      destinationId: "destination-replacement",
      startMinute: 660,
      plannedDurationMinutes: 30,
    });
    expect(result.days[0]!.visits[1]).toEqual({
      visitId: "visit-b",
      destinationId: "destination-replacement",
      startMinute: 660,
      plannedDurationMinutes: 30,
      order: 2,
    });
    expect(source).toEqual(candidate());
  });

  it("rejects missing IDs, unknown days, duplicate IDs, invalid positions and day capacity", () => {
    const source = deepFreeze(candidate());
    expect(() => removeVisit(source, "missing")).toThrow(EditCandidateOperationError);
    expect(() => addVisit(source, 3, {
      visitId: "visit-new", destinationId: "destination-new", startMinute: 720, plannedDurationMinutes: 30,
    })).toThrow(EditCandidateOperationError);
    expect(() => addVisit(source, 1, {
      visitId: "visit-a", destinationId: "destination-new", startMinute: 720, plannedDurationMinutes: 30,
    })).toThrow(EditCandidateOperationError);
    expect(() => addVisit(source, 1, {
      visitId: "visit-new", destinationId: "destination-new", startMinute: 720, plannedDurationMinutes: 30,
    }, 4)).toThrow(EditCandidateOperationError);

    const fullDay = {
      ...candidate(),
      days: candidate().days.map((day, index) => index === 0
        ? { ...day, visits: Array.from({ length: MAX_EDIT_VISITS_PER_DAY }, (_, visitIndex) => ({
          visitId: `full-${visitIndex}`,
          destinationId: `destination-${visitIndex}`,
          startMinute: visitIndex * 100,
          plannedDurationMinutes: 30,
          order: visitIndex + 1,
        })) }
        : day),
    };
    expect(() => addVisit(fullDay, 1, {
      visitId: "visit-extra", destinationId: "destination-extra", startMinute: 720, plannedDurationMinutes: 30,
    })).toThrow(EditCandidateOperationError);
    expect(() => moveVisit(fullDay, "visit-c", 1)).toThrow(EditCandidateOperationError);
    expect(source).toEqual(candidate());
  });
});

describe("diffEditCandidate", () => {
  it("reports additions, removals, edits, moves, reorders and trip metadata deterministically", () => {
    const original = deepFreeze(candidate());
    const changed = addVisit(original, 1, {
      visitId: "visit-new",
      destinationId: "destination-new",
      startMinute: 720,
      plannedDurationMinutes: 30,
    });
    const moved = moveVisit(changed, "visit-b", 2, 1);
    const replaced = replaceVisit(moved, "visit-a", {
      destinationId: "destination-updated",
      startMinute: 500,
      plannedDurationMinutes: 45,
    });
    const next = {
      ...replaced,
      transport: "MOTORCYCLE" as const,
    };

    expect(diffEditCandidate(original, next)).toEqual({
      added: [{
        visitId: "visit-new", destinationId: "destination-new", startMinute: 720, plannedDurationMinutes: 30, order: 2, dayIndex: 1,
      }],
      removed: [],
      updated: expect.arrayContaining([
        expect.objectContaining({ visitId: "visit-a", changedFields: expect.arrayContaining(["destinationId", "startMinute", "plannedDurationMinutes"]) }),
        expect.objectContaining({ visitId: "visit-b", changedFields: expect.arrayContaining(["dayIndex", "order"]) }),
      ]),
      tripChanges: { transport: { before: "CAR", after: "MOTORCYCLE" } },
    });
    expect(original).toEqual(candidate());
  });

  it("returns empty collections for an unchanged candidate and reports removed visits", () => {
    const original = candidate();
    expect(diffEditCandidate(original, original)).toEqual({ added: [], removed: [], updated: [], tripChanges: {} });
    expect(diffEditCandidate(original, removeVisit(original, "visit-a")).removed).toEqual([
      { ...original.days[0]!.visits[0]!, dayIndex: 1 },
    ]);
  });
});
