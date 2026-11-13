import { describe, expect, it } from "vitest";
import { isTripsageChatEnabled } from "./tripsage-chat-flag";

describe("isTripsageChatEnabled", () => {
  it("is off when the variable is missing", () => {
    expect(isTripsageChatEnabled({})).toBe(false);
  });
  it("is off for anything other than the exact string true", () => {
    for (const value of ["", "false", "1", "TRUE", "yes", " true"]) {
      expect(isTripsageChatEnabled({ TRIPSAGE_CHAT_ENABLED: value })).toBe(false);
    }
  });
  it("is on only for the exact string true", () => {
    expect(isTripsageChatEnabled({ TRIPSAGE_CHAT_ENABLED: "true" })).toBe(true);
  });
});
