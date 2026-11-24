import { describe, expect, it } from "vitest";
import {
  formatDecimalNumber,
  formatDistanceKm,
  formatDistanceMeters,
} from "./traveler-number-format";

describe("Lỗi 5: shared vi-VN and en-US distance and decimal formatting", () => {
  it("formats km distances in Vietnamese (vi-VN comma) and meters under 1 km", () => {
    expect(formatDistanceKm(34.4)).toBe("34,4 km");
    expect(formatDistanceKm(34.4, "vi")).toBe("34,4 km");
    expect(formatDistanceKm(0.107)).toBe("107 m");
    expect(formatDistanceKm(0.107, "vi")).toBe("107 m");
    expect(formatDistanceKm(2.25)).toBe("2,3 km");
    expect(formatDistanceKm(2.25, "vi")).toBe("2,3 km");
    expect(formatDistanceKm(2.2)).toBe("2,2 km");
    expect(formatDistanceKm(3)).toBe("3 km");
    expect(formatDistanceMeters(34400)).toBe("34,4 km");
    expect(formatDistanceMeters(107)).toBe("107 m");
    expect(formatDistanceMeters(2250, "vi")).toBe("2,3 km");
  });

  it("formats km distances in English (en-US dot) and meters under 1 km", () => {
    expect(formatDistanceKm(2.25, "en")).toBe("2.3 km");
    expect(formatDistanceKm(34.4, "en")).toBe("34.4 km");
    expect(formatDistanceKm(0.107, "en")).toBe("107 m");
    expect(formatDistanceMeters(2250, "en")).toBe("2.3 km");
  });

  it("formats arbitrary decimals in vi-VN vs en-US", () => {
    expect(formatDecimalNumber(0.5, "vi")).toBe("0,5");
    expect(formatDecimalNumber(0.5, "en")).toBe("0.5");
    expect(formatDecimalNumber(12.34, "vi", 1)).toBe("12,3");
    expect(formatDecimalNumber(1900, "vi")).toBe("1.900");
    expect(formatDecimalNumber(1900, "en")).toBe("1,900");
  });
});
