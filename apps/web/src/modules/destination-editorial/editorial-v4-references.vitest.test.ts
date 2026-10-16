import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  validateAiProposalV2,
  createV2JsonSchema,
  proposeEditorial,
} from "./editorial-ai";
import {
  buildCanonicalContentAst,
} from "./editorial-ast";
import {
  EditorialProposalError,
  createEditorialAiDiagnostics,
} from "./editorial-ai-diagnostics";
import {
  autoLayoutV2,
  autoLayoutV1,
  validateLayoutReferences,
  usableEditorialMedia,
  EditorialReferenceError,
} from "./editorial-engine";
import {
  acceptedEditorialProposal,
} from "./editorial-proposal-result";
import {
  isV2Layout,
  type EditorialContext,
  type EditorialLayoutV2,
} from "./editorial-contract";
import { unknownSchedule } from "../destination/destination-contract";
import { assertStrictModelJsonSchema } from "../preference-extraction/preference-extraction-contract";

const testContext: EditorialContext = {
  id: "cmv9fcwo1000be89w3yxz3mqu",
  name: "Di tích lịch sử Căng Bắc Mê",
  area: "Bắc Mê, Hà Giang",
  category: "di tích lịch sử",
  description:
    "Di tích lịch sử Căng Bắc Mê nằm trên sườn núi Rồng thuộc thôn Bản Đồn, xã Yên Cường, huyện Bắc Mê, tỉnh Hà Giang.\n\nThời kỳ thuộc Pháp\nNơi đây từng là đồn binh do thực dân Pháp xây dựng trước năm 1939 nhằm kiểm soát tuyến đường giao thông huyết mạch giữa Hà Giang, Tuyên Quang và Cao Bằng.\n\nSau năm 1939, thực dân Pháp chuyển đồn binh thành nơi giam giữ các chiến sĩ cách mạng.\n\nDấu tích lịch sử và cảnh quan\nTrải qua thời gian và chiến tranh, nhiều hạng mục của Căng Bắc Mê đã bị rêu phong bao phủ giữa khung cảnh thiên nhiên hùng vĩ của núi rừng Tây Bắc.",
  media: [
    {
      id: "media-bm-1",
      url: "https://res.cloudinary.com/kltn/image/upload/v1/bacme-hero.jpg",
      isCover: true,
      alt: "Toàn cảnh phế tích đồn binh Căng Bắc Mê phủ rêu xanh",
      caption: "Cổng và tường đá rêu phong của di tích Căng Bắc Mê",
      websiteRights: "APPROVED",
      author: null,
      sourceUrl: null,
      storageReference: null,
    },
    {
      id: "media-bm-2",
      url: "https://res.cloudinary.com/kltn/image/upload/v1/bacme-tuong-da.jpg",
      isCover: false,
      alt: "Cận cảnh những bức tường đá rêu phong",
      caption: "Những bức tường đá kiên cố thời Pháp thuộc",
      websiteRights: "APPROVED",
      author: null,
      sourceUrl: null,
      storageReference: null,
    },
    {
      id: "media-bm-3",
      url: "https://res.cloudinary.com/kltn/image/upload/v1/bacme-rung-nui.jpg",
      isCover: false,
      alt: "Khung cảnh rừng xanh bao bọc khu di tích",
      caption: "Cảnh quan thiên nhiên tĩnh mịch quanh Căng Bắc Mê",
      websiteRights: "APPROVED",
      author: null,
      sourceUrl: null,
      storageReference: null,
    },
  ],
  sources: [
    {
      id: "src-bm-1",
      title: "Cổng TTĐT tỉnh Tuyên Quang – Căng Bắc Mê, chứng nhân lịch sử",
      url: "https://stttt.tuyenquang.gov.vn/vi/tin-bai/cang-bac-me",
      websiteRights: "APPROVED",
    },
    {
      id: "src-bm-2",
      title: "Báo Tuyên Quang – Bản hùng ca giữa núi rừng Việt Bắc",
      url: "https://baotuyenquang.com.vn/van-hoa/ban-hung-ca-7897b15",
      websiteRights: "APPROVED",
    },
  ],
  latitude: 22.75,
  longitude: 105.28,
  suggestedDurationMinutes: 120,
  openingDays: unknownSchedule(),
};

function createValidV2ProposalPayload(context: EditorialContext): EditorialLayoutV2 {
  const ast = buildCanonicalContentAst(context);
  const media = usableEditorialMedia(context);

  return {
    schemaVersion: 2,
    mode: "GENERATIVE",
    family: "HERITAGE_STORY",
    variant: "EDITORIAL",
    hero: {
      composition: "EDITORIAL",
      locked: false,
    },
    design: {
      typography: "LITERARY",
      palette: "FOREST",
      rhythm: "IMMERSIVE",
      containerWidth: "STANDARD",
    },
    sections: [
      {
        id: "hero",
        type: "HERO",
        contentRef: null,
        hidden: false,
        locked: false,
        title: context.name,
        text: "",
        caption: "",
        deck: null,
        emphasis: "FEATURED",
        columns: 1,
        gap: "MEDIUM",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "full",
        gallery: "mosaic",
        mediaIds: [media[0]!.id],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
      },
      {
        id: "lead-section",
        type: "SECTION",
        contentRef: "ast-intro",
        hidden: false,
        locked: false,
        title: "",
        text: "", // To be hydrated
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 1,
        gap: "SMALL",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "left",
        gallery: "mosaic",
        mediaIds: [],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
      },
      {
        id: "chapter-cols",
        type: "COLUMNS",
        contentRef: null,
        hidden: false,
        locked: false,
        title: "Thời kỳ thuộc Pháp",
        text: "",
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 2,
        gap: "MEDIUM",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "center",
        gallery: "mosaic",
        mediaIds: [],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [
          {
            id: "para-1",
            type: "PARAGRAPH",
            contentRef: "ast-para-0-0",
            hidden: false,
            locked: false,
            title: "",
            text: "", // To be hydrated
            caption: "",
            deck: null,
            emphasis: "STANDARD",
            columns: 1,
            gap: "SMALL",
            aspectRatio: "16:9",
            crop: "wide",
            placement: "left",
            gallery: "mosaic",
            mediaIds: [],
            sourceIds: [],
            focalX: 50,
            focalY: 50,
            entries: [],
            children: [],
          },
          {
            id: "para-2",
            type: "PARAGRAPH",
            contentRef: "ast-para-1-0",
            hidden: false,
            locked: false,
            title: "",
            text: "", // To be hydrated
            caption: "",
            deck: null,
            emphasis: "STANDARD",
            columns: 1,
            gap: "SMALL",
            aspectRatio: "16:9",
            crop: "wide",
            placement: "left",
            gallery: "mosaic",
            mediaIds: [],
            sourceIds: [],
            focalX: 50,
            focalY: 50,
            entries: [],
            children: [],
          },
        ],
      },
      {
        id: "final-chapter",
        type: "SECTION",
        contentRef: "ast-para-2-0",
        hidden: false,
        locked: false,
        title: "Dấu tích lịch sử và cảnh quan",
        text: "", // To be hydrated
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 1,
        gap: "SMALL",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "left",
        gallery: "mosaic",
        mediaIds: [media[1]!.id],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
      },
      {
        id: "mosaic",
        type: "IMAGE_MOSAIC",
        contentRef: null,
        hidden: false,
        locked: false,
        title: "",
        text: "",
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 2,
        gap: "MEDIUM",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "full",
        gallery: "mosaic",
        mediaIds: [media[2]!.id],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
      },
      {
        id: "sources",
        type: "SOURCES",
        contentRef: null,
        hidden: false,
        locked: false,
        title: "Nguồn tham khảo",
        text: "",
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 1,
        gap: "SMALL",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "full",
        gallery: "mosaic",
        mediaIds: [],
        sourceIds: [], // Empty for server auto-hydration
        focalX: 50,
        focalY: 50,
        entries: [],
        children: [],
      },
    ],
  };
}

describe("Task FIX_V4_REFERENCES_VALIDATION — Rigorous Reference & Provenance Suite", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_EDITORIAL_MODEL", "gpt-6-luna");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("1. Strict Reference Validation & Canonical AST Units", () => {
    it("accepts valid canonical contentRef units and deterministically hydrates exact text", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const valid = createValidV2ProposalPayload(testContext);

      const validated = validateAiProposalV2(JSON.stringify(valid), base, testContext, "AUTO");
      expect(validated.schemaVersion).toBe(2);

      // Verify server hydrated text from canonical AST
      const leadSection = validated.sections.find(s => s.id === "lead-section");
      expect(leadSection?.text).toContain("Di tích lịch sử Căng Bắc Mê nằm trên sườn núi Rồng");

      // Verify COLUMNS children were hydrated
      const chapterCols = validated.sections.find(s => s.id === "chapter-cols");
      const para1 = chapterCols?.children?.[0];
      expect(para1?.text).toContain("Nơi đây từng là đồn binh do thực dân Pháp xây dựng trước năm 1939");
    });

    it("rejects unknown contentRef with exact diagnostics path and invalid reason category", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const malformed = createValidV2ProposalPayload(testContext);

      // Inject hallucinated contentRef
      malformed.sections[1]!.contentRef = "ast-unknown-unit-999";

      expect(() => {
        validateAiProposalV2(JSON.stringify(malformed), base, testContext, "AUTO");
      }).toThrowError(EditorialProposalError);

      try {
        validateAiProposalV2(JSON.stringify(malformed), base, testContext, "AUTO");
      } catch (err: any) {
        expect(err).toBeInstanceOf(EditorialProposalError);
        expect(err.validationCode).toBe("REFERENCES");
        expect(err.fieldPath).toBe("sections.1.contentRef");
        expect(err.referenceDetails?.referenceType).toBe("CONTENT_AST");
        expect(err.referenceDetails?.invalidReason).toBe("UNKNOWN_REFERENCE");
        expect(err.referenceDetails?.expectedNamespace).toBe("ast.units");
      }
    });

    it("rejects unknown contentRef nested deeply inside COLUMNS children", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const malformed = createValidV2ProposalPayload(testContext);

      // Inject hallucinated contentRef into child
      malformed.sections[2]!.children![0]!.contentRef = "ast-fake-para";

      try {
        validateAiProposalV2(JSON.stringify(malformed), base, testContext, "AUTO");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(EditorialProposalError);
        expect(err.validationCode).toBe("REFERENCES");
        expect(err.fieldPath).toBe("sections.2.children.0.contentRef");
        expect(err.referenceDetails?.referenceType).toBe("CONTENT_AST");
        expect(err.referenceDetails?.invalidReason).toBe("UNKNOWN_REFERENCE");
      }
    });

    it("allows null contentRef for layout structural nodes (HERO, SECTION, MOSAIC, SOURCES)", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const valid = createValidV2ProposalPayload(testContext);

      // HERO, mosaic, and sources have contentRef: null
      expect(valid.sections[0]!.contentRef).toBeNull();
      expect(valid.sections[4]!.contentRef).toBeNull();
      expect(valid.sections[5]!.contentRef).toBeNull();

      expect(() => {
        validateAiProposalV2(JSON.stringify(valid), base, testContext, "AUTO");
      }).not.toThrow();
    });
  });

  describe("2. Media & Source Provenance Validation", () => {
    it("rejects foreign mediaId not belonging to the destination with MEDIA_ELIGIBILITY", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const malformed = createValidV2ProposalPayload(testContext);

      // Inject unowned media ID
      malformed.sections[0]!.mediaIds = ["foreign-unowned-photo-id"];

      try {
        validateAiProposalV2(JSON.stringify(malformed), base, testContext, "AUTO");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(EditorialProposalError);
        expect(err.validationCode).toBe("MEDIA_ELIGIBILITY");
        expect(err.fieldPath).toBe("sections.0.mediaIds.0");
        expect(err.referenceDetails?.referenceType).toBe("MEDIA");
        expect(err.referenceDetails?.invalidReason).toBe("UNUSABLE_MEDIA");
      }
    });

    it("rejects hallucinated or unapproved sourceId with REFERENCES error", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const malformed = createValidV2ProposalPayload(testContext);

      // Inject fake sourceId into section
      malformed.sections[1]!.sourceIds = ["fabricated-source-id"];

      try {
        validateAiProposalV2(JSON.stringify(malformed), base, testContext, "AUTO");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(EditorialProposalError);
        expect(err.validationCode).toBe("REFERENCES");
        expect(err.fieldPath).toBe("sections.1.sourceIds.0");
        expect(err.referenceDetails?.referenceType).toBe("SOURCE");
        expect(err.referenceDetails?.invalidReason).toBe("REJECTED_SOURCE");
      }
    });

    it("rejects hallucinated sourceId inside TIMELINE entries", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const proposalWithTimeline = createValidV2ProposalPayload(testContext);

      proposalWithTimeline.sections.push({
        id: "timeline-sec",
        type: "TIMELINE",
        contentRef: null,
        hidden: false,
        locked: false,
        title: "Dòng thời gian",
        text: "",
        caption: "",
        deck: null,
        emphasis: "STANDARD",
        columns: 1,
        gap: "MEDIUM",
        aspectRatio: "16:9",
        crop: "wide",
        placement: "full",
        gallery: "mosaic",
        mediaIds: [],
        sourceIds: [],
        focalX: 50,
        focalY: 50,
        entries: [
          {
            label: "1938",
            text: "Xây dựng đồn binh Căng Bắc Mê",
            sourceIds: ["fake-timeline-source"],
          },
        ],
        children: [],
      });

      try {
        validateAiProposalV2(JSON.stringify(proposalWithTimeline), base, testContext, "AUTO");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(EditorialProposalError);
        expect(err.validationCode).toBe("REFERENCES");
        expect(err.fieldPath).toBe("sections.6.entries.0.sourceIds.0");
        expect(err.referenceDetails?.referenceType).toBe("SOURCE");
        expect(err.referenceDetails?.invalidReason).toBe("REJECTED_SOURCE");
      }
    });

    it("auto-hydrates canonical sources for SOURCES section when empty", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const valid = createValidV2ProposalPayload(testContext);

      // SOURCES section has sourceIds: []
      const sourcesNode = valid.sections.find(s => s.type === "SOURCES")!;
      expect(sourcesNode.sourceIds).toEqual([]);

      const validated = validateAiProposalV2(JSON.stringify(valid), base, testContext, "AUTO");
      const validatedSourcesNode = validated.sections.find(s => s.type === "SOURCES")!;

      expect(validatedSourcesNode.sourceIds).toContain("src-bm-1");
      expect(validatedSourcesNode.sourceIds).toContain("src-bm-2");
    });
  });

  describe("3. Dynamic Schema Enum & Payload Alignment", () => {
    it("createV2JsonSchema binds contentRef enum to canonical AST unit IDs when provided", () => {
      const ast = buildCanonicalContentAst(testContext);
      const schema = createV2JsonSchema("AUTO", undefined, ast);

      expect(() => assertStrictModelJsonSchema(schema)).not.toThrow();

      // Verify contentRef in section schema has enum
      const sectionProperties = (schema.properties as any).sections.items.properties;
      const contentRefSchema = sectionProperties.contentRef as any;
      expect(contentRefSchema.anyOf[0]).toHaveProperty("enum");
      expect(contentRefSchema.anyOf[0].enum).toContain("ast-intro");
      expect(contentRefSchema.anyOf[0].enum).toContain("ast-para-0-0");
    });

    it("createV2JsonSchema falls back cleanly to string when ast is not provided", () => {
      const schema = createV2JsonSchema("AUTO");
      expect(() => assertStrictModelJsonSchema(schema)).not.toThrow();

      const sectionProperties = (schema.properties as any).sections.items.properties;
      const contentRefSchema = sectionProperties.contentRef as any;
      expect(contentRefSchema.anyOf[0].type).toBe("string");
      expect(contentRefSchema.anyOf[0]).not.toHaveProperty("enum");
    });
  });

  describe("4. Diagnostics & Safe Logging", () => {
    it("emits detailed reference failure log without leaking secret tokens or raw prose", () => {
      const diagnostics = createEditorialAiDiagnostics();
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      const refError = new EditorialProposalError("REFERENCES", ["sections", 2, "contentRef"], {
        referenceType: "CONTENT_AST",
        nodeType: "PARAGRAPH",
        nodePath: "sections.2",
        invalidReason: "UNKNOWN_REFERENCE",
        expectedNamespace: "ast.units",
      });

      diagnostics.failure("PROPOSAL_VALIDATION", refError);

      expect(consoleSpy).toHaveBeenCalled();
      const rawLog = consoleSpy.mock.calls[0]![0];
      const parsed = JSON.parse(rawLog);

      expect(parsed.event).toBe("editorial_ai");
      expect(parsed.validationCode).toBe("REFERENCES");
      expect(parsed.fieldPath).toBe("sections.2.contentRef");
      expect(parsed.referenceType).toBe("CONTENT_AST");
      expect(parsed.nodeType).toBe("PARAGRAPH");
      expect(parsed.nodePath).toBe("sections.2");
      expect(parsed.invalidReason).toBe("UNKNOWN_REFERENCE");
      expect(parsed.expectedNamespace).toBe("ast.units");

      // Verify no sensitive keys leaked
      expect(rawLog).not.toContain("test-openai-key");
      expect(rawLog).not.toContain("Authorization");

      consoleSpy.mockRestore();
    });
  });

  describe("5. End-to-End Proposal with References & Atomic Fallback", () => {
    it("proposeEditorial succeeds with V4 when model outputs valid canonical references", async () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const validProposal = createValidV2ProposalPayload(testContext);

      const mockLlmClient = {
        complete: vi.fn().mockResolvedValue({
          rawText: JSON.stringify(validProposal),
        }),
      };

      const destinationRow = {
        ...testContext,
        createdAt: new Date(),
        updatedAt: new Date(),
        minimumDurationMinutes: 60,
        visibility: "VISIBLE",
        openingDays: testContext.openingDays.map(d => ({
          dayOfWeek: d.dayOfWeek,
          status: d.status,
          intervals: [],
        })),
      };

      const deps = {
        resolveSession: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
        database: {
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN" }),
          },
          destinationEditorial: {
            findUnique: vi.fn().mockResolvedValue({ draftRevision: 1 }),
          },
          destination: {
            findUnique: vi.fn().mockResolvedValue(destinationRow),
          },
        } as any,
      };

      const headers = new Headers();
      headers.set("x-user-role", "admin");
      headers.set("x-user-id", "admin-1");

      const result = await proposeEditorial(headers, testContext.id, deps as any, mockLlmClient as any, {
        layout: base,
        version: 2,
        mode: "PROPOSE",
      });

      expect(result.status).toBe("PROPOSED");
      expect(isV2Layout(result.layout)).toBe(true);

      // Check that userPayload supplied sources to the LLM
      const callArgs = mockLlmClient.complete.mock.calls[0]![0];
      const sentPayload = JSON.parse(callArgs.user);
      expect(sentPayload.sources).toBeDefined();
      expect(sentPayload.sources.length).toBe(2);
      expect(sentPayload.sources[0].id).toBe("src-bm-1");
    });

    it("proposeEditorial falls back atomically when reference validation fails, preserving draft layout", async () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const invalidProposal = createValidV2ProposalPayload(testContext);
      invalidProposal.sections[1]!.contentRef = "hallucinated-unit-id";

      const mockLlmClient = {
        complete: vi.fn().mockResolvedValue({
          rawText: JSON.stringify(invalidProposal),
        }),
      };

      const destinationRow = {
        ...testContext,
        createdAt: new Date(),
        updatedAt: new Date(),
        minimumDurationMinutes: 60,
        visibility: "VISIBLE",
        openingDays: testContext.openingDays.map(d => ({
          dayOfWeek: d.dayOfWeek,
          status: d.status,
          intervals: [],
        })),
      };

      const deps = {
        resolveSession: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
        database: {
          user: {
            findUnique: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN" }),
          },
          destinationEditorial: {
            findUnique: vi.fn().mockResolvedValue({ draftRevision: 1 }),
          },
          destination: {
            findUnique: vi.fn().mockResolvedValue(destinationRow),
          },
        } as any,
      };

      const headers = new Headers();
      headers.set("x-user-role", "admin");
      headers.set("x-user-id", "admin-1");

      const result = await proposeEditorial(headers, testContext.id, deps as any, mockLlmClient as any, {
        layout: base,
        version: 2,
        mode: "PROPOSE",
      });

      // Assert atomic fallback: layout is strictly preserved
      expect(result.status).toBe("FALLBACK");
      if (result.status === "FALLBACK") {
        expect(result.outcome).toBe("VALIDATION_FAILED");
        expect(result.code).toBe("REFERENCES");
        expect(result.layout).toEqual(base);
      }
    });

    it("acceptedEditorialProposal client gate accepts valid V4 layout and rejects invalid references", () => {
      const base = autoLayoutV2(testContext) as EditorialLayoutV2;
      const valid = createValidV2ProposalPayload(testContext);
      const validated = validateAiProposalV2(JSON.stringify(valid), base, testContext, "AUTO");

      // Valid proposal is accepted by client gate
      const accepted = acceptedEditorialProposal(
        { status: "PROPOSED", outcome: "PROPOSED_NEW", layout: validated },
        base,
        testContext,
        "AUTO",
        "PROPOSE"
      );
      expect(accepted).not.toBeNull();

      // Proposal with foreign media is rejected by client gate
      const withForeignMedia = {
        ...validated,
        sections: [
          ...validated.sections,
          {
            ...validated.sections[0]!,
            id: "extra-hero",
            mediaIds: ["unowned-photo"],
          },
        ],
      };
      const rejected = acceptedEditorialProposal(
        { status: "PROPOSED", outcome: "PROPOSED_NEW", layout: withForeignMedia },
        base,
        testContext,
        "AUTO",
        "PROPOSE"
      );
      expect(rejected).toBeNull();
    });
  });

  describe("6. V3.6 Backward Compatibility", () => {
    it("preserves V1 autoLayout and validateLayoutReferences behavior without regression", () => {
      const v1Layout = autoLayoutV1(testContext);
      expect(v1Layout.schemaVersion).toBe(1);

      expect(() => {
        validateLayoutReferences(v1Layout, testContext, false);
        validateLayoutReferences(v1Layout, testContext, true);
      }).not.toThrow();
    });
  });
});
