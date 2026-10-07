import { describe, expect, it, vi } from "vitest";

import type { CultureDatabase } from "./culture.service";
import {
  getPublicCulture,
  listPublicCulture,
  publicCultureDetailResponse,
  publicCultureResponse,
} from "./culture.service";
import { parsePublicCultureQuery } from "./culture.schema";
import {
  safeCultureSourceUrl,
  sortCultureSources,
} from "@/app/culture/[slug]/culture-source-utils";

const databaseRef = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/services", () => ({
  get db() {
    return databaseRef.current;
  },
}));

type FakeRow = {
  id: string;
  title: string;
  content: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  visibility: "HIDDEN" | "VISIBLE";
  updatedAt: Date;
  destinations: Array<{
    destination: { id: string; name: string };
  }>;
};

function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "culture-visible",
    title: "Lễ hội giả lập",
    content: "Nội dung văn hóa dùng cho kiểm thử.",
    sourceTitle: "Nguồn kiểm thử",
    sourceUrl: "https://example.test/culture",
    visibility: "VISIBLE",
    updatedAt: new Date("2026-10-05T01:02:03.000Z"),
    destinations: [
      { destination: { id: "destination-visible", name: "Điểm đến công khai" } },
    ],
    ...overrides,
  };
}

function databaseFor(rows: FakeRow[]) {
  const findMany = vi.fn(async (input: { skip: number; take: number }) =>
    rows
      .filter((item) => item.visibility === "VISIBLE")
      .slice(input.skip, input.skip + input.take),
  );
  const findFirst = vi.fn(async (input: { where: { id: string; visibility: string } }) =>
    rows.find(
      (item) =>
        item.id === input.where.id && item.visibility === input.where.visibility,
    ) ?? null,
  );

  return {
    database: {
      cultureContent: { findMany, findFirst },
    } as unknown as CultureDatabase,
    findMany,
    findFirst,
  };
}

async function routeHandlers() {
  const listRoute = await import("@/app/api/culture/route");
  const detailRoute = await import("@/app/api/culture/[idOrSlug]/route");
  return { listRoute, detailRoute };
}

describe("US14 Culture public service and Route Handlers", () => {
  it("returns only public rows and builds q/destination/pagination filters", async () => {
    const fixture = databaseFor([
      row({ id: "culture-a" }),
      row({ id: "culture-hidden", visibility: "HIDDEN" }),
      row({ id: "culture-b" }),
    ]);

    const result = await listPublicCulture(
      {
        q: "lễ hội",
        destinationId: "destination-visible",
        page: 2,
        pageSize: 1,
      },
      fixture.database,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("culture-b");
    expect(result.pageInfo).toEqual({ page: 2, pageSize: 1, hasNextPage: false });

    const query = fixture.findMany.mock.calls[0]?.[0] as Record<string, any>;
    expect(query.where.visibility).toBe("VISIBLE");
    expect(query.where.OR).toEqual([
      { title: { contains: "lễ hội", mode: "insensitive" } },
      { content: { contains: "lễ hội", mode: "insensitive" } },
    ]);
    expect(query.where.destinations.some.destinationId).toBe("destination-visible");
    expect(query.where.destinations.some.destination.visibility).toBe("VISIBLE");
    expect(query.skip).toBe(1);
    expect(query.take).toBe(2);
  });

  it("returns empty list as success and invalid pagination as VALIDATION_ERROR", async () => {
    const empty = databaseFor([]);
    const emptyResponse = await publicCultureResponse(
      new Request("http://localhost/api/culture?page=1&pageSize=12"),
      empty.database,
    );
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({
      success: true,
      data: {
        items: [],
        pageInfo: { page: 1, pageSize: 12, hasNextPage: false },
      },
    });

    const invalidResponse = await publicCultureResponse(
      new Request("http://localhost/api/culture?pageSize=51"),
      empty.database,
    );
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: expect.any(String) },
    });
  });

  it("returns strict detail DTO, safe sources, visible related destinations, and empty sources", async () => {
    const fixture = databaseFor([
      row({
        id: "culture-visible",
        sourceTitle: "Nguồn thật",
        sourceUrl: "javascript:alert(1)",
        destinations: [
          { destination: { id: "destination-visible", name: "Điểm đến công khai" } },
        ],
      }),
      row({
        id: "culture-no-source",
        sourceTitle: null,
        sourceUrl: null,
        destinations: [],
      }),
    ]);

    const detail = await getPublicCulture("culture-visible", fixture.database);
    expect(Object.keys(detail).sort()).toEqual([
      "body",
      "coverImageUrl",
      "destinations",
      "id",
      "slug",
      "sources",
      "summary",
      "title",
      "updatedAt",
    ]);
    expect(detail.body).toBe("Nội dung văn hóa dùng cho kiểm thử.");
    expect(detail.sources).toEqual([
      { title: "Nguồn thật", url: null, citation: null, sortOrder: 0 },
    ]);
    expect(detail.destinations).toEqual([
      { id: "destination-visible", slug: "destination-visible", name: "Điểm đến công khai" },
    ]);

    const noSource = await getPublicCulture("culture-no-source", fixture.database);
    expect(noSource.sources).toEqual([]);

    const query = fixture.findFirst.mock.calls[0]?.[0] as Record<string, any>;
    expect(query.where.visibility).toBe("VISIBLE");
    expect(query.select.destinations.where.destination.visibility).toBe("VISIBLE");
    expect(query.select.destinations.orderBy).toEqual({ destinationId: "asc" });
  });

  it("maps hidden and missing detail to the same unavailable error", async () => {
    const fixture = databaseFor([row({ id: "culture-hidden", visibility: "HIDDEN" })]);

    const hidden = await publicCultureDetailResponse("culture-hidden", fixture.database);
    const missing = await publicCultureDetailResponse("culture-missing", fixture.database);

    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    await expect(getPublicCulture("culture-hidden", fixture.database)).rejects.toMatchObject({
      code: "CULTURE_CONTENT_UNAVAILABLE",
      status: 404,
    });
  });

  it("calls both public GET Route Handlers directly with a fake Request/database", async () => {
    const fixture = databaseFor([row()]);
    databaseRef.current = fixture.database;
    const { listRoute, detailRoute } = await routeHandlers();

    const listResponse = await listRoute.GET(
      new Request("http://localhost/api/culture?page=1&pageSize=1"),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      success: true,
      data: { items: [{ id: "culture-visible" }] },
    });

    const detailResponse = await detailRoute.GET(
      new Request("http://localhost/api/culture/culture-visible"),
      { params: Promise.resolve({ idOrSlug: "culture-visible" }) },
    );
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      success: true,
      data: { id: "culture-visible", body: "Nội dung văn hóa dùng cho kiểm thử." },
    });

    const invalidResponse = await listRoute.GET(
      new Request("http://localhost/api/culture?pageSize=invalid"),
    );
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("accepts only HTTP(S) source URLs and sorts source order stably", () => {
    expect(safeCultureSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeCultureSourceUrl("data:text/plain,unsafe")).toBeNull();
    expect(safeCultureSourceUrl("  https://example.test/source  ")).toBe(
      "https://example.test/source",
    );
    expect(safeCultureSourceUrl("ftp://example.test/source")).toBeNull();
    expect(
      sortCultureSources([
        { id: "second", sortOrder: 2 },
        { id: "first", sortOrder: 1 },
        { id: "same-order", sortOrder: 1 },
      ]),
    ).toEqual([
      { id: "first", sortOrder: 1 },
      { id: "same-order", sortOrder: 1 },
      { id: "second", sortOrder: 2 },
    ]);
  });

  it("parses valid filters and rejects invalid/repeated query parameters", () => {
    expect(
      parsePublicCultureQuery(
        new URLSearchParams("q=%20l%E1%BB%85%20h%E1%BB%99i%20&destinationId=destination-1&page=2&pageSize=50"),
      ),
    ).toEqual({
      q: "lễ hội",
      destinationId: "destination-1",
      page: 2,
      pageSize: 50,
    });
    expect(() => parsePublicCultureQuery(new URLSearchParams("page=1&page=2"))).toThrow();
    expect(() => parsePublicCultureQuery(new URLSearchParams("pageSize=0"))).toThrow();
  });
});
