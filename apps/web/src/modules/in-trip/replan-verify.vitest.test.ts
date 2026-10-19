import { describe, expect, test } from "vitest";

import { PreferenceExtractionError } from "../preference-extraction/preference-extraction-errors";
import type { ReplanModelOutput } from "./replan-contract";
import { verifyReplanOutput } from "./replan-verify";
import type { ReplanPromptServerContext } from "./replan-prompt";

const context: ReplanPromptServerContext = {
  completedVisitIds: ["completed-1"],
  remainingVisits: [
    {
      visitId: "remaining-1",
      destinationName: "Điểm A",
      dayIndex: 1,
      startTime: "09:00",
      durationMinutes: 60,
    },
    {
      visitId: "remaining-2",
      destinationName: "Điểm B",
      dayIndex: 2,
      startTime: "10:00",
      durationMinutes: 90,
    },
  ],
  remainingVisitIds: ["remaining-1", "remaining-2"],
  eligibleDestinations: [
    { id: "destination-1", name: "Điểm mới 1" },
    { id: "destination-2", name: "Điểm mới 2" },
  ],
  dayIndexes: [1, 2],
};

function operation(
  operationType: ReplanModelOutput["operations"][number]["operationType"],
  overrides: Partial<ReplanModelOutput["operations"][number]> = {},
): ReplanModelOutput["operations"][number] {
  return {
    operationType,
    targetVisitId: operationType === "ADD_VISIT" ? null : "remaining-1",
    destinationId:
      operationType === "ADD_VISIT" || operationType === "REPLACE_VISIT"
        ? "destination-1"
        : null,
    params: {
      dayIndex: operationType === "ADD_VISIT" || operationType === "MOVE_VISIT" ? 2 : null,
      position: operationType === "ADD_VISIT" || operationType === "MOVE_VISIT" ? 1 : null,
      startTime:
        operationType === "ADD_VISIT" || operationType === "CHANGE_TIME" ? "11:00" : null,
      durationMinutes:
        operationType === "ADD_VISIT" || operationType === "CHANGE_DURATION" ? 45 : null,
    },
    ...overrides,
  };
}

function output(overrides: Partial<ReplanModelOutput> = {}): ReplanModelOutput {
  return {
    operations: [operation("MOVE_VISIT")],
    mandatoryEndpoint: null,
    needsClarification: false,
    clarificationReason: null,
    ...overrides,
  };
}

describe("in-trip replan verification", () => {
  test.each([
    operation("ADD_VISIT"),
    operation("REMOVE_VISIT"),
    operation("MOVE_VISIT"),
    operation("CHANGE_TIME"),
    operation("CHANGE_DURATION"),
    operation("REPLACE_VISIT"),
  ])("accepts a verified %s operation", (candidate) => {
    const result = verifyReplanOutput(output({ operations: [candidate] }), context);
    expect(result.status).toBe("PROPOSED");
    if (result.status === "PROPOSED") {
      expect(result.intent.operations).toHaveLength(1);
      expect(result.intent.operations[0]?.operationType).toBe(candidate.operationType);
    }
  });

  test("preserves the model's ordered operation sequence", () => {
    const result = verifyReplanOutput(
      output({ operations: [operation("REMOVE_VISIT"), operation("MOVE_VISIT")] }),
      context,
    );
    expect(result.status).toBe("PROPOSED");
    if (result.status === "PROPOSED") {
      expect(result.intent.operations.map((item) => item.operationType)).toEqual([
        "REMOVE_VISIT",
        "MOVE_VISIT",
      ]);
    }
  });

  test("rejects the whole proposal when an operation targets a completed visit", () => {
    const result = verifyReplanOutput(
      output({ operations: [operation("REMOVE_VISIT", { targetVisitId: "completed-1" })] }),
      context,
    );
    expect(result).toEqual({
      status: "REJECTED_COMPLETED_VISIT",
      reason: "COMPLETED_VISIT_TARGET",
      message: "Đề xuất bị từ chối vì có thao tác nhắm tới lượt đã qua giờ theo lịch.",
    });
  });

  test.each([
    ["unknown visit", operation("REMOVE_VISIT", { targetVisitId: "fake-visit" }), "MISSING_TARGET"],
    ["unknown destination", operation("ADD_VISIT", { destinationId: "fake-destination" }), "AMBIGUOUS_DESTINATION"],
    ["day outside trip", operation("MOVE_VISIT", { params: { dayIndex: 9, position: 1, startTime: null, durationMinutes: null } }), "MISSING_DAY"],
    ["invalid time", operation("CHANGE_TIME", { params: { dayIndex: null, position: null, startTime: "25:80", durationMinutes: null } }), "MISSING_TIME"],
    ["nonpositive duration", operation("CHANGE_DURATION", { params: { dayIndex: null, position: null, startTime: null, durationMinutes: 0 } }), "MISSING_TIME"],
    ["end crosses midnight", operation("ADD_VISIT", { params: { dayIndex: 2, position: 1, startTime: "23:30", durationMinutes: 60 } }), "MISSING_TIME"],
  ])("turns %s into code-controlled clarification", (_label, candidate, reason) => {
    const result = verifyReplanOutput(output({ operations: [candidate] }), context);
    expect(result).toEqual({
      status: "NEEDS_CLARIFICATION",
      clarificationReason: reason,
      operations: [],
      mandatoryEndpoint: null,
    });
  });

  test("returns no operations when the provider says the need is ambiguous", () => {
    const result = verifyReplanOutput(
      output({ operations: [], needsClarification: true, clarificationReason: "MISSING_TARGET" }),
      context,
    );
    expect(result).toEqual({
      status: "NEEDS_CLARIFICATION",
      clarificationReason: "MISSING_TARGET",
      operations: [],
      mandatoryEndpoint: null,
    });
  });

  test("an empty destination set cannot authorize a fabricated new stop", () => {
    const emptyDestinationContext = { ...context, eligibleDestinations: [] };
    const result = verifyReplanOutput(output({ operations: [operation("ADD_VISIT")] }), emptyDestinationContext);
    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status === "NEEDS_CLARIFICATION") {
      expect(result.clarificationReason).toBe("AMBIGUOUS_DESTINATION");
      expect(result.operations).toEqual([]);
    }
  });

  test("validates the mandatory endpoint against server destinations and HH:mm", () => {
    const valid = verifyReplanOutput(
      output({ operations: [], mandatoryEndpoint: { destinationId: "destination-2", deadline: "17:30" } }),
      context,
    );
    expect(valid.status).toBe("PROPOSED");

    const invalid = verifyReplanOutput(
      output({ operations: [], mandatoryEndpoint: { destinationId: "fake", deadline: "17:30" } }),
      context,
    );
    expect(invalid.status).toBe("NEEDS_CLARIFICATION");
    if (invalid.status === "NEEDS_CLARIFICATION") {
      expect(invalid.clarificationReason).toBe("AMBIGUOUS_DESTINATION");
    }
  });

  test("resolves an ambiguous endpoint only from a current eligible server choice", () => {
    const resolved = verifyReplanOutput(
      output({
        operations: [],
        mandatoryEndpoint: { destinationId: null, deadline: "17:30" },
      }),
      { ...context, resolution: { selectedDestinationId: "destination-2" } },
    );
    expect(resolved.status).toBe("PROPOSED");
    if (resolved.status === "PROPOSED") {
      expect(resolved.intent.mandatoryEndpoint).toEqual({
        destinationId: "destination-2",
        deadline: "17:30",
      });
    }

    const forged = verifyReplanOutput(
      output({
        operations: [],
        mandatoryEndpoint: { destinationId: null, deadline: "17:30" },
      }),
      { ...context, resolution: { selectedDestinationId: "forged-destination" } },
    );
    expect(forged).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      clarificationReason: "AMBIGUOUS_DESTINATION",
    });
  });

  test("rejects malformed structured output as a typed provider error", () => {
    expect(() => verifyReplanOutput({ ...output(), unexpected: "field" }, context)).toThrow(
      expect.objectContaining<Partial<PreferenceExtractionError>>({ code: "INVALID_PROVIDER_RESPONSE" }),
    );
    expect(() => verifyReplanOutput("not json", context)).toThrow(
      expect.objectContaining<Partial<PreferenceExtractionError>>({ code: "INVALID_PROVIDER_RESPONSE" }),
    );
  });
});
