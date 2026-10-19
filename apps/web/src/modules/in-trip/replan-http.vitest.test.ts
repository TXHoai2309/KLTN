import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Database } from "@KLTN/db";

import type { AuthorizationDependencies } from "@/server/authorization/guard";
import type { StructuredLlmClient } from "../preference-extraction/preference-extraction-client";
import { replanResponse } from "./replan-http";
import type { ReplanServiceDependencies } from "./replan-service";

const baseRevision = "2026-10-17T00:00:00.000Z";
const validBody = {
  baseRevision,
  location: {
    source: "MANUAL",
    latitude: 22.8,
    longitude: 104.9,
    accuracyMeters: null,
    capturedAt: "2026-10-17T09:00:00.000Z",
  },
  need: "Đổi kế hoạch buổi tối.",
};

function auth(role: "TRAVELER" | "ADMIN" | null): AuthorizationDependencies {
  return {
    database: {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          role === null ? null : { id: where.id, role },
      },
    } as unknown as Database,
    resolveSession: async () =>
      role === null ? null : { user: { id: "traveler-1", role } },
  };
}

function service(trip: unknown, options: { now?: Date } = {}) {
  let tripReads = 0;
  let providerCalls = 0;
  let destinationReads = 0;
  const database = {
    trip: {
      findFirst: async (query: unknown) => {
        tripReads += 1;
        assert.deepEqual((query as { where: unknown }).where, {
          id: "trip-1",
          userId: "traveler-1",
        });
        return trip;
      },
    },
    destination: {
      findMany: async () => {
        destinationReads += 1;
        return [];
      },
    },
  } as unknown as Database;
  const llm = {
    complete: async () => {
      providerCalls += 1;
      return {
        rawText: JSON.stringify({
          operations: [
            {
              operationType: "CHANGE_TIME",
              targetVisitId: "remaining-1",
              destinationId: null,
              params: { dayIndex: null, position: null, startTime: "21:00", durationMinutes: null },
            },
          ],
          mandatoryEndpoint: null,
          needsClarification: false,
          clarificationReason: null,
        }),
        model: "fake-model",
      };
    },
  } as StructuredLlmClient;
  const dependencies: ReplanServiceDependencies = {
    database,
    llm,
    now: () => options.now ?? new Date("2026-10-17T10:00:00.000Z"),
  };
  return {
    dependencies,
    tripReads: () => tripReads,
    providerCalls: () => providerCalls,
    destinationReads: () => destinationReads,
  };
}

function tripFixture() {
  return {
    id: "trip-1",
    userId: "traveler-1",
    startDate: new Date("2026-10-17T00:00:00.000Z"),
    durationDays: 2,
    transport: "CAR",
    updatedAt: new Date(baseRevision),
    days: [
      {
        dayIndex: 1,
        localDate: new Date("2026-10-17T00:00:00.000Z"),
        visits: [
          {
            id: "completed-1",
            destinationId: "destination-a",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            destination: { id: "destination-a", name: "Đã qua giờ", visibility: "VISIBLE" },
          },
          {
            id: "remaining-1",
            destinationId: "destination-b",
            order: 2,
            startMinute: 1200,
            plannedDurationMinutes: 60,
            destination: { id: "destination-b", name: "Buổi tối", visibility: "VISIBLE" },
          },
        ],
      },
      { dayIndex: 2, localDate: new Date("2026-10-18T00:00:00.000Z"), visits: [] },
    ],
  };
}

function post(body: unknown, contentType = "application/json"): Request {
  return new Request("https://app.example/api/trips/trip-1/in-trip/replan", {
    method: "POST",
    headers: { origin: "https://app.example", "content-type": contentType },
    body: JSON.stringify(body),
  });
}

async function payload(response: Response) {
  return response.json() as Promise<{
    success: boolean;
    data?: { status: string };
    error?: { code: string };
  }>;
}

describe("US36 Task289 replan HTTP boundary", () => {
  it("authenticates before the bounded body reader is reached", async () => {
    for (const [role, status, code] of [
      [null, 401, "UNAUTHENTICATED"],
      ["ADMIN", 403, "FORBIDDEN"],
    ] as const) {
      let bodyRead = false;
      const f = service(tripFixture());
      const response = await replanResponse(post(validBody), "trip-1", {
        authorization: auth(role),
        service: f.dependencies,
        onBodyRead: () => {
          bodyRead = true;
        },
      });
      expect(response.status).toBe(status);
      expect((await payload(response)).error?.code).toBe(code);
      expect(bodyRead).toBe(false);
      expect(f.tripReads()).toBe(0);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("returns an owner-masked 404 for a Trip that the repository does not return", async () => {
    const f = service(null);
    const response = await replanResponse(post(validBody), "trip-1", {
      authorization: auth("TRAVELER"),
      service: f.dependencies,
    });
    expect(response.status).toBe(404);
    expect((await payload(response)).error?.code).toBe("TRIP_NOT_FOUND");
    expect(f.providerCalls()).toBe(0);
  });

  it("returns 409 for stale revision without calling the AI provider", async () => {
    const f = service(tripFixture());
    const response = await replanResponse(
      post({ ...validBody, baseRevision: "2026-10-16T00:00:00.000Z" }),
      "trip-1",
      { authorization: auth("TRAVELER"), service: f.dependencies },
    );
    expect(response.status).toBe(409);
    expect((await payload(response)).error?.code).toBe("TRIP_REVISION_CONFLICT");
    expect(f.providerCalls()).toBe(0);
  });

  it("rejects a client-supplied clock because request fields are strict", async () => {
    const f = service(tripFixture());
    const response = await replanResponse(
      post({ ...validBody, now: "2026-10-19T00:00:00.000Z" }),
      "trip-1",
      { authorization: auth("TRAVELER"), service: f.dependencies },
    );
    expect(response.status).toBe(400);
    expect((await payload(response)).error?.code).toBe("VALIDATION_ERROR");
    expect(f.tripReads()).toBe(0);
  });

  it("returns ALL_COMPLETED without loading destinations or calling the provider", async () => {
    const f = service(tripFixture(), { now: new Date("2026-10-19T00:00:00.000Z") });
    const response = await replanResponse(post(validBody), "trip-1", {
      authorization: auth("TRAVELER"),
      service: f.dependencies,
    });
    expect(response.status).toBe(200);
    expect(await payload(response)).toEqual({ success: true, data: { status: "ALL_COMPLETED" } });
    expect(f.destinationReads()).toBe(0);
    expect(f.providerCalls()).toBe(0);
  });

  it("keeps AI preview sources free of write-path imports", async () => {
    const route = await readFile(
      new URL("../../app/api/trips/[id]/in-trip/replan/route.ts", import.meta.url),
      "utf8",
    );
    const serviceSource = await readFile(new URL("./replan-service.ts", import.meta.url), "utf8");
    expect(route + serviceSource).not.toMatch(/apply-edit|applyEdit|executeIdempotentWrite/u);
    expect(route + serviceSource).not.toMatch(/database\.(?:create|update|delete|upsert)/u);
    expect(route + serviceSource).not.toMatch(
      /console\.(?:log|info|warn|error)|localStorage|sessionStorage|document\.cookie/u,
    );
  });
});
