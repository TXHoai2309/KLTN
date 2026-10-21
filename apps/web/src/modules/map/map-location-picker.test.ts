import { test } from "node:test";
import assert from "node:assert/strict";
import type * as MapLibre from "maplibre-gl";
import { parseCoordinateInputs } from "./map-model";
import { mountDestinationPinPicker } from "./maplibre-renderer";
import { stadiaStyles } from "./map-config";

type Handler = (...args: never[]) => void;
type FakeMarker = {
  options: { draggable?: boolean; color?: string };
  position: [number, number];
  removed: boolean;
  element: {
    attributes: Record<string, string>;
    handlers: Record<string, (event: KeyboardEvent) => void>;
    tabIndex: number;
    setAttribute(name: string, value: string): void;
    addEventListener(name: string, handler: (event: KeyboardEvent) => void): void;
    removeEventListener(name: string, handler: (event: KeyboardEvent) => void): void;
  };
  events: Record<string, () => void>;
  setLngLat(value: [number, number]): FakeMarker;
  addTo(map: FakeMap): FakeMarker;
  getLngLat(): { lng: number; lat: number };
  getElement(): FakeMarker["element"];
  on(name: string, handler: () => void): FakeMarker;
  remove(): FakeMarker;
};
type FakeMap = {
  options: { center: [number, number]; zoom: number };
  handlers: Record<string, Handler>;
  camera: { center: [number, number]; zoom: number } | null;
  removed: boolean;
  on(name: string, handler: Handler): FakeMap;
  styles: string[];
  setStyle(style: string): FakeMap;
  off(name: string, handler: Handler): FakeMap;
  getZoom(): number;
  jumpTo(camera: { center: [number, number]; zoom: number }): FakeMap;
  remove(): void;
};

test("coordinate input parser requires a complete finite in-range pair", () => {
  assert.deepEqual(parseCoordinateInputs("23.12", "105.34"), { latitude: 23.12, longitude: 105.34 });
  assert.deepEqual(parseCoordinateInputs("-90", "180"), { latitude: -90, longitude: 180 });
  for (const pair of [["", "105"], ["23", ""], ["NaN", "105"], ["91", "105"], ["23", "181"]]) {
    assert.equal(parseCoordinateInputs(pair[0]!, pair[1]!), null);
  }
});

test("Admin pin picker supports click, drag, manual coordinate sync and cleanup", () => {
  const previousDocument = globalThis.document;
  const markers: FakeMarker[] = [];
  const maps: FakeMap[] = [];
  const makeElement = () => {
    const attributes: Record<string, string> = {};
    const handlers: Record<string, (event: KeyboardEvent) => void> = {};
    return {
      attributes, handlers, tabIndex: -1,
      setAttribute(name: string, value: string) { attributes[name] = value; },
      addEventListener(name: string, handler: (event: KeyboardEvent) => void) { handlers[name] = handler; },
      removeEventListener(name: string, handler: (event: KeyboardEvent) => void) { if (handlers[name] === handler) delete handlers[name]; },
    };
  };
  globalThis.document = { createElement: () => makeElement() } as unknown as Document;
  const library = {
    Map: class {
      options: FakeMap["options"];
      handlers: FakeMap["handlers"] = {};
      camera: FakeMap["camera"] = null;
      removed = false;
      styles: string[] = [];
      constructor(options: FakeMap["options"]) { this.options = options; maps.push(this as unknown as FakeMap); }
      on(name: string, handler: Handler) { this.handlers[name] = handler; return this; }
      off(name: string, handler: Handler) { if (this.handlers[name] === handler) delete this.handlers[name]; return this; }
      getZoom() { return this.camera?.zoom ?? this.options.zoom; }
      setStyle(style: string) { this.styles.push(style); return this; }
      jumpTo(camera: NonNullable<FakeMap["camera"]>) { this.camera = camera; return this; }
      remove() { this.removed = true; }
    },
    Marker: class {
      options: FakeMarker["options"];
      position: [number, number] = [0, 0];
      removed = false;
      element = makeElement();
      events: Record<string, () => void> = {};
      constructor(options: FakeMarker["options"]) { this.options = options; markers.push(this as unknown as FakeMarker); }
      setLngLat(value: [number, number]) { this.position = value; this.removed = false; return this; }
      addTo(_map: FakeMap) { return this; }
      getLngLat() { return { lng: this.position[0], lat: this.position[1] }; }
      getElement() { return this.element; }
      on(name: string, handler: () => void) { this.events[name] = handler; return this; }
      remove() { this.removed = true; return this; }
    },
  } as unknown as typeof MapLibre;

  try {
    const changed: { latitude: number; longitude: number }[] = [];
    const session = mountDestinationPinPicker({} as HTMLDivElement, library, { latitude: 23, longitude: 105 }, stadiaStyles.light, coordinate => changed.push(coordinate), () => {}, () => {});
    const map = maps[0]!;
    assert.deepEqual(map.options.center, [105, 23]);
    assert.equal(markers[0]?.options.draggable, true);
    assert.equal(markers[0]?.element.tabIndex, 0);
    assert.match(markers[0]?.element.attributes["aria-label"] ?? "", /phím mũi tên/);
    assert.equal(markers[0]?.element.attributes.role, "group");

    map.handlers.click?.({ lngLat: { lat: 23.25, lng: 105.5 } } as never);
    assert.deepEqual(changed.at(-1), { latitude: 23.25, longitude: 105.5 });
    assert.deepEqual(markers[0]?.position, [105.5, 23.25]);

    markers[0]!.position = [105.6, 23.3];
    markers[0]!.events.dragend?.();
    assert.deepEqual(changed.at(-1), { latitude: 23.3, longitude: 105.6 });

    let prevented = false;
    markers[0]!.element.handlers.keydown?.({ key: "ArrowRight", shiftKey: false, preventDefault: () => { prevented = true; } } as KeyboardEvent);
    assert.equal(prevented, true);
    assert.deepEqual(changed.at(-1), { latitude: 23.3, longitude: 105.6001 });
    assert.deepEqual(markers[0]?.position, [105.6001, 23.3]);
    assert.match(markers[0]?.element.attributes["aria-label"] ?? "", /105\.600100/);

    session.setCoordinates(parseCoordinateInputs("24.01", "106.02"));
    assert.deepEqual(markers[0]?.position, [106.02, 24.01]);
    assert.deepEqual(map.camera, { center: [106.02, 24.01], zoom: 12 });

    const changesBeforeTheme = changed.length;
    session.setStyle(stadiaStyles.dark); session.setStyle(stadiaStyles.dark);
    assert.deepEqual(map.styles, [stadiaStyles.dark]); assert.equal(maps.length, 1);
    assert.equal(markers.length, 1); assert.equal(markers[0]?.removed, false);
    assert.deepEqual(markers[0]?.position, [106.02, 24.01]);
    assert.equal(changed.length, changesBeforeTheme);

    session.setCoordinates(null);
    assert.equal(markers[0]?.removed, true);
    assert.equal(markers[0]?.element.handlers.keydown, undefined);
    session.dispose();
    assert.equal(map.removed, true);
    session.setStyle(stadiaStyles.light); assert.deepEqual(map.styles, [stadiaStyles.dark]);
    assert.deepEqual(Object.keys(map.handlers).sort(), []);
  } finally {
    globalThis.document = previousDocument;
  }
});
