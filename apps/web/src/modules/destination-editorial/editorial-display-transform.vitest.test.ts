import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
import { DestinationSummaryCard } from "@/app/destinations/[id]/destination-summary-card";
import type { EditorialNodeV2, ResolvedEditorial } from "./editorial-contract";
import {
  isSentenceLikeEditorialHeading,
  projectPublicEditorialV1,
  projectPublicEditorialV2,
} from "./editorial-display-transform";

describe("P3: destination detail summary, dedup, sentence-H2 & TOC", () => {
  it("detects long (>60 chars) or sentence-like headings cleanly", () => {
    expect(isSentenceLikeEditorialHeading("Dấu ấn địa chất hơn 550 triệu năm")).toBe(false);
    expect(isSentenceLikeEditorialHeading("Sắc màu văn hóa cao nguyên")).toBe(false);
    expect(isSentenceLikeEditorialHeading("Sủng Là nổi bật với cảnh quan thung lũng")).toBe(true);
    expect(isSentenceLikeEditorialHeading("Ngoài giá trị địa chất")).toBe(true);
    expect(isSentenceLikeEditorialHeading("Khi tham quan")).toBe(true);
    expect(isSentenceLikeEditorialHeading("Cổng trời Quản Bạ có thể tham quan quanh năm")).toBe(true);
    expect(isSentenceLikeEditorialHeading("Tiêu đề quá dài vượt ngưỡng sáu mươi ký tự để hiển thị như một tiêu đề mục lục độc lập")).toBe(true);
  });

  it("deduplicates repeated headings/sections, renders sentence H2s as bold leads, removes eyebrow and adds TOC on V2 editorial", () => {
    const sections: EditorialNodeV2[] = [
      { id: "hero", type: "HERO", title: "Cao nguyên đá Đồng Văn", mediaIds: ["img1"] },
      {
        id: "geo-1",
        type: "SECTION",
        title: "Dấu ấn địa chất hơn 550 triệu năm",
        text: "Cao nguyên đá Đồng Văn lưu giữ dấu ấn địa chất hơn 550 triệu năm.",
      },
      {
        id: "sentence-sec",
        type: "SECTION",
        title: "Sủng Là nổi bật với cảnh quan thung lũng",
        text: "Thung lũng bình yên giữa núi đá tai mèo.",
      },
      {
        id: "geo-dup",
        type: "SECTION",
        title: "Dấu ấn địa chất hơn 550 triệu năm",
        text: "Cao nguyên đá Đồng Văn lưu giữ dấu ấn địa chất hơn 550 triệu năm.",
      },
      {
        id: "visit",
        type: "SECTION",
        title: "Trải nghiệm nổi bật",
        text: "Ngắm bình minh trên đèo đá tai mèo.",
      },
    ];

    const projection = projectPublicEditorialV2(sections);
    expect(projection.toc.map(t => t.title)).toEqual([
      "Dấu ấn địa chất hơn 550 triệu năm",
      "Trải nghiệm nổi bật",
    ]);
    expect(projection.headings.get("sentence-sec")?.kind).toBe("lead");

    const editorial: ResolvedEditorial = {
      layout: { schemaVersion: 2, mode: "GENERATIVE", design: { typography: "LITERARY", palette: "FOREST", rhythm: "IMMERSIVE", containerWidth: "STANDARD" }, sections },
      media: [{ id: "img1", url: "https://example.org/p1.jpg", alt: "Cao nguyên đá", caption: "", author: "", sourceUrl: null, width: 1200, height: 800 }],
      sources: [],
    };
    const html = renderToStaticMarkup(
      createElement(EditorialRenderer, {
        data: {
          id: "dest-dv",
          name: "Cao nguyên đá Đồng Văn",
          category: "công viên địa chất",
          area: "khu vực hà giang",
          latitude: 23.28,
          longitude: 105.36,
          suggestedDurationMinutes: 180,
          openingDays: [],
        },
        editorial,
        summarySlot: createElement(DestinationSummaryCard, {
          destinationId: "dest-dv",
          destinationName: "Cao nguyên đá Đồng Văn",
          area: "khu vực hà giang",
          hours: [],
          suggestedDurationMinutes: 180,
          ticketPrice: null,
          hasCoordinates: true,
          mapSlot: createElement("div", { "data-testid": "compact-map" }, "Map"),
        }),
      }),
    );

    expect(html).not.toContain("emg-kicker");
    expect(html).toContain('class="emg-category-sub"');
    expect(html).toContain("Lập lịch với điểm này");
    expect(html).toContain("/assistant?destinationId=dest-dv&amp;mustInclude=dest-dv&amp;intent=plan");
    expect(html).toContain("Chưa có giá vé");
    expect(html).toContain("3 giờ");
    expect(html.match(/<h2[^>]*>Dấu ấn địa chất hơn 550 triệu năm<\/h2>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<h2[^>]*>Sủng Là nổi bật với cảnh quan thung lũng<\/h2>/);
    expect(html).toContain('<p class="emg-lead-heading"><strong>Sủng Là nổi bật với cảnh quan thung lũng</strong></p>');
    expect(html).toContain("Mục lục");
  });

  it("deduplicates V1 editorial blocks identically", () => {
    const v1 = projectPublicEditorialV1([
      { id: "b1", type: "HERO", hidden: false, title: "Lũng Cú", text: "", caption: "", mediaIds: [], sourceIds: [], placement: "left", gallery: "mosaic", crop: "wide", focalX: 50, focalY: 50, entries: [] },
      { id: "b2", type: "TEXT_SECTION", hidden: false, title: "Lịch sử", text: "Đoạn trùng.", caption: "", mediaIds: [], sourceIds: [], placement: "left", gallery: "mosaic", crop: "wide", focalX: 50, focalY: 50, entries: [] },
      { id: "b3", type: "TEXT_SECTION", hidden: false, title: "Lịch sử", text: "Đoạn trùng.", caption: "", mediaIds: [], sourceIds: [], placement: "left", gallery: "mosaic", crop: "wide", focalX: 50, focalY: 50, entries: [] },
    ]);
    expect(v1.blocks).toHaveLength(2);
    expect(v1.toc).toHaveLength(1);
  });
});
