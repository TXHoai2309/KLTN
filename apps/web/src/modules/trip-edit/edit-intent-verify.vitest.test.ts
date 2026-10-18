import { describe, expect, it } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type { EditIntentModelOutput } from "./edit-intent-contract";
import type { EditIntentPromptServerContext } from "./edit-intent-prompt";
import { verifyEditIntentOutput } from "./edit-intent-verify";

const context: EditIntentPromptServerContext = {
  itinerary: [
    {
      dayIndex: 1,
      visits: [
        {
          visitId: "visit-1",
          destinationName: "Bảo tàng",
          startTime: "09:00",
          durationMinutes: 90,
        },
      ],
    },
    { dayIndex: 2, visits: [] },
  ],
  eligibleDestinations: [{ id: "destination-1", name: "Công viên" }],
};

function output(overrides: Partial<EditIntentModelOutput> = {}): EditIntentModelOutput {
  return {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1"],
    destinationId: null,
    params: {
      dayIndex: null,
      position: null,
      startTime: "10:00",
      durationMinutes: null,
    },
    affected: { visitIds: ["visit-1"], dayIndexes: [1] },
    needsClarification: false,
    clarificationReason: null,
    ...overrides,
  };
}

describe("verifyEditIntentOutput", () => {
  it("returns verified IDs and the exact affected visit/day for valid output", () => {
    expect(verifyEditIntentOutput(output(), context)).toEqual(output());
  });

  it("removes invented visit IDs and requires clarification", () => {
    const result = verifyEditIntentOutput(
      output({ targetVisitIds: ["visit-fake"], affected: { visitIds: ["visit-fake"], dayIndexes: [1] } }),
      context,
    );

    expect(result.targetVisitIds).toEqual([]);
    expect(result.affected.visitIds).toEqual([]);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationReason).toBe("MISSING_TARGET");
  });

  it("removes a destination that is not in the server-provided eligible set", () => {
    const result = verifyEditIntentOutput(
      output({
        intentType: "ADD_VISIT",
        targetVisitIds: [],
        destinationId: "destination-fake",
        params: { dayIndex: 2, position: null, startTime: "10:00", durationMinutes: 60 },
        affected: { visitIds: [], dayIndexes: [2] },
      }),
      context,
    );

    expect(result.destinationId).toBeNull();
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationReason).toBe("AMBIGUOUS_DESTINATION");
  });

  it("drops a day outside the current itinerary and asks for a valid day", () => {
    const result = verifyEditIntentOutput(
      output({
        intentType: "ADD_VISIT",
        targetVisitIds: [],
        destinationId: "destination-1",
        params: { dayIndex: 3, position: null, startTime: "10:00", durationMinutes: 60 },
        affected: { visitIds: [], dayIndexes: [3] },
      }),
      context,
    );

    expect(result.params.dayIndex).toBeNull();
    expect(result.affected.dayIndexes).toEqual([]);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationReason).toBe("MISSING_DAY");
  });

  it("converts malformed time and out-of-range schedule parameters into clarification", () => {
    const badTime = verifyEditIntentOutput(
      output({ params: { dayIndex: null, position: null, startTime: "25:70", durationMinutes: null } }),
      context,
    );
    expect(badTime.params.startTime).toBeNull();
    expect(badTime.needsClarification).toBe(true);
    expect(badTime.clarificationReason).toBe("MISSING_TIME");

    const badDuration = verifyEditIntentOutput(
      output({
        intentType: "CHANGE_DURATION",
        params: { dayIndex: null, position: null, startTime: null, durationMinutes: 1_500 },
      }),
      context,
    );
    expect(badDuration.params.durationMinutes).toBeNull();
    expect(badDuration.needsClarification).toBe(true);
    expect(badDuration.clarificationReason).toBe("MISSING_TIME");
  });

  it("converts an insertion position beyond the available day into clarification", () => {
    const result = verifyEditIntentOutput(
      output({
        intentType: "ADD_VISIT",
        targetVisitIds: [],
        destinationId: "destination-1",
        params: { dayIndex: 1, position: 4, startTime: "10:00", durationMinutes: 60 },
        affected: { visitIds: [], dayIndexes: [1] },
      }),
      context,
    );

    expect(result.params.position).toBeNull();
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationReason).toBe("OUT_OF_SCOPE");
  });

  it("marks an ambiguous request for clarification without inventing a question", () => {
    const result = verifyEditIntentOutput(
      output({
        intentType: "UNCLEAR",
        targetVisitIds: [],
        params: { dayIndex: null, position: null, startTime: null, durationMinutes: null },
        affected: { visitIds: [], dayIndexes: [] },
        needsClarification: true,
        clarificationReason: null,
      }),
      context,
    );

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationReason).toBe("MISSING_TARGET");
    expect(result).not.toHaveProperty("question");
  });

  it.each([
    { ...output(), unexpected: true },
    { ...output(), params: { dayIndex: null, position: null, startTime: "10:00" } },
    { ...output(), intentType: "UNSUPPORTED_INTENT" },
  ])("maps structurally malformed provider output to a typed error", (badOutput) => {
    expect(() => verifyEditIntentOutput(badOutput, context)).toThrow(PreferenceExtractionError);
    try {
      verifyEditIntentOutput(badOutput, context);
    } catch (error) {
      expect((error as PreferenceExtractionError).code).toBe("INVALID_PROVIDER_RESPONSE");
    }
  });
});
