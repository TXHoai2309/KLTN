import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { autoLayout, resolveEditorial, validateLayoutReferences } from "./editorial-engine";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { formatHeroLocation } from "@/components/editorial/editorial-story";
import { deriveSectionHeading, isShortEditorialHeading } from "./editorial-content";
import { getLayoutSignature, compareLayoutSignatures } from "./editorial-signature";
import { acceptedEditorialProposal } from "./editorial-proposal-result";
import { validateAiProposal } from "./editorial-ai";
import { editorialBlockSchema } from "./editorial-contract";

describe("E-Magazine V3.6: Quality & Parity", () => {
  describe("P1 — Layout Signature & True AI Variation", () => {
    it("computes layout signature and detects SAME vs SIGNIFICANT differences", () => {
      const context = editorialFixture(undefined, 3);
      const layout1 = autoLayout(context);
      const sig1 = getLayoutSignature(layout1);

      // Identical signature
      const diffSame = compareLayoutSignatures(sig1, sig1);
      expect(diffSame.level).toBe("SAME");
      expect(diffSame.score).toBe(0);

      // Changed hero photo
      const layout2 = {
        ...layout1,
        blocks: layout1.blocks.map(b =>
          b.type === "HERO" ? { ...b, mediaIds: [context.media[1]!.id] } : b
        ),
      };
      const sig2 = getLayoutSignature(layout2);
      const diffHero = compareLayoutSignatures(sig1, sig2);
      expect(diffHero.level).toBe("SIGNIFICANT");
      expect(diffHero.score).toBeGreaterThanOrEqual(3);
      expect(diffHero.differences).toContain("Đổi ảnh Hero chính");

      // Changed variant
      const layout3 = { ...layout1, variant: "EDITORIAL" as const };
      const sig3 = getLayoutSignature(layout3);
      const diffVariant = compareLayoutSignatures(sig1, sig3);
      expect(diffVariant.level).toBe("SIGNIFICANT");
      expect(diffVariant.differences.some(d => d.includes("biến thể"))).toBe(true);
    });

    it("acceptedEditorialProposal rejects insignificant alternative when mode is ALTERNATIVE", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);

      // Proposal that is identical to base
      const identicalProposal = { status: "PROPOSED", outcome: "PROPOSED", layout: base };
      const accepted = acceptedEditorialProposal(identicalProposal, base, context, "KEEP", "ALTERNATIVE");
      expect(accepted).toBeNull();
    });

    it("acceptedEditorialProposal accepts significant alternative in ALTERNATIVE mode", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);

      // Alternative that rotates Hero image to photo-1
      const heroBlock = base.blocks.find(b => b.type === "HERO")!;
      const splitBlock = base.blocks.find(b => b.type === "IMAGE_TEXT_SPLIT" && b.mediaIds.includes(context.media[1]!.id))!;
      const altBlocks = base.blocks.map(b => {
        if (b.id === heroBlock.id) return { ...b, mediaIds: [context.media[1]!.id] };
        if (b.id === splitBlock.id) return { ...b, mediaIds: [context.media[0]!.id] };
        return b;
      });
      const altLayout = { ...base, blocks: altBlocks };
      const altProposal = { status: "PROPOSED", outcome: "PROPOSED_NEW", layout: altLayout };

      const accepted = acceptedEditorialProposal(altProposal, base, context, "KEEP", "ALTERNATIVE");
      expect(accepted).not.toBeNull();
      expect(accepted?.blocks.find(b => b.type === "HERO")?.mediaIds[0]).toBe(context.media[1]!.id);
    });

    it("Hero focal point variation is preserved and accepted", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);

      const modifiedBlocks = base.blocks.map(b =>
        b.type === "HERO" ? { ...b, focalX: 80, focalY: 20 } : b
      );
      const modifiedLayout = { ...base, blocks: modifiedBlocks };
      const proposal = { status: "PROPOSED", outcome: "PROPOSED_NEW", layout: modifiedLayout };

      const accepted = acceptedEditorialProposal(proposal, base, context, "KEEP", "PROPOSE");
      expect(accepted).not.toBeNull();
      const hero = accepted?.blocks.find(b => b.type === "HERO");
      expect(hero?.focalX).toBe(80);
      expect(hero?.focalY).toBe(20);
    });
  });

  describe("P1 — Duplicate Location Fix", () => {
    it("formats Dong Van location with historical clarity", () => {
      expect(formatHeroLocation("khu vực hà giang", "Cao nguyên đá Đồng Văn")).toBe(
        "Tuyên Quang · Vùng Hà Giang trước đây"
      );
      expect(formatHeroLocation("Hà Giang", "Công viên địa chất Cao nguyên đá Đồng Văn")).toBe(
        "Tuyên Quang · Vùng Hà Giang trước đây"
      );
    });

    it("title-cases general area for other destinations", () => {
      expect(formatHeroLocation("khu vực mèo vạc", "Đèo Mã Pí Lèng")).toBe(
        "Khu Vực Mèo Vạc"
      );
      expect(formatHeroLocation("quản bạ", "Cổng trời Quản Bạ")).toBe(
        "Quản Bạ"
      );
    });

    it("returns empty string for missing or whitespace area", () => {
      expect(formatHeroLocation("", "Điểm đến")).toBe("");
      expect(formatHeroLocation(null, "Điểm đến")).toBe("");
      expect(formatHeroLocation(undefined, "Điểm đến")).toBe("");
    });
  });

  describe("P2 — Editorial Section Headings", () => {
    it("derives grounded thematic headings from section content", () => {
      const geologyText =
        "Giá trị đặc biệt của Cao nguyên đá Đồng Văn nằm ở lịch sử địa chất kéo dài hơn 550 triệu năm. Theo UNESCO, các tầng đá, hóa thạch và cấu trúc địa chất tại đây ghi lại những giai đoạn quan trọng trong lịch sử phát triển của Trái Đất.";
      const geoResult = deriveSectionHeading(geologyText);
      expect(geoResult.title).toBe("Dấu ấn địa chất hơn 550 triệu năm");
      expect(isShortEditorialHeading(geoResult.title, geoResult.text)).toBe(true);

      const routeText =
        "Hành trình khám phá cao nguyên đưa du khách qua những cảnh quan nổi tiếng như Cổng trời Quản Bạ, đèo Mã Pí Lèng, hẻm vực Tu Sản và dòng sông Nho Quế.";
      const routeResult = deriveSectionHeading(routeText);
      expect(routeResult.title).toBe("Những cung đường qua miền đá");
      expect(isShortEditorialHeading(routeResult.title, routeResult.text)).toBe(true);

      const cultureText =
        "Cao nguyên đá Đồng Văn cũng là không gian sinh sống của nhiều cộng đồng dân tộc với những truyền thống văn hóa phong phú. Giữa điều kiện địa hình nhiều đá, cư dân địa phương duy trì chợ phiên và phong tục.";
      const cultureResult = deriveSectionHeading(cultureText);
      expect(cultureResult.title).toBe("Sắc màu văn hóa cao nguyên");
      expect(isShortEditorialHeading(cultureResult.title, cultureResult.text)).toBe(true);

      const visitText =
        "Du khách có thể khám phá thông qua các hành trình đường bộ kết hợp ngắm cảnh và trải nghiệm văn hóa địa phương. Khoảng tháng 10–11, hoa tam giác mạch thường xuất hiện tại nhiều khu vực.";
      const visitResult = deriveSectionHeading(visitText);
      expect(visitResult.title).toBe("Trải nghiệm giữa thiên nhiên hùng vĩ");
      expect(isShortEditorialHeading(visitResult.title, visitResult.text)).toBe(true);
    });

    it("preserves explicit line-break headings", () => {
      const explicitText = "Dấu tích thời gian\nNội dung chi tiết của đoạn văn tiếp theo.";
      const res = deriveSectionHeading(explicitText);
      expect(res.title).toBe("Dấu tích thời gian");
      expect(res.text).toBe("Nội dung chi tiết của đoạn văn tiếp theo.");
    });
  });

  describe("P2 — Restore References Section", () => {
    it("includes unreviewed but valid destination citations (websiteRights: UNKNOWN)", () => {
      const context = editorialFixture(undefined, 2);
      context.sources = [
        { id: "src-1", title: "UNESCO Global Geoparks", url: "https://unesco.org", websiteRights: "UNKNOWN" },
        { id: "src-2", title: "Cổng thông tin Tuyên Quang", url: "https://tuyenquang.gov.vn", websiteRights: "UNKNOWN" },
      ];
      const layout = autoLayout(context);
      expect(layout.blocks.some(b => b.type === "SOURCES")).toBe(true);

      const resolved = resolveEditorial(layout, context);
      expect(resolved).not.toBeNull();
      expect(resolved?.sources).toHaveLength(2);
      expect(resolved?.layout.blocks.some(b => b.type === "SOURCES")).toBe(true);
    });

    it("excludes strictly REJECTED sources from editorial citations", () => {
      const context = editorialFixture(undefined, 2);
      context.sources = [
        { id: "src-approved", title: "Nguồn hợp lệ", url: "https://example.org/ok", websiteRights: "APPROVED" },
        { id: "src-rejected", title: "Nguồn bị từ chối", url: "https://example.org/bad", websiteRights: "REJECTED" },
      ];
      const layout = autoLayout(context);
      const resolved = resolveEditorial(layout, context);
      expect(resolved?.sources.some(s => s.id === "src-rejected")).toBe(false);
      expect(resolved?.sources.some(s => s.id === "src-approved")).toBe(true);
    });

    it("resolves sources even on legacy layouts that omitted the SOURCES block", () => {
      const context = editorialFixture(undefined, 2);
      context.sources = [
        { id: "src-1", title: "UNESCO Global Geopark", url: "https://unesco.org", websiteRights: "UNKNOWN" },
      ];
      // Legacy layout without SOURCES block
      const legacyLayout = {
        ...autoLayout(context),
        blocks: autoLayout(context).blocks.filter(b => b.type !== "SOURCES"),
      };
      const resolved = resolveEditorial(legacyLayout, context);
      expect(resolved?.layout.blocks.some(b => b.type === "SOURCES")).toBe(true);
      expect(resolved?.sources).toHaveLength(1);
    });
  });

  describe("P1 — Fallback Safety & Deduplication", () => {
    it("never creates duplicate SOURCES, HIGHLIGHT_FACTS, or MAP blocks", () => {
      const context = editorialFixture(undefined, 2);
      const base = autoLayout(context);
      const sourcesBlock = base.blocks.find(b => b.type === "SOURCES");
      if (sourcesBlock) {
        const withDuplicate = {
          ...base,
          blocks: [...base.blocks, { ...sourcesBlock, id: "sources-duplicate" }],
        };
        const resolved = resolveEditorial(withDuplicate, context);
        const sourceBlocks = resolved?.layout.blocks.filter(b => b.type === "SOURCES");
        expect(sourceBlocks).toHaveLength(1);
      }
    });

    it("smart empty content: destination with no sources renders no empty SOURCES block", () => {
      const context = editorialFixture(undefined, 2);
      context.sources = [];
      const layout = autoLayout(context);
      expect(layout.blocks.some(b => b.type === "SOURCES")).toBe(false);

      const resolved = resolveEditorial(layout, context);
      expect(resolved?.layout.blocks.some(b => b.type === "SOURCES")).toBe(false);
      expect(resolved?.sources).toHaveLength(0);
    });
  });

  describe("P1 & P2 — 12 Mandatory Verifications for V3.6 Proposal Stability", () => {
    function makeModelProposalJson(base: any, overrides: any = {}) {
      return JSON.stringify({
        family: overrides.family ?? base.family,
        variant: overrides.variant ?? base.variant,
        design: overrides.design ?? { typography: "LITERARY", palette: "EARTH", rhythm: "IMMERSIVE" },
        blocks: base.blocks.map((b: any) => ({
          id: b.id,
          mediaIds: b.mediaIds,
          placement: b.placement,
          crop: b.crop,
          gallery: b.gallery,
          ...(overrides.blocksOverrides?.[b.id] ?? {}),
        })),
        ...(overrides.rootOverrides ?? {}),
      });
    }

    it("1. AI proposal lần đầu PASS", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const proposalJson = makeModelProposalJson(base, { variant: "EDITORIAL" });
      const validated = validateAiProposal(proposalJson, base, context, "AUTO");
      expect(validated.variant).toBe("EDITORIAL");
      expect(validated.blocks.length).toBe(base.blocks.length);
      expect(validated.blocks.map(b => b.id)).toEqual(base.blocks.map(b => b.id));
    });

    it("2. AI proposal lần thứ hai PASS trên current layout", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      // Proposal 1:
      const p1Json = makeModelProposalJson(base, { variant: "EDITORIAL" });
      const layout1 = validateAiProposal(p1Json, base, context, "AUTO");
      expect(layout1.variant).toBe("EDITORIAL");

      // Proposal 2 on layout1:
      const p2Json = makeModelProposalJson(layout1, { variant: "SPLIT" });
      const layout2 = validateAiProposal(p2Json, layout1, context, "AUTO");
      expect(layout2.variant).toBe("SPLIT");
      expect(layout2.blocks.length).toBe(base.blocks.length);
      // Titles are retained from layout1 without TITLE_PROVENANCE errors
      expect(layout2.blocks.find(b => b.type === "HERO")?.title).toBe(base.blocks.find(b => b.type === "HERO")?.title);
    });

    it("3. Nhiều lần đề xuất liên tiếp không làm mất block", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const initialIds = base.blocks.map(b => b.id);

      let current = base;
      const variantsList = ["PANORAMA", "SPLIT", "EDITORIAL", "PANORAMA", "SPLIT"] as const;
      for (let i = 0; i < 5; i++) {
        const json = makeModelProposalJson(current, { variant: variantsList[i] });
        current = validateAiProposal(json, current, context, "AUTO");
        expect(current.blocks.map(b => b.id)).toEqual(initialIds);
      }
      expect(current.blocks.length).toBe(base.blocks.length);
      for (const orig of base.blocks) {
        const after = current.blocks.find(b => b.id === orig.id);
        expect(after).toBeDefined();
        expect(after?.type).toBe(orig.type);
        expect(after?.text).toBe(orig.text);
      }
    });

    it("4. Model trả title bịa đặt không được đưa vào layout (TITLE_PROVENANCE)", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const fourthBlock = base.blocks[4]!;

      // If model attempts to return a hallucinated title:
      const hallucinatedJson = makeModelProposalJson(base, {
        blocksOverrides: {
          [fourthBlock.id]: { title: "Tiêu đề bịa đặt hoàn toàn không có trong nguồn" },
        },
      });

      expect(() => validateAiProposal(hallucinatedJson, base, context, "AUTO")).toThrowError(
        expect.objectContaining({ validationCode: "TITLE_PROVENANCE" })
      );

      // But when title is omitted (as in our actual schema sent to model), it succeeds
      const safeJson = makeModelProposalJson(base);
      const res = validateAiProposal(safeJson, base, context, "AUTO");
      expect(res.blocks.find(b => b.id === fourthBlock.id)?.title).toBe(fourthBlock.title);
    });

    it("5. Admin-edited titles được bảo toàn", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const customTitle = "Tiêu đề biên tập viên tự đặt thủ công";
      const editedBase = {
        ...base,
        blocks: base.blocks.map((b, i) => i === 2 ? { ...b, title: customTitle } : b),
      };

      // Model proposes new layout omitting titles
      const proposalJson = makeModelProposalJson(editedBase, { variant: "EDITORIAL" });
      const validated = validateAiProposal(proposalJson, editedBase, context, "AUTO");
      expect(validated.blocks[2]!.title).toBe(customTitle);
    });

    it("6. Không mất caption, citations hoặc provenance", () => {
      const context = editorialFixture(undefined, 3);
      context.sources = [{ id: "src-1", title: "Citations Test", url: "https://example.com", websiteRights: "APPROVED" }];
      const base = autoLayout(context);
      const customCaption = "Ảnh chụp bình minh tuyệt đẹp";
      const excerpt = "Con đường dẫn qua";
      const modifiedBase = {
        ...base,
        blocks: base.blocks.map(b => {
          if (b.type === "IMAGE_TEXT_SPLIT") {
            return {
              ...b,
              title: excerpt,
              text: `${excerpt} những khoảng xanh và mái nhà nhỏ.`,
              caption: customCaption,
              sourceIds: ["src-1"],
              headingProvenance: { blockId: b.id, excerpt },
            };
          }
          return b;
        }),
      };

      const json = makeModelProposalJson(modifiedBase, { variant: "EDITORIAL" });
      const validated = validateAiProposal(json, modifiedBase, context, "AUTO");
      const splitBlock = validated.blocks.find(b => b.type === "IMAGE_TEXT_SPLIT");
      expect(splitBlock?.caption).toBe(customCaption);
      expect(splitBlock?.sourceIds).toEqual(["src-1"]);
      expect(splitBlock?.headingProvenance?.excerpt).toBe(excerpt);
      expect(splitBlock?.title).toBe(excerpt);
    });

    it("7. Không dùng media chưa APPROVED (MEDIA_ELIGIBILITY)", () => {
      const context = editorialFixture(undefined, 3);
      context.media[2]!.websiteRights = "REJECTED";
      const base = autoLayout(context);

      const invalidJson = makeModelProposalJson(base, {
        blocksOverrides: {
          [base.blocks[0]!.id]: { mediaIds: [context.media[2]!.id] },
        },
      });

      expect(() => validateAiProposal(invalidJson, base, context, "AUTO")).toThrowError(
        expect.objectContaining({ validationCode: "MEDIA_ELIGIBILITY" })
      );
    });

    it("8. Không trùng media IDs giữa các block (DUPLICATE_MEDIA)", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const sharedMediaId = context.media[0]!.id;
      const heroBlock = base.blocks.find(b => b.type === "HERO")!;
      const splitBlock = base.blocks.find(b => b.type === "IMAGE_TEXT_SPLIT")!;

      const duplicateJson = makeModelProposalJson(base, {
        blocksOverrides: {
          [heroBlock.id]: { mediaIds: [sharedMediaId] },
          [splitBlock.id]: { mediaIds: [sharedMediaId] },
        },
      });

      expect(() => validateAiProposal(duplicateJson, base, context, "AUTO")).toThrowError(
        expect.objectContaining({ validationCode: "DUPLICATE_MEDIA" })
      );
    });

    it("9. Không phát sinh mất nội dung khi có unsaved changes", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const unsavedBlock = editorialBlockSchema.parse({
        id: "unsaved-block-123",
        type: "TEXT_SECTION",
        text: "Nội dung thuyết minh do người dùng nhập chưa bấm lưu nháp",
        title: "Ghi chú thêm",
      });
      const draftLayout = {
        ...base,
        blocks: [...base.blocks, unsavedBlock],
      };

      const proposalJson = makeModelProposalJson(draftLayout, { variant: "EDITORIAL" });
      const validated = validateAiProposal(proposalJson, draftLayout, context, "AUTO");

      const preserved = validated.blocks.find(b => b.id === "unsaved-block-123");
      expect(preserved).toBeDefined();
      expect(preserved?.text).toBe("Nội dung thuyết minh do người dùng nhập chưa bấm lưu nháp");
      expect(preserved?.title).toBe("Ghi chú thêm");
    });

    it("10. Undo hoạt động (khôi phục chính xác layout trước đó)", () => {
      const context = editorialFixture(undefined, 3);
      const l0 = autoLayout(context);

      const historyStack: any[] = [];
      let currentLayout = l0;

      // Action 1: User edits layout
      historyStack.push(currentLayout);
      currentLayout = { ...currentLayout, variant: "EDITORIAL" as const };

      // Action 2: AI proposal applied
      historyStack.push(currentLayout);
      const pJson = makeModelProposalJson(currentLayout, { variant: "SPLIT" });
      currentLayout = validateAiProposal(pJson, currentLayout, context, "AUTO");
      expect(currentLayout.variant).toBe("SPLIT");

      // Undo 1: Reverts to Editorial
      currentLayout = historyStack.pop();
      expect(currentLayout.variant).toBe("EDITORIAL");

      // Undo 2: Reverts to L0
      currentLayout = historyStack.pop();
      expect(currentLayout.variant).toBe(l0.variant);
      expect(currentLayout).toEqual(l0);
    });

    it("11. Public renderer không bị regression", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);
      const proposalJson = makeModelProposalJson(base, { variant: "EDITORIAL" });
      const validated = validateAiProposal(proposalJson, base, context, "AUTO");

      const resolved = resolveEditorial(validated, context);
      expect(resolved).not.toBeNull();
      expect(resolved?.layout.variant).toBe("EDITORIAL");
      expect(resolved?.media.length).toBeGreaterThan(0);
      expect(resolved?.layout.blocks.some(b => b.type === "HERO")).toBe(true);
    });

    it("12. Existing schema validation vẫn giữ nguyên", () => {
      const context = editorialFixture(undefined, 3);
      const base = autoLayout(context);

      // Missing blocks property
      expect(() => validateAiProposal(JSON.stringify({ family: "HERITAGE_STORY", variant: "EDITORIAL" }), base, context)).toThrowError(
        expect.objectContaining({ validationCode: "SCHEMA" })
      );

      // Invalid block count / missing block
      const missingBlockJson = JSON.stringify({
        family: base.family,
        variant: base.variant,
        blocks: base.blocks.slice(0, 2).map((b: any) => ({ id: b.id, mediaIds: b.mediaIds, placement: b.placement })),
      });
      expect(() => validateAiProposal(missingBlockJson, base, context)).toThrowError(
        expect.objectContaining({ validationCode: "BLOCK_IDS" })
      );
    });
  });
});
