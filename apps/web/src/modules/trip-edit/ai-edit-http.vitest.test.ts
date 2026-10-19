import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type { EditIntentModelOutput } from "./edit-intent-contract";
import { aiEditResponse, type AiEditHttpDependencies } from "./ai-edit-http";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");

function output(): EditIntentModelOutput {
  return {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
    affected: { visitIds: ["visit-1"], dayIndexes: [1] },
    needsClarification: false,
    clarificationReason: null,
  };
}

function fixture() {
  let role = "TRAVELER";
  let sessionExists = true;
  let tripExists = true;
  let bodyRead = false;
  let tripReadCount = 0;
  let providerCalls = 0;
  let modelOutput = output();
  const user = { findUnique: async () => ({ id: "owner-1", role }) };
  const database = {
    user,
    trip: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        tripReadCount += 1;
        if (!tripExists || where.id !== "trip-1" || where.userId !== "owner-1") return null;
        return {
          id: "trip-1",
          userId: "owner-1",
          startDate: new Date("2026-10-20T00:00:00.000Z"),
          durationDays: 1,
          transport: "CAR",
          updatedAt: revision,
          days: [{
            dayIndex: 1,
            visits: [{
              id: "visit-1",
              order: 1,
              startMinute: 480,
              plannedDurationMinutes: 60,
              destination: { id: "destination-1", name: "Điểm A", visibility: "VISIBLE" },
            }],
          }],
        };
      },
    },
    destination: {
      findMany: async () => [{
        id: "destination-1",
        name: "Điểm A",
        suggestedDurationMinutes: 60,
        latitude: 23,
        longitude: 105,
        minimumDurationMinutes: 30,
        openingDays: [{
          dayOfWeek: "TUESDAY",
          status: "OPEN",
          intervals: [{ opensAtMinute: 0, closesAtMinute: 1440 }],
        }],
      }],
    },
  };
  const dependencies: AiEditHttpDependencies = {
    authorization: {
      database: database as unknown as Pick<Database, "user">,
      resolveSession: async () => sessionExists ? { user: { id: "owner-1", role } } : null,
    },
    service: {
      database: database as unknown as Database,
      llm: {
        complete: async () => {
          providerCalls += 1;
          return { rawText: JSON.stringify(modelOutput), model: "fake-model" };
        },
      },
      getRoute: async () => ({ kind: "ok", durationSeconds: 0 }),
      createVisitId: () => "visit-new",
    },
    now: () => new Date(timeReference),
    onBodyRead: () => { bodyRead = true; },
  };
  return {
    dependencies,
    get bodyRead() { return bodyRead; },
    get tripReadCount() { return tripReadCount; },
    get providerCalls() { return providerCalls; },
    setRole: (nextRole: string) => { role = nextRole; },
    removeSession: () => { sessionExists = false; },
    removeTrip: () => { tripExists = false; },
    setOutput: (next: EditIntentModelOutput) => { modelOutput = next; },
    failProvider: (error: Error) => {
      dependencies.service.llm = { complete: async () => { throw error; } };
    },
  };
}

function postRequest(body: string): Request {
  return new Request("https://example.test/api/trips/trip-1/edits/ai", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body,
  });
}

const body = JSON.stringify({ baseRevision: revision.toISOString(), message: "Đổi giờ điểm A" });

describe("aiEditResponse", () => {
  it.each([
    ["Guest", (test: ReturnType<typeof fixture>) => test.removeSession(), 401, "UNAUTHENTICATED"],
    ["Admin", (test: ReturnType<typeof fixture>) => test.setRole("ADMIN"), 403, "FORBIDDEN"],
  ] as const)("rejects %s before reading body or querying Trip", async (_role, configure, status, code) => {
    const test = fixture();
    configure(test);

    const response = await aiEditResponse(postRequest("{"), "trip-1", test.dependencies);
    const payload = await response.json();

    expect(response.status).toBe(status);
    expect(payload.error.code).toBe(code);
    expect(test.bodyRead).toBe(false);
    expect(test.tripReadCount).toBe(0);
    expect(test.providerCalls).toBe(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects extra request fields before accessing Trip or provider", async () => {
    const test = fixture();
    const response = await aiEditResponse(
      postRequest(JSON.stringify({
        baseRevision: revision.toISOString(),
        message: "Đổi giờ điểm A",
        candidate: {},
      })),
      "trip-1",
      test.dependencies,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(test.tripReadCount).toBe(0);
    expect(test.providerCalls).toBe(0);
  });

  it("returns an owner-scoped proposal without writing", async () => {
    const test = fixture();
    const response = await aiEditResponse(postRequest(body), "trip-1", test.dependencies);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      data: {
        status: "PROPOSED",
        candidate: { days: [{ visits: [{ visitId: "visit-1", startMinute: 540 }] }] },
        validation: {
          canConfirm: true,
          groups: {
            openingHours: { status: "SATISFIED" },
            minimumDuration: { status: "SATISFIED" },
            travelTime: { status: "SATISFIED" },
            scheduleConflict: { status: "SATISFIED" },
          },
        },
      },
    });
    expect(test.bodyRead).toBe(true);
    expect(test.tripReadCount).toBe(2);
    expect(test.providerCalls).toBe(1);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns code-generated clarification and accepts a revalidated choice on a new request", async () => {
    const test = fixture();
    test.setOutput({
      ...output(),
      needsClarification: true,
      clarificationReason: "AMBIGUOUS_TARGET",
    });
    const clarifyResponse = await aiEditResponse(postRequest(body), "trip-1", test.dependencies);
    const clarificationPayload = await clarifyResponse.json();

    expect(clarificationPayload.data).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      reason: "AMBIGUOUS_TARGET",
      clarification: {
        code: "AMBIGUOUS_TARGET",
        prompt: "Bạn muốn chỉnh sửa lượt ghé nào? Chọn một điểm trong hành trình.",
        choices: [{ label: "Điểm A · Ngày 1 · 08:00", resolution: { selectedVisitId: "visit-1" } }],
      },
    });
    expect(clarificationPayload.data).not.toHaveProperty("candidate");

    const resolvedResponse = await aiEditResponse(
      postRequest(JSON.stringify({
        baseRevision: revision.toISOString(),
        message: "Đổi giờ điểm A",
        resolution: { selectedVisitId: "visit-1" },
      })),
      "trip-1",
      test.dependencies,
    );
    expect(resolvedResponse.status).toBe(200);
    expect((await resolvedResponse.json()).data).toMatchObject({
      status: "PROPOSED",
      candidate: { days: [{ visits: [{ visitId: "visit-1", startMinute: 540 }] }] },
    });
  });

  it("rejects a submitted resolution that is not a verified server choice", async () => {
    const test = fixture();
    test.setOutput({
      ...output(),
      needsClarification: true,
      clarificationReason: "AMBIGUOUS_TARGET",
    });
    const response = await aiEditResponse(
      postRequest(JSON.stringify({
        baseRevision: revision.toISOString(),
        message: "Đổi giờ điểm A",
        resolution: { selectedVisitId: "foreign-visit" },
      })),
      "trip-1",
      test.dependencies,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the same 404 for a Trip that is missing or owned by someone else", async () => {
    const foreign = fixture();
    foreign.setRole("TRAVELER");
    const foreignDependencies = {
      ...foreign.dependencies,
      authorization: {
        database: {
          user: { findUnique: async () => ({ id: "another-user", role: "TRAVELER" }) },
        } as unknown as Pick<Database, "user">,
        resolveSession: async () => ({ user: { id: "another-user", role: "TRAVELER" } }),
      },
    };
    const foreignResponse = await aiEditResponse(postRequest(body), "trip-1", foreignDependencies);

    const missing = fixture();
    missing.removeTrip();
    const missingResponse = await aiEditResponse(postRequest(body), "trip-1", missing.dependencies);

    expect(foreignResponse.status).toBe(404);
    expect((await foreignResponse.json()).error.code).toBe("TRIP_NOT_FOUND");
    expect(missingResponse.status).toBe(404);
    expect((await missingResponse.json()).error.code).toBe("TRIP_NOT_FOUND");
  });

  it("maps typed provider failures to an AI-only safe response without logging raw errors", async () => {
    const test = fixture();
    test.failProvider(new PreferenceExtractionError("PROVIDER_TIMEOUT", true));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await aiEditResponse(postRequest(body), "trip-1", test.dependencies);
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.error.code).toBe("AI_UNAVAILABLE");
      expect(payload.error.message).toContain("chỉnh sửa thủ công");
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("does not call the provider when the revision is stale", async () => {
    const test = fixture();
    const response = await aiEditResponse(
      postRequest(JSON.stringify({ ...JSON.parse(body), baseRevision: "2026-10-14T12:00:00.000Z" })),
      "trip-1",
      test.dependencies,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("TRIP_REVISION_CONFLICT");
    expect(test.providerCalls).toBe(0);
  });
});
