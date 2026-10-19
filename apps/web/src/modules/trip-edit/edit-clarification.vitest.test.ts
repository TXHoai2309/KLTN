import { describe, expect, it } from "vitest";

import type { EditIntentResult } from "./edit-intent-contract";
import {
  createEditClarification,
  resolveEditIntent,
  type EditClarificationContext,
} from "./edit-clarification";

const context: EditClarificationContext = {
  visits: [
    {
      visitId: "visit-1",
      destinationId: "destination-1",
      destinationName: "Hồ Ba Bể",
      dayIndex: 1,
      startMinute: 480,
    },
    {
      visitId: "visit-2",
      destinationId: "destination-2",
      destinationName: "Hồ Ba Bể",
      dayIndex: 2,
      startMinute: 615,
    },
  ],
  eligibleDestinations: [
    { id: "destination-3", name: "Thác Bản Giốc" },
    { id: "destination-4", name: "Hang Pác Bó" },
  ],
};

function intent(overrides: Partial<EditIntentResult> = {}): EditIntentResult {
  return {
    intentType: "CHANGE_TIME",
    targetVisitIds: ["visit-1", "visit-2"] as EditIntentResult["targetVisitIds"],
    destinationId: null,
    params: { dayIndex: null, position: null, startTime: "09:00", durationMinutes: null },
    affected: {
      visitIds: ["visit-1", "visit-2"] as EditIntentResult["affected"]["visitIds"],
      dayIndexes: [1, 2],
    },
    needsClarification: true,
    clarificationReason: "AMBIGUOUS_TARGET",
    ...overrides,
  };
}

describe("createEditClarification", () => {
  it.each([
    ["MISSING_TARGET", "Bạn muốn chỉnh sửa điểm đến nào trong hành trình?"],
    ["MISSING_TIME", "Bạn muốn dùng giờ bắt đầu hoặc thời lượng nào cho điểm đến này?"],
    ["MISSING_DAY", "Bạn muốn thêm hoặc chuyển điểm đến sang ngày nào trong hành trình?"],
    ["AMBIGUOUS_TARGET", "Bạn muốn chỉnh sửa lượt ghé nào? Chọn một điểm trong hành trình."],
    ["AMBIGUOUS_DESTINATION", "Bạn muốn chọn điểm đến nào? Chọn một điểm trong danh sách."],
  ] as const)("generates stable code-owned text for %s", (reason, prompt) => {
    const result = createEditClarification(reason, intent(), context);

    expect(result).toMatchObject({ code: reason, prompt });
    expect(result.prompt).not.toContain("model");
  });

  it("includes only server-verified visit choices with destination, day and time", () => {
    const result = createEditClarification("AMBIGUOUS_TARGET", intent(), context);

    expect(result.choices).toEqual([
      { label: "Hồ Ba Bể · Ngày 1 · 08:00", resolution: { selectedVisitId: "visit-1" } },
      { label: "Hồ Ba Bể · Ngày 2 · 10:15", resolution: { selectedVisitId: "visit-2" } },
    ]);
  });

  it("builds destination options from the current eligible destination list", () => {
    const result = createEditClarification(
      "AMBIGUOUS_DESTINATION",
      intent({ destinationId: null }),
      context,
    );

    expect(result.choices).toEqual([
      { label: "Thác Bản Giốc", resolution: { selectedDestinationId: "destination-3" } },
      { label: "Hang Pác Bó", resolution: { selectedDestinationId: "destination-4" } },
    ]);
  });

  it("explains the supported editing scope for out-of-scope requests", () => {
    const result = createEditClarification("OUT_OF_SCOPE", intent(), context);

    expect(result.prompt).toContain("ngày bắt đầu");
    expect(result.prompt).toContain("ngân sách");
    expect(result.prompt).toContain("số người");
    expect(result.prompt).toContain("chỉnh sửa thủ công");
    expect(result.prompt).toContain("tạo hành trình mới");
    expect(result.choices).toBeUndefined();
  });
});

describe("resolveEditIntent", () => {
  it("resolves an ambiguous target only to a current server-verified candidate", () => {
    const result = resolveEditIntent(intent(), { selectedVisitId: "visit-2" }, context);

    expect(result).toMatchObject({
      targetVisitIds: ["visit-2"],
      needsClarification: false,
      clarificationReason: null,
      affected: { visitIds: ["visit-1", "visit-2"], dayIndexes: [1, 2] },
    });
  });

  it("resolves an ambiguous destination only to a currently eligible destination", () => {
    const ambiguousDestination = intent({
      intentType: "ADD_VISIT",
      targetVisitIds: [],
      destinationId: null,
      params: { dayIndex: 1, position: null, startTime: "09:00", durationMinutes: 60 },
      affected: { visitIds: [], dayIndexes: [1] },
      clarificationReason: "AMBIGUOUS_DESTINATION",
    });

    const result = resolveEditIntent(
      ambiguousDestination,
      { selectedDestinationId: "destination-4" },
      context,
    );

    expect(result).toMatchObject({
      destinationId: "destination-4",
      needsClarification: false,
      clarificationReason: null,
    });
  });

  it.each([
    ["visit not in this Trip", { selectedVisitId: "foreign-visit" }],
    ["visit not offered by this verified intent", { selectedVisitId: "visit-3" }],
    ["destination not currently eligible", { selectedDestinationId: "hidden-destination" }],
  ] as const)("rejects a fake resolution: %s", (_case, resolution) => {
    const currentIntent = "selectedDestinationId" in resolution
      ? intent({ clarificationReason: "AMBIGUOUS_DESTINATION", destinationId: null })
      : intent();

    expect(() => resolveEditIntent(currentIntent, resolution, context)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 }),
    );
  });

  it("rejects a selection that does not resolve the current clarification reason", () => {
    const needsTime = intent({ clarificationReason: "MISSING_TIME" });

    expect(() => resolveEditIntent(needsTime, { selectedVisitId: "visit-1" }, context))
      .toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it("rejects malformed resolutions with multiple selection IDs", () => {
    expect(() => resolveEditIntent(
      intent(),
      { selectedVisitId: "visit-1", selectedDestinationId: "destination-3" } as never,
      context,
    )).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
});
