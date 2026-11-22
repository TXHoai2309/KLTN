import { describe, expect, it } from "vitest";
import { driveWithRest, restPolicyOf, restProfileOf } from "../trip-origin/rest-policy";
import { namesOrAgreesOrigin, sameOriginPlace } from "./tripsage-chat-origin";

describe("ADR-48 compact roadside rest", () => {
  it("keeps 15-minute breaks by default and uses 10 minutes in compact mode", () => {
    const fourHours = 4 * 3600;
    expect(driveWithRest(fourHours, 0, "MOTORCYCLE").restMinutes).toBe(30);
    expect(driveWithRest(fourHours, 0, restProfileOf({ transport: "MOTORCYCLE", restMode: "COMPACT" })).restMinutes).toBe(20);
    expect(restPolicyOf({ restMode: "COMPACT" })).toBe("roadside-rest-compact-v1");
    expect(restPolicyOf({})).toBe("roadside-rest-v1");
  });
});

describe("one-turn origin confirmation", () => {
  it("accepts plain agreement or the place name, but not a refusal or a contrast", () => {
    for (const text of ["ok nhé", "ok, xác nhận", "Đà Nẵng", "điểm tập kết là hà nội", "đồng ý"]) {
      expect(namesOrAgreesOrigin(text, text.includes("nội") ? "Hà Nội" : "Đà Nẵng")).toBe(true);
    }
    expect(namesOrAgreesOrigin("không, đi từ Huế", "Đà Nẵng")).toBe(false);
    expect(namesOrAgreesOrigin("Đà Nẵng hay Huế", "Đà Nẵng")).toBe(false);
  });

  it("recognises an origin that was already confirmed", () => {
    expect(sameOriginPlace("Hà Nội (bến xe Mỹ Đình)", "Hà Nội")).toBe(true);
    expect(sameOriginPlace("Đà Nẵng, Việt Nam", "đà nẵng")).toBe(true);
    expect(sameOriginPlace("Đà Nẵng, Việt Nam", "Huế")).toBe(false);
  });
});
