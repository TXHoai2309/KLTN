import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DestinationCardImage from "@/components/destination-card-image";
import {
  FavoriteContent,
  buildFavoritesPlannerHref,
} from "@/app/favorites/favorites-view";
import type { FavoriteItem } from "@/modules/favorite/favorite-contract";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const destA: FavoriteItem = {
  favoriteId: "fav-a",
  targetId: "dest-a",
  title: "Cột cờ Lũng Cú",
  availability: "AVAILABLE",
  href: "/destinations/dest-a",
  area: "khu vực hà giang",
};
const destB: FavoriteItem = {
  favoriteId: "fav-b",
  targetId: "dest-b",
  title: "Đèo Mã Pì Lèng",
  availability: "AVAILABLE",
  href: "/destinations/dest-b",
};
const hiddenDest: FavoriteItem = {
  favoriteId: "fav-h",
  targetId: "dest-h",
  title: "Điểm ẩn",
  availability: "UNAVAILABLE",
  href: null,
};

describe("Favorites planner handoff (P8)", () => {
  it("builds /assistant?mustInclude=...&intent=plan from selected available favorites only", () => {
    expect(buildFavoritesPlannerHref([destA, hiddenDest, destB])).toBe(
      "/assistant?mustInclude=dest-a%2Cdest-b&intent=plan",
    );
    expect(
      buildFavoritesPlannerHref([destA, destB], new Set(["dest-a"])),
    ).toBe("/assistant?mustInclude=dest-b&intent=plan");
    expect(
      buildFavoritesPlannerHref([destA, hiddenDest], new Set(["dest-a"])),
    ).toBeNull();
  });

  it("hides generic area pill on favorite destination cards and renders selection toggle", () => {
    const html = renderToStaticMarkup(
      createElement(FavoriteContent, {
        state: "ready",
        group: "destinations",
        items: [destA, hiddenDest],
        retry() {},
        onRemoved() {},
        deselectedTargetIds: new Set<string>(),
        onToggleSelectForPlan() {},
      }),
    );
    expect(html).not.toContain("khu vực hà giang");
    expect(html).toContain("Đưa vào lịch");
    const fallbackHtml = renderToStaticMarkup(
      createElement(DestinationCardImage, { image: null }),
    );
    expect(fallbackHtml).toContain("destination-card-image-fallback");
    expect(fallbackHtml).toContain("Chưa có ảnh");
  });
});
