import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { tripSaveRequestSchema } from "../trip-save/trip-save-contract";
import { saveTrip, previewTripValidation, type TripSaveDependencies } from "../trip-save/trip-save-service";
import { COMPLETE_JOURNEY_FIXTURE } from "./trip-origin-fixtures";
import { weekdays } from "../destination/destination-contract";
import { getMyTrip } from "../trip-read/trip-read-service";

const now = new Date("2030-11-14T00:00:00Z");
const input = () => tripSaveRequestSchema.parse({ confirm: true, proposal: { startDate: "2030-11-15", durationDays: 1, transport: "CAR", journey: COMPLETE_JOURNEY_FIXTURE, days: [{ dayIndex: 1, visits: [{ destinationId: "a", order: 1, startMinute: 600, plannedDurationMinutes: 60 }] }] } });
function fixture() {
  const destinations = [{ id: "a", latitude: 22.8233, longitude: 104.9836, minimumDurationMinutes: 30, openingDays: weekdays.map(dayOfWeek => ({ dayOfWeek, status: "OPEN", intervals: [{ opensAtMinute: 480, closesAtMinute: 1080 }] })) }];
  let role = "TRAVELER", failure = false;
  let trips: Record<string, unknown>[] = [], receipts: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  const lookup = async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => receipts.find(row => row.scope === where.scope_key.scope && row.key === where.scope_key.key) ?? null;
  const database = {
    user: { findUnique: async () => ({ id: "owner", role }) },
    destination: { findMany: async () => structuredClone(destinations) },
    idempotencyRecord: { findUnique: lookup },
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) => {
      const pendingTrips = [...trips], pendingReceipts = structuredClone(receipts);
      const result = await execute({
        user: database.user, destination: database.destination,
        trip: { create: async ({ data }: { data: Record<string, unknown> }) => { if (failure) throw new Error("synthetic write failure"); pendingTrips.push(data); return { id: "trip-1" }; } },
        idempotencyRecord: { create: async ({ data }: { data: typeof pendingReceipts[number] }) => { pendingReceipts.push(data); }, update: async ({ data }: { data: { responseJson: string } }) => { pendingReceipts.at(-1)!.responseJson = data.responseJson; } },
      });
      trips = pendingTrips; receipts = pendingReceipts; return result;
    },
  };
  const deps: TripSaveDependencies = { database: database as unknown as Database, resolveSession: async () => ({ user: { id: "owner" } }), getRoute: vi.fn(async () => ({ kind: "ok" as const, durationSeconds: 7200, distanceMeters: 100_000 })) };
  return { deps, destinations, setRole: (next: string) => { role = next; }, fail: () => { failure = true; }, get trips() { return trips; }, get receipts() { return receipts; } };
}
describe("fresh authoritative journey Save", () => {
  it("fetches boundary evidence and persists origin/policy atomically, replaying without another route call", async () => {
    const test = fixture(); const payload = input();
    const saved = await saveTrip(new Headers(), payload, "journey-save-1", test.deps, now);
    expect(saved).toMatchObject({ status: "SUCCESS", data: { tripId: "trip-1", validation: { canConfirm: true } } });
    expect(test.deps.getRoute).toHaveBeenCalledTimes(2);
    expect(test.trips[0]).toMatchObject({ userId: "owner", journeySnapshot: { revision: "journey-save-v1", journey: COMPLETE_JOURNEY_FIXTURE, plan: { policy: "roadside-rest-v1" } } });
    expect(await saveTrip(new Headers(), payload, "journey-save-1", test.deps, now)).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(test.trips).toHaveLength(1); expect(test.deps.getRoute).toHaveBeenCalledTimes(2);
    payload.proposal.journey!.departureMinute = 420;
    expect(await saveTrip(new Headers(), payload, "journey-save-1", test.deps, now)).toMatchObject({ status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED" } });
  });
  it("accepts fresh preview while rejecting forged timing, below-minimum visits, missing distance and missed return deadline", async () => {
    const test = fixture();
    expect((await previewTripValidation(new Headers(), input().proposal, test.deps, now)).canConfirm).toBe(true);
    for (const change of [(value: ReturnType<typeof input>) => { value.proposal.days[0]!.visits[0]!.startMinute = 400; }, (value: ReturnType<typeof input>) => { value.proposal.days[0]!.visits[0]!.plannedDurationMinutes = 10; }, (value: ReturnType<typeof input>) => { value.proposal.journey!.returnDeadlineMinute = 700; }]) {
      const payload = input(); change(payload);
      await expect(saveTrip(new Headers(), payload, "invalid-save", test.deps, now)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    }
    test.deps.getRoute = async () => ({ kind: "ok", durationSeconds: 60 });
    await expect(saveTrip(new Headers(), input(), "missing-distance", test.deps, now)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    expect(test.trips).toHaveLength(0);
  });
  it.each(["coordinates", "minimum", "role"])("detects changed %s after fresh route work before transactional write", async kind => {
    const test = fixture(); let calls = 0;
    test.deps.getRoute = async () => {
      if (++calls === 2) {
        if (kind === "coordinates") test.destinations[0]!.latitude += 0.01;
        if (kind === "minimum") test.destinations[0]!.minimumDurationMinutes = 100;
        if (kind === "role") test.setRole("ROOT");
      }
      return { kind: "ok", durationSeconds: 7200, distanceMeters: 100_000 };
    };
    const result = await saveTrip(new Headers(), input(), "changed-fresh-data", test.deps, now);
    expect(result).toMatchObject({ status: "FAILED", error: { code: kind === "coordinates" ? "TRIP_DATA_CHANGED" : kind === "minimum" ? "TRIP_VALIDATION_FAILED" : "FORBIDDEN" } });
    expect(test.trips).toHaveLength(0); expect(test.receipts).toHaveLength(0);
  });
  it("does not retain partial Trip or success receipt on UNKNOWN database write", async () => {
    const test = fixture(); test.fail();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await saveTrip(new Headers(), input(), "unknown-fresh-save", test.deps, now)).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
      expect(test.trips).toHaveLength(0); expect(test.receipts).toHaveLength(0);
    } finally { spy.mockRestore(); }
  });
});
