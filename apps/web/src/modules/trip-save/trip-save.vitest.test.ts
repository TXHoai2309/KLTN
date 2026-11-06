import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { executeIdempotentWrite } from "../../server/http/idempotency";

import { tripSaveRequestSchema } from "./trip-save-contract";
import { previewTripValidation, saveTrip, type TripSaveDependencies } from "./trip-save-service";

const timeReference = new Date("2026-10-15T00:00:00.000Z");
const headers = new Headers();
const request = { confirm: true, proposal: {
  startDate: "2026-10-20", durationDays: 1, transport: "CAR",
  days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }],
} } as const;
type Row = { id: string; visibility: "VISIBLE" | "HIDDEN"; latitude: number; longitude: number; minimumDurationMinutes: number | null; openingDays: { dayOfWeek: "TUESDAY" | "WEDNESDAY"; status: "OPEN" | "UNKNOWN"; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[] };
const destination = (id: string): Row => ({ id, visibility: "VISIBLE", latitude: 23, longitude: 105, minimumDurationMinutes: 30, openingDays: [{ dayOfWeek: "TUESDAY", status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] }] });

function fixture(initialRole = "TRAVELER") {
  const rows = [destination("a"), destination("b")];
  let records: { scope: string; key: string; requestHash: string; responseJson: string }[] = [];
  let trips: unknown[] = [];
  let role = initialRole;
  let failNestedCreate = false;
  const database = {
    user: { findUnique: async () => ({ id: "actor", role }) },
    destination: { findMany: async ({ where }: { where: { id: { in: string[] }; visibility: string } }) => structuredClone(rows.filter(row => where.id.in.includes(row.id) && row.visibility === where.visibility)) },
    idempotencyRecord: { findUnique: async ({ where }: { where: { scope_key: { scope: string; key: string } } }) => records.find(row => row.scope === where.scope_key.scope && row.key === where.scope_key.key) ?? null },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingRecords = structuredClone(records);
      const pendingTrips = structuredClone(trips);
      const tx = {
        user: database.user, destination: database.destination,
        idempotencyRecord: {
          create: async ({ data }: { data: typeof pendingRecords[number] }) => { pendingRecords.push(data); },
          update: async ({ where, data }: { where: { scope_key: { scope: string; key: string } }; data: { responseJson: string } }) => {
            pendingRecords.find(row => row.scope === where.scope_key.scope && row.key === where.scope_key.key)!.responseJson = data.responseJson;
          },
        },
        trip: { create: async ({ data }: { data: unknown }) => {
          if (failNestedCreate) throw new Error("database failed");
          pendingTrips.push(data); return { id: `trip-${pendingTrips.length}` };
        } },
      };
      const result = await callback(tx);
      records = pendingRecords; trips = pendingTrips;
      return result;
    },
  };
  const dependencies: TripSaveDependencies = {
    database: database as unknown as Database,
    resolveSession: async () => ({ user: { id: "actor", role } }),
    getRoute: async () => ({ kind: "ok", durationSeconds: 0 }),
  };
  return { dependencies, rows, get trips() { return trips; }, get records() { return records; }, setRole: (value: string) => { role = value; }, failCreate: () => { failNestedCreate = true; } };
}

const twoVisits = () => ({ confirm: true as const, proposal: { ...structuredClone(request.proposal), days: [{ dayIndex: 1, visits: [
  { destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
  { destinationId: "b", startMinute: 600, plannedDurationMinutes: 60, order: 2 },
] }] } });

describe.each(["TRAVELER", "ADMIN"])("Origin rollout: %s new-save boundary", role => {
  it("previews visit checks but cannot certify unvalidated origin legs", async () => {
    const test = fixture(role);
    const validation = await previewTripValidation(headers, tripSaveRequestSchema.parse(twoVisits()).proposal, test.dependencies, timeReference);
    expect(validation.canConfirm).toBe(false);
    expect(validation.groups.travelTime).toMatchObject({ status: "INSUFFICIENT_DATA", findings: [expect.objectContaining({ reasonCode: "JOURNEY_ROUTES_NOT_VALIDATED" })] });
    expect(validation.groups.openingHours.status).toBe("SATISFIED");
    expect(test.trips).toHaveLength(0);
    expect(test.records).toHaveLength(0);
  });
  it.each([
    ["opening", (rows: Row[]) => { rows[0].openingDays[0].intervals = [{ opensAtMinute: 600, closesAtMinute: 1440 }]; }, "openingHours", "VIOLATION"],
    ["minimum", (rows: Row[]) => { rows[0].minimumDurationMinutes = 90; }, "minimumDuration", "VIOLATION"],
    ["insufficient", (rows: Row[]) => { rows[0].openingDays[0].status = "UNKNOWN"; }, "openingHours", "INSUFFICIENT_DATA"],
  ] as const)("preserves %s validation findings in preliminary preview", async (_name, change, group, status) => {
    const test = fixture(role); change(test.rows);
    const validation = await previewTripValidation(headers, tripSaveRequestSchema.parse(request).proposal, test.dependencies, timeReference);
    expect(validation.groups[group].status).toBe(status);
    expect(validation.canConfirm).toBe(false);
    expect(test.trips).toHaveLength(0);
  });
  it("preserves travel violation, overlap and missing route evidence", async () => {
    const test = fixture(role);
    test.dependencies.getRoute = async () => ({ kind: "ok", durationSeconds: 4000 });
    expect((await previewTripValidation(headers, tripSaveRequestSchema.parse(twoVisits()).proposal, test.dependencies, timeReference)).groups.travelTime.status).toBe("VIOLATION");
    const overlap = twoVisits(); overlap.proposal.days[0].visits[1].startMinute = 500;
    expect((await previewTripValidation(headers, tripSaveRequestSchema.parse(overlap).proposal, test.dependencies, timeReference)).groups.scheduleConflict.status).toBe("VIOLATION");
    test.dependencies.getRoute = async () => ({ kind: "unavailable" });
    expect((await previewTripValidation(headers, tripSaveRequestSchema.parse(twoVisits()).proposal, test.dependencies, timeReference)).groups.travelTime.status).toBe("INSUFFICIENT_DATA");
  });
  it("blocks new writes without journey before routing/transaction, even with valid visits", async () => {
    const test = fixture(role);
    test.dependencies.getRoute = vi.fn();
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "new-save", test.dependencies, timeReference)).rejects.toMatchObject({ code: "TRIP_JOURNEY_REQUIRED" });
    expect(test.dependencies.getRoute).not.toHaveBeenCalled();
    expect(test.trips).toHaveLength(0);
    expect(test.records).toHaveLength(0);
  });
  it("requires explicit confirmation and rejects owner/validator claims", () => {
    expect(tripSaveRequestSchema.safeParse({ ...request, confirm: false }).success).toBe(false);
    expect(tripSaveRequestSchema.safeParse({ ...request, ownerId: "attacker" }).success).toBe(false);
    expect(tripSaveRequestSchema.safeParse({ ...request, validatorPassed: true }).success).toBe(false);
  });
  it("reconciles an existing SUCCESS receipt without re-routing or creating another trip", async () => {
    const test = fixture(role);
    const input = tripSaveRequestSchema.parse(request);
    const identity = { database: test.dependencies.database, actorId: "actor", operation: "trip:create", key: "previous-save", input };
    // Historical committed intent, created through the same idempotency primitive.
    const receipt = await executeIdempotentWrite({ ...identity, execute: async tx => {
      const trip = await tx.trip.create({ data: { userId: "actor", startDate: new Date("2026-10-20T00:00:00Z"), durationDays: 1, transport: "CAR" }, select: { id: true } });
      return { tripId: trip.id, validation: { canConfirm: true } };
    } });
    expect(receipt.status).toBe("SUCCESS");
    test.dependencies.getRoute = vi.fn();
    const replay = await saveTrip(headers, input, "previous-save", test.dependencies, timeReference);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true, data: { tripId: "trip-1" } });
    expect(test.dependencies.getRoute).not.toHaveBeenCalled();
    expect(test.trips).toHaveLength(1);
    const changed = structuredClone(input); changed.proposal.days[0].visits[0].startMinute++;
    expect(await saveTrip(headers, changed, "previous-save", test.dependencies, timeReference)).toMatchObject({ status: "FAILED", error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(test.trips).toHaveLength(1);
  });
  it("retains UNKNOWN when the prior receipt cannot be read", async () => {
    const test = fixture(role);
    vi.spyOn(test.dependencies.database.idempotencyRecord, "findUnique").mockRejectedValue(new Error("lost database response"));
    expect(await saveTrip(headers, tripSaveRequestSchema.parse(request), "uncertain-save", test.dependencies, timeReference)).toMatchObject({ status: "UNKNOWN", retryWithSameKey: true });
    expect(test.trips).toHaveLength(0);
  });
  it("blocks Guest/unsupported role and hides unavailable destinations in read-only preview", async () => {
    const guest = fixture(role); guest.dependencies.resolveSession = async () => null;
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "guest", guest.dependencies, timeReference)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const denied = fixture(role); denied.setRole("ROOT");
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "role", denied.dependencies, timeReference)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const hidden = fixture(role); hidden.rows[0].visibility = "HIDDEN";
    await expect(previewTripValidation(headers, tripSaveRequestSchema.parse(request).proposal, hidden.dependencies, timeReference)).rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE" });
  });
});

it("still verifies interday transfers, without certifying missing journey endpoints", async () => {
  const test = fixture();
  test.dependencies.interdayDepartureMinute = 480;
  for (const row of test.rows) row.openingDays.push({ dayOfWeek: "WEDNESDAY", status: "OPEN", intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }] });
  const proposal = { startDate: "2026-10-20", durationDays: 2, transport: "CAR", days: [
    { dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] },
    { dayIndex: 2, visits: [{ destinationId: "b", startMinute: 540, plannedDurationMinutes: 60, order: 1 }] },
  ] };
  const parsed = tripSaveRequestSchema.parse({ confirm: true, proposal });
  const route = vi.fn<TripSaveDependencies["getRoute"]>(async () => ({ kind: "unavailable" }));
  test.dependencies.getRoute = route;
  const preview = await previewTripValidation(headers, parsed.proposal, test.dependencies, timeReference);
  expect(route).toHaveBeenCalledTimes(1);
  expect(preview.groups.travelTime.status).toBe("INSUFFICIENT_DATA");
  test.dependencies.getRoute = async () => ({ kind: "ok", durationSeconds: 600 });
  const routed = await previewTripValidation(headers, parsed.proposal, test.dependencies, timeReference);
  expect(routed.groups.travelTime.findings.map(f => f.reasonCode)).toEqual(["JOURNEY_ROUTES_NOT_VALIDATED"]);
  expect(routed.canConfirm).toBe(false);
});
