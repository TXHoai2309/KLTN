import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { getTravelRoute } from "../trip-validation/stadia-route";

import { tripSaveRequestSchema } from "./trip-save-contract";
import { saveTrip, type TripSaveDependencies } from "./trip-save-service";

const timeReference = new Date("2026-10-15T00:00:00.000Z");
const headers = new Headers();
const request = { confirm: true, proposal: {
  startDate: "2026-10-20", durationDays: 1, transport: "CAR",
  days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 480, plannedDurationMinutes: 60, order: 1 }] }],
} } as const;
type Row = { id: string; visibility: "VISIBLE" | "HIDDEN"; latitude: number; longitude: number; minimumDurationMinutes: number | null; openingDays: { dayOfWeek: "TUESDAY"; status: "OPEN" | "UNKNOWN"; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[] };
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

describe.each(["TRAVELER", "ADMIN"])("US-30 %s server save gate", role => {
  it("revalidates through shared motorcycle routing and replays without another provider call", async () => {
    const test=fixture(role);
    const fetcher=vi.fn<typeof fetch>(async()=>Response.json({trip:{summary:{time:60}}}));
    test.dependencies.getRoute=input=>getTravelRoute(input,{apiKey:()=>"fixture",fetcher});
    const payload=tripSaveRequestSchema.parse(twoVisits()); payload.proposal.transport="MOTORCYCLE";
    expect(await saveTrip(headers,payload,"shared-stadia",test.dependencies,timeReference)).toMatchObject({status:"SUCCESS"});
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).costing).toBe("motorcycle");
    expect(await saveTrip(headers,payload,"shared-stadia",test.dependencies,timeReference)).toMatchObject({status:"SUCCESS",replayed:true});
    expect(fetcher).toHaveBeenCalledOnce(); expect(test.trips).toHaveLength(1);
  });
  it("persists one owned trip with days and visits when all four groups satisfy and user confirms", async () => {
    const test = fixture(role);
    test.setRole(role);
    const outcome = await saveTrip(headers, tripSaveRequestSchema.parse(request), "save-1", test.dependencies, timeReference);
    expect(outcome).toMatchObject({ status: "SUCCESS", data: { tripId: "trip-1", validation: { canConfirm: true } } });
    expect(test.trips).toHaveLength(1);
    expect(test.trips[0]).toMatchObject({ userId: "actor", days: { create: [{ dayIndex: 1, visits: { create: [{ destinationId: "a" }] } }] } });
    expect(test.records).toHaveLength(1);
  });
  it.each([
    ["opening", (rows: Row[]) => { rows[0].openingDays[0].intervals = [{ opensAtMinute: 600, closesAtMinute: 1440 }]; }],
    ["minimum", (rows: Row[]) => { rows[0].minimumDurationMinutes = 90; }],
    ["insufficient", (rows: Row[]) => { rows[0].openingDays[0].status = "UNKNOWN"; }],
  ])("rejects %s failure without creating a trip", async (_name, change) => {
    const test = fixture(role); change(test.rows);
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "save-1", test.dependencies, timeReference)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    expect(test.trips).toHaveLength(0);
  });
  it("rejects travel violation, conflict, and missing route independently", async () => {
    const travel = fixture(role); travel.dependencies.getRoute = async () => ({ kind: "ok", durationSeconds: 4000 });
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(twoVisits()), "travel", travel.dependencies, timeReference)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    const conflict = fixture(role); const overlapping = twoVisits(); overlapping.proposal.days[0].visits[1].startMinute = 539;
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(overlapping), "conflict", conflict.dependencies, timeReference)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    const missing = fixture(role); missing.dependencies.getRoute = async () => ({ kind: "unavailable" });
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(twoVisits()), "missing", missing.dependencies, timeReference)).rejects.toMatchObject({ code: "TRIP_VALIDATION_FAILED" });
    expect(travel.trips).toHaveLength(0); expect(conflict.trips).toHaveLength(0); expect(missing.trips).toHaveLength(0);
  });
  it("requires explicit confirmation and rejects owner/validator claims", () => {
    expect(tripSaveRequestSchema.safeParse({ ...request, confirm: false }).success).toBe(false);
    expect(tripSaveRequestSchema.safeParse({ ...request, ownerId: "attacker" }).success).toBe(false);
    expect(tripSaveRequestSchema.safeParse({ ...request, validatorPassed: true }).success).toBe(false);
  });
  it("replays the same key and payload without a duplicate", async () => {
    const test = fixture(role); const input = tripSaveRequestSchema.parse(request);
    await saveTrip(headers, input, "save-1", test.dependencies, timeReference);
    const replay = await saveTrip(headers, input, "save-1", test.dependencies, timeReference);
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(test.trips).toHaveLength(1);
  });
  it("blocks Guest, unsupported roles, and hidden destinations", async () => {
    const guest = fixture(role); guest.dependencies.resolveSession = async () => null;
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "guest", guest.dependencies, timeReference)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const admin = fixture(role); admin.setRole("ROOT");
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "admin", admin.dependencies, timeReference)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const hidden = fixture(role); hidden.rows[0].visibility = "HIDDEN";
    await expect(saveTrip(headers, tripSaveRequestSchema.parse(request), "hidden", hidden.dependencies, timeReference)).rejects.toMatchObject({ code: "DESTINATION_UNAVAILABLE" });
    expect(guest.trips).toHaveLength(0); expect(admin.trips).toHaveLength(0); expect(hidden.trips).toHaveLength(0);
  });
  it("returns fresh validation and rolls back when business data changes before write", async () => {
    const test = fixture(role); test.dependencies.getRoute = async () => { test.rows[0].minimumDurationMinutes = 90; return { kind: "ok", durationSeconds: 0 }; };
    const outcome = await saveTrip(headers, tripSaveRequestSchema.parse(twoVisits()), "changed", test.dependencies, timeReference);
    expect(outcome).toMatchObject({ status: "FAILED", error: { code: "TRIP_VALIDATION_FAILED", details: { validation: { canConfirm: false } } } });
    expect(test.trips).toHaveLength(0); expect(test.records).toHaveLength(0);
  });
  it("does not persist a partial trip or success record when nested creation fails", async () => {
    const test = fixture(role); test.failCreate();
    const outcome = await saveTrip(headers, tripSaveRequestSchema.parse(request), "broken", test.dependencies, timeReference);
    expect(outcome.status).toBe("UNKNOWN");
    expect(test.trips).toHaveLength(0); expect(test.records).toHaveLength(0);
  });
});
