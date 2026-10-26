import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  connection: vi.fn(),
  findMany: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  connection: fixture.connection,
}));
vi.mock("./home.css", () => ({}));
vi.mock("@/components/home-polish.css", () => ({}));
vi.mock("@/services", () => ({ db: { destination: { findMany: fixture.findMany } } }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: any) => React.createElement("a", { href, ...props }, children) }));
vi.mock("next/image", () => ({ default: ({ fill, priority, ...props }: any) => React.createElement("img", props) }));
vi.mock("@/components/home-terrain-map", () => ({ default: ({ destinations }: any) => React.createElement("ul", { "aria-label": "Current destinations" }, destinations.map((d: any) => React.createElement("li", { key: d.id }, d.name))) }));
vi.mock("@/components/home-hero-video", () => ({ default: () => null }));
vi.mock("@/components/home-hero-metrics", () => ({ default: () => null }));
vi.mock("@/components/home-gallery", () => ({ default: () => null }));
vi.mock("@/components/home-season-banner", () => ({ default: () => null }));
vi.mock("@/components/home-planner-story", () => ({ default: () => null }));
vi.mock("@/components/home-scroll-reveal", () => ({ default: ({ children }: any) => children }));
import Home from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.rows = [];
  fixture.connection.mockResolvedValue(undefined);
  fixture.findMany.mockImplementation(async (query: any) => fixture.rows.map(row =>
    Object.fromEntries(Object.keys(query.select).map(key => [key, row[key]]))));
});

it("waits for the real request boundary before querying and reflects subsequent data on each render", async () => {
  let release!: () => void;
  fixture.connection.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
  const first = Home();
  expect(fixture.findMany).not.toHaveBeenCalled();
  release();
  expect(renderToStaticMarkup(await first)).toContain("Xem các điểm đến");
  fixture.rows = ["Synthetic mountain", "Synthetic heritage", "Synthetic market"].map((name, index) => ({
    id: `fixture-${index}`, name, area: "fixture area", category: "fixture category",
    latitude: 23, longitude: 105, media: [], description: "Synthetic authored text",
  }));
  const html = renderToStaticMarkup(await Home());
  for (const row of fixture.rows) expect(html).toContain(row.name);
  expect(html).not.toContain("Xem các điểm đến");
  expect(fixture.connection).toHaveBeenCalledTimes(2);
});

it("does not swallow prerender/request control flow inside the database fallback", async () => {
  const control = new Error("synthetic framework control flow");
  fixture.connection.mockRejectedValueOnce(control);
  await expect(Home()).rejects.toBe(control);
  expect(fixture.findMany).not.toHaveBeenCalled();
});

it("retains the existing readable fallback for a real data failure", async () => {
  fixture.findMany.mockRejectedValue(new Error("synthetic data outage"));
  expect(renderToStaticMarkup(await Home())).toContain("Xem các điểm đến");
});
