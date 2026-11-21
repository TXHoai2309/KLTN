import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type { TripValidation } from "../trip-validation/trip-validation";
import { buildGroundedAdvice, isJourneyQuestion } from "./ai-workspace-plan";
import type { EditCandidate } from "./edit-candidate";
import { composeGroundedAdviceWithFallback, type VerifiedAdvisoryFacts } from "./saved-trip-advisory";

const facts = { topic: "GENERAL", overallStatus: "PASS" } as VerifiedAdvisoryFacts;
const question = "tôi di chuyển bắt đầu từ đâu lúc mấy giờ nhỉ";

function compose(complete: () => Promise<{ rawText: string; model: string }>) {
  return composeGroundedAdviceWithFallback({
    message: question,
    facts,
    fallbackText: "FALLBACK",
    knownDestinationIds: new Set(["cmiw57x910008q67gi5dkj4xj"]),
    llm: { complete },
  });
}

function events(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

afterEach(() => vi.restoreAllMocks());

describe("Phase A composer observability", () => {
  it.each([
    ["a provider timeout", async () => { throw new PreferenceExtractionError("PROVIDER_TIMEOUT", true); }, "PROVIDER:PROVIDER_TIMEOUT"],
    ["a leaked internal id", async () => ({ rawText: JSON.stringify({ advice: "Xem điểm cmiw57x910008q67gi5dkj4xj nhé bạn." }), model: "m" }), "FACT_GUARD:LEAKED_ID"],
    ["an off-schema answer", async () => ({ rawText: JSON.stringify({ text: "x" }), model: "m" }), "SCHEMA_INVALID"],
    ["non-JSON output", async () => ({ rawText: "not json", model: "m" }), "INVALID_JSON"],
  ])("logs why it fell back on %s without logging the conversation", async (_label, complete, reason) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(compose(complete)).resolves.toBe("FALLBACK");

    expect(events(info)).toContainEqual(expect.objectContaining({ event: "trip_assistant", stage: "COMPOSER", outcome: "FALLBACK", reason }));
    expect(JSON.stringify(info.mock.calls)).not.toContain("bắt đầu từ đâu");
  });

  it("returns and logs model prose when it passes the fact guard", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const answer = "Bạn khởi hành từ Hà Nội lúc 06:30 và dự kiến tới điểm đầu lúc 13:04.";

    await expect(compose(async () => ({ rawText: JSON.stringify({ advice: answer }), model: "m" }))).resolves.toBe(answer);
    expect(events(info)).toContainEqual(expect.objectContaining({ stage: "COMPOSER", outcome: "MODEL", reason: null }));
  });
});

describe("Phase A fallback answers the journey question first", () => {
  const validation: TripValidation = {
    timeReference: "2026-11-20T00:00:00.000Z",
    groups: {
      openingHours: { status: "SATISFIED", findings: [] },
      minimumDuration: { status: "SATISFIED", findings: [] },
      travelTime: { status: "SATISFIED", findings: [] },
      scheduleConflict: { status: "SATISFIED", findings: [] },
    },
    canConfirm: true,
  };
  const candidate: EditCandidate = {
    startDate: "2026-11-29",
    durationDays: 1,
    transport: "CAR",
    days: [{ dayIndex: 1, visits: [{ visitId: "v1", destinationId: "d1", startMinute: 784, plannedDurationMinutes: 60, order: 1 }] }],
    journey: {
      origin: { label: "Hà Nội", latitude: 21, longitude: 105.8, source: "MANUAL", confirmed: true },
      departureMinute: 390,
      returnDeadlineMinute: 1200,
      returnDepartureMinute: null,
    },
  } as EditCandidate;

  it("recognizes departure/return questions", () => {
    expect(isJourneyQuestion(question)).toBe(true);
    expect(isJourneyQuestion("Mấy giờ thì về tới nhà?")).toBe(true);
    expect(isJourneyQuestion("Ngày 2 có gấp quá không?")).toBe(false);
  });

  it("names the origin and departure time on the first line", () => {
    const text = buildGroundedAdvice({
      candidate,
      placeNames: new Map([["d1", "Cột cờ Lũng Cú"]]),
      validation,
      journeySummary: { estimatedArrivalAtFirstMinute: 784, estimatedReturnArrivalMinute: 1176, returnDeadlineMinute: 1200 } as never,
      journeyFirst: true,
    });

    expect(text.split("\n\n")[0]).toBe(
      "Lộ trình xuất phát/trở về: khởi hành từ Hà Nội lúc 06:30; dự kiến tới điểm đầu lúc 13:04; về tới nơi xuất phát lúc 19:36 (hạn về 20:00).",
    );
  });
});
