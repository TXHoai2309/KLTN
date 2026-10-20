import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertStrictModelJsonSchema } from "../preference-extraction/preference-extraction-contract";
import { createEditorialOpenAiClient } from "./editorial-openai-client";
import {
  v2JsonSchema,
  createV2JsonSchema,
  proposeEditorial,
} from "./editorial-ai";
import {
  autoLayoutV2,
  autoLayoutV1,
} from "./editorial-engine";
import {
  isV1Layout,
  isV2Layout,
  editorialLayoutV2Schema,
  EDITORIAL_V2_MAX_ROOT_SECTIONS,
  EDITORIAL_V2_MAX_TOTAL_NODES,
  type EditorialContext,
  type EditorialLayoutV2,
} from "./editorial-contract";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { unknownSchedule } from "../destination/destination-contract";
import { readEditorialContext } from "./editorial-service";

const fixtureContext: EditorialContext = {
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
      title: "Hồ sơ xếp hạng di tích quốc gia Căng Bắc Mê",
      url: "https://dsvh.gov.vn/di-tich-cang-bac-me",
      websiteRights: "APPROVED",
    },
  ],
  latitude: 22.75,
  longitude: 105.28,
  suggestedDurationMinutes: 120,
  openingDays: unknownSchedule(),
};

describe("Task FIX_V4_GENERATIVE_INVALID_SCHEMA — Root Cause & Strict Outputs Verification", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    vi.stubEnv("OPENAI_EDITORIAL_MODEL", "gpt-6-luna");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // 1. Regression Reproduction: Why did the old schema fail?
  it("REGRESSION: reproduces exact schema failure when properties are omitted from required", () => {
    // In old code, 'family' and 'variant' were declared in properties but omitted from required
    const oldMalformedSchema = {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "mode", "design", "hero", "sections"], // missing 'family', 'variant'
      properties: {
        schemaVersion: { type: "integer", enum: [2] },
        mode: { type: "string", enum: ["GENERATIVE"] },
        family: { type: "string", enum: ["HERITAGE_STORY"] },
        variant: { type: "string", enum: ["EDITORIAL"] },
        hero: { type: "object", additionalProperties: false, required: ["composition", "locked"], properties: { composition: { type: "string" }, locked: { type: "boolean" } } },
        design: { type: "object", additionalProperties: false, required: ["typography", "palette", "rhythm", "containerWidth"], properties: { typography: { type: "string" }, palette: { type: "string" }, rhythm: { type: "string" }, containerWidth: { type: "string" } } },
        sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type"], properties: { id: { type: "string" }, type: { type: "string" } } } },
      },
    };

    expect(() => assertStrictModelJsonSchema(oldMalformedSchema)).toThrowError(
      /Every Structured Outputs property must be required/
    );
  });

  // 2. Strict Schema Verification: New V4 schema satisfies assertStrictModelJsonSchema completely
  it("STRICT_SCHEMA: verifies default v2JsonSchema passes assertStrictModelJsonSchema", () => {
    expect(() => assertStrictModelJsonSchema(v2JsonSchema)).not.toThrow();
    expect(v2JsonSchema.type).toBe("object");
    expect(v2JsonSchema.additionalProperties).toBe(false);

    // Every property in properties is in required
    const propKeys = Object.keys(v2JsonSchema.properties).sort();
    const reqKeys = [...v2JsonSchema.required].sort();
    expect(propKeys).toEqual(reqKeys);
    expect((v2JsonSchema.properties.sections as { maxItems: number }).maxItems).toBe(EDITORIAL_V2_MAX_ROOT_SECTIONS);
  });

  it("STRICT_SCHEMA: verifies dynamic createV2JsonSchema for both AUTO and KEEP directions", () => {
    const base = autoLayoutV2(fixtureContext);
    const schemaAuto = createV2JsonSchema("AUTO", base);
    const schemaKeep = createV2JsonSchema("KEEP", base);

    expect(() => assertStrictModelJsonSchema(schemaAuto)).not.toThrow();
    expect(() => assertStrictModelJsonSchema(schemaKeep)).not.toThrow();

    // When KEEP direction is specified, hero and family are constrained to base layout
    expect(schemaKeep.properties.family.enum).toEqual([base.family]);
    expect(schemaKeep.properties.variant.enum).toEqual([base.variant]);
  });

  it("accepts 50 root nodes including utility nodes and rejects a 51st root", () => {
    const base = autoLayoutV2(fixtureContext);
    const sections = [...base.sections, ...Array.from({ length: EDITORIAL_V2_MAX_ROOT_SECTIONS - base.sections.length }, (_, i) => ({
      id: `utility-${i}`,
      type: (["MAP", "SOURCES", "VISIT_INFORMATION", "FACTS", "SECTION"] as const)[i % 5]!,
    }))];
    expect(sections).toHaveLength(EDITORIAL_V2_MAX_ROOT_SECTIONS);
    expect(editorialLayoutV2Schema.safeParse({ ...base, sections }).success).toBe(true);
    expect(editorialLayoutV2Schema.safeParse({ ...base, sections: [...sections, { id: "overflow", type: "SECTION" }] }).success).toBe(false);
  });

  it("rejects 51 total nodes even when root sections remain under 50", () => {
    const sections = Array.from({ length: 5 }, (_, rootIndex) => ({
      id: `root-${rootIndex}`,
      type: "SECTION" as const,
      children: Array.from({ length: rootIndex === 4 ? 6 : 10 }, (_, childIndex) => ({
        id: `child-${rootIndex}-${childIndex}`,
        type: "PARAGRAPH" as const,
      })),
    }));
    expect(sections.length).toBeLessThan(EDITORIAL_V2_MAX_ROOT_SECTIONS);
    expect(sections.reduce((count, root) => count + 1 + root.children.length, 0)).toBe(EDITORIAL_V2_MAX_TOTAL_NODES + 1);
    expect(editorialLayoutV2Schema.safeParse({ schemaVersion: 2, mode: "GENERATIVE", sections }).success).toBe(false);
  });

  // 3. Adapter error classification: LOCAL_INVALID_SCHEMA vs OPENAI_SCHEMA_REJECTED
  it("ADAPTER: rejects malformed schema locally as LOCAL_INVALID_SCHEMA without calling provider", async () => {
    const fetcher = vi.fn(async () => new Response("ok"));
    const client = createEditorialOpenAiClient({
      apiKey: () => "fixture-key",
      model: () => "gpt-6-luna",
      fetcher,
    });

    const malformedInput = {
      system: "system",
      user: "user",
      jsonSchema: { type: "object" }, // invalid: lacks properties, required, additionalProperties
    };

    await expect(client.complete(malformedInput)).rejects.toMatchObject({
      code: "LOCAL_INVALID_SCHEMA",
      httpStatus: null,
      providerCode: null,
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ADAPTER: classifies OpenAI 400 invalid_json_schema as OPENAI_SCHEMA_REJECTED", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "invalid_json_schema",
            param: "response_format.json_schema.schema",
            message: "Schema rejected by OpenAI",
          },
        }),
        { status: 400 }
      )
    );

    const client = createEditorialOpenAiClient({
      apiKey: () => "fixture-key",
      model: () => "gpt-6-luna",
      fetcher,
    });

    const validSchemaInput = {
      system: "system",
      user: "user",
      jsonSchema: v2JsonSchema,
    };

    await expect(client.complete(validSchemaInput)).rejects.toMatchObject({
      code: "OPENAI_SCHEMA_REJECTED",
      httpStatus: 400,
      providerCode: "invalid_json_schema",
    });

    expect(fetcher).toHaveBeenCalledOnce();
  });

  // 4. End-to-End V4 Generative Proposal with Mocked OpenAI Provider
  it("E2E_PROPOSE: generates a valid V4 layout with nested COLUMNS and IMAGE_MOSAIC through mocked provider", async () => {
    const mockV4ResponsePayload = {
      schemaVersion: 2,
      mode: "GENERATIVE",
      family: "HERITAGE_STORY",
      variant: "EDITORIAL",
      hero: { composition: "EDITORIAL", locked: false },
      design: {
        typography: "LITERARY",
        palette: "FOREST",
        rhythm: "IMMERSIVE",
        containerWidth: "STANDARD",
      },
      sections: [
        {
          id: "sec-hero",
          type: "HERO",
          contentRef: null,
          hidden: false,
          title: "Di tích lịch sử Căng Bắc Mê",
          text: "",
          caption: "",
          deck: null,
          emphasis: "STANDARD",
          columns: null,
          gap: null,
          crop: "wide",
          placement: "full",
          gallery: "mosaic",
          mediaIds: ["media-bm-1"],
          sourceIds: [],
          focalX: 50,
          focalY: 50,
          entries: [],
          children: [],
        },
        {
          id: "sec-intro",
          type: "LEAD",
          contentRef: null,
          hidden: false,
          title: "",
          text: "Di tích lịch sử Căng Bắc Mê nằm trên sườn núi Rồng thuộc thôn Bản Đồn, xã Yên Cường, huyện Bắc Mê, tỉnh Hà Giang.",
          caption: "",
          deck: null,
          emphasis: "FEATURED",
          columns: null,
          gap: null,
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
          id: "sec-chapters-col",
          type: "COLUMNS",
          contentRef: null,
          hidden: false,
          title: "Thời kỳ thuộc Pháp",
          text: "",
          caption: "",
          deck: null,
          emphasis: "STANDARD",
          columns: 2,
          gap: "MEDIUM",
          crop: "wide",
          placement: "left",
          gallery: "mosaic",
          mediaIds: [],
          sourceIds: [],
          focalX: 50,
          focalY: 50,
          entries: [],
          children: [
            {
              id: "child-p1",
              type: "PARAGRAPH",
              contentRef: null,
              hidden: false,
              title: "",
              text: "Nơi đây từng là đồn binh do thực dân Pháp xây dựng trước năm 1939 nhằm kiểm soát tuyến đường giao thông huyết mạch giữa Hà Giang, Tuyên Quang và Cao Bằng.",
              caption: "",
              deck: null,
              emphasis: "STANDARD",
              columns: null,
              gap: null,
              crop: "wide",
              placement: "left",
              gallery: "mosaic",
              mediaIds: [],
              sourceIds: [],
              focalX: 50,
              focalY: 50,
              entries: [],
            },
            {
              id: "child-p2",
              type: "PARAGRAPH",
              contentRef: null,
              hidden: false,
              title: "",
              text: "Sau năm 1939, thực dân Pháp chuyển đồn binh thành nơi giam giữ các chiến sĩ cách mạng.",
              caption: "",
              deck: null,
              emphasis: "STANDARD",
              columns: null,
              gap: null,
              crop: "wide",
              placement: "left",
              gallery: "mosaic",
              mediaIds: [],
              sourceIds: [],
              focalX: 50,
              focalY: 50,
              entries: [],
            },
          ],
        },
        {
          id: "sec-mosaic",
          type: "IMAGE_MOSAIC",
          contentRef: null,
          hidden: false,
          title: "Dấu tích lịch sử và cảnh quan",
          text: "Trải qua thời gian và chiến tranh, nhiều hạng mục của Căng Bắc Mê đã bị rêu phong bao phủ giữa khung cảnh thiên nhiên hùng vĩ của núi rừng Tây Bắc.",
          caption: "",
          deck: null,
          emphasis: "FEATURED",
          columns: null,
          gap: "LARGE",
          crop: "original",
          placement: "center",
          gallery: "mosaic",
          mediaIds: ["media-bm-2", "media-bm-3"],
          sourceIds: [],
          focalX: 50,
          focalY: 50,
          entries: [],
          children: [],
        },
        {
          id: "sec-sources",
          type: "SOURCES",
          contentRef: null,
          hidden: false,
          title: "Tài liệu lưu trữ & Nguồn tham khảo",
          text: "",
          caption: "",
          deck: null,
          emphasis: "SUBTLE",
          columns: null,
          gap: null,
          crop: "wide",
          placement: "left",
          gallery: "mosaic",
          mediaIds: [],
          sourceIds: ["src-bm-1"],
          focalX: 50,
          focalY: 50,
          entries: [],
          children: [],
        },
      ],
    };

    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(mockV4ResponsePayload) },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const client = createEditorialOpenAiClient({
      apiKey: () => "fixture-key",
      model: () => "gpt-6-luna",
      fetcher,
    });

    const store = v3TestStore();
    const db = store.deps.database as any;
    db.$executeRaw = async () => 1;
    db.idempotencyRecord.count = async () => 0;

    const created = await writeDestination(
      new Headers(),
      {
        name: fixtureContext.name,
        description: fixtureContext.description,
        area: fixtureContext.area,
        category: fixtureContext.category,
        latitude: fixtureContext.latitude,
        longitude: fixtureContext.longitude,
        suggestedDurationMinutes: fixtureContext.suggestedDurationMinutes,
        minimumDurationMinutes: 30,
        openingDays: unknownSchedule(),
      },
      "create",
      null,
      store.deps
    );
    if (created.status !== "SUCCESS") throw new Error("Creation failed");
    const destId = created.data.id;
    const row = store.rows().get(destId);
    row.media.push(
      ...fixtureContext.media.map((m, idx) => ({
        id: m.id,
        destinationId: destId,
        url: m.url,
        alt: m.alt,
        caption: m.caption,
        author: null,
        sourceUrl: null,
        websiteRights: "APPROVED",
        rightsEvidence: "Giấy phép sử dụng hình ảnh chính thức",
        reviewedBy: "admin",
        reviewedAt: new Date(),
        position: idx,
        isCover: m.isCover,
        storageReference: null,
      }))
    );
    row.sources.push(
      ...fixtureContext.sources.map((s) => ({
        id: s.id,
        destinationId: destId,
        title: s.title,
        url: s.url,
        publisher: null,
        publishedDate: null,
        isOfficial: true,
      }))
    );

    const result = await proposeEditorial(
      new Headers(),
      destId,
      store.deps,
      client,
      { version: 2 }
    );

    expect(result.status).toBe("PROPOSED");
    expect(isV2Layout(result.layout)).toBe(true);

    const v2Layout = result.layout as EditorialLayoutV2;
    expect(v2Layout.schemaVersion).toBe(2);
    expect(v2Layout.mode).toBe("GENERATIVE");

    // Check that nested COLUMNS and IMAGE_MOSAIC exist
    const hasColumns = v2Layout.sections.some((n) => n.type === "COLUMNS" && n.columns === 2);
    const hasChildren = v2Layout.sections.some((n) => Boolean(n.children && n.children.length > 0));
    const hasMosaic = v2Layout.sections.some((n) => n.type === "IMAGE_MOSAIC");

    expect(hasColumns).toBe(true);
    expect(hasChildren).toBe(true);
    expect(hasMosaic).toBe(true);

    // 5. Sensitive config leak check: layout.metadata does NOT contain model string
    expect(v2Layout.metadata).not.toHaveProperty("model");
    expect(result).not.toHaveProperty("model");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("gpt-6-luna");
  });

  // 6. Fallback Behavior: Fallback preserves layout and classifies outcome accurately
  it("FALLBACK: returns FALLBACK with accurate outcome when client is missing", async () => {
    const store = v3TestStore();
    const db = store.deps.database as any;
    db.$executeRaw = async () => 1;
    db.idempotencyRecord.count = async () => 0;

    const created = await writeDestination(
      new Headers(),
      {
        name: fixtureContext.name,
        description: fixtureContext.description,
        area: fixtureContext.area,
        category: fixtureContext.category,
        latitude: fixtureContext.latitude,
        longitude: fixtureContext.longitude,
        suggestedDurationMinutes: fixtureContext.suggestedDurationMinutes,
        minimumDurationMinutes: 30,
        openingDays: unknownSchedule(),
      },
      "create",
      null,
      store.deps
    );
    if (created.status !== "SUCCESS") throw new Error("Creation failed");
    const destId = created.data.id;
    const row = store.rows().get(destId);
    row.media.push(
      ...fixtureContext.media.map((m, idx) => ({
        id: m.id,
        destinationId: destId,
        url: m.url,
        alt: m.alt,
        caption: m.caption,
        author: null,
        sourceUrl: null,
        websiteRights: "APPROVED",
        rightsEvidence: "Giấy phép sử dụng hình ảnh chính thức",
        reviewedBy: "admin",
        reviewedAt: new Date(),
        position: idx,
        isCover: m.isCover,
        storageReference: null,
      }))
    );
    row.sources.push(
      ...fixtureContext.sources.map((s) => ({
        id: s.id,
        destinationId: destId,
        title: s.title,
        url: s.url,
        publisher: null,
        publishedDate: null,
        isOfficial: true,
      }))
    );

    const ctx = await readEditorialContext(destId, db);
    const baseLayout = autoLayoutV2(ctx);
    const result = await proposeEditorial(
      new Headers(),
      destId,
      store.deps,
      null, // No AI client configured
      { version: 2, layout: baseLayout }
    );

    expect(result.status).toBe("FALLBACK");
    expect(result.layout).toEqual(baseLayout);
  });

  // 7. V3.6 Backward Compatibility: V1 layouts still work identically
  it("V3_6_COMPAT: preserves full compatibility for V1 layouts", () => {
    const v1 = autoLayoutV1(fixtureContext);
    expect(isV1Layout(v1)).toBe(true);
    expect(v1.schemaVersion).toBe(1);
    expect(v1.blocks.length).toBeGreaterThan(0);
  });
});
