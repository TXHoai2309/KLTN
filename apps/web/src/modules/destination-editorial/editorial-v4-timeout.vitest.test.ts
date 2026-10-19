import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createEditorialOpenAiClient,
  resolveEditorialTimeout,
  EDITORIAL_OPENAI_LIMITS,
} from "./editorial-openai-client";
import {
  proposeEditorial,
  validateAiProposalV2,
} from "./editorial-ai";
import {
  autoLayoutV2,
  autoLayoutV1,
} from "./editorial-engine";
import {
  type EditorialContext,
  type EditorialLayoutV2,
  type EditorialLayoutV1,
} from "./editorial-contract";
import { compileEditorialLayout } from "./editorial-compiler";
import { buildCanonicalContentAst } from "./editorial-ast";
import { unknownSchedule } from "../destination/destination-contract";

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

import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";

async function createMockStore() {
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
    ...fixtureContext.sources.map(s => ({
      id: s.id,
      destinationId: destId,
      title: s.title,
      url: s.url,
      publisher: null,
      publishedDate: null,
      isOfficial: true,
    }))
  );
  return { store, destId, row };
}


describe("Task FIX_V4_GENERATIVE_TIMEOUT — Strict Verification Suite", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    vi.stubEnv("OPENAI_EDITORIAL_MODEL", "gpt-6-luna");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // 1. Timeout Resolution Logic
  describe("Timeout Resolution & Bounds", () => {
    it("resolves default V1 timeout to 25,000ms", () => {
      expect(resolveEditorialTimeout(1)).toBe(25_000);
      expect(resolveEditorialTimeout()).toBe(25_000);
    });

    it("resolves default V4 timeout to 240,000ms", () => {
      expect(resolveEditorialTimeout(2)).toBe(240_000);
    });

    it("honors OPENAI_EDITORIAL_TIMEOUT_MS env variable when valid", () => {
      vi.stubEnv("OPENAI_EDITORIAL_TIMEOUT_MS", "75000");
      expect(resolveEditorialTimeout(2)).toBe(75_000);
      expect(resolveEditorialTimeout(1)).toBe(75_000);
    });

    it("clamps invalid or out-of-bound env timeout to default", () => {
      vi.stubEnv("OPENAI_EDITORIAL_TIMEOUT_MS", "999999");
      expect(resolveEditorialTimeout(2)).toBe(240_000);

      vi.stubEnv("OPENAI_EDITORIAL_TIMEOUT_MS", "not-a-number");
      expect(resolveEditorialTimeout(2)).toBe(240_000);
    });

    it("respects explicit overrideMs bounded up to maxTimeoutMs (240,000ms)", () => {
      expect(resolveEditorialTimeout(2, 45_000)).toBe(45_000);
      expect(resolveEditorialTimeout(2, 240_000)).toBe(240_000);
      // Beyond 240,000ms is ignored and falls back
      expect(resolveEditorialTimeout(2, 360_000)).toBe(240_000);
    });
  });

  // 2. Client Adapter Timeout & Error Classification
  describe("Adapter Timeout, Cancellation & Error Mapping", () => {
    const input = {
      system: "system prompt",
      user: "user prompt",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
    };

    it("completes cleanly when provider responds before timeout", async () => {
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: '{"value":"ok"}' } }],
          }),
          { status: 200 }
        )
      );
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
        timeoutMs: 1000,
      });

      const res = await client.complete(input);
      expect(res.rawText).toBe('{"value":"ok"}');
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("aborts and throws TIMEOUT when provider response exceeds deadline", async () => {
      vi.useFakeTimers();
      const fetcher = vi.fn(() => new Promise<Response>(() => {}));
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
        timeoutMs: 50,
      });

      const promise = client.complete(input);
      const check = expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.advanceTimersByTimeAsync(55);
      await check;
      expect(fetcher).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it("aborts and throws CANCELLED when parent AbortSignal is triggered", async () => {
      const controller = new AbortController();
      const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
        timeoutMs: 5000,
      });

      controller.abort();
      await expect(client.complete({ ...input, signal: controller.signal })).rejects.toMatchObject({
        code: "CANCELLED",
      });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("maps provider 429 to RATE_LIMIT", async () => {
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { code: "rate_limit_exceeded", message: "Too many requests" },
          }),
          { status: 429, headers: { "Retry-After": "15" } }
        )
      );
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
      });

      await expect(client.complete(input)).rejects.toMatchObject({
        code: "RATE_LIMIT",
        httpStatus: 429,
        retryAfterSeconds: 15,
      });
    });

    it("maps provider 400 invalid_json_schema to OPENAI_SCHEMA_REJECTED", async () => {
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "invalid_json_schema",
              message: "Schema violates strict mode",
              param: "response_format.json_schema.schema",
            },
          }),
          { status: 400 }
        )
      );
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
      });

      await expect(client.complete(input)).rejects.toMatchObject({
        code: "OPENAI_SCHEMA_REJECTED",
        httpStatus: 400,
      });
    });

    it("maps provider truncated finish_reason length to TOKEN_LIMIT", async () => {
      const fetcher = vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: '{"incomplete":' } }],
          }),
          { status: 200 }
        )
      );
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
      });

      await expect(client.complete(input)).rejects.toMatchObject({
        code: "TOKEN_LIMIT",
      });
    });
  });

  // 4. Content AST Token Optimization & Hydration
  describe("Content AST Token Optimization via contentRef", () => {
    it("hydrates text and title from canonical AST when model emits contentRef with empty text", () => {
      const baseV2 = autoLayoutV2(fixtureContext);
      const ast = buildCanonicalContentAst(fixtureContext);
      const firstUnit = ast.units[0];
      expect(firstUnit).toBeDefined();

      const modelOutputJson = {
        schemaVersion: 2,
        mode: "GENERATIVE",
        family: "HERITAGE_STORY",
        variant: "EDITORIAL",
        design: {
          typography: "LITERARY",
          palette: "FOREST",
          rhythm: "IMMERSIVE",
          containerWidth: "STANDARD",
        },
        hero: {
          composition: "EDITORIAL",
          locked: false,
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
            id: "sec-narrative",
            type: "SECTION",
            contentRef: null,
            hidden: false,
            title: "",
            text: "",
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
            children: ast.units.filter(u => u.provenance.sourceField === "description").map((u, idx) => ({
              id: `node-unit-${idx}`,
              type: "PARAGRAPH" as const,
              // Notice: Model passes only contentRef and empty text
              contentRef: u.id,
              hidden: false,
              title: "",
              text: "",
              caption: "",
              deck: null,
              emphasis: "STANDARD" as const,
              columns: null,
              gap: null,
              crop: "wide" as const,
              placement: "left" as const,
              gallery: "mosaic" as const,
              mediaIds: [],
              sourceIds: [],
              focalX: 50,
              focalY: 50,
              entries: [],
              children: null,
            })),
          },
        ],
      };

      const validated = validateAiProposalV2(
        JSON.stringify(modelOutputJson),
        baseV2,
        fixtureContext,
        "AUTO"
      );

      // Verify that validateAiProposalV2 deterministically hydrated all canonical prose!
      const narrativeSec = validated.sections.find(s => s.id === "sec-narrative");
      const p1Node = narrativeSec?.children?.[0];
      expect(p1Node?.contentRef).toBe(firstUnit.id);
      expect(p1Node?.text).toBe(firstUnit.text);
      expect(p1Node?.text?.length ?? 0).toBeGreaterThan(20);

      // Verify compiling layout succeeds and preserves text
      const compiled = compileEditorialLayout(validated, fixtureContext);
      expect(compiled.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 5. Preserving Current Layout on Timeout
  describe("Atomic Fallback on Timeout", () => {
    it("preserves exact current layout and draft revisions when timeout occurs", async () => {
      const { store, destId } = await createMockStore();
      const baseV2 = autoLayoutV2(fixtureContext);

      // Stalled fetcher triggers timeout
      vi.useFakeTimers();
      const fetcher = vi.fn(() => new Promise<Response>(() => {}));
      const client = createEditorialOpenAiClient({
        apiKey: () => "valid-key",
        model: () => "gpt-6-luna",
        fetcher,
        timeoutMs: 25,
      });

      const promise = proposeEditorial(
        new Headers(),
        destId,
        store.deps,
        client,
        {
          layout: baseV2,
          version: 2,
        }
      );

      await vi.advanceTimersByTimeAsync(30);
      const result = await promise;

      expect(result.status).toBe("FALLBACK");
      expect(result.outcome).toBe("PROVIDER_FAILED");
      expect(result.reason).toContain("AI Editorial quá thời gian chờ");
      expect(result.layout).toEqual(baseV2);
      vi.useRealTimers();
    });
  });

  // 6. Backward Compatibility for V3.6
  describe("V3.6 Backward Compatibility", () => {
    it("preserves 25,000ms default timeout and contract for V1 layout proposals", async () => {
      const { store, destId } = await createMockStore();
      const baseV1 = autoLayoutV1(fixtureContext) as EditorialLayoutV1;

      let passedTimeout: number | undefined;
      const fakeClient = {
        async complete(input: any) {
          passedTimeout = input.timeoutMs;
          return {
            rawText: JSON.stringify({
              family: baseV1.family,
              variant: baseV1.variant,
              heroComposition: baseV1.variant,
              design: { typography: "LITERARY", palette: "FOREST", rhythm: "IMMERSIVE" },
              blocks: baseV1.blocks.map(b => ({
                id: b.id,
                mediaIds: b.mediaIds,
                placement: b.placement,
                crop: b.crop,
                focalX: b.focalX,
                focalY: b.focalY,
                gallery: b.gallery,
                emphasis: b.emphasis ?? "STANDARD",
                composition: "KEEP",
                hidden: b.hidden,
              })),
            }),
            model: "gpt-6-luna",
          };
        },
      };

      const result = await proposeEditorial(
        new Headers(),
        destId,
        store.deps,
        fakeClient,
        {
          layout: baseV1,
          direction: "KEEP",
        }
      );

      expect(passedTimeout).toBe(25_000);
      expect(result.status).toBe("PROPOSED");
    });
  });
});
