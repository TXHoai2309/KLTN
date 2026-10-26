import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import EditorialRenderer from "./editorial-renderer";
import { editorialFixture } from "@/modules/destination-editorial/__fixtures__/editorial-fixture";
import { autoLayout, resolveEditorial } from "@/modules/destination-editorial/editorial-engine";
import { editorialLayoutV2Schema } from "@/modules/destination-editorial/editorial-contract";

describe("Google iframe boundary in published Editorial detail", () => {
  it("renders the destination iframe in a V1 MAP block", () => {
    const data = editorialFixture(undefined, 0);
    const editorial = resolveEditorial(autoLayout(data), data);
    expect(editorial).not.toBeNull();
    const html = renderToStaticMarkup(createElement(EditorialRenderer, { data, editorial: editorial! }));
    expect(html).toContain('class="destination-map destination-detail-iframe-map"');
    expect(html).toContain(`Bản đồ tham chiếu ${data.name}`);
    expect(html).toContain("<iframe");
    expect(html).not.toMatch(/maplibregl|stadiamaps|maps\.googleapis\.com/i);
  });

  it("passes a verified place link through the published Editorial map", () => {
    const data = editorialFixture(undefined, 0);
    const editorial = resolveEditorial(autoLayout(data), data);
    expect(editorial).not.toBeNull();
    const placeUrl = "https://www.google.com/maps/place/Dong+Van+Plateau/";
    const html = renderToStaticMarkup(createElement(EditorialRenderer, {
      data: { ...data, profile: { googleMapsUrl: placeUrl, locationVerified: true } },
      editorial: editorial!,
    }));
    expect(html).toContain(`href="${placeUrl}"`);
  });

  it("renders the destination iframe in V2 and omits it without valid coordinates", () => {
    const data = editorialFixture(undefined, 0);
    const layout = editorialLayoutV2Schema.parse({ schemaVersion: 2, sections: [{ id: "hero", type: "HERO", title: data.name }, { id: "map", type: "MAP", title: "Vị trí tham chiếu" }] });
    const editorial = resolveEditorial(layout, data);
    expect(editorial).not.toBeNull();
    const html = renderToStaticMarkup(createElement(EditorialRenderer, { data, editorial: editorial! }));
    expect(html).toContain('class="destination-map destination-detail-iframe-map"');
    expect(html).toContain("<iframe");
    expect(html).not.toMatch(/maplibregl|stadiamaps|maps\.googleapis\.com/i);
    const withoutCoordinates = { ...data, latitude: Number.NaN, longitude: Number.NaN };
    const unavailable = resolveEditorial(layout, withoutCoordinates);
    expect(unavailable).not.toBeNull();
    expect(renderToStaticMarkup(createElement(EditorialRenderer, { data: withoutCoordinates, editorial: unavailable! }))).not.toContain("destination-detail-iframe-map");
  });
});
