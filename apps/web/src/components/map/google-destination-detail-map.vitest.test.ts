import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GoogleDestinationDetailMap, { googleDetailPosition, mountGoogleDetailMap } from "./google-destination-detail-map";

const destination = {
  id: "dong-van",
  name: "Cao nguyên đá Đồng Văn",
  area: "Đồng Văn",
  category: "Công viên địa chất",
  latitude: 23.28,
  longitude: 105.36,
};

afterEach(() => vi.unstubAllEnvs());

describe("Google map for one public Destination detail", () => {
  it("uses latitude for lat and longitude for lng, and rejects invalid coordinates", () => {
    expect(googleDetailPosition(destination)).toEqual({ lat: 23.28, lng: 105.36 });
    expect(googleDetailPosition({ ...destination, latitude: null })).toBeNull();
    expect(googleDetailPosition({ ...destination, longitude: 181 })).toBeNull();
  });

  it("shows an accessible map loading state when browser configuration is present", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-browser-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
    const html = renderToStaticMarkup(createElement(GoogleDestinationDetailMap, { destination, label: "Bản đồ tham chiếu Cao nguyên đá Đồng Văn" }));
    expect(html).toContain('aria-label="Bản đồ tham chiếu Cao nguyên đá Đồng Văn"');
    expect(html).toContain("Đang tải bản đồ");
    expect(html).not.toMatch(/maplibregl|stadiamaps|<iframe/i);
    expect(html).not.toContain("test-browser-key");
  });

  it("fails closed without browser configuration or valid coordinates", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(renderToStaticMarkup(createElement(GoogleDestinationDetailMap, { destination }))).toContain("Bản đồ hiện không khả dụng");
    expect(renderToStaticMarkup(createElement(GoogleDestinationDetailMap, { destination: { ...destination, latitude: null } }))).toContain("chưa có tọa độ hợp lệ");
  });

  it("mounts one accessible Google marker, opens its popup, and disposes listeners", () => {
    const oldDocument = globalThis.document;
    const elements: Array<{ tag: string; textContent: string; children: unknown[] }> = [];
    vi.stubGlobal("document", { createElement(tag: string) {
      const element = { tag, textContent: "", children: [] as unknown[], append(...children: unknown[]) { this.children.push(...children); } };
      elements.push(element);
      return element;
    } });
    let options: Record<string, unknown> = {};
    let markerOptions: Record<string, unknown> = {};
    let tileLoaded = () => {};
    let removed = 0;
    let opened = 0;
    let closed = 0;
    let marker: EventTarget & { map: unknown };
    const library = {
      Map: class {
        constructor(_host: unknown, value: Record<string, unknown>) { options = value; }
        addListener(_event: string, handler: () => void) { tileLoaded = handler; return { remove: () => { removed++; } }; }
      },
      AdvancedMarkerElement: class extends EventTarget {
        map: unknown;
        constructor(value: Record<string, unknown>) { super(); markerOptions = value; this.map = value.map; marker = this; }
      },
      InfoWindow: class {
        constructor(_value: unknown) {}
        open() { opened++; }
        close() { closed++; }
      },
    } as unknown as Parameters<typeof mountGoogleDetailMap>[1];
    const host = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    try {
      const ready = vi.fn();
      const dispose = mountGoogleDetailMap(host, library, destination, { lat: 23.28, lng: 105.36 }, "map-id", "DARK", ready);
      expect(options).toMatchObject({ center: { lat: 23.28, lng: 105.36 }, mapId: "map-id", colorScheme: "DARK" });
      expect(markerOptions).toMatchObject({ position: { lat: 23.28, lng: 105.36 }, title: "Xem Cao nguyên đá Đồng Văn", gmpClickable: true });
      tileLoaded();
      expect(ready).toHaveBeenCalledOnce();
      marker!.dispatchEvent(new Event("gmp-click"));
      expect(opened).toBe(1);
      expect(elements.map(element => element.textContent)).toContain(destination.name);
      dispose();
      expect(removed).toBe(1);
      expect(closed).toBe(1);
      expect(marker!.map).toBeNull();
      expect(host.replaceChildren).toHaveBeenCalledOnce();
    } finally { vi.stubGlobal("document", oldDocument); }
  });
});
