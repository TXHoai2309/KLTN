import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@KLTN/db";
import { weekdays } from "./destination-contract";
import { visibleDestinationWhere } from "./destination-eligibility";
import { getPublicDestination, publicDestinationSelect } from "./public-destination-service";
import { publicDestinationResponse } from "./public-destination-http";
import { publicDestinationDetailSchema, formatSuggestedDuration } from "./public-destination-contract";
import DestinationDetail, { DetailState } from "../../app/destinations/[id]/destination-detail";

function fixture(visibility = "VISIBLE", duration: number | null = 90) {
  let state: string | null = visibility;
  let reads = 0;
  const row = {
    id: "detail-a", name: "Public destination", description: "Exact factual description", area: "đồng văn", category: "văn hóa", latitude: 23.2, longitude: 105.3,
    suggestedDurationMinutes: duration,
    openingDays: [...weekdays].reverse().map(dayOfWeek => ({ dayOfWeek, status: dayOfWeek === "MONDAY" ? "OPEN" : dayOfWeek === "TUESDAY" ? "CLOSED" : "UNKNOWN",
      intervals: dayOfWeek === "MONDAY" ? [{ opensAtMinute: 780, closesAtMinute: 1440 }, { opensAtMinute: 420, closesAtMinute: 660 }] : [],
    })),
  };
  const database = { destination: { findUnique: async ({ where, select }: any) => {
    reads++;
    if (select.id && Object.keys(select).length === 1) return state && where.id === row.id ? { id: row.id } : null;
    assert.deepEqual(where, { id: row.id, ...visibleDestinationWhere });
    assert.deepEqual(select, publicDestinationSelect);
    return state === "VISIBLE" ? row : null;
  } } } as unknown as Pick<Database, "destination">;
  return { row, database, reads: () => reads, state: (value: string | null) => { state = value; } };
}

for (const role of ["Guest", "Traveler", "Admin"]) test(`${role} public HTTP returns200 with exact public DTO and canonical schedule`, async () => {
  const f = fixture();
  const response = await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a", { headers: role === "Guest" ? {} : { cookie: `test-role=${role}` } }), "detail-a", f.database);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json(); assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result.data).sort(), ["id", "name", "description", "area", "category", "latitude", "longitude", "suggestedDurationMinutes", "openingDays", "relatedCulture"].sort());
  assert.equal(result.data.description, f.row.description); assert.equal(result.data.latitude, 23.2); assert.equal(result.data.longitude, 105.3); assert.equal(result.data.suggestedDurationMinutes, 90);
  assert.equal(result.data.openingDays.length, 7); assert.deepEqual(result.data.openingDays.map((d: any) => d.dayOfWeek), weekdays);
  assert.deepEqual(result.data.openingDays[0].intervals, [{ opensAt: "07:00", closesAt: "11:00" }, { opensAt: "13:00", closesAt: "24:00" }]);
  assert.equal(result.data.openingDays[1].status, "CLOSED"); assert.equal(result.data.openingDays[2].status, "UNKNOWN");
  assert.deepEqual(result.data.relatedCulture, []); assert.equal("sourceInfo" in result.data, false);
});

for (const role of ["Guest", "Traveler", "Admin"]) test(`${role} hidden HTTP410 contains no full DTO or private data`, async () => {
  const f = fixture("HIDDEN");
  const response = await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a", { headers: { "X-Role": role } }), "detail-a", f.database);
  assert.equal(response.status, 410); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json(); assert.equal(result.error.code, "DESTINATION_UNAVAILABLE");
  assert.deepEqual(Object.keys(result), ["success", "error"]); assert.equal("details" in result.error, false);
  assert.ok(!JSON.stringify(result).includes(f.row.name)); assert.ok(!JSON.stringify(result).includes(f.row.description));
  assert.equal(f.reads(), 2);
});

test("missing404, malformed404 before persistence and unsupported query400 are distinct", async () => {
  const f = fixture(); f.state(null);
  const response = await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a"), "detail-a", f.database);
  assert.equal(response.status, 404); assert.equal((await response.json()).error.code, "DESTINATION_NOT_FOUND");
  const reads = f.reads();
  for (const id of ["", "bad/id", "a".repeat(129), "<script>"]) {
    assert.equal((await publicDestinationResponse(new Request("http://localhost/api/destinations/invalid"), id, f.database)).status, 404);
  }
  assert.equal(f.reads(), reads);
  assert.equal((await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a?role=ADMIN"), "detail-a", f.database)).status, 400);
});

test("a fresh read after hide cannot replay visible content", async () => {
  const f = fixture(); assert.equal((await getPublicDestination("detail-a", f.database)).name, f.row.name);
  f.state("HIDDEN");
  const response = await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a"), "detail-a", f.database);
  assert.equal(response.status, 410); assert.equal("data" in await response.json(), false);
});

test("database failure is500 load failure rather than unavailable and has no internal message", async () => {
  const database = { destination: { findUnique: async () => { throw Error("fixture-internal-detail"); } } } as unknown as Pick<Database, "destination">;
  await assert.rejects(getPublicDestination("detail-a", database), /fixture-internal-detail/);
  const original = console.error; console.error = () => {};
  try {
    const response = await publicDestinationResponse(new Request("http://localhost/api/destinations/detail-a"), "detail-a", database);
    assert.equal(response.status, 500); const result = await response.json();
    assert.equal(result.error.code, "INTERNAL_SERVER_ERROR"); assert.ok(!JSON.stringify(result).includes("fixture-internal-detail"));
  } finally { console.error = original; }
});

test("strict public allowlist rejects metadata, minimum, fabricated source and Culture", async () => {
  const f = fixture("VISIBLE", null); const dto = await getPublicDestination("detail-a", f.database);
  assert.equal(dto.suggestedDurationMinutes, null);
  for (const extra of [{ visibility: "HIDDEN" }, { minimumDurationMinutes: 45 }, { updatedAt: "private" }, { sourceInfo: "fake" }, { relatedCulture: [{ id: "fake" }] }]) {
    assert.equal(publicDestinationDetailSchema.safeParse({ ...dto, ...extra }).success, false);
  }
  assert.ok(!("minimumDurationMinutes" in publicDestinationSelect)); assert.ok(!("visibility" in publicDestinationSelect));
});

test("duration formats minutes/hour/mixed/null without a fallback", () => {
  for (const [input, output] of [[45, "45 phút"], [60, "1 giờ"], [90, "1 giờ 30 phút"], [120, "2 giờ"], [null, "Chưa có dữ liệu"]] as const) assert.equal(formatSuggestedDuration(input), output);
});

test("public screen renders factual text, seven weekdays and human hours with no fake integrations", async () => {
  const dto = await getPublicDestination("detail-a", fixture().database);
  const html = renderToStaticMarkup(createElement(DestinationDetail, { destination: dto }));
  for (const copy of [dto.name, dto.description, dto.area, dto.category, "Thông tin tham quan", "Thời lượng tham quan gợi ý", "1 giờ 30 phút", "23.2", "105.3", "Nội dung văn hóa liên quan", "Chưa có nội dung văn hóa liên quan.", "07:00 – 11:00", "13:00 – 24:00", "Đóng cửa cả ngày", "Chưa có dữ liệu", "Thứ Hai", "Chủ Nhật"]) assert.ok(html.includes(copy), copy);
  assert.doesNotMatch(html, />OPEN<|>CLOSED<|>UNKNOWN<|minimumDuration|<img|<iframe|Yêu thích|Hỏi AI|\/explore/);
  assert.match(html, /href="\/"/); assert.match(html, /aria-labelledby="hours-title"/);
});

test("separate loading/error/missing/unavailable views never contain destination content", () => {
  for (const [state, title] of [["loading", "Đang tải điểm đến…"], ["error", "Không thể tải thông tin điểm đến"], ["missing", "Không tìm thấy điểm đến"], ["unavailable", "Điểm đến không còn khả dụng"]] as const) {
    const html = renderToStaticMarkup(createElement(DetailState, { state }));
    assert.ok(html.includes(title)); assert.ok(!html.includes("Exact factual description"));
    if (state === "error") assert.match(html, /role="alert"/);
    if (state === "loading") assert.match(html, /role="status"/);
  }
});

test("public delivery uses one service, no auth exception/cache and real retry; responsive dark styles", async () => {
  const page = await readFile(new URL("../../app/destinations/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getPublicDestination/); assert.match(page, /notFound\(\)/); assert.match(page, /DESTINATION_UNAVAILABLE/); assert.match(page, /force-dynamic/);
  const route = await readFile(new URL("../../app/api/destinations/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /publicDestinationResponse/); assert.doesNotMatch(route, /requireActor|session|admin/);
  const error = await readFile(new URL("../../app/destinations/[id]/error.tsx", import.meta.url), "utf8");
  assert.match(error, /router.refresh\(\); reset\(\)/); assert.match(error, /disabled=\{pending\}/);
  const css = await readFile(new URL("../../app/destinations/[id]/detail.css", import.meta.url), "utf8");
  assert.match(css, /\.dark \.public-detail/); assert.match(css, /minmax\(0, 1fr\)/); assert.match(css, /focus-visible/);
});
