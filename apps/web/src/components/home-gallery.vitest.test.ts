import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("./home-gallery.css", () => ({}));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: any) => React.createElement("a", { href, ...props }, children) }));
vi.mock("next/image", () => ({ default: ({ fill, ...props }: any) => React.createElement("img", props) }));
vi.mock("@/components/protected-link", () => ({ ProtectedLink: ({ children, href, intent, ...props }: any) => React.createElement("a", { href, ...props }, children) }));
import HomeGallery from "./home-gallery";
import HomeSeasonBanner from "./home-season-banner";

it("renders every gallery photo with alt text and keeps the photographer credit", () => {
  const html = renderToStaticMarkup(React.createElement(HomeGallery));
  const images = [...html.matchAll(/<img[^>]*>/g)].map(match => match[0]);
  expect(images).toHaveLength(6);
  for (const image of images) {
    expect(image).toMatch(/src="\/images\/gallery\/[a-z-]+\.webp"/);
    expect(image).toMatch(/alt="[^"]{10,}"/);
  }
  expect(html).toContain("Ảnh: Chu Việt Bắc");
  expect(html).toContain("bản quyền thuộc tác giả");
});

it("links the seasonal banner to the assistant and the trip planner", () => {
  const html = renderToStaticMarkup(React.createElement(HomeSeasonBanner));
  expect(html).toContain('href="/assistant"');
  expect(html).toContain('href="/trips/new"');
  expect(html).toMatch(/alt="[^"]{10,}"/);
});
