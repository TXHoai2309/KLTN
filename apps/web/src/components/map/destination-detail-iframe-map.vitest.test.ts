import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DestinationDetailIframeMap, { destinationDetailCoordinates, destinationDetailEmbedUrl } from "./destination-detail-iframe-map";

const destination = {
  name: "Cao nguyên đá Đồng Văn",
  latitude: 23.28,
  longitude: 105.36,
};

describe("keyless map for one public Destination detail", () => {
  it("uses the destination's own latitude and longitude and rejects invalid coordinates", () => {
    expect(destinationDetailCoordinates(destination)).toBe("23.28,105.36");
    expect(destinationDetailCoordinates({ ...destination, latitude: null })).toBeNull();
    expect(destinationDetailCoordinates({ ...destination, longitude: 181 })).toBeNull();
    expect(destinationDetailCoordinates({ ...destination, latitude: Number.NaN })).toBeNull();
  });

  it("renders the legacy Google iframe and a supported location link without API credentials", () => {
    const html = renderToStaticMarkup(createElement(DestinationDetailIframeMap, { destination, label: "Bản đồ tham chiếu Cao nguyên đá Đồng Văn" }));
    expect(html).toContain('title="Bản đồ tham chiếu Cao nguyên đá Đồng Văn"');
    expect(html).toContain(`src="${destinationDetailEmbedUrl("23.28,105.36").replaceAll("&", "&amp;")}"`);
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Cao%20nguy%C3%AAn%20%C4%91%C3%A1%20%C4%90%E1%BB%93ng%20V%C4%83n");
    expect(html).toContain("Tìm điểm đến trên Google Maps");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).not.toMatch(/maps\.googleapis\.com|maplibregl|stadiamaps|api[_-]?key|mapId/i);
  });

  it("opens a verified Google place link when one exists", () => {
    const placeUrl = "https://www.google.com/maps/place/Dong+Van+Plateau/";
    const html = renderToStaticMarkup(createElement(DestinationDetailIframeMap, {
      destination: { ...destination, profile: { googleMapsUrl: placeUrl, locationVerified: true } },
    }));
    expect(html).toContain(`href="${placeUrl}"`);
    expect(html).toContain("Mở địa danh trên Google Maps");
  });

  it("does not treat an unverified or coordinate-only link as a named place", () => {
    for (const profile of [
      { googleMapsUrl: "https://www.google.com/maps/place/Dong+Van+Plateau/", locationVerified: false },
      { googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=23.28%2C105.36", locationVerified: true },
      { googleMapsUrl: "https://example.com/maps/place/Dong+Van+Plateau/", locationVerified: true },
    ]) {
      const html = renderToStaticMarkup(createElement(DestinationDetailIframeMap, { destination: { ...destination, profile } }));
      expect(html).toContain("Tìm điểm đến trên Google Maps");
      expect(html).not.toContain('href="https://www.google.com/maps/search/?api=1&amp;query=23.28%2C105.36"');
    }
  });

  it("shows a clear state instead of an iframe for missing coordinates", () => {
    const html = renderToStaticMarkup(createElement(DestinationDetailIframeMap, { destination: { ...destination, latitude: null } }));
    expect(html).toContain("chưa có tọa độ hợp lệ");
    expect(html).not.toContain("<iframe");
  });
});
