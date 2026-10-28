import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { companionDraftSchema, companionFormContextSchema, companionPreviewSchema, publicCompanionSchema } from "./companion-contract";
import { companionDraftFixture as draft, companionFormFixture, publicCompanionFixture } from "./companion-fixtures";
import { companionPreviewResponse, companionPublicationResponse, publicCompanionResponse } from "./companion-http";
import { getCompanionFormContext, getPublicCompanion, previewCompanion, publishCompanion } from "./companion-service";

const headers = new Headers(), now = new Date("2030-11-14T12:00:00Z");
const input = { ...draft, confirm: true };

function fixture() {
  let actor: string | null = "owner", role = "TRAVELER", status = "ACTIVE";
  let committed = false, loseAck = false;
  let publication: any = null;
  let records: any[] = [];
  const trip = {
    startDate: new Date("2030-11-15"), durationDays: 2, transport: "MOTORCYCLE", manuallyCompletedAt: null as Date | null,
    user: { name: "Chủ chuyến mẫu", image: null, email: "PRIVATE_EMAIL", id: "PRIVATE_HOST_ID" },
    days: [{ visits: [{ startMinute: 480, destination: { id: "synthetic-destination", name: "Điểm đến mẫu", visibility: "VISIBLE", deletedAt: null, media: [
      { id: "synthetic-media", url: "https://example.invalid/companion-fixture.jpg", alt: "Ảnh điểm đến mẫu", websiteRights: "APPROVED" },
      { id: "rejected-media", url: "https://example.invalid/rejected.jpg", alt: "PRIVATE_REJECTED_MEDIA", websiteRights: "REJECTED" },
    ] } }] }],
    needs: "PRIVATE_NEEDS", aiHistory: "PRIVATE_AI_HISTORY", meeting: "PRIVATE_MEETING",
  };
  const findPublication = vi.fn(async () => publication ? { ...publication, trip } : null);
  const database = {
    user: { findUnique: vi.fn(async () => actor ? { id: actor, role, status } : null) },
    trip: { findFirst: vi.fn(async ({ where }: any) => where.id === "trip" && where.userId === "owner" ? trip : null) },
    tripCompanionPublication: { findUnique: findPublication },
    idempotencyRecord: { findUnique: vi.fn(async ({ where }: any) => records.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key) ?? null) },
    $transaction: vi.fn(async (run: any) => {
      const pendingRecords = structuredClone(records); let pendingPublication = publication;
      const tx = {
        ...database, $queryRaw: vi.fn(async () => []),
        idempotencyRecord: {
          create: async ({ data }: any) => pendingRecords.push({ ...data }),
          update: async ({ where, data }: any) => Object.assign(pendingRecords.find(r => r.scope === where.scope_key.scope && r.key === where.scope_key.key), data),
        },
        tripCompanionPublication: {
          findUnique: async () => pendingPublication,
          create: async ({ data }: any) => { pendingPublication = { ...data, id: "synthetic-publication" }; return { id: pendingPublication.id }; },
        },
      };
      const result = await run(tx);
      publication = pendingPublication; records = pendingRecords; committed = true;
      if (loseAck) {
        database.idempotencyRecord.findUnique.mockRejectedValueOnce(new Error("fixture unavailable reconciliation"));
        throw new Error("fixture acknowledgement lost after commit");
      }
      return result;
    }),
  };
  return {
    deps: { database: database as unknown as Database, resolveSession: async () => actor ? { user: { id: actor, role: "ADMIN" } } : null, now: () => now },
    database, trip, get publication() { return publication; }, get records() { return records; }, get committed() { return committed; },
    setActor: (value: string | null, nextRole = "TRAVELER", nextStatus = "ACTIVE") => { actor = value; role = nextRole; status = nextStatus; },
    loseAck: () => { loseAck = true; },
  };
}
function request(method: string, body?: unknown, extra: Record<string, string> = {}, path = "/api/trips/trip/publication") {
  return new Request(`http://localhost:3010${path}`, {
    method, headers: { origin: "http://localhost:3010", "content-type": "application/json", "Idempotency-Key": "key", ...extra },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

describe("TC-01 publication service and HTTP contract", () => {
  it("shares strict synthetic FE schemas and rejects identity overrides/coercion", () => {
    expect(publicCompanionSchema.parse(publicCompanionFixture)).toEqual(publicCompanionFixture);
    expect(companionFormContextSchema.parse(companionFormFixture)).toEqual(companionFormFixture);
    for (const additionalCapacity of [0, -1, 1.5, "2", 2_147_483_648, null]) {
      expect(companionDraftSchema.safeParse({ ...draft, additionalCapacity }).success).toBe(false);
    }
    for (const field of ["userId", "hostId", "tripId", "startDate", "transport", "availablePlaces"]) {
      expect(companionDraftSchema.safeParse({ ...draft, [field]: "spoof" }).success).toBe(false);
    }
    expect(companionDraftSchema.safeParse({ ...draft, title: "  " }).success).toBe(false);
  });

  it("preview matches Guest content, with allowlists excluding private data even if a reader returns extra fields", async () => {
    const f = fixture();
    expect(await getCompanionFormContext(headers, "trip", f.deps)).toEqual(companionFormFixture);
    const preview = await previewCompanion(headers, "trip", draft, f.deps);
    expect(companionPreviewSchema.parse(preview)).toEqual({ introduction: publicCompanionFixture.introduction });
    const result = await publishCompanion(headers, "trip", input, "publish", f.deps);
    expect(result).toMatchObject({ status: "SUCCESS", data: { publicationId: "synthetic-publication", tripId: "trip" } });
    expect(f.committed).toBe(true);
    const read = await getPublicCompanion("synthetic-publication", f.deps.database);
    expect(read).toEqual(publicCompanionFixture);
    expect(JSON.stringify(read)).not.toContain("PRIVATE_");
    expect(read.introduction).toEqual(preview.introduction);
    expect(await getCompanionFormContext(headers, "trip", f.deps)).toMatchObject({ publication: { publicationId: read.publicationId, draft } });
  });

  it.each([[null, "TRAVELER", "ACTIVE", 401], ["outsider", "TRAVELER", "ACTIVE", 404], ["outsider", "ADMIN", "ACTIVE", 404], ["owner", "TRAVELER", "LOCKED", 403]])("denies actor %s/%s/%s", async (actor, role, status, code) => {
    const f = fixture(); f.setActor(actor as string | null, role as string, status as string);
    const response = await companionPublicationResponse(request("POST", input), "trip", f.deps);
    expect(response.status).toBe(code); expect(await response.json()).toMatchObject({ operationStatus: "FAILED" });
    expect(f.publication).toBeNull(); expect(f.records).toHaveLength(0);
    await expect(getCompanionFormContext(headers, "trip", f.deps)).rejects.toMatchObject({ status: code });
    await expect(previewCompanion(headers, "trip", draft, f.deps)).rejects.toMatchObject({ status: code });
  });

  it("allows an active Admin only on own Trip; missing and foreign are uniform", async () => {
    const f = fixture(); f.setActor("owner", "ADMIN");
    expect(await publishCompanion(headers, "trip", input, "admin-own", f.deps)).toMatchObject({ status: "SUCCESS" });
    await expect(previewCompanion(headers, "missing", draft, f.deps)).rejects.toMatchObject({ code: "TRIP_NOT_FOUND", status: 404 });
  });

  it("same payload/key replays IDs; changed payload/Trip and another key cannot duplicate; lock revokes replay", async () => {
    const f = fixture();
    const first = await publishCompanion(headers, "trip", input, "key", f.deps);
    f.trip.startDate = new Date("2020-01-01"); // An acknowledged result survives later eligibility changes.
    expect(await publishCompanion(headers, "trip", input, "key", f.deps)).toEqual({ ...first, replayed: true });
    for (const [id, payload] of [["trip", { ...input, title: "different" }], ["missing", input]] as const) {
      expect(await publishCompanion(headers, id, payload, "key", f.deps)).toMatchObject({ status: "FAILED", httpStatus: 409, error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    }
    f.trip.startDate = new Date("2030-11-15");
    expect(await publishCompanion(headers, "trip", input, "different-key", f.deps)).toMatchObject({ status: "FAILED", httpStatus: 409, error: { code: "COMPANION_ALREADY_PUBLISHED" } });
    f.setActor("owner", "TRAVELER", "LOCKED");
    await expect(publishCompanion(headers, "trip", input, "key", f.deps)).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(f.records).toHaveLength(1);
  });

  it.each([new Date("2030-11-14T17:00:00Z"), new Date("2030-11-16T00:00:00Z")])("blocks departure day by Vietnam calendar: %s", async date => {
    const f = fixture(); f.deps.now = () => date;
    expect(await publishCompanion(headers, "trip", input, "date", f.deps)).toMatchObject({ status: "FAILED", error: { code: "TRIP_NOT_PUBLISHABLE" } });
    expect(f.records).toHaveLength(0);
  });
  it("blocks manual completion and invalid images without publishing; public media disappearance falls back", async () => {
    const f = fixture(); f.trip.manuallyCompletedAt = now;
    expect(await publishCompanion(headers, "trip", input, "completed", f.deps)).toMatchObject({ status: "FAILED", httpStatus: 409 });
    f.trip.manuallyCompletedAt = null;
    expect(await publishCompanion(headers, "trip", { ...input, imageMediaId: "rejected-media" }, "bad-media", f.deps)).toMatchObject({ status: "FAILED", httpStatus: 422 });
    await publishCompanion(headers, "trip", input, "ok", f.deps);
    f.trip.days = [];
    expect(await getPublicCompanion("synthetic-publication", f.deps.database)).toMatchObject({ introduction: { image: null, routeSummary: [] } });
  });

  it("omits a destination that becomes hidden between nested relation queries", async () => {
    const f = fixture();
    await publishCompanion(headers, "trip", input, "publish", f.deps);
    f.trip.days[0]!.visits[0]!.destination.visibility = "HIDDEN";
    expect((await getPublicCompanion("synthetic-publication", f.deps.database)).introduction).toMatchObject({ routeSummary: [], image: null });
  });

  it("lost commit acknowledgement returns UNKNOWN and identical retry resolves original publication", async () => {
    const f = fixture(); f.loseAck();
    const response = await companionPublicationResponse(request("POST", input), "trip", f.deps);
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ operationStatus: "UNKNOWN", retryWithSameKey: true });
    expect(f.publication).not.toBeNull();
    const retry = await companionPublicationResponse(request("POST", input), "trip", f.deps);
    expect(retry.headers.get("Idempotency-Replayed")).toBe("true");
    expect(await retry.json()).toMatchObject({ operationStatus: "SUCCESS", data: { publicationId: "synthetic-publication" } });
    expect(f.records).toHaveLength(1);
  });

  it.each([
    ["{broken", {}, 400], [{ ...input, hostId: "spoof" }, {}, 400], [{ ...input, confirm: false }, {}, 400],
    [input, { origin: "https://evil.invalid" }, 403], [input, { "content-type": "text/plain" }, 415],
    [input, { "Idempotency-Key": "" }, 400], ["x".repeat(24_577), {}, 413],
  ])("HTTP rejects invalid request (%s)", async (body, extra, code) => {
    const f = fixture();
    const response = await companionPublicationResponse(request("POST", body, extra as Record<string, string>), "trip", f.deps);
    expect(response.status).toBe(code); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ success: false, operationStatus: "FAILED" });
    expect(f.publication).toBeNull();
  });

  it("HTTP reads/preview use ordinary envelopes, no idempotency write; missing public is 404", async () => {
    const f = fixture();
    const preview = await companionPreviewResponse(request("POST", draft), "trip", f.deps);
    expect(preview.status).toBe(200); expect(await preview.json()).toEqual({ success: true, data: { introduction: publicCompanionFixture.introduction } });
    expect(f.database.$transaction).not.toHaveBeenCalled();
    const context = await companionPublicationResponse(request("GET"), "trip", f.deps);
    expect(await context.json()).toEqual({ success: true, data: companionFormFixture });
    const missing = await publicCompanionResponse(request("GET"), "missing", f.deps.database);
    expect(missing.status).toBe(404); expect(await missing.json()).toMatchObject({ error: { code: "COMPANION_NOT_FOUND" } });
  });

  it("read technical errors stay errors and publish uncertainty stays UNKNOWN", async () => {
    const f = fixture(), log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      f.database.tripCompanionPublication.findUnique.mockRejectedValue(new Error("fixture DB error"));
      expect((await publicCompanionResponse(request("GET"), "id", f.deps.database)).status).toBe(500);
      f.database.idempotencyRecord.findUnique.mockRejectedValue(new Error("fixture lookup unavailable"));
      const response = await companionPublicationResponse(request("POST", input), "trip", f.deps);
      expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ operationStatus: "UNKNOWN" });
      expect(f.database.$transaction).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
