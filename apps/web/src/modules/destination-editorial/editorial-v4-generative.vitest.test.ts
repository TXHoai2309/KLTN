import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  editorialLayoutSchema,
  editorialLayoutV1Schema,
  editorialLayoutV2Schema,
  isV1Layout,
  isV2Layout,
  type EditorialLayoutV2,
  type EditorialNodeV2,
  type EditorialContext,
} from "./editorial-contract";
import { buildCanonicalContentAst } from "./editorial-ast";
import { compileEditorialLayout } from "./editorial-compiler";
import { evaluateLayoutQuality } from "./editorial-quality-gate";
import { autoLayoutV2, autoLayout, resolveEditorial } from "./editorial-engine";
import { compareLayoutSignatures, getLayoutSignature } from "./editorial-signature";
import { proposeEditorial } from "./editorial-ai";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
import { ADMIN_IMAGE_USE } from "../destination/destination-media-eligibility";
import { readEditorialContext } from "./editorial-service";
import EditorialRenderer from "@/components/editorial/editorial-renderer";

vi.mock("@/components/map/destination-map", () => ({ default: () => null }));

describe("Editorial Layout DSL v2 — Schema & Security Contract", () => {
  const context: EditorialContext = {
    ...editorialFixture("thiên nhiên", 4),
    name: "Cao nguyên đá Đồng Văn",
    description: "Cao nguyên đá Đồng Văn trải rộng trên bốn huyện miền núi phía Bắc.\n\nCảnh quan đá vôi hùng vĩ\nNơi đây sở hữu các tầng địa chất karst độc đáo hàng trăm triệu năm.\n\nĐời sống bản làng\nNgười Mông, Lô Lô cư trú lâu đời với bản sắc văn hóa đặc sắc.",
  };

  it("validates and compiles a complete, valid V2 generative layout", () => {
    const layout = autoLayoutV2(context);
    expect(isV2Layout(layout)).toBe(true);
    expect(layout.schemaVersion).toBe(2);
    expect(layout.mode).toBe("GENERATIVE");

    const parsed = editorialLayoutSchema.safeParse(layout);
    expect(parsed.success).toBe(true);

    const compiled = compileEditorialLayout(layout, context);
    expect(compiled.nodes.length).toBeGreaterThan(0);
    expect(compiled.media.length).toBeGreaterThan(0);
  });

  it("rejects invalid node types not in allowed primitives", () => {
    const invalidNode = {
      id: "sec-1",
      type: "CUSTOM_REACT_COMPONENT", // prohibited
      hidden: false,
      locked: false,
      children: [],
    };
    const layout = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      sections: [invalidNode],
    };
    const parsed = editorialLayoutV2Schema.safeParse(layout);
    expect(parsed.success).toBe(false);
  });

  it("rejects layouts exceeding maximum allowed section count (> 50)", () => {
    const sections: EditorialNodeV2[] = Array.from({ length: 55 }, (_, i) => ({
      id: `node-${i}`,
      type: "PARAGRAPH" as const,
      hidden: false,
      locked: false,
      text: `Đoạn văn số ${i}`,
      children: [],
    }));

    const layout = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      sections,
    };
    const parsed = editorialLayoutV2Schema.safeParse(layout);
    expect(parsed.success).toBe(false);
  });

  it("rejects deep nesting exceeding maximum depth of 3", () => {
    const deeplyNested: EditorialNodeV2 = {
      id: "level-1",
      type: "SECTION",
      hidden: false,
      locked: false,
      children: [
        {
          id: "level-2",
          type: "GRID",
          hidden: false,
          locked: false,
          children: [
            {
              id: "level-3",
              type: "STACK",
              hidden: false,
              locked: false,
              children: [
                {
                  id: "level-4-illegal",
                  type: "PARAGRAPH",
                  hidden: false,
                  locked: false,
                  children: [
                    {
                      id: "level-5-illegal",
                      type: "PARAGRAPH",
                      hidden: false,
                      locked: false,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const layout = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      sections: [deeplyNested],
    };
    const parsed = editorialLayoutV2Schema.safeParse(layout);
    expect(parsed.success).toBe(false);
  });

  it("bounds maximum columns to 6", () => {
    const overColumnNode: EditorialNodeV2 = {
      id: "grid-over",
      type: "GRID",
      columns: 12, // Maximum allowed is 6
      hidden: false,
      locked: false,
      children: [],
    };
    const layout = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      sections: [overColumnNode],
    };
    const parsed = editorialLayoutV2Schema.safeParse(layout);
    expect(parsed.success).toBe(false);
  });
});

describe("Editorial Content AST & Quality Gate", () => {
  const context: EditorialContext = {
    ...editorialFixture("di tích lịch sử", 3),
    name: "Di tích lịch sử Căng Bắc Mê",
    description: "Căng Bắc Mê là di tích lịch sử thời kỳ kháng chiến chống thực dân Pháp.\n\nDấu tích kiên trung\nNơi đây từng giam giữ nhiều chiến sĩ cách mạng tiền bối.\n\nKhông gian bảo tồn\nHiện nay di tích được tôn tạo, giữ lại các bờ tường đá rêu phong.",
  };

  it("builds canonical content AST with stable IDs and semantic topics", () => {
    const ast = buildCanonicalContentAst(context);
    expect(ast.units.length).toBeGreaterThan(0);

    const intro = ast.units.find(u => u.type === "INTRO");
    expect(intro).toBeDefined();
    expect(intro?.provenance.sourceField).toBe("description");

    const chapter = ast.units.find(u => u.type === "CHAPTER_HEADING");
    expect(chapter).toBeDefined();
    expect(chapter?.text).toBe("Dấu tích kiên trung");
  });

  it("evaluates layout quality and detects content loss or empty sections", () => {
    const layout = autoLayoutV2(context);
    const evaluation = evaluateLayoutQuality(layout, context);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.score).toBeGreaterThanOrEqual(75);

    // Now introduce an empty section and content loss
    const mutilatedLayout: EditorialLayoutV2 = {
      ...layout,
      sections: [
        layout.sections[0]!, // Only HERO, discarding all story content
        {
          id: "empty-sec",
          type: "SECTION",
          hidden: false,
          locked: false,
          children: [],
        },
      ],
    };

    const badEval = evaluateLayoutQuality(mutilatedLayout, context);
    expect(badEval.passed).toBe(false);
    expect(badEval.issues.some(i => i.code === "CONTENT_LOSS")).toBe(true);
    expect(badEval.issues.some(i => i.code === "EMPTY_SECTION")).toBe(true);
  });
});

describe("V4 Generative AI Proposals & True Structural Variation", () => {
  const context: EditorialContext = {
    ...editorialFixture("thiên nhiên", 4),
    name: "Cao nguyên đá Đồng Văn",
    description: "Cao nguyên đá Đồng Văn trải rộng trên bốn huyện miền núi phía Bắc.\n\nCảnh quan đá vôi hùng vĩ\nNơi đây sở hữu các tầng địa chất karst độc đáo hàng trăm triệu năm.\n\nĐời sống bản làng\nNgười Mông, Lô Lô cư trú lâu đời với bản sắc văn hóa đặc sắc.",
  };

  async function generativeFixture() {
    const store = v3TestStore(), db = store.deps.database as any;
    db.$executeRaw = async () => 1;
    db.idempotencyRecord.count = async () => 0;
    const created = await writeDestination(
      new Headers(),
      {
        name: "Cao nguyên đá Đồng Văn",
        description: "Cao nguyên đá Đồng Văn trải rộng trên bốn huyện miền núi phía Bắc.\n\nCảnh quan đá vôi hùng vĩ\nNơi đây sở hữu các tầng địa chất karst độc đáo hàng trăm triệu năm.\n\nĐời sống bản làng\nNgười Mông, Lô Lô cư trú lâu đời với bản sắc văn hóa đặc sắc.",
        area: "Đồng Văn",
        category: "thiên nhiên – thắng cảnh",
        latitude: 23.2,
        longitude: 105.3,
        suggestedDurationMinutes: 180,
        minimumDurationMinutes: 60,
        openingDays: unknownSchedule(),
      },
      "create",
      null,
      store.deps
    );
    if (created.status !== "SUCCESS") throw Error("fixture failed");
    const id = created.data.id;
    const row = store.rows().get(id);
    row.media.push({
      id: "photo-gen-1",
      url: "https://res.cloudinary.com/fixture/image/upload/v1/photo-gen-1.jpg",
      alt: "Toàn cảnh Cao nguyên đá",
      caption: null,
      author: null,
      sourceUrl: null,
      isCover: true,
      position: 0,
      websiteRights: "APPROVED",
      rightsEvidence: "Giấy phép sử dụng hình ảnh số 102/UBND.",
      reviewedBy: null,
      reviewedAt: null,
      storageReference: null,
    });
    row.media.push({
      id: "photo-gen-2",
      url: "https://res.cloudinary.com/fixture/image/upload/v1/photo-gen-2.jpg",
      alt: "Cảnh quan đá vôi karst",
      caption: null,
      author: null,
      sourceUrl: null,
      isCover: false,
      position: 1,
      websiteRights: "APPROVED",
      rightsEvidence: "Giấy phép sử dụng hình ảnh số 102/UBND.",
      reviewedBy: null,
      reviewedAt: null,
      storageReference: null,
    });

    const ctx = await readEditorialContext(id, db);
    const layout = autoLayoutV2(ctx);
    return { store, db, id, row, layout, ctx };
  }

  it("detects significant structural differences between two distinct V2 generative layouts", () => {
    const layout1 = autoLayoutV2(context);

    // Create a structurally varied layout: grid topology instead of linear stack
    const layout2: EditorialLayoutV2 = {
      ...layout1,
      hero: { composition: "EDITORIAL", locked: false },
      sections: [
        layout1.sections[0]!,
        {
          id: "dual-grid",
          type: "GRID",
          columns: 2,
          gap: "LARGE",
          hidden: false,
          locked: false,
          children: [
            {
              id: "col-left",
              type: "PARAGRAPH",
              hidden: false,
              locked: false,
              text: "Cảnh quan đá vôi hùng vĩ",
              children: [],
            },
            {
              id: "col-right",
              type: "IMAGE",
              mediaIds: [context.media[1]!.id],
              hidden: false,
              locked: false,
              children: [],
            },
          ],
        },
        ...layout1.sections.slice(2),
      ],
    };

    const sig1 = getLayoutSignature(layout1);
    const sig2 = getLayoutSignature(layout2);
    const comparison = compareLayoutSignatures(sig1, sig2);

    expect(comparison.level).toBe("SIGNIFICANT");
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  it("proposeEditorial with version 2 completes with structured generative proposal", async () => {
    const f = await generativeFixture();
    const mockLlmResponse = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      design: {
        typography: "MODERN",
        palette: "SLATE",
        rhythm: "IMMERSIVE",
        containerWidth: "STANDARD",
      },
      hero: {
        composition: "PANORAMA",
        locked: false,
      },
      sections: [
        {
          id: "hero",
          type: "HERO",
          mediaIds: [f.row.media[0]!.id],
          title: f.ctx.name,
        },
        {
          id: "lead-section",
          type: "LEAD",
          contentRef: "ast-intro",
          text: "Cao nguyên đá Đồng Văn trải rộng trên bốn huyện miền núi phía Bắc.",
        },
        {
          id: "nature-split",
          type: "IMAGE_TEXT",
          title: "Cảnh quan đá vôi hùng vĩ",
          text: "Nơi đây sở hữu các tầng địa chất karst độc đáo hàng trăm triệu năm.",
          mediaIds: [f.row.media[1]!.id],
          placement: "right",
        },
        {
          id: "culture-para",
          type: "PARAGRAPH",
          title: "Đời sống bản làng",
          text: "Người Mông, Lô Lô cư trú lâu đời với bản sắc văn hóa đặc sắc.",
        },
        {
          id: "sources",
          type: "SOURCES",
          sourceIds: [],
        },
      ],
    };

    const client = {
      complete: vi.fn().mockResolvedValue({
        model: "gpt-6-luna",
        rawText: JSON.stringify(mockLlmResponse),
      }),
    };

    const result = await proposeEditorial(
      new Headers(),
      f.id,
      f.store.deps,
      client,
      {
        version: 2,
        layout: f.layout,
        direction: "AUTO",
      }
    );

    expect(result.status).toBe("PROPOSED");
    expect(isV2Layout(result.layout)).toBe(true);
    expect(result.layout.sections.length).toBe(5);
  });

  it("falls back gracefully and preserves current layout when AI response is malformed", async () => {
    const f = await generativeFixture();
    const client = {
      complete: vi.fn().mockResolvedValue({
        model: "gpt-6-luna",
        rawText: "Not valid JSON output from model",
      }),
    };

    const result = await proposeEditorial(
      new Headers(),
      f.id,
      f.store.deps,
      client,
      {
        version: 2,
        layout: f.layout,
      }
    );

    expect(result.status).toBe("FALLBACK");
    expect(result.layout).toEqual(f.layout);
  });
});

describe("V3.6 Backward Compatibility & Dual-Version Interoperability", () => {
  const context = editorialFixture("thiên nhiên", 3);

  it("parses both V1 and V2 through the discriminated union", () => {
    const v1 = autoLayout(context);
    const v2 = autoLayoutV2(context);

    expect(isV1Layout(v1)).toBe(true);
    expect(isV2Layout(v2)).toBe(true);

    const parsedV1 = editorialLayoutSchema.parse(v1);
    const parsedV2 = editorialLayoutSchema.parse(v2);

    expect(parsedV1.schemaVersion).toBe(1);
    expect(parsedV2.schemaVersion).toBe(2);
  });

  it("shared EditorialRenderer renders both V1 and V2 seamlessly into static markup", () => {
    const v1 = autoLayout(context);
    const v2 = autoLayoutV2(context);

    const resolvedV1 = resolveEditorial(v1, context)!;
    const resolvedV2 = resolveEditorial(v2, context)!;

    const htmlV1 = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolvedV1 }));
    const htmlV2 = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolvedV2 }));

    expect(htmlV1).toContain("Miền xanh");
    expect(htmlV2).toContain("Miền xanh");
    expect(htmlV2).toContain("emg-gen");
  });
});
