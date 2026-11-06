import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  changeOriginSelection,
  originSelectionSchema,
  type OriginSelection,
} from "@/modules/trip-origin/trip-origin-contract";
import OriginLocationPicker from "./origin-location-picker";
import { ORIGIN_FIXTURES } from "@/modules/trip-origin/trip-origin-fixtures";

describe("OriginLocationPicker component", () => {
  it("renders empty picker state without selecting any default coordinates or city", () => {
    const html = renderToStaticMarkup(
      createElement(OriginLocationPicker, {
        origin: null,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("Điểm xuất phát");
    expect(html).toContain("Tên địa điểm xuất phát");
    expect(html).toContain("Chưa chọn vị trí");
    expect(html).toContain("Xác nhận điểm xuất phát");
    expect(html).not.toContain("Hà Nội");
  });

  it("renders with supplied unconfirmed origin coordinates", () => {
    const unconfirmed: OriginSelection = {
      label: "Bến xe Mỹ Đình",
      latitude: 21.028511,
      longitude: 105.804817,
      source: "MANUAL",
      confirmed: false,
    };

    const html = renderToStaticMarkup(
      createElement(OriginLocationPicker, {
        origin: unconfirmed,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("Bến xe Mỹ Đình");
    expect(html).toContain("21.028511");
    expect(html).toContain("105.804817");
    expect(html).toContain("Chưa xác nhận vị trí");
  });

  it("renders confirmed state with success badge", () => {
    const confirmed: OriginSelection = {
      ...ORIGIN_FIXTURES.confirmed,
      label: "Hà Nội",
    };

    const html = renderToStaticMarkup(
      createElement(OriginLocationPicker, {
        origin: confirmed,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("Hà Nội");
    expect(html).toContain("Đã xác nhận trên bản đồ");
  });

  it("changeOriginSelection enforces schema constraints", () => {
    const origin: OriginSelection = {
      label: "Vị trí mẫu",
      latitude: 21.0,
      longitude: 105.0,
      source: "MANUAL",
      confirmed: true,
    };

    // Moving coordinates resets confirmation to false
    const moved = changeOriginSelection(origin, { latitude: 22.0 });
    expect(moved.confirmed).toBe(false);
    expect(moved.latitude).toBe(22.0);

    // Invalid coordinates throw zod error
    expect(() =>
      originSelectionSchema.parse({
        ...origin,
        latitude: 95, // outside -90..90
      }),
    ).toThrow();

    expect(() =>
      originSelectionSchema.parse({
        ...origin,
        longitude: 185, // outside -180..180
      }),
    ).toThrow();
  });
});

