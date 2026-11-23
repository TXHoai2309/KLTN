import { describe, expect, it } from "vitest";
import { buildDataTripTitle, extractOriginCityProvince } from "./traveler-trip-title";
import { computeSanitizedAutoConversationTitle } from "../modules/tripsage-chat/auto-title-sanitize";

describe("P1: Trip and conversation title privacy (city/province level only)", () => {
  it("extracts city/province from full street addresses without leaking house numbers or wards", () => {
    expect(extractOriginCityProvince("96 P. Định Công, Hoàng Mai, Hà Nội")).toBe("Hà Nội");
    expect(extractOriginCityProvince("96 Định Công, Hà Nội, Việt Nam")).toBe("Hà Nội");
    expect(extractOriginCityProvince("229 Trần Cung, Tu Liem, Hà Nội, Việt Nam")).toBe("Hà Nội");
    expect(extractOriginCityProvince("229 Phố Tây Sơn, Hà Nội, Việt Nam")).toBe("Hà Nội");
    expect(extractOriginCityProvince("Bến xe Mỹ Đình, Hà Nội, Việt Nam")).toBe("Hà Nội");
    expect(extractOriginCityProvince("Hà Nội (bến xe Mỹ Đình)")).toBe("Hà Nội");
    expect(extractOriginCityProvince("Hà Nội 100000, Việt Nam")).toBe("Hà Nội");
    expect(extractOriginCityProvince("12 Nguyễn Huệ, Bến Nghé, Quận 1, Thành phố Hồ Chí Minh")).toBe("TP.HCM");
    expect(extractOriginCityProvince("15 Lê Duẩn, Hải Châu, Đà Nẵng, Việt Nam")).toBe("Đà Nẵng");
    expect(extractOriginCityProvince("Tỉnh Tuyên Quang")).toBe("Tuyên Quang");
  });

  it("never returns street numbers, wards, districts, or coordinates", () => {
    expect(extractOriginCityProvince("96 P. Định Công")).toBeNull();
    expect(extractOriginCityProvince("Phường Định Công, Quận Hoàng Mai")).toBeNull();
    expect(extractOriginCityProvince("Bến xe Giáp Bát")).toBeNull();
    expect(extractOriginCityProvince("21.0285, 105.8542")).toBeNull();
    expect(extractOriginCityProvince("TP Hà Giang (bến xe phía Nam)")).toBeNull();
    expect(extractOriginCityProvince("TP Hà Giang (bến xe phía Nam)", { allowHaGiang: true })).toBe("Hà Giang");
  });

  it("formats buildDataTripTitle with city/province only and safe fallback", () => {
    expect(
      buildDataTripTitle({
        originLabel: "96 P. Định Công, Hoàng Mai, Hà Nội",
        startDate: "2026-11-29",
        endDate: "2026-12-03",
        durationDays: 5,
      }),
    ).toBe("Hà Nội → Hà Giang, 29/11–3/12");

    expect(
      buildDataTripTitle({
        originLabel: "96 P. Định Công",
        startDate: "2026-11-29",
        endDate: "2026-12-03",
        durationDays: 5,
      }),
    ).toBe("Hà Giang, 29/11–3/12");

    expect(
      buildDataTripTitle({
        originLabel: "96 P. Định Công",
        firstArea: "Quản Bạ",
        lastArea: "Đồng Văn",
        startDate: "2026-11-29",
        endDate: "2026-12-03",
        durationDays: 5,
      }),
    ).toBe("Quản Bạ – Đồng Văn, 29/11–3/12");

    expect(
      buildDataTripTitle({
        originLabel: "96 P. Định Công",
        hubName: "Hà Nội (bến xe Mỹ Đình)",
        startDate: "2026-11-29",
        endDate: "2026-12-03",
        durationDays: 5,
      }),
    ).toBe("Hà Nội → Hà Giang, 29/11–3/12");
  });

  it("sanitizes stored auto-titled conversations while preserving titleCustomized=true", () => {
    expect(
      computeSanitizedAutoConversationTitle({
        id: "c1",
        title: "96 P. Định Công → HG · 2 người · 29/11",
        titleCustomized: false,
        savedTripId: null,
        latestAssistantParts: [
          {
            type: "data-trip-info",
            data: {
              tripInfo: {
                homeCity: "96 P. Định Công, Hoàng Mai, Hà Nội",
                travelers: 2,
                startDate: "2026-11-29",
              },
            },
          },
        ],
      }),
    ).toBe("Hà Nội → HG · 2 người · 29/11");

    expect(
      computeSanitizedAutoConversationTitle({
        id: "c2",
        title: "96 Định Công → HG · 2 người · 29/11",
        titleCustomized: false,
        savedTripId: null,
      }),
    ).toBe("Hà Giang · 2 người · 29/11");

    // Custom user-renamed conversation MUST never be changed.
    expect(
      computeSanitizedAutoConversationTitle({
        id: "c3",
        title: "Đón bạn ở 96 Định Công",
        titleCustomized: true,
        savedTripId: null,
      }),
    ).toBeNull();
  });
});
