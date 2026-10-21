import { describe, expect, it } from "vitest";

import {
  inTripDateLabel,
  inTripVisitStatus,
  REMAINING_EMPTY_MESSAGE,
} from "./in-trip-presentation";

describe("in-trip presentation", () => {
  it("formats factual visit labels consistently", () => {
    expect(inTripDateLabel("2026-10-20")).toBe("20/10/2026");
    expect(inTripVisitStatus(true)).toBe("Đã qua giờ");
    expect(inTripVisitStatus(false)).toBe("Sắp tới");
  });

  it("keeps the required remaining empty-state copy", () => {
    expect(REMAINING_EMPTY_MESSAGE).toBe("Hiện chưa có lượt nào để đề xuất lại");
  });
});
