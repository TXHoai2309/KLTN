import { describe, expect, it } from "vitest";
import {
  collectRealExploreAreas,
  exploreDistanceKm,
  filterAndSortExploreLocations,
  isDestinationOpenToday,
  resolveExploreDisplayArea,
  vietnamWeekdayKey,
} from "./explore-filter-sort";

describe("P4: Explore area hiding, inference, filters & sorting", () => {
  it("hides generic placeholder areas and infers real district/commune from address when missing", () => {
    expect(
      resolveExploreDisplayArea({
        area: "khu vực hà giang",
        address: "Thôn Sà Phìn, xã Sà Phìn, huyện Đồng Văn, tỉnh Hà Giang",
      }),
    ).toBe("Sà Phìn");

    expect(
      resolveExploreDisplayArea({
        area: "khu vực hà giang",
        address: "Khu vực xã Hồ Thầu, huyện Hoàng Su Phì, tỉnh Tuyên Quang",
      }),
    ).toBe("Hồ Thầu");

    expect(
      resolveExploreDisplayArea({
        area: "khu vực hà giang",
        address: null,
        latitude: null,
        longitude: null,
      }),
    ).toBeNull();

    // Preserves genuine non-generic areas directly
    expect(resolveExploreDisplayArea({ area: "đồng văn" })).toBe("Đồng Văn");
    expect(resolveExploreDisplayArea({ area: "Khu vực Hà Giang", inferredArea: "Quản Bạ" })).toBe("Quản Bạ");
  });

  it("never fabricates a distant village area purely from far-off coordinates", () => {
    expect(
      resolveExploreDisplayArea({
        area: "khu vực hà giang",
        address: "Tỉnh Hà Giang",
        latitude: 23.24,
        longitude: 105.4,
      }),
    ).toBeNull();
  });

  it("evaluates 'Đang mở cửa hôm nay' in Vietnam timezone (Asia/Ho_Chi_Minh)", () => {
    // 2026-11-24T12:00:00Z = Tuesday in Vietnam
    const tuesday = new Date("2026-11-24T12:00:00Z");
    expect(vietnamWeekdayKey(tuesday)).toBe("TUESDAY");
    expect(
      isDestinationOpenToday(
        [
          { dayOfWeek: "MONDAY", status: "CLOSED" },
          { dayOfWeek: "TUESDAY", status: "OPEN" },
        ],
        tuesday,
      ),
    ).toBe(true);
    expect(
      isDestinationOpenToday(
        [
          { dayOfWeek: "MONDAY", status: "OPEN" },
          { dayOfWeek: "TUESDAY", status: "CLOSED" },
        ],
        tuesday,
      ),
    ).toBe(false);
    expect(isDestinationOpenToday([{ dayOfWeek: "TUESDAY", status: "UNKNOWN" }], tuesday)).toBeNull();
  });

  it("collects real areas and filters/sorts by region, openTodayOnly, name, nearest, and popular", () => {
    const items = [
      {
        id: "d-dv",
        name: "Phố cổ Đồng Văn",
        area: "khu vực hà giang",
        inferredArea: "Đồng Văn",
        category: "văn hóa",
        latitude: 23.2783,
        longitude: 105.3614,
        openToday: true,
        favoriteCount: 2,
      },
      {
        id: "d-qb",
        name: "Cổng trời Quản Bạ",
        area: "khu vực hà giang",
        inferredArea: "Quản Bạ",
        category: "thiên nhiên",
        latitude: 23.0703,
        longitude: 104.9798,
        openToday: false,
        favoriteCount: 8,
      },
      {
        id: "d-hsp",
        name: "Bản Phùng",
        area: "khu vực hà giang",
        category: "văn hóa",
        latitude: null,
        longitude: null,
        openToday: true,
        favoriteCount: 5,
      },
    ];

    expect(collectRealExploreAreas(items)).toEqual(["Đồng Văn", "Quản Bạ"]);

    expect(filterAndSortExploreLocations(items, { region: "Quản Bạ" }).map(x => x.id)).toEqual(["d-qb"]);
    expect(filterAndSortExploreLocations(items, { openTodayOnly: true }).map(x => x.id)).toEqual(["d-hsp", "d-dv"]);
    expect(filterAndSortExploreLocations(items, { sort: "popular" }).map(x => x.id)).toEqual(["d-qb", "d-hsp", "d-dv"]);

    const userNearDongVan = { latitude: 23.28, longitude: 105.36 };
    expect(exploreDistanceKm(items[0]!, userNearDongVan)!).toBeLessThan(1);
    expect(
      filterAndSortExploreLocations(items, { sort: "nearest", userCoords: userNearDongVan }).map(x => x.id),
    ).toEqual(["d-dv", "d-qb", "d-hsp"]);
  });
});

describe("Lỗi 3: resolveExploreDisplayArea region normalization and priority", () => {
  it("normalizes numbered administrative units like Hà Giang 1 and Hà Giang 2 to TP Hà Giang", () => {
    expect(resolveExploreDisplayArea({ address: "phường Hà Giang 1, Tuyên Quang" })).toBe("TP Hà Giang");
    expect(resolveExploreDisplayArea({ address: "phường Hà Giang 2, tỉnh Tuyên Quang" })).toBe("TP Hà Giang");
    expect(
      resolveExploreDisplayArea({ address: "thôn Hạ Thành, phường Hà Giang 1, Tuyên Quang" }),
    ).toBe("TP Hà Giang");
    expect(
      resolveExploreDisplayArea({ area: "khu vực hà giang", inferredArea: "Hà Giang 1" }),
    ).toBe("TP Hà Giang");
  });

  it("extracts real commune/town names like Lũng Cú and Đồng Văn", () => {
    expect(
      resolveExploreDisplayArea({ address: "xã Lũng Cú, huyện Đồng Văn, tỉnh Hà Giang" }),
    ).toBe("Lũng Cú");
    expect(
      resolveExploreDisplayArea({ address: "thị trấn Đồng Văn, huyện Đồng Văn, tỉnh Hà Giang" }),
    ).toBe("Đồng Văn");
  });

  it("prioritizes real DB area over inferredArea and address, but skips generic placeholder", () => {
    expect(
      resolveExploreDisplayArea({
        area: "Mèo Vạc",
        inferredArea: "Hà Giang 1",
        address: "phường Hà Giang 1, Tuyên Quang",
      }),
    ).toBe("Mèo Vạc");
    expect(
      resolveExploreDisplayArea({
        area: "khu vực hà giang",
        address: "phường Hà Giang 1, Tuyên Quang",
      }),
    ).toBe("TP Hà Giang");
  });

  it("ignores meaningless numeric/road/admin fragments and never fabricates an area", () => {
    expect(resolveExploreDisplayArea({ address: "Đường 1, Phường 2, Tỉnh Tuyên Quang" })).toBeNull();
    expect(resolveExploreDisplayArea({ address: "Thôn 3, Tổ 5, Tỉnh Hà Giang" })).toBeNull();
    expect(resolveExploreDisplayArea({ area: "khu vực hà giang", address: "KM 12, QL4C, Hà Giang" })).toBeNull();
    expect(resolveExploreDisplayArea({ area: "", address: null, latitude: 23.2, longitude: 105.3 })).toBeNull();
  });
});
