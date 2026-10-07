import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "@KLTN/db";
import { listPublicLocations, parsePublicListQuery, publicLocationResponse, publicLocationSelect } from "./public-destination-list";

const rows = [
  { id: "a", name: "Đồng Văn", description: "Di sản cao nguyên", category: "heritage", area: "dong-van", visibility: "VISIBLE", latitude: 23, longitude: 105 },
  { id: "b", name: "Mèo Vạc", description: "Chợ và di sản", category: "heritage", area: "meo-vac", visibility: "VISIBLE", latitude: 23, longitude: 105 },
  { id: "c", name: "Núi", description: "Cao nguyên", category: "nature", area: "dong-van", visibility: "VISIBLE", latitude: 23, longitude: 105 },
  { id: "hidden-match", name: "Đồng Văn ẩn", description: "Di sản", category: "heritage", area: "dong-van", visibility: "HIDDEN", latitude: 23, longitude: 105 },
  { id: "hidden-only", name: "Riêng", description: "Di sản", category: "private", area: "private", visibility: "HIDDEN", latitude: 23, longitude: 105 },
];
function fixture(source = rows) {
  const queries: any[] = [];
  const database = { destination: { findMany: async (query: any) => {
    queries.push(query);
    return source.filter(row => row.visibility === query.where.visibility
      && (!query.where.category || row.category === query.where.category)
      && (!query.where.area || row.area === query.where.area)
      && (!query.where.OR || query.where.OR.some((condition: any) => {
        const [field, search] = Object.entries(condition)[0]! as [keyof typeof row, any];
        return String(row[field]).toLocaleLowerCase("vi-VN").includes(search.contains.toLocaleLowerCase("vi-VN"));
      })))
      .map(row => Object.fromEntries(Object.keys(query.select).map(key => [key, row[key as keyof typeof row]])));
  } } } as unknown as Pick<Database, "destination">;
  return { database, queries };
}
for (const [query, ids] of [
  ["", ["a", "b", "c"]], ["q=ĐỒNG", ["a"]], ["q=Di sản", ["a", "b"]],
  ["q=absent", []], ["category=heritage", ["a", "b"]], ["region=dong-van", ["a", "c"]],
  ["category=heritage&region=dong-van", ["a"]],
  ["q=di sản&category=heritage&region=dong-van", ["a"]],
  ["q=Mèo&category=nature&region=dong-van", []],
  ["q=%20&category=%20&region=%20", ["a", "b", "c"]], ["category=unknown", []],
] as const) test(`public AND search ${query || "no filter"}`, async () => {
  const f = fixture();
  const data = await listPublicLocations(parsePublicListQuery(new URLSearchParams(query)), f.database);
  assert.deepEqual(data.items.map(item => item.id), ids);
  assert.equal(f.queries.length, 2);
  for (const input of f.queries) assert.equal(input.where.visibility, "VISIBLE");
  assert.deepEqual(f.queries[0].select, publicLocationSelect);
  assert.deepEqual(f.queries[0].orderBy, [{ name: "asc" }, { id: "asc" }]);
  assert.equal(f.queries[0].skip, undefined); assert.equal(f.queries[0].take, undefined);
  assert.deepEqual((data as any).filters, { categories: ["heritage", "nature"], regions: ["dong-van", "meo-vac"] });
});
test("empty dataset is successful with empty public options", async () => {
  const response = await publicLocationResponse(new Request("http://localhost/api/destinations"), fixture([]).database);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { success: true, data: { items: [], filters: { categories: [], regions: [] } } });
});
test("taxonomy normalizes existing convention; blank is absent; no role bypass", () => {
  assert.deepEqual(parsePublicListQuery(new URLSearchParams("q=%20Cao%20%20nguyên%20&category=%20HERITAGE%20&region=%20DONG-VAN%20")), { q: "Cao nguyên", category: "heritage", region: "dong-van" });
  assert.deepEqual(parsePublicListQuery(new URLSearchParams("q=&category=&region=")), {});
});
test("invalid inputs produce shared400 and never query the database", async () => {
  for (const query of ["q=a&q=b", "category=a&category=b", "region=a&region=b", "role=ADMIN", "area=x", "view=evil", "page=2", `q=${"a".repeat(201)}`, `category=${"a".repeat(101)}`, `region=${"a".repeat(101)}`]) {
    const f = fixture(); const response = await publicLocationResponse(new Request(`http://localhost/api/destinations?${query}`), f.database);
    assert.equal(response.status, 400, query); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).error.code, "INVALID_EXPLORE_QUERY"); assert.equal(f.queries.length, 0);
  }
});
test("technical failure is sanitized shared500, never successful empty", async () => {
  const old = console.error; console.error = () => {};
  try {
    const response = await publicLocationResponse(new Request("http://localhost/api/destinations?q=match"), { destination: { findMany: async () => { throw Error("secret connection"); } } } as any);
    assert.equal(response.status, 500); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Đã xảy ra lỗi hệ thống" } });
  } finally { console.error = old; }
});
test("keyword wildcard characters are literal substring characters, not ILIKE patterns", async () => {
  const f = fixture();
  await listPublicLocations({ q: "100%_\\" }, f.database);
  assert.deepEqual(f.queries[0].where.OR, [
    { name: { contains: "100\\%\\_\\\\", mode: "insensitive" } },
    { description: { contains: "100\\%\\_\\\\", mode: "insensitive" } },
  ]);
});
