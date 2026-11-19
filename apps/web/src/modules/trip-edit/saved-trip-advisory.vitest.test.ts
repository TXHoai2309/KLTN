import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { requestAiTripEdit } from "@/lib/trip-edit-client";
import { aiEditResponse, type AiEditHttpDependencies } from "./ai-edit-http";
import { createAiEditProposal } from "./ai-edit-service";
import type { WorkspacePlanModelOutput } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";
import { isGroundedAdviceTextSafe, type VerifiedAdvisoryFacts } from "./saved-trip-advisory";

const revision = new Date("2026-10-15T12:00:00.000Z");
const timeReference = new Date("2026-10-16T10:00:00.000Z");

const advisedPlanOutput = (dayIndex: number | null = 1): WorkspacePlanModelOutput => ({
  mode: "ADVISED",
  operations: [],
  originClocks: {
    departureTime: null,
    returnDeadlineTime: null,
    returnDepartureTime: null,
    rescheduleDayOne: false,
  },
  adviceFocus: {
    dayIndex,
    topic: "TRAVEL_TIME",
  },
  candidateVisitIds: [],
  candidateDestinationIds: [],
  affected: {
    visitIds: [],
    dayIndexes: dayIndex ? [dayIndex] : [1],
  },
  clarificationReason: null,
});

function createConflictFixture() {
  const fullOpen = [
    {
      dayOfWeek: "TUESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }],
    },
    {
      dayOfWeek: "WEDNESDAY" as const,
      status: "OPEN" as const,
      intervals: [{ opensAtMinute: 360, closesAtMinute: 1200 }],
    },
  ];

  const catalog = [
    {
      id: "dest-1",
      name: "Cổng Trời Quản Bạ",
      area: "Quản Bạ",
      category: "SCENIC",
      latitude: 23.07,
      longitude: 104.99,
      suggestedDurationMinutes: 60,
      minimumDurationMinutes: 30,
      isOutdoor: true,
      openingDays: fullOpen,
    },
    {
      id: "dest-2",
      name: "Dinh Thự Vua Mèo",
      area: "Đồng Văn",
      category: "HERITAGE",
      latitude: 23.26,
      longitude: 105.22,
      suggestedDurationMinutes: 90,
      minimumDurationMinutes: 30,
      isOutdoor: false,
      openingDays: fullOpen,
    },
  ];

  const tripRow = {
    id: "trip-adv-1",
    userId: "owner-1",
    startDate: new Date("2026-10-20T00:00:00.000Z"),
    durationDays: 1,
    transport: "CAR" as const,
    updatedAt: revision,
    manuallyCompletedAt: null,
    journeySnapshot: null,
    days: [
      {
        dayIndex: 1,
        visits: [
          {
            id: "visit-1",
            order: 1,
            startMinute: 480,
            plannedDurationMinutes: 60,
            externalPlace: null,
            destination: {
              id: "dest-1",
              name: "Cổng Trời Quản Bạ",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
          {
            id: "visit-2",
            order: 2,
            startMinute: 550, // Only 10m gap while route needs 30m -> travelTime VIOLATION
            plannedDurationMinutes: 90,
            externalPlace: null,
            destination: {
              id: "dest-2",
              name: "Dinh Thự Vua Mèo",
              visibility: "VISIBLE",
              deletedAt: null,
            },
          },
        ],
      },
    ],
  };

  const database = {
    user: { findUnique: async () => ({ id: "owner-1", role: "TRAVELER" }) },
    trip: {
      findFirst: async () => tripRow,
    },
    destination: {
      findMany: async () => catalog,
    },
  };

  const draftWithViolation: EditCandidate = {
    startDate: "2026-10-20",
    durationDays: 1,
    transport: "CAR",
    days: [
      {
        dayIndex: 1,
        visits: [
          { visitId: "visit-1", destinationId: "dest-1", startMinute: 480, plannedDurationMinutes: 60, order: 1 },
          { visitId: "visit-2", destinationId: "dest-2", startMinute: 550, plannedDurationMinutes: 90, order: 2 },
        ],
      },
    ],
  };

  return { database, draftWithViolation };
}

describe("Saved-trip assistant Ticket 02: 2-step grounded advisory & actionable suggestion cards", () => {
  it("runs Step 1 dry-run remedies through getRoute + Validator, composes natural Step 2 advice without mutating draft", async () => {
    const { database, draftWithViolation } = createConflictFixture();
    const originalSnapshot = JSON.stringify(draftWithViolation);
    const routeSpy = vi.fn(async () => ({
      kind: "ok" as const,
      durationSeconds: 1800,
      distanceMeters: 22000,
    }));

    let callCount = 0;
    let capturedComposerUserPayload: { verifiedFacts?: VerifiedAdvisoryFacts } = {};
    const llm = {
      complete: async ({ user }: { system: string; user: string }) => {
        callCount += 1;
        if (callCount === 1) {
          return { rawText: JSON.stringify(advisedPlanOutput(1)), model: "fake-step-1" };
        }
        capturedComposerUserPayload = JSON.parse(user) as { verifiedFacts?: VerifiedAdvisoryFacts };
        return {
          rawText: JSON.stringify({
            advice:
              "Ngày 1 hiện có 2 điểm từ 08:00 đến 10:40, nhưng chặng từ Cổng Trời Quản Bạ sang Dinh Thự Vua Mèo cần khoảng 30 phút di chuyển (lịch hiện tại chỉ chừa 10 phút). Mình đã mô phỏng sẵn phương án dời Dinh Thự Vua Mèo sang 09:40 để khớp thời gian di chuyển — bạn có thể bấm áp dụng ngay bên dưới.",
          }),
          model: "fake-step-2",
        };
      },
    };

    const result = await createAiEditProposal(
      "trip-adv-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Tôi đi thế này được không?",
        draft: draftWithViolation,
      },
      {
        database: database as unknown as Database,
        llm,
        getRoute: routeSpy,
      },
      timeReference,
    );

    expect(callCount).toBe(2);
    expect(result.status).toBe("ADVISED");
    if (result.status !== "ADVISED") return;

    // Draft remains untouched because advisory is read-only
    expect(JSON.stringify(draftWithViolation)).toBe(originalSnapshot);
    expect(result.validation.groups.travelTime.status).toBe("VIOLATION");
    expect(result.advice).toContain("30 phút di chuyển");
    expect(result.advice).toContain("09:40");
    expect(capturedComposerUserPayload.verifiedFacts?.overallStatus).toBe("VIOLATION");
    expect(capturedComposerUserPayload.verifiedFacts?.suggestions.length).toBeGreaterThanOrEqual(1);

    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThanOrEqual(1);
    expect(result.suggestions!.length).toBeLessThanOrEqual(2);
    const card = result.suggestions![0]!;
    expect(card.validation.groups.travelTime.status).toBe("SATISFIED");
    expect(card.candidate.days[0]!.visits[1]!.startMinute).toBe(570);
    expect(card.diffSummaryLines.some((l) => l.includes("09:30") || l.includes("Dinh Thự Vua Mèo"))).toBe(true);
    expect(routeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to deterministic server summary when Step 2 composer fails, times out, or returns invalid output, while keeping suggestions", async () => {
    const { database, draftWithViolation } = createConflictFixture();
    let callCount = 0;
    const failingComposerLlm = {
      complete: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { rawText: JSON.stringify(advisedPlanOutput(1)), model: "fake-step-1" };
        }
        throw new Error("Simulated OpenAI timeout");
      },
    };

    const result = await createAiEditProposal(
      "trip-adv-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Kiểm tra giúp mình lịch Ngày 1",
        draft: draftWithViolation,
      },
      {
        database: database as unknown as Database,
        llm: failingComposerLlm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 22000 }),
      },
      timeReference,
    );

    expect(result.status).toBe("ADVISED");
    if (result.status !== "ADVISED") return;
    expect(result.advice).toContain("Ngày 1");
    expect(result.advice).toContain("Không đủ thời gian di chuyển");
    expect(result.suggestions?.length).toBeGreaterThanOrEqual(1);
  });

  it("enforces Deterministic Fact Guard against false PASS claims, fake IDs, URLs, and absolute safety promises", async () => {
    const { database, draftWithViolation } = createConflictFixture();
    const baseFacts: VerifiedAdvisoryFacts = {
      focusDayIndex: 1,
      topic: "TRAVEL_TIME",
      overallStatus: "VIOLATION",
      totalVisits: 2,
      durationDays: 1,
      totalVerifiedDriveMinutes: 30,
      totalVerifiedDistanceKm: 22,
      unknownLegCount: 0,
      days: [],
      findings: [{ group: "travelTime", status: "VIOLATION", message: "Thiếu 20 phút di chuyển." }],
      journey: null,
      weatherAndSun: [],
      suggestions: [],
    };
    const knownIds = new Set(["cmiw57x910008q67gi5dkj4xj"]);

    expect(isGroundedAdviceTextSafe("Lịch trình này hoàn toàn hợp lệ và sẵn sàng lưu ngay.", baseFacts, knownIds)).toBe(false);
    expect(isGroundedAdviceTextSafe("Trạng thái đạt PASS rồi nhé.", baseFacts, knownIds)).toBe(false);
    expect(isGroundedAdviceTextSafe("Đi trời này đảm bảo an toàn tuyệt đối cho cả đoàn.", { ...baseFacts, overallStatus: "PASS" }, knownIds)).toBe(false);
    expect(isGroundedAdviceTextSafe("Xem chi tiết điểm cmiw57x910008q67gi5dkj4xj nhé.", { ...baseFacts, overallStatus: "PASS" }, knownIds)).toBe(false);
    expect(isGroundedAdviceTextSafe("Xem bản đồ tại https://evil.test nhé.", { ...baseFacts, overallStatus: "PASS" }, knownIds)).toBe(false);

    // End-to-end check: Step 2 outputs a false PASS claim -> service rejects & uses fallback
    let call = 0;
    const lyingLlm = {
      complete: async () => {
        call += 1;
        if (call === 1) return { rawText: JSON.stringify(advisedPlanOutput(1)), model: "step-1" };
        return {
          rawText: JSON.stringify({ advice: "Mọi kiểm tra đều đạt, lịch trình hoàn toàn hợp lệ và đạt PASS!" }),
          model: "step-2",
        };
      },
    };
    const res = await createAiEditProposal(
      "trip-adv-1",
      "owner-1",
      {
        baseRevision: revision.toISOString(),
        message: "Đánh giá lịch Ngày 1 giúp mình",
        draft: draftWithViolation,
      },
      {
        database: database as unknown as Database,
        llm: lyingLlm,
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 22000 }),
      },
      timeReference,
    );

    expect(res.status).toBe("ADVISED");
    if (res.status !== "ADVISED") return;
    expect(res.advice).not.toContain("đạt PASS");
    expect(res.advice).not.toContain("hoàn toàn hợp lệ");
    expect(res.advice).toContain("Không đủ thời gian di chuyển");
  });

  it("exposes suggestions cleanly over HTTP with private, no-store headers and passes requestAiTripEdit client schema", async () => {
    const { database, draftWithViolation } = createConflictFixture();
    let call = 0;
    const deps: AiEditHttpDependencies = {
      authorization: {
        database: database as unknown as Pick<Database, "user">,
        resolveSession: async () => ({ user: { id: "owner-1", role: "TRAVELER" } }),
      },
      service: {
        database: database as unknown as Database,
        llm: {
          complete: async () => {
            call += 1;
            if (call === 1) return { rawText: JSON.stringify(advisedPlanOutput(1)), model: "step-1" };
            return {
              rawText: JSON.stringify({
                advice: "Ngày 1 đang thiếu thời gian di chuyển sang Dinh Thự Vua Mèo. Bạn có thể bấm phương án dời giờ bên dưới.",
              }),
              model: "step-2",
            };
          },
        },
        getRoute: async () => ({ kind: "ok", durationSeconds: 1800, distanceMeters: 22000 }),
      },
      now: () => new Date(timeReference),
    };

    const req = new Request("https://example.test/api/trips/trip-adv-1/edits/ai", {
      method: "POST",
      headers: {
        origin: "https://example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        baseRevision: revision.toISOString(),
        message: "Chuyến này đi ổn không?",
        draft: draftWithViolation,
      }),
    });

    const httpRes = await aiEditResponse(req, "trip-adv-1", deps);
    expect(httpRes.status).toBe(200);
    expect(httpRes.headers.get("cache-control")).toBe("private, no-store");
    const payload = (await httpRes.json()) as {
      success: boolean;
      data: { status: string; advice: string; suggestions?: unknown[] };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe("ADVISED");
    expect(Array.isArray(payload.data.suggestions)).toBe(true);
    expect(payload.data.suggestions!.length).toBeGreaterThanOrEqual(1);

    // Client parser accepts payload cleanly through requestAiTripEdit
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      const outcome = await requestAiTripEdit("trip-adv-1", {
        baseRevision: revision.toISOString(),
        message: "Chuyến này đi ổn không?",
        draft: draftWithViolation,
      });
      expect(outcome.kind).toBe("RESULT");
      if (outcome.kind === "RESULT" && outcome.result.status === "ADVISED") {
        expect(outcome.result.suggestions?.length).toBe(payload.data.suggestions?.length);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
