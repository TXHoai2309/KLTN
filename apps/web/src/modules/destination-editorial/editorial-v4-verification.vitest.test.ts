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
import { validateAiProposalV2 } from "./editorial-ai";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import EditorialRenderer from "@/components/editorial/editorial-renderer";

vi.mock("@/components/map/destination-map", () => ({ default: () => null }));

describe("KLTN V4.0 — Generative Layout Engine Comprehensive Fixture Verification", () => {
  // -------------------------------------------------------------
  // FIXTURE A: Cao nguyên đá Đồng Văn (Nature/Karst, 3 photos)
  // -------------------------------------------------------------
  const fixtureA: EditorialContext = {
    ...editorialFixture("thiên nhiên – thắng cảnh", 3),
    name: "Cao nguyên đá Đồng Văn",
    description: `Cao nguyên đá Đồng Văn là công viên địa chất toàn cầu UNESCO đầu tiên tại Việt Nam.

Địa hình karst hùng vĩ
Các tầng đá vôi xám tai mèo trải rộng qua bốn huyện Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc.

Bản làng giữa thung lũng đá
Đời sống đồng bào Mông mộc mạc bên những hàng rào đá xếp tay vững chãi qua bao mùa sương gió.`,
  };

  // -------------------------------------------------------------
  // FIXTURE B: Di tích lịch sử Căng Bắc Mê (Heritage, 5 photos, Markdown)
  // -------------------------------------------------------------
  const fixtureB: EditorialContext = {
    ...editorialFixture("di tích lịch sử", 5),
    name: "Di tích lịch sử Căng Bắc Mê",
    description: `Căng Bắc Mê là di tích lịch sử ghi dấu thời kỳ đấu tranh cách mạng kiên cường của các chiến sĩ cộng sản.

## Dấu tích kiên trung nơi rừng thiêng
Nơi đây từng là đồn binh do thực dân Pháp xây dựng, sau đó chuyển thành trại giam các chiến sĩ cách mạng tiền khởi nghĩa.

## Kiến trúc nhà giam và bờ tường đá
Những bờ tường đá rêu phong cổ kính và hệ thống vọng gác vẫn sừng sững bên dòng sông Gâm.

## Giá trị di sản và ký ức lịch sử
Di tích là trường học cách mạng tiêu biểu, nơi tôi luyện ý chí kiên trung của nhiều nhà lãnh đạo tiền bối.

## Kinh nghiệm tham quan và bảo tồn
Du khách nên dành khoảng 60 phút để tìm hiểu hiện vật và tuân thủ các quy định bảo vệ di tích.`,
  };

  // -------------------------------------------------------------
  // FIXTURE C: Làng Lô Lô Chải (Culture/Village, 4 photos)
  // -------------------------------------------------------------
  const fixtureC: EditorialContext = {
    ...editorialFixture("làng du lịch – bản làng", 4),
    name: "Làng văn hóa du lịch Lô Lô Chải",
    description: `Làng Lô Lô Chải nằm nép mình bình yên dưới chân núi Rồng kỳ vĩ gần Cột cờ Lũng Cú.

Kiến trúc nhà trình tường đất sét
Những ngôi nhà mái ngói âm dương cổ kính đã qua hàng trăm năm gìn giữ nét văn hóa nguyên bản.

Sắc màu thổ cẩm và đời sống bản địa
Phụ nữ người Lô Lô Đen tự tay thêu dệt những bộ trang phục rực rỡ sắc màu truyền thống bên hiên nhà.`,
  };

  // -------------------------------------------------------------
  // FIXTURE D: Nho Quế – Hẻm Tu Sản (Landscape, 6 photos)
  // -------------------------------------------------------------
  const fixtureD: EditorialContext = {
    ...editorialFixture("thiên nhiên – thắng cảnh", 6),
    name: "Hẻm Tu Sản – Sông Nho Quế",
    description: `Hẻm Tu Sản được mệnh danh là hẻm vực sâu nhất Đông Nam Á với vách đá dựng đứng kỳ vĩ.

Dòng sông xanh ngọc bích
Dòng Nho Quế uốn lượn như dải lụa xanh biếc len lỏi qua chân đèo Mã Pí Lèng hiểm trở.

Hành trình trải nghiệm chèo thuyền
Du khách lướt thuyền giữa đôi bờ vách đá sừng sững cao hàng trăm mét để cảm nhận sự kỳ vĩ của thiên nhiên.`,
  };

  // -------------------------------------------------------------
  // FIXTURE E: Destination không có ảnh (0 photos)
  // -------------------------------------------------------------
  const fixtureE: EditorialContext = {
    ...editorialFixture("thiên nhiên", 0),
    name: "Điểm khám phá hoang sơ chưa có ảnh",
    description: `Một không gian hoang sơ chưa được ghi nhận trong thư viện tư liệu hình ảnh.

Cảm nhận bước chân lữ hành
Nơi đây giữ trọn vẹn vẻ đẹp tĩnh lặng của thiên nhiên nguyên sơ nơi rẻo cao Hà Giang.`,
  };

  // -------------------------------------------------------------
  // FIXTURE F: Destination có đúng 1 ảnh
  // -------------------------------------------------------------
  const fixtureF: EditorialContext = {
    ...editorialFixture("văn hóa", 1),
    name: "Chợ phiên vùng cao",
    description: `Chợ phiên là nét sinh hoạt văn hóa đặc sắc của đồng bào các dân tộc thiểu số.

Sắc màu chợ phiên
Tiếng cười nói rộn rã hòa cùng sắc màu váy áo thổ cẩm tạo nên bức tranh văn hóa sinh động.`,
  };

  // -------------------------------------------------------------
  // FIXTURE G: Destination có văn bản dài và nhiều nguồn
  // -------------------------------------------------------------
  const fixtureG: EditorialContext = {
    ...editorialFixture("di tích lịch sử", 4),
    name: "Địa đạo và căn cứ kháng chiến",
    description: `Căn cứ kháng chiến là trung tâm chỉ huy quân sự quan trọng trong thời kỳ bảo vệ biên cương.

Bối cảnh lịch sử và địa hình chiến lược
Địa hình hiểm trở với các hang đá tự nhiên và rừng rậm nhiệt đới che chở cho sở chỉ huy. Các chiến sĩ đã bí mật đào hào, đắp ụ súng và thiết lập mạng lưới liên lạc dày đặc.

Hệ thống hầm ngầm và hậu cần
Hệ thống hầm ngầm kiên cố sâu trong lòng núi đá vôi giúp che chắn trước các đợt không kích dữ dội. Trong hầm có trạm xá dã chiến, kho lương thực và phòng điện đài.

Chiến công oanh liệt và tinh thần quả cảm
Nhiều trận đánh oanh liệt đã diễn ra tại các cao điểm xung quanh căn cứ, bẻ gãy các đợt tiến công của đối phương. Tinh thần đoàn kết quân dân đã làm nên chiến thắng lịch sử.

Ý nghĩa giáo dục truyền thống cách mạng
Ngày nay khu căn cứ trở thành địa chỉ đỏ giáo dục truyền thống yêu nước cho các thế hệ trẻ mai sau.`,
    sources: [
      { id: "src-1", title: "Lịch sử kháng chiến tỉnh Hà Giang (Tập 1)", url: "https://example.com/su-ha-giang", websiteRights: "APPROVED" },
      { id: "src-2", title: "Bảo tàng Lịch sử Quân sự Việt Nam", url: "https://example.com/btqsvnc", websiteRights: "APPROVED" },
      { id: "src-3", title: "Cổng thông tin điện tử tỉnh Hà Giang", url: "https://hagiang.gov.vn", websiteRights: "APPROVED" },
      { id: "src-4", title: "Hồ sơ xếp hạng Di tích Quốc gia số 45/QĐ-BVHTTDL", url: "https://example.com/di-tich", websiteRights: "APPROVED" },
      { id: "src-5", title: "Tạp chí Di sản Văn hóa số 88", url: "https://example.com/tap-chi-di-san", websiteRights: "APPROVED" },
    ],
  };

  // =========================================================================
  // TEST SUITE 1: VERIFY FIXTURES A - G & ZERO CONTENT LOSS
  // =========================================================================
  describe("Section 2 & 4: Fixture Verification & 100% Zero Content Loss", () => {
    const fixtures = [
      { name: "Fixture A (Cao nguyên đá Đồng Văn - Nature)", ctx: fixtureA, minPhotos: 3 },
      { name: "Fixture B (Căng Bắc Mê - Heritage)", ctx: fixtureB, minPhotos: 5 },
      { name: "Fixture C (Làng Lô Lô Chải - Culture)", ctx: fixtureC, minPhotos: 4 },
      { name: "Fixture D (Nho Quế - Landscape)", ctx: fixtureD, minPhotos: 6 },
      { name: "Fixture E (No Photo - Text only)", ctx: fixtureE, minPhotos: 0 },
      { name: "Fixture F (Single Photo)", ctx: fixtureF, minPhotos: 1 },
      { name: "Fixture G (Long text & 5 sources)", ctx: fixtureG, minPhotos: 4 },
    ];

    for (const f of fixtures) {
      it(`verifies ${f.name} achieves 100% content preservation, valid DSL v2, and no content loss`, () => {
        const ast = buildCanonicalContentAst(f.ctx);
        expect(ast.units.length).toBeGreaterThan(0);

        // Every paragraph and intro has a non-empty SHA-256 hash
        for (const u of ast.units) {
          expect(u.hash).toBeDefined();
          expect(u.hash.length).toBe(12);
          expect(u.provenance.sourceField).toBeDefined();
        }

        const layout = autoLayoutV2(f.ctx);
        expect(isV2Layout(layout)).toBe(true);
        expect(layout.schemaVersion).toBe(2);
        expect(layout.mode).toBe("GENERATIVE");

        const compiled = compileEditorialLayout(layout, f.ctx, { ast });
        const quality = evaluateLayoutQuality(layout, f.ctx, { ast, compiled });

        // Quality Gate Verification
        expect(quality.passed).toBe(true);
        expect(quality.score).toBeGreaterThanOrEqual(70);

        // ZERO CONTENT LOSS VERIFICATION
        expect(quality.metrics.contentPreservationRatio).toBe(1.0); // Exactly 100%
        expect(quality.metrics.missingUnitIds).toEqual([]); // Zero missing units!
        expect(quality.metrics.missingUnitHashes).toEqual([]); // Zero missing hashes!
        expect(quality.issues.some(i => i.code === "CONTENT_LOSS")).toBe(false);

        // Structural Integrity
        expect(quality.issues.some(i => i.code === "EMPTY_SECTION")).toBe(false);
        expect(quality.issues.some(i => i.code === "DUPLICATE_HEADING")).toBe(false);
        expect(quality.issues.some(i => i.code === "DUPLICATE_MEDIA")).toBe(false);

        // Media Expectations
        if (f.minPhotos === 0) {
          expect(compiled.media.length).toBe(0);
          expect(compiled.nodes[0]?.mediaIds.length).toBe(0);
        } else {
          expect(compiled.media.length).toBeGreaterThanOrEqual(1);
          expect(compiled.nodes[0]?.mediaIds.length).toBe(1); // Hero uses 1 image
        }

        // Markdown Cleanliness Check
        for (const n of compiled.nodes) {
          expect(n.title).not.toMatch(/^#+\s+/);
          expect(n.title).not.toContain("**");
          expect(n.text).not.toContain("**");
        }
      });
    }

    it("specifically audits Căng Bắc Mê for no duplicate headings and preserved historical narrative", () => {
      const ast = buildCanonicalContentAst(fixtureB);
      const layout = autoLayoutV2(fixtureB);
      const compiled = compileEditorialLayout(layout, fixtureB, { ast });

      const headingTitles = compiled.nodes.map(n => n.title).filter(Boolean);
      const uniqueHeadings = new Set(headingTitles.map(t => t.toLowerCase()));
      expect(uniqueHeadings.size).toBe(headingTitles.length);

      // Verify that all 4 historical sections are present
      expect(headingTitles).toContain("Dấu tích kiên trung nơi rừng thiêng");
      expect(headingTitles).toContain("Kiến trúc nhà giam và bờ tường đá");
      expect(headingTitles).toContain("Giá trị di sản và ký ức lịch sử");
      expect(headingTitles).toContain("Kinh nghiệm tham quan và bảo tồn");
    });
  });

  // =========================================================================
  // TEST SUITE 2: TRUE GENERATIVE LAYOUT VARIATIONS (CĂNG BẮC MÊ)
  // =========================================================================
  describe("Section 3: True Structural Variation (3 Distinct V2 Layouts for Căng Bắc Mê)", () => {
    const baseCtx = fixtureB;
    const mediaIds = baseCtx.media.map(m => m.id);

    // LAYOUT A: Editorial Hero, 2-column history section, Timeline, Gallery mosaic, Map/Sources
    const layoutA: EditorialLayoutV2 = editorialLayoutV2Schema.parse({
      schemaVersion: 2,
      mode: "GENERATIVE",
      design: {
        typography: "EDITORIAL_SERIF",
        palette: "SLATE",
        rhythm: "IMMERSIVE",
        containerWidth: "STANDARD",
      },
      hero: { composition: "EDITORIAL", locked: false },
      sections: [
        {
          id: "hero",
          type: "HERO",
          mediaIds: [mediaIds[0]!],
          title: baseCtx.name,
          hidden: false,
          locked: false,
        },
        {
          id: "intro-lead",
          type: "LEAD",
          contentRef: "ast-intro",
          text: "Căng Bắc Mê là di tích lịch sử ghi dấu thời kỳ đấu tranh cách mạng kiên cường của các chiến sĩ cộng sản.",
          hidden: false,
          locked: false,
        },
        {
          id: "history-col",
          type: "COLUMNS",
          columns: 2,
          gap: "LARGE",
          hidden: false,
          locked: false,
          children: [
            {
              id: "sec-chien-si",
              type: "PARAGRAPH",
              title: "Dấu tích kiên trung nơi rừng thiêng",
              text: "Nơi đây từng là đồn binh do thực dân Pháp xây dựng, sau đó chuyển thành trại giam các chiến sĩ cách mạng tiền khởi nghĩa.",
              hidden: false,
              locked: false,
            },
            {
              id: "sec-kien-truc",
              type: "PARAGRAPH",
              title: "Kiến trúc nhà giam và bờ tường đá",
              text: "Những bờ tường đá rêu phong cổ kính và hệ thống vọng gác vẫn sừng sững bên dòng sông Gâm.",
              hidden: false,
              locked: false,
            },
          ],
        },
        {
          id: "sec-timeline",
          type: "TIMELINE",
          title: "Các mốc lịch sử",
          hidden: false,
          locked: false,
          entries: [
            {
              label: "Năm 1938",
              text: "Thực dân Pháp xây dựng đồn binh Căng Bắc Mê nhằm kiểm soát tuyến đường thủy bộ.",
              sourceIds: [baseCtx.sources[0]?.id || "src-0"],
            },
            {
              label: "Năm 1940 - 1945",
              text: "Chuyển thành căng giam giữ tù chính trị cách mạng kiên trung.",
              sourceIds: [baseCtx.sources[0]?.id || "src-0"],
            },
          ],
        },
        {
          id: "heritage-text",
          type: "SECTION",
          title: "Giá trị di sản và ký ức lịch sử",
          text: "Di tích là trường học cách mạng tiêu biểu, nơi tôi luyện ý chí kiên trung của nhiều nhà lãnh đạo tiền bối.",
          hidden: false,
          locked: false,
        },
        {
          id: "visit-text",
          type: "SECTION",
          title: "Kinh nghiệm tham quan và bảo tồn",
          text: "Du khách nên dành khoảng 60 phút để tìm hiểu hiện vật và tuân thủ các quy định bảo vệ di tích.",
          hidden: false,
          locked: false,
        },
        {
          id: "heritage-gallery",
          type: "GALLERY",
          columns: 3,
          gap: "MEDIUM",
          mediaIds: [mediaIds[1]!, mediaIds[2]!, mediaIds[3]!],
          hidden: false,
          locked: false,
        },
        {
          id: "sources",
          type: "SOURCES",
          sourceIds: baseCtx.sources.map(s => s.id),
          hidden: false,
          locked: false,
        },
      ],
    });

    // LAYOUT B: Image-led Panorama Hero, narrative split alternating large image, Asymmetric Grid, Facts
    const layoutB: EditorialLayoutV2 = editorialLayoutV2Schema.parse({
      schemaVersion: 2,
      mode: "GENERATIVE",
      design: {
        typography: "MODERN",
        palette: "FOREST",
        rhythm: "COMPACT",
        containerWidth: "WIDE",
      },
      hero: { composition: "PANORAMA", locked: false },
      sections: [
        {
          id: "hero",
          type: "HERO",
          mediaIds: [mediaIds[1]!],
          title: baseCtx.name,
          hidden: false,
          locked: false,
        },
        {
          id: "intro-lead",
          type: "LEAD",
          contentRef: "ast-intro",
          text: "Căng Bắc Mê là di tích lịch sử ghi dấu thời kỳ đấu tranh cách mạng kiên cường của các chiến sĩ cộng sản.",
          hidden: false,
          locked: false,
        },
        {
          id: "story-split-1",
          type: "IMAGE_TEXT",
          title: "Dấu tích kiên trung nơi rừng thiêng",
          text: "Nơi đây từng là đồn binh do thực dân Pháp xây dựng, sau đó chuyển thành trại giam các chiến sĩ cách mạng tiền khởi nghĩa.",
          mediaIds: [mediaIds[2]!],
          placement: "right",
          columns: 2,
          hidden: false,
          locked: false,
        },
        {
          id: "story-split-2",
          type: "IMAGE_TEXT",
          title: "Kiến trúc nhà giam và bờ tường đá",
          text: "Những bờ tường đá rêu phong cổ kính và hệ thống vọng gác vẫn sừng sững bên dòng sông Gâm.",
          mediaIds: [mediaIds[3]!],
          placement: "left",
          columns: 2,
          hidden: false,
          locked: false,
        },
        {
          id: "asymmetric-grid",
          type: "GRID",
          columns: 2,
          gap: "LARGE",
          hidden: false,
          locked: false,
          children: [
            {
              id: "grid-cell-1",
              type: "SECTION",
              title: "Giá trị di sản và ký ức lịch sử",
              text: "Di tích là trường học cách mạng tiêu biểu, nơi tôi luyện ý chí kiên trung của nhiều nhà lãnh đạo tiền bối.",
              hidden: false,
              locked: false,
            },
            {
              id: "grid-cell-2",
              type: "SECTION",
              title: "Kinh nghiệm tham quan và bảo tồn",
              text: "Du khách nên dành khoảng 60 phút để tìm hiểu hiện vật và tuân thủ các quy định bảo vệ di tích.",
              hidden: false,
              locked: false,
            },
          ],
        },
        {
          id: "facts-section",
          type: "FACTS",
          hidden: false,
          locked: false,
        },
        {
          id: "sources",
          type: "SOURCES",
          sourceIds: baseCtx.sources.map(s => s.id),
          hidden: false,
          locked: false,
        },
      ],
    });

    // LAYOUT C: Split Hero, text-first storytelling, Image Mosaic, Map/Sources
    const layoutC: EditorialLayoutV2 = editorialLayoutV2Schema.parse({
      schemaVersion: 2,
      mode: "GENERATIVE",
      design: {
        typography: "HUMANIST",
        palette: "EARTH",
        rhythm: "RELAXED",
        containerWidth: "NARROW",
      },
      hero: { composition: "SPLIT", locked: false },
      sections: [
        {
          id: "hero",
          type: "HERO",
          mediaIds: [mediaIds[2]!],
          title: baseCtx.name,
          hidden: false,
          locked: false,
        },
        {
          id: "intro-lead",
          type: "LEAD",
          contentRef: "ast-intro",
          text: "Căng Bắc Mê là di tích lịch sử ghi dấu thời kỳ đấu tranh cách mạng kiên cường của các chiến sĩ cộng sản.",
          hidden: false,
          locked: false,
        },
        {
          id: "narrative-flow",
          type: "STACK",
          hidden: false,
          locked: false,
          children: [
            {
              id: "flow-1",
              type: "PARAGRAPH",
              title: "Dấu tích kiên trung nơi rừng thiêng",
              text: "Nơi đây từng là đồn binh do thực dân Pháp xây dựng, sau đó chuyển thành trại giam các chiến sĩ cách mạng tiền khởi nghĩa.",
              hidden: false,
              locked: false,
            },
            {
              id: "flow-2",
              type: "PARAGRAPH",
              title: "Kiến trúc nhà giam và bờ tường đá",
              text: "Những bờ tường đá rêu phong cổ kính và hệ thống vọng gác vẫn sừng sững bên dòng sông Gâm.",
              hidden: false,
              locked: false,
            },
            {
              id: "flow-3",
              type: "PARAGRAPH",
              title: "Giá trị di sản và ký ức lịch sử",
              text: "Di tích là trường học cách mạng tiêu biểu, nơi tôi luyện ý chí kiên trung của nhiều nhà lãnh đạo tiền bối.",
              hidden: false,
              locked: false,
            },
            {
              id: "flow-4",
              type: "PARAGRAPH",
              title: "Kinh nghiệm tham quan và bảo tồn",
              text: "Du khách nên dành khoảng 60 phút để tìm hiểu hiện vật và tuân thủ các quy định bảo vệ di tích.",
              hidden: false,
              locked: false,
            },
          ],
        },
        {
          id: "photo-mosaic",
          type: "IMAGE_MOSAIC",
          columns: 3,
          gap: "SMALL",
          mediaIds: [mediaIds[0]!, mediaIds[3]!, mediaIds[4]!],
          hidden: false,
          locked: false,
        },
        {
          id: "map-section",
          type: "MAP",
          title: "Vị trí di tích",
          hidden: false,
          locked: false,
        },
        {
          id: "sources",
          type: "SOURCES",
          sourceIds: baseCtx.sources.map(s => s.id),
          hidden: false,
          locked: false,
        },
      ],
    });

    it("validates all 3 layouts against editorialLayoutV2Schema", () => {
      expect(editorialLayoutV2Schema.safeParse(layoutA).success).toBe(true);
      expect(editorialLayoutV2Schema.safeParse(layoutB).success).toBe(true);
      expect(editorialLayoutV2Schema.safeParse(layoutC).success).toBe(true);
    });

    it("verifies 100% content preservation across all 3 structural variations", () => {
      const ast = buildCanonicalContentAst(baseCtx);
      for (const layout of [layoutA, layoutB, layoutC]) {
        const quality = evaluateLayoutQuality(layout, baseCtx, { ast });
        expect(quality.passed).toBe(true);
        expect(quality.metrics.contentPreservationRatio).toBe(1.0);
        expect(quality.metrics.missingUnitIds).toHaveLength(0);
      }
    });

    it("proves substantial structural & topological differences between Layout A, B, and C", () => {
      const sigA = getLayoutSignature(layoutA);
      const sigB = getLayoutSignature(layoutB);
      const sigC = getLayoutSignature(layoutC);

      const diffAB = compareLayoutSignatures(sigA, sigB);
      const diffAC = compareLayoutSignatures(sigA, sigC);
      const diffBC = compareLayoutSignatures(sigB, sigC);

      // ALL THREE PAIRS MUST BE SIGNIFICANTLY DIFFERENT
      expect(diffAB.level).toBe("SIGNIFICANT");
      expect(diffAC.level).toBe("SIGNIFICANT");
      expect(diffBC.level).toBe("SIGNIFICANT");

      // Verify specific topological differences
      expect(sigA.heroComposition).toBe("EDITORIAL");
      expect(sigB.heroComposition).toBe("PANORAMA");
      expect(sigC.heroComposition).toBe("SPLIT");

      expect(sigA.blockTypes).toContain("COLUMNS");
      expect(sigA.blockTypes).toContain("TIMELINE");

      expect(sigB.blockTypes).toContain("IMAGE_TEXT");
      expect(sigB.blockTypes).toContain("GRID");

      expect(sigC.blockTypes).toContain("STACK");
      expect(sigC.blockTypes).toContain("IMAGE_MOSAIC");

      // Hero image distribution is distinct
      expect(sigA.heroMediaId).not.toBe(sigB.heroMediaId);
      expect(sigB.heroMediaId).not.toBe(sigC.heroMediaId);
    });
  });

  // =========================================================================
  // TEST SUITE 3: V3.6 BACKWARD COMPATIBILITY & DUAL-VERSION RUNTIME
  // =========================================================================
  describe("Section 6 & 8: V3.6 Compatibility & Media/Source Security", () => {
    it("preserves V1 layouts without mutating schemaVersion or structure on read", () => {
      const v1 = autoLayout(fixtureA);
      expect(isV1Layout(v1)).toBe(true);
      expect(v1.schemaVersion).toBe(1);

      // Discriminated union parses it directly as V1
      const parsed = editorialLayoutSchema.parse(v1);
      expect(parsed.schemaVersion).toBe(1);
      if (isV1Layout(parsed)) {
        expect(parsed.family).toBeDefined();
        expect(parsed.blocks.length).toBeGreaterThan(0);
      } else {
        throw new Error("Parsed V1 as V2 unexpectedly");
      }
    });

    it("EditorialRenderer renders both V1 and V2 with public/admin parity", () => {
      const v1 = autoLayout(fixtureA);
      const v2 = autoLayoutV2(fixtureA);

      const resolvedV1 = resolveEditorial(v1, fixtureA)!;
      const resolvedV2 = resolveEditorial(v2, fixtureA)!;

      const htmlV1 = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: fixtureA, editorial: resolvedV1 }));
      const htmlV2 = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: fixtureA, editorial: resolvedV2 }));

      // Both must include the destination name and core prose
      expect(htmlV1).toContain("Cao nguyên đá Đồng Văn");
      expect(htmlV2).toContain("Cao nguyên đá Đồng Văn");
      expect(htmlV1).toContain("Địa hình karst hùng vĩ");
      expect(htmlV2).toContain("Địa hình karst hùng vĩ");

      // V2 renders with generative class namespace
      expect(htmlV2).toContain("emg-gen");
    });

    it("rejects AI proposals attempting to inject arbitrary external media URLs or IDs", () => {
      const base = autoLayoutV2(fixtureA);
      const maliciousAiRaw = JSON.stringify({
        schemaVersion: 2,
        mode: "GENERATIVE",
        design: { typography: "MODERN", palette: "FOREST", rhythm: "IMMERSIVE", containerWidth: "STANDARD" },
        hero: { composition: "PANORAMA", locked: false },
        sections: [
          {
            id: "hero",
            type: "HERO",
            mediaIds: ["https://attacker.com/malicious.jpg"], // Illegal URL
            title: fixtureA.name,
          },
          {
            id: "lead",
            type: "LEAD",
            text: "Cao nguyên đá Đồng Văn",
          },
        ],
      });

      expect(() => validateAiProposalV2(maliciousAiRaw, base, fixtureA)).toThrow();
    });

    it("sanitizes HTML tags in node titles and text through DSL contract", () => {
      const dirtyNode = {
        id: "xss-node",
        type: "PARAGRAPH" as const,
        title: "<script>alert('xss')</script>Tiêu đề",
        text: "<img src='x' onerror='alert(1)'>Nội dung",
        hidden: false,
        locked: false,
        children: [],
      };

      const layout = {
        schemaVersion: 2,
        mode: "GENERATIVE",
        sections: [dirtyNode],
      };

      const parsed = editorialLayoutV2Schema.safeParse(layout);
      expect(parsed.success).toBe(false);
    });
  });
});
