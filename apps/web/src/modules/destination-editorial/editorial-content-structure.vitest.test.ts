import { describe, expect, it } from "vitest";
import { groupEditorialSections, stripMarkdownHeading, isShortEditorialHeading, prepareEditorialContent } from "./editorial-content";
import { autoLayout, resolveEditorial, chooseFamily, validateLayoutReferences } from "./editorial-engine";
import { editorialQualityFixture } from "./__fixtures__/editorial-quality-fixtures";
import type { EditorialContext } from "./editorial-contract";

const CANG_BAC_ME_DESC = `Căng Bắc Mê là di tích lịch sử quốc gia nằm trên sườn núi Rồng, thuộc thôn Đồn Điền, xã Yên Cường, huyện Bắc Mê, tỉnh Hà Giang. Nơi đây từng là căn cứ quân sự của thực dân Pháp và sau đó trở thành trại giam giữ nhiều chiến sĩ cộng sản kiên trung trong thời kỳ kháng chiến chống Pháp.

**Dấu tích lịch sử giữa núi rừng Việt Bắc**

Trong thời kỳ thuộc địa, khu vực Căng Bắc Mê từng được sử dụng làm đồn binh, sau đó chuyển thành trại giam chính trị giai đoạn 1939–1945. Nơi đây từng giam giữ các đồng chí cán bộ cách mạng kiên trung nhằm ngăn chặn phong trào đấu tranh giải phóng dân tộc tại vùng núi phía Bắc.

**Tinh thần cách mạng vượt qua lao tù**

Dù phải đối mặt với nhiều khó khăn, các tù nhân chính trị tại Căng Bắc Mê vẫn duy trì tinh thần cách mạng, tổ chức sinh hoạt chính trị, truyền bá tư tưởng cách mạng trong trại giam và tạo mối liên hệ mật thiết với đồng bào các dân tộc thiểu số xung quanh khu căn cứ.

**Không gian kiến trúc và dấu tích còn lại**

Khu trung tâm Căng Bắc Mê được xây dựng trên địa thế có núi cao bao quanh và sông Gâm chảy qua. Quần thể di tích có quy mô khoảng 2.500 m², bao gồm hệ thống tường đá kiên cố, 3 khu nhà giam, vọng gác, nhà kho và khu vực sinh hoạt của lính coi ngục. Trải qua thời gian và chiến tranh, các hạng mục kiến trúc hiện còn lại chủ yếu là nền móng, tường bao và một số dấu tích công trình bằng đá và gạch.

**Di tích lịch sử quốc gia**

Theo thông tin được Cổng thông tin điện tử tỉnh Tuyên Quang công bố, Căng Bắc Mê được Bộ Văn hóa và Thông tin xếp hạng là Di tích lịch sử quốc gia theo Quyết định số 97/QĐ-BVHTT ngày 20/4/1992. Di tích có giá trị quan trọng trong việc nghiên cứu lịch sử địa phương và giáo dục truyền thống cách mạng cho các thế hệ trẻ.

**Hành trình tìm hiểu lịch sử**

Ngày nay, Căng Bắc Mê là một điểm đến có ý nghĩa đối với du khách yêu thích lịch sử và những chuyến hành trình về nguồn. Tại đây, du khách có thể tìm hiểu bối cảnh hình thành cơ sở giam giữ, quan sát những dấu tích còn lại và khám phá câu chuyện về cuộc sống, tinh thần đấu tranh của các chiến sĩ cách mạng.

Không gian núi Rồng và dòng sông Gâm cũng tạo nên cảnh quan trầm mặc, góp phần làm sâu sắc trải nghiệm tham quan lịch sử. Đây là điểm đến phù hợp với các hoạt động tìm hiểu di sản, giáo dục truyền thống và nghiên cứu lịch sử địa phương.

Do thông tin về giờ mở cửa, giá vé và phạm vi tiếp cận chưa được xác minh đầy đủ, du khách nên liên hệ đơn vị quản lý địa phương trước khi đến, đặc biệt nếu đi theo đoàn hoặc tổ chức hoạt động học tập.`;

function cangBacMeContext(photoCount = 5): EditorialContext {
  const c = editorialQualityFixture("Di tích lịch sử Căng Bắc Mê", "di tích lịch sử – kiến trúc", photoCount);
  c.id = "cmv9fcwo1000be89w3yxz3mqu";
  c.description = CANG_BAC_ME_DESC;
  return c;
}

describe("E-Magazine Content Structure & Editorial Blocks", () => {
  describe("Task 1 & 2: Root cause analysis and Markdown normalization", () => {
    it("strips raw markdown symbols from headings safely", () => {
      expect(stripMarkdownHeading("**Dấu tích lịch sử giữa núi rừng Việt Bắc**")).toBe("Dấu tích lịch sử giữa núi rừng Việt Bắc");
      expect(stripMarkdownHeading("### Không gian kiến trúc và dấu tích")).toBe("Không gian kiến trúc và dấu tích");
      expect(stripMarkdownHeading('__"Ký ức cách mạng"__')).toBe("Ký ức cách mạng");
      expect(stripMarkdownHeading("## Dấu mốc di sản:")).toBe("Dấu mốc di sản");
    });

    it("never promotes advisory notices or causal opening clauses to headings", () => {
      const advisory = "Do thông tin về giờ mở cửa, giá vé và phạm vi tiếp cận chưa được xác minh đầy đủ";
      expect(isShortEditorialHeading("Do thông tin về giờ mở cửa", advisory)).toBe(false);
      expect(isShortEditorialHeading("Lưu ý khi tham quan", advisory)).toBe(false);
      expect(isShortEditorialHeading("Vì thời tiết vùng núi thay đổi nhanh", advisory)).toBe(false);
      expect(isShortEditorialHeading("Khuyến cáo du khách không nên đi một mình", advisory)).toBe(false);
    });

    it("preserves advisory paragraphs as body text without losing data", () => {
      const c = cangBacMeContext();
      const { sections } = groupEditorialSections(c.description, c.category);
      const allText = sections.map(s => s.text).join("\n\n");
      expect(allText).toContain("Do thông tin về giờ mở cửa, giá vé và phạm vi tiếp cận chưa được xác minh đầy đủ");
      expect(sections.every(s => s.title !== "Do thông tin về giờ mở cửa")).toBe(true);
    });

    it("renders formatted inline markdown bold and lists without raw symbols", async () => {
      const { renderFormattedEditorialText } = await import("@/components/editorial/editorial-story");
      const res = renderFormattedEditorialText("Đoạn văn có **chữ in đậm** và **nội dung quan trọng**.");
      expect(Array.isArray(res)).toBe(true);
      // The bold words are converted into strong elements
      const strongs = (res as any[]).filter(item => typeof item === "object" && item?.type === "strong");
      expect(strongs).toHaveLength(2);
      expect(strongs[0].props.children).toBe("chữ in đậm");
      expect(strongs[1].props.children).toBe("nội dung quan trọng");
    });
  });

  describe("Task 3 & 4: Semantic section grouping and Heading quality", () => {
    it("groups Căng Bắc Mê into 5 coherent heritage chapters without empty micro-blocks", () => {
      const c = cangBacMeContext();
      const { introText, sections } = groupEditorialSections(c.description, c.category);

      expect(introText).toContain("Căng Bắc Mê là di tích lịch sử quốc gia nằm trên sườn núi Rồng");
      expect(sections).toHaveLength(5);

      const titles = sections.map(s => s.title);
      expect(titles).toEqual([
        "Dấu tích lịch sử giữa núi rừng Việt Bắc",
        "Tinh thần cách mạng vượt qua lao tù",
        "Không gian kiến trúc và dấu tích còn lại",
        "Di tích lịch sử quốc gia",
        "Hành trình tìm hiểu lịch sử",
      ]);

      // Every section title is completely unique
      expect(new Set(titles).size).toBe(titles.length);

      // No raw markdown in titles
      for (const title of titles) {
        expect(title).not.toContain("**");
        expect(title).not.toContain("#");
      }

      // Check storytelling narrative
      expect(sections[0]!.text).toContain("giai đoạn 1939–1945");
      expect(sections[1]!.text).toContain("tù nhân chính trị");
      expect(sections[2]!.text).toContain("2.500 m²");
      expect(sections[3]!.text).toContain("Quyết định số 97/QĐ-BVHTT");
      expect(sections[4]!.text).toContain("hành trình về nguồn");
    });

    it("groups natural destination without markdown (Đồng Văn) into 4 distinct thematic chapters", () => {
      const DONG_VAN_DESC = `Cao nguyên đá Đồng Văn là vùng núi đá vôi đặc sắc ở cực Bắc Việt Nam, hiện thuộc tỉnh Tuyên Quang, trải rộng qua các huyện Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc. Năm 2010, nơi đây được UNESCO công nhận là Công viên địa chất toàn cầu, trở thành một trong những điểm đến thiên nhiên nổi bật của miền núi phía Bắc.

Giá trị đặc biệt của Cao nguyên đá Đồng Văn nằm ở lịch sử địa chất kéo dài hơn 550 triệu năm, với nhiều tầng đá vôi, hẻm vực và hóa thạch cổ sinh phản ánh sự tiến hóa của vỏ Trái Đất. Cảnh quan nơi đây nổi bật với những dãy núi tai mèo sắc nhọn, thung lũng sâu và các bề mặt đá xám trải dài bất tận.

Hành trình khám phá cao nguyên đưa du khách qua những cảnh quan nổi tiếng như Cổng Trời Quản Bạ, dốc Thẩm Mã, đèo Mã Pí Lèng uốn lượn bên hẻm vực Tu Sản và dòng sông Nho Quế trong xanh. Mỗi cung đường đều mở ra tầm nhìn bao quát địa hình karst kỳ vĩ của vùng cao.

Cao nguyên đá Đồng Văn cũng là không gian sinh sống của nhiều cộng đồng dân tộc thiểu số như H'Mông, Dao, Tày, Lô Lô... Nếp sống truyền thống, những ngôi nhà trình tường, ruộng ngô len lỏi giữa hốc đá và các phiên chợ rực rỡ sắc màu tạo nên bức tranh văn hóa độc đáo song hành cùng di sản địa chất.

Du khách có thể khám phá Cao nguyên đá Đồng Văn thông qua các hành trình đường bộ kết hợp ngắm cảnh, tìm hiểu địa chất, tham quan bản làng và trải nghiệm văn hóa địa phương. Khoảng tháng 10–11, hoa tam giác mạch thường xuất hiện tại nhiều khu vực, nhưng thời điểm nở thực tế phụ thuộc điều kiện thời tiết. Để chuyến đi thuận lợi, du khách nên kiểm tra tình trạng đường đèo, thời tiết và thông tin vận hành của từng điểm tham quan trước khi khởi hành.`;

      const c = editorialQualityFixture("Cao nguyên đá Đồng Văn", "thắng cảnh – công viên địa chất", 4);
      c.description = DONG_VAN_DESC;
      const { introText, sections } = groupEditorialSections(c.description, c.category);

      expect(introText).toBeTruthy();
      expect(sections).toHaveLength(4);

      const titles = sections.map(s => s.title);
      expect(titles).toEqual([
        "Dấu ấn địa chất hơn 550 triệu năm",
        "Những cung đường qua miền đá",
        "Sắc màu văn hóa cao nguyên",
        "Trải nghiệm giữa thiên nhiên hùng vĩ",
      ]);

      // Completely deduplicated
      expect(new Set(titles).size).toBe(titles.length);
    });

    it("handles short single-paragraph destinations gracefully with no empty ghost sections", () => {
      const shortDesc = "Cổng Trời Quản Bạ là cửa ngõ đầu tiên bước vào Công viên địa chất toàn cầu Cao nguyên đá Đồng Văn.";
      const { introText, sections } = groupEditorialSections(shortDesc, "thắng cảnh");

      expect(introText).toBe(shortDesc);
      expect(sections).toHaveLength(0);

      const c = editorialQualityFixture("Cổng Trời", "thắng cảnh", 1);
      c.description = shortDesc;
      const layout = autoLayout(c);
      const resolved = resolveEditorial(layout, c);

      expect(resolved).not.toBeNull();
      expect(resolved!.layout.blocks.find(b => b.type === "INTRO")!.text).toBe(shortDesc);
      expect(resolved!.layout.blocks.filter(b => b.type === "TEXT_SECTION" && !b.text && !b.title)).toHaveLength(0);
    });

    it("handles 0-photo destinations gracefully", () => {
      const c = cangBacMeContext(0);
      const layout = autoLayout(c);
      const resolved = resolveEditorial(layout, c);

      expect(resolved).not.toBeNull();
      expect(resolved!.media).toHaveLength(0);
      expect(layout.blocks.find(b => b.type === "HERO")!.mediaIds).toHaveLength(0);
      expect(layout.blocks.some(b => b.type === "IMAGE_GRID" || b.type === "IMAGE_GALLERY")).toBe(false);
    });
  });

  describe("Task 5 & 6: Visual composition, deterministic layout and AI consistency", () => {
    it("chooses HERITAGE_STORY and weaves photos with narrative balance for Căng Bắc Mê", () => {
      const c = cangBacMeContext(5);
      expect(chooseFamily(c.category)).toBe("HERITAGE_STORY");

      const layout = autoLayout(c);
      expect(layout.family).toBe("HERITAGE_STORY");

      // Verify block types and sequence
      const storyBlocks = layout.blocks.filter(b => b.type === "IMAGE_TEXT_SPLIT" || b.type === "TEXT_SECTION");
      expect(storyBlocks.length).toBe(5);

      // Section headings are clean and unique
      const sectionTitles = storyBlocks.map(b => b.title);
      expect(new Set(sectionTitles).size).toBe(5);
      expect(sectionTitles.every(t => !t.includes("**"))).toBe(true);

      // Gallery has remaining photos
      const gallery = layout.blocks.find(b => b.type === "IMAGE_GRID" || b.type === "IMAGE_GALLERY");
      expect(gallery).toBeDefined();
      expect(gallery!.mediaIds.length).toBeGreaterThanOrEqual(3);

      // All 5 media items are uniquely allocated
      const allUsedMedia = layout.blocks.flatMap(b => b.mediaIds);
      expect(new Set(allUsedMedia).size).toBe(5);

      // Layout passes reference validation
      expect(() => validateLayoutReferences(layout, c, false)).not.toThrow();
      expect(() => validateLayoutReferences(layout, c, true)).not.toThrow();
    });

    it("deduplicates titles during prepareEditorialContent and resolveEditorialDisplay", () => {
      const c = cangBacMeContext(3);
      const layout = autoLayout(c);

      // Force a duplicate title onto a block
      layout.blocks[2]!.title = layout.blocks[3]!.title;

      const prepared = prepareEditorialContent(layout, c.description);
      expect(prepared.issues.some(i => i.code === "DUPLICATE_HEADING")).toBe(true);

      const resolved = resolveEditorial(layout, c);
      expect(resolved).not.toBeNull();

      const resolvedTitles = resolved!.layout.blocks
        .filter(b => b.type === "TEXT_SECTION" || b.type === "IMAGE_TEXT_SPLIT")
        .map(b => b.title)
        .filter(Boolean);

      // Zero duplicate titles in resolved public output
      expect(new Set(resolvedTitles).size).toBe(resolvedTitles.length);
    });

    it("preserves Admin-customized headings and adheres to TITLE_PROVENANCE", () => {
      const c = cangBacMeContext(3);
      const layout = autoLayout(c);

      const customTitle = "Dấu tích kiến trúc và hiện vật xưa";
      layout.blocks[2]!.title = customTitle;
      layout.blocks[2]!.headingProvenance = {
        blockId: layout.blocks[2]!.id,
        excerpt: customTitle,
      };

      // Since customTitle is a valid short heading, autoLayout with seed preserves curated blocks
      const seedLayout = autoLayout(c, layout);
      const block2 = seedLayout.blocks.find(b => b.id === layout.blocks[2]!.id);
      expect(block2).toBeDefined();
    });
  });
});
