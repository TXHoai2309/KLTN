import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));
import { autoLayoutV2, EditorialLayoutGenerationError, getAllLayoutNodes } from "./editorial-engine";
import { buildCanonicalContentAst } from "./editorial-ast";
import { bacMeContext } from "./__fixtures__/bac-me-v4";

function contextWith(description: string) {
  return {
    ...bacMeContext,
    name: "Điểm đến thử nghiệm",
    category: "",
    area: "",
    description,
    latitude: 23,
    longitude: 105,
    suggestedDurationMinutes: null,
    openingDays: [],
    media: [],
    sources: [],
  };
}

function paragraph(index: number) {
  return `Đoạn thông tin nguồn ${index} ghi nhận những đặc điểm cụ thể của địa hình và cảnh quan quanh điểm đến để người đọc tìm hiểu thêm.`;
}

function expectCanonicalDescriptionInOrder(layout: ReturnType<typeof autoLayoutV2>, context: ReturnType<typeof contextWith>) {
  const renderedText = getAllLayoutNodes(layout).map(node => `${node.title ?? ""}\n\n${node.text ?? ""}`).join("\n\n");
  let cursor = 0;
  for (const unit of buildCanonicalContentAst(context).units.filter(item => item.provenance.sourceField === "description")) {
    const offset = renderedText.indexOf(unit.text, cursor);
    expect(offset, `missing/out-of-order canonical unit ${unit.id}`).toBeGreaterThanOrEqual(0);
    cursor = offset + unit.text.length;
  }
}

describe("bounded deterministic Editorial V2 fallback", () => {
  it("coalesces only as many adjacent paragraph roots as needed and preserves canonical text/order/provenance", () => {
    const chunks = [paragraph(0), `## Khởi đầu\n${paragraph(1)}`, ...Array.from({ length: 63 }, (_, index) => paragraph(index + 2))];
    const context = contextWith(chunks.join("\n\n"));
    const layout = autoLayoutV2(context);

    expect(getAllLayoutNodes(layout)).toHaveLength(50);
    expect(layout.sections.length).toBeLessThanOrEqual(50);
    expectCanonicalDescriptionInOrder(layout, context);
    expect(layout.sections[2]).toMatchObject({
      id: "section-0",
      title: "Khởi đầu",
      headingProvenance: { blockId: "section-0", excerpt: "Khởi đầu" },
    });
    expect(layout.sections[1]).toMatchObject({ type: "LEAD", contentRef: "ast-intro", text: paragraph(0) });
  });

  it("returns a bounded error without a partial layout when source headings prevent safe coalescing", () => {
    const chapters = Array.from({ length: 55 }, (_, index) => `## Chương ${index + 1}\n${paragraph(index + 1)}`);
    const context = contextWith(chapters.join("\n\n"));

    let failure: unknown;
    try { autoLayoutV2(context); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(EditorialLayoutGenerationError);
    expect(failure).toMatchObject({ code: "NODE_LIMIT", expectedNodeCount: 50, actualNodeCount: 57 });
    expect((failure as Error).message).not.toContain(context.description);
  });

  it("leaves a normal-sized deterministic layout unchanged", () => {
    const context = contextWith([paragraph(0), paragraph(1), paragraph(2)].join("\n\n"));
    const layout = autoLayoutV2(context);
    expect(getAllLayoutNodes(layout)).toHaveLength(layout.sections.length);
    expect(layout.sections.filter(section => section.type === "SECTION").map(section => section.text)).toEqual([paragraph(1), paragraph(2)]);
    expectCanonicalDescriptionInOrder(layout, context);
  });
});
