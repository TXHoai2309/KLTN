import { describe, expect, it } from "vitest";

import type { EditClarificationContext } from "../trip-edit/edit-clarification";
import { createReplanClarification } from "./replan-clarification";

const context: EditClarificationContext = {
  visits: [
    {
      visitId: "visit-1",
      destinationId: "destination-1",
      destinationName: "Đèo Mã Pí Lèng",
      dayIndex: 1,
      startMinute: 600,
    },
  ],
  eligibleDestinations: [
    { id: "destination-1", name: "Đèo Mã Pí Lèng" },
    { id: "destination-2", name: "Sông Nho Quế" },
  ],
};

describe("US36 Task290 replan clarification", () => {
  it("asks a stable code-authored question when the deadline is missing", () => {
    expect(createReplanClarification("MISSING_TIME", context)).toMatchObject({
      code: "MISSING_TIME",
      prompt: expect.stringContaining("trước mấy giờ"),
    });
  });

  it("uses only eligible server destinations to build ambiguous endpoint choices", () => {
    expect(createReplanClarification("AMBIGUOUS_DESTINATION", context)).toMatchObject({
      code: "AMBIGUOUS_DESTINATION",
      choices: [
        { label: "Đèo Mã Pí Lèng", resolution: { selectedDestinationId: "destination-1" } },
        { label: "Sông Nho Quế", resolution: { selectedDestinationId: "destination-2" } },
      ],
    });
  });
});
