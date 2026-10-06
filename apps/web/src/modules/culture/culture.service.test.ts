import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getPublicCulture,
  listPublicCulture,
  publicCultureResponse,
  publicCultureDetailResponse,
} from "./culture.service";
import { parsePublicCultureQuery } from "./culture.schema";

type FixtureRow = {
  id: string;
  title: string;
  content: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  visibility: "HIDDEN" | "VISIBLE";
  updatedAt: Date;
  destinations: Array<{
    destination: {
      id: string;
      name: string;
    };
  }>;
};

const visibleRow: FixtureRow = {
  id: "culture-visible",
  title: "Lễ hội giả lập",
  content: "Đây là nội dung giả lập để kiểm thử API văn hóa.",
  sourceTitle: "Nguồn kiểm thử",
  sourceUrl: "https://example.test/culture",
  visibility: "VISIBLE",
  updatedAt: new Date("2026-10-05T01:02:03.000Z"),
  destinations: [
    { destination: { id: "destination-visible", name: "Điểm đến công khai" } },
  ],
};

function databaseFor(rows: FixtureRow[]) {
  let lastFindMany: any;
  let lastFindFirst: any;
  return {
    database: {
      cultureContent: {
        findMany: async (input: any) => {
          lastFindMany = input;
          const visible = rows.filter((row) => row.visibility === "VISIBLE");
          return visible.slice(input.skip, input.skip + input.take);
        },
        findFirst: async (input: any) => {
          lastFindFirst = input;
          return rows.find(
            (row) =>
              row.id === input.where.id &&
              row.visibility === input.where.visibility,
          ) ?? null;
        },
      },
    } as any,
    query: () => ({ findMany: lastFindMany, findFirst: lastFindFirst }),
  };
}

test("public Culture query defaults to page/pageSize and rejects unsupported input", () => {
  assert.deepEqual(
    parsePublicCultureQuery(
      new URLSearchParams(
        "q=%20l%E1%BB%85%20h%E1%BB%99i%20&destinationId=destination-1&page=2&pageSize=50",
      ),
    ),
    {
      q: "lễ hội",
      destinationId: "destination-1",
      page: 2,
      pageSize: 50,
    },
  );
  assert.deepEqual(parsePublicCultureQuery(new URLSearchParams()), {
    page: 1,
    pageSize: 12,
  });
  for (const query of [
    "unknown=value",
    "pageSize=0",
    "pageSize=51",
    "page=1&page=2",
  ]) {
    assert.throws(() => parsePublicCultureQuery(new URLSearchParams(query)));
  }
});

test("public Culture list uses visible filter, q/destination filter and stable ordering", async () => {
  const f = databaseFor(
    Array.from({ length: 13 }, (_, index) => ({
      ...visibleRow,
      id: index === 12 ? visibleRow.id : "culture-" + index,
    })),
  );
  const result = await listPublicCulture(
    {
      q: "lễ",
      destinationId: "destination-visible",
      page: 2,
      pageSize: 12,
    },
    f.database,
  );

  assert.deepEqual(result.pageInfo, {
    page: 2,
    pageSize: 12,
    hasNextPage: false,
  });
  assert.deepEqual(result.items[0], {
    id: "culture-visible",
    slug: "culture-visible",
    title: "Lễ hội giả lập",
    summary: "Đây là nội dung giả lập để kiểm thử API văn hóa.",
    coverImageUrl: null,
    updatedAt: "2026-10-05T01:02:03.000Z",
  });
  const query = f.query().findMany;
  assert.equal(query.where.visibility, "VISIBLE");
  assert.equal(query.where.OR[0].title.mode, "insensitive");
  assert.equal(query.where.OR[1].content.mode, "insensitive");
  assert.equal(
    query.where.destinations.some.destination.visibility,
    "VISIBLE",
  );
  assert.deepEqual(query.orderBy, [{ updatedAt: "desc" }, { id: "asc" }]);
  assert.equal(query.skip, 12);
  assert.equal(query.take, 13);
});

test("hidden or missing Culture detail has the same unavailable 404", async () => {
  const f = databaseFor([
    { ...visibleRow, id: "culture-hidden", visibility: "HIDDEN" },
  ]);
  const hidden = await publicCultureDetailResponse(
    "culture-hidden",
    f.database,
  );
  const missing = await publicCultureDetailResponse(
    "missing",
    f.database,
  );

  assert.equal(hidden.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await hidden.json(), await missing.json());
  assert.deepEqual(await getPublicCulture("culture-hidden", f.database).catch((error) => ({
    code: error.code,
    status: error.status,
  })), {
    code: "CULTURE_CONTENT_UNAVAILABLE",
    status: 404,
  });
});

test("public Culture detail projects inline source and only visible destinations", async () => {
  const f = databaseFor([visibleRow]);
  const response = await publicCultureDetailResponse(
    "culture-visible",
    f.database,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.sources, [
    {
      title: "Nguồn kiểm thử",
      url: "https://example.test/culture",
      citation: null,
      sortOrder: 0,
    },
  ]);
  assert.deepEqual(body.data.destinations, [
    {
      id: "destination-visible",
      slug: "destination-visible",
      name: "Điểm đến công khai",
    },
  ]);
  assert.equal(body.data.body, visibleRow.content);
  assert.equal("visibility" in body.data, false);
  assert.equal("createdAt" in body.data, false);
});

test("invalid list input is a Vietnamese VALIDATION_ERROR with details", async () => {
  const response = await publicCultureResponse(
    new Request("http://localhost/api/culture?pageSize=51"),
    databaseFor([visibleRow]).database,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(body.error.details));
  assert.equal(body.error.details[0].message, "pageSize phải từ 1 đến 50.");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
