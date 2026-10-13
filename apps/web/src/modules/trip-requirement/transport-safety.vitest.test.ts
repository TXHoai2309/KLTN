import { describe, expect, it } from "vitest";

import { resolveTransportCandidateFromExtraction, unresolvedTransportMessage } from "./transport-safety";

describe("transport safety boundary", () => {
  it.each([
    [{ status: "EXTRACTED", value: "MOTORCYCLE" }, "MOTORCYCLE"],
    [{ status: "EXTRACTED", value: "CAR" }, "CAR"],
    [{ status: "EXTRACTED", value: "AIRPLANE" }, null],
    [{ status: "EXTRACTED", value: null }, null],
    [{ status: "AMBIGUOUS", value: "CAR" }, null],
    [{ status: "UNSUPPORTED", value: "MOTORCYCLE" }, null],
    [{ status: "EXTRACTED", value: "CAR", downgraded: true }, null],
  ] as const)("returns only a verified canonical candidate: %j", (field, expected) => {
    expect(resolveTransportCandidateFromExtraction(field)).toBe(expected);
  });

  it("keeps the original source text in the fixed unsupported message", () => {
    expect(unresolvedTransportMessage("xe đạp")).toBe(
      "Phương tiện bạn nhắc tới (“xe đạp”) hiện chưa được hỗ trợ. Hệ thống chỉ hỗ trợ xe máy hoặc ô tô — vui lòng tự chọn.",
    );
    expect(unresolvedTransportMessage(null)).toContain("“chưa được nêu rõ”");
  });
});

