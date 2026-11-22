import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";
import { changeOriginSelection, missingJourneyFields, originSelectionSchema, tripJourneySchema } from "./trip-origin-contract";
import { COMPLETE_JOURNEY_FIXTURE, MISSING_JOURNEY_FIXTURE, ORIGIN_FIXTURES } from "./trip-origin-fixtures";
import { assertJourneyCoverage, assertJourneyReady } from "./trip-origin-service";
import { vietnamCoverageAt } from "./vietnam-coverage";
import { validateOriginResponse } from "./trip-origin-http";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { checkTripRequirement } from "../trip-requirement/trip-requirement-check";
import { draftFromFormFields, draftToCandidate, applyFieldEdit, updateDraftJourney, clearField, confirmDraft } from "../trip-requirement/trip-requirement-review";
import { evaluateTripRequirement } from "../trip-requirement/trip-requirement-readiness";
import { toTripProposal } from "../trip-planner/planner-save-adapter";
import { saveTrip, type TripSaveDependencies } from "../trip-save/trip-save-service";
import { tripSaveRequestSchema } from "../trip-save/trip-save-contract";
import { evaluateTripRequirementResponse } from "../trip-requirement/trip-requirement-http";
import { checkTripRequirementResponse } from "../trip-requirement/trip-requirement-check-http";
import { assertTripRequirementClear } from "../trip-requirement/trip-clarification-server";
import type { PlannerResult } from "../trip-planner/planner-contract";

const now = new Date("2026-11-04T00:00:00Z");
const requirement = { durationDays: 1, transport: "CAR", startDate: "2026-11-10", journey: COMPLETE_JOURNEY_FIXTURE };
function auth(role: string | null = "TRAVELER") {
  return { database: { user: { findUnique: vi.fn(async () => ({ id: "owner", role })) } } as unknown as Database, resolveSession: vi.fn(async () => role === null ? null : { user: { id: "owner" } }) };
}
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://example.test/api/trip-origins/validate", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("origin-v1 coverage and contract", () => {
  it("uses polygon evidence for mainland/island and rejects neighbours within the country's rectangle", () => {
    for (const point of [{ latitude: 21.028511, longitude: 105.804817 }, { latitude: 22.8233, longitude: 104.9836 }, { latitude: 10.22, longitude: 103.96 }, { latitude: 10.7769, longitude: 106.7009 }]) expect(vietnamCoverageAt(point)).toBe("SUPPORTED");
    for (const point of [{ latitude: 20, longitude: 102 }, { latitude: 11.56, longitude: 104.92 }, { latitude: 18, longitude: 108 }, { latitude: 23, longitude: 108 }]) expect(vietnamCoverageAt(point)).toBe("OUTSIDE");
    expect(vietnamCoverageAt({ latitude: NaN, longitude: 105 })).toBe("UNKNOWN");
    expect(vietnamCoverageAt({ latitude: 8.413098319000028, longitude: 104.861487093000051 })).toBe("UNKNOWN");
  });
  it("normalizes labels, preserves unknown clocks and invalidates confirmation on every selection edit", () => {
    const selected = originSelectionSchema.parse(ORIGIN_FIXTURES.confirmed);
    expect(selected.label).toBe("Hà Nội");
    expect(changeOriginSelection(selected, { longitude: 105.81 }).confirmed).toBe(false);
    expect(changeOriginSelection(selected, { label: "Đã sửa" }).confirmed).toBe(false);
    expect(tripJourneySchema.parse({})).toEqual(MISSING_JOURNEY_FIXTURE);
    expect(originSelectionSchema.safeParse(ORIGIN_FIXTURES.invalid).success).toBe(false);
    expect(tripJourneySchema.safeParse({ departureMinute: 1440 }).success).toBe(false);
    expect(tripJourneySchema.safeParse({ departureMinute: "06:00" }).success).toBe(false);
    expect(tripJourneySchema.safeParse({ departureMinute: 0.5 }).success).toBe(false);
    expect(tripJourneySchema.parse({ departureMinute: 0 }).departureMinute).toBe(0);
    expect(missingJourneyFields(COMPLETE_JOURNEY_FIXTURE)).toEqual([]);
    expect(missingJourneyFields(COMPLETE_JOURNEY_FIXTURE, true)).toEqual(["returnDepartureMinute"]);
  });
  it("distinguishes incomplete, outside and uncertain input without authorizing a save", () => {
    expect(() => assertJourneyReady(MISSING_JOURNEY_FIXTURE)).toThrowError(expect.objectContaining({ code: "TRIP_JOURNEY_REQUIRED" }));
    expect(() => assertJourneyReady({ ...COMPLETE_JOURNEY_FIXTURE, origin: ORIGIN_FIXTURES.unconfirmed })).toThrowError(expect.objectContaining({ code: "TRIP_JOURNEY_REQUIRED" }));
    expect(() => assertJourneyCoverage({ ...COMPLETE_JOURNEY_FIXTURE, origin: ORIGIN_FIXTURES.outside })).toThrowError(expect.objectContaining({ code: "ORIGIN_OUTSIDE_VIETNAM" }));
    expect(() => assertJourneyReady(COMPLETE_JOURNEY_FIXTURE)).not.toThrow();
    const unknown = { ...COMPLETE_JOURNEY_FIXTURE, origin: { ...ORIGIN_FIXTURES.confirmed, latitude: 8.413098319000028, longitude: 104.861487093000051 } };
    expect(() => assertJourneyCoverage(unknown)).toThrowError(expect.objectContaining({ code: "ORIGIN_COVERAGE_UNKNOWN" }));
    expect(() => assertTripRequirementClear({ ...requirement, journey: { ...COMPLETE_JOURNEY_FIXTURE, origin: ORIGIN_FIXTURES.outside } }, now)).toThrowError(expect.objectContaining({ code: "ORIGIN_OUTSIDE_VIETNAM" }));
  });
  it("retains additive input compatibility and preliminary planning while requiring journey for final input readiness", () => {
    const legacyShape = tripRequirementInputSchema.parse({ durationDays: 1, transport: "CAR", startDate: "2026-11-10" });
    expect(legacyShape).not.toHaveProperty("journey");
    expect(evaluateTripRequirement(legacyShape, now)).toMatchObject({ preliminary: true, finalConfirmation: false });
    expect(checkTripRequirement(requirement, now)).toMatchObject({ confirmable: true, requirement: { journey: COMPLETE_JOURNEY_FIXTURE } });
    expect(evaluateTripRequirement(tripRequirementInputSchema.parse(requirement), now).finalConfirmation).toBe(true);
  });
  it("preserves journey through review, unrelated edits, canonical normalization and proposal conversion", () => {
    const original = draftFromFormFields({ startDate: "2026-11-10", durationDays: "1", transport: "CAR", companionType: "", companionGroupSize: "", interests: [], pace: "", mobilityFlags: [], mobilityNote: "" });
    const changed = updateDraftJourney(original, COMPLETE_JOURNEY_FIXTURE);
    expect(changed.confirmation.state).toBe("NOT_CONFIRMED");
    const edited = applyFieldEdit(changed.draft, "durationDays", "2", now);
    expect(draftToCandidate(edited.draft).journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
    expect(draftToCandidate(clearField(changed.draft, "pace")).journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
    const checked = checkTripRequirement(draftToCandidate(changed.draft), now);
    expect(confirmDraft(changed.draft, checked, now).confirmation.snapshot?.requirement.journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
    // Adapter only consumes requirement + days; full planner fixtures live in its suite.
    const proposal = { requirement: tripRequirementInputSchema.parse(requirement), days: [] } as unknown as PlannerResult;
    expect(toTripProposal(proposal).journey).toEqual(COMPLETE_JOURNEY_FIXTURE);
  });
});

describe("origin validation HTTP", () => {
  it.each([evaluateTripRequirementResponse, checkTripRequirementResponse])("enforces coverage at existing requirement HTTP boundaries %#", async respond => {
    const deps = { authorization: auth(), now: () => now };
    const response = await respond(request(requirement), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { requirement: { journey: COMPLETE_JOURNEY_FIXTURE } } });
    const rejected = await respond(request({ ...requirement, journey: { ...COMPLETE_JOURNEY_FIXTURE, origin: ORIGIN_FIXTURES.outside } }), deps);
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ error: { code: "ORIGIN_OUTSIDE_VIETNAM" } });
  });
  it.each(["TRAVELER", "ADMIN"])("allows %s and returns sanitized attribution with private-no-store", async role => {
    const response = await validateOriginResponse(request({ origin: ORIGIN_FIXTURES.confirmed }), auth(role));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ success: true, data: { revision: "origin-v1", origin: { label: "Hà Nội", confirmed: true }, coverage: { status: "SUPPORTED", license: "CC-BY-4.0" } } });
  });
  it("rejects Guest before touching the body, including malformed input", async () => {
    const req = request({});
    const spy = vi.spyOn(req, "text");
    expect((await validateOriginResponse(req, auth(null))).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and oversized input; never trusts a country/owner/coverage claim", async () => {
    expect((await validateOriginResponse(request({}, { origin: "https://other.test" }), auth())).status).toBe(403);
    expect((await validateOriginResponse(request({ origin: { ...ORIGIN_FIXTURES.confirmed, country: "vn" } }), auth())).status).toBe(400);
    expect((await validateOriginResponse(request({ origin: ORIGIN_FIXTURES.outside }), auth())).status).toBe(422);
    expect((await validateOriginResponse(request({ origin: { ...ORIGIN_FIXTURES.confirmed, label: "x".repeat(5000) } }), auth())).status).toBe(413);
  });
});

describe("new official Save rollout gates", () => {
  it.each([undefined, null, MISSING_JOURNEY_FIXTURE])("blocks bypass by direct service payload %# before route or database writes", async journey => {
    const dependencies = { ...auth(), getRoute: vi.fn(), database: { ...auth().database, idempotencyRecord: { findUnique: async () => null }, $transaction: vi.fn() } } as unknown as TripSaveDependencies;
    const { journey: _omitted, ...base } = requirement;
    const input = tripSaveRequestSchema.parse({ confirm: true, proposal: { ...base, ...(journey === undefined ? {} : { journey }), days: [{ dayIndex: 1, visits: [{ destinationId: "a", startMinute: 600, plannedDurationMinutes: 30, order: 1 }] }] } });
    await expect(saveTrip(new Headers(), input, "origin-save-key", dependencies, now)).rejects.toMatchObject({ code: "TRIP_JOURNEY_REQUIRED" });
    expect(dependencies.getRoute).not.toHaveBeenCalled();
    expect(dependencies.database.$transaction).not.toHaveBeenCalled();
  });
});
