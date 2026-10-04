import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import type { Database } from "@KLTN/db";
import { destinationInputSchema, unknownSchedule, toMinute, fromMinute, type DestinationInput } from "./destination-contract";
import { getDestination, listDestinations, writeDestination, type DestinationDependencies } from "./destination-service";
import { destinationJson, destinationPageQuery } from "./destination-http";
import { AppError } from "../../server/http/app-error";
import { saveDestination, changeDestinationVisibility } from "../../lib/destination-client";
import { setDestinationVisibility } from "./destination-visibility";
import { visibleDestinationWhere, isDestinationPublic, isDestinationEligibleForNewItinerary, findEligibleDestinationIds } from "./destination-eligibility";
import { claimSubmission, releaseSubmission } from "../../lib/auth-submission-guard";
import { markDestinationSaved, takeDestinationSaved } from "../../lib/destination-save-notice";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpeningHoursEditor from "../../app/admin/destinations/opening-hours-editor";
import DestinationPageHeader from "../../app/admin/destinations/destination-page-header";
import { useDestinationVisibility } from "../../app/admin/destinations/destination-visibility-action";
import DestinationVisibilitySwitch from "../../app/admin/destinations/destination-visibility-switch";

const input = (): DestinationInput => ({ name: "Test destination", description: "Description", area: "Đồng Văn", category: "Thiên nhiên", latitude: 23.2, longitude: 105.3, suggestedDurationMinutes: 90, minimumDurationMinutes: 30, openingDays: unknownSchedule() });
function fixture(role: string | null = "ADMIN") {
  let rows = new Map<string, any>(); let records = new Map<string, any>(); let writes = 0; let fail = false;
  const rowFromData = (data: any, id: string) => ({ ...data, id, createdAt: new Date("2026-10-04T00:00:00Z"), updatedAt: new Date("2026-10-04T01:00:00Z"), openingDays: data.openingDays.create.map((day: any) => ({ ...day, intervals: day.intervals.create })) });
  const db: any = {
    user: { findUnique: async () => ({ id: "actor", role }) },
    destination: {
      findMany: async ({ skip = 0, take = rows.size, where }: any) => [...rows.values()].filter(row => (!where?.visibility || row.visibility === where.visibility) && (!where?.id?.in || where.id.in.includes(row.id))).slice(skip, skip + take).map(({ id, name, area, category, visibility, updatedAt }) => ({ id, name, area, category, visibility, updatedAt })),
      findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
      create: async ({ data }: any) => { writes++; const row = rowFromData(data, `id-${rows.size + 1}`); rows.set(row.id, row); return row; },
      update: async ({ where, data }: any) => { writes++; if (fail) throw new AppError("TEST_ROLLBACK", "fixture failure", 400); const old = rows.get(where.id); const row = data.openingDays ? rowFromData({ ...old, ...data }, where.id) : { ...old, ...data }; rows.set(row.id, row); return row; },
    },
    openingDay: { deleteMany: async ({ where }: any) => { rows.get(where.destinationId).openingDays = []; } },
    idempotencyRecord: {
      findUnique: async ({ where }: any) => records.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({ data }: any) => { const key = JSON.stringify({ scope: data.scope, key: data.key }); if (records.has(key)) throw new Error("duplicate key"); records.set(key, data); },
      update: async ({ where, data }: any) => Object.assign(records.get(JSON.stringify(where.scope_key)), data),
    },
    $transaction: async (fn: any) => { const snapshot = structuredClone({ rows, records }); try { return await fn(db); } catch (error) { rows = snapshot.rows; records = snapshot.records; throw error; } },
  };
  const deps: DestinationDependencies = { database: db as Database, resolveSession: async () => role ? { user: { id: "actor" } } : null };
  return { deps, writes: () => writes, records: () => records.size, rows: () => rows, failUpdate: () => { fail = true; } };
}
const headers = new Headers();
for (const role of [null, "TRAVELER"]) test(`${role ?? "GUEST"} cannot list/detail/create/update even with role body`, async () => {
  const f = fixture(role);
  for (const execute of [() => listDestinations(headers, 1, f.deps), () => getDestination(headers, "id", f.deps), () => writeDestination(headers, { ...input(), role: "ADMIN" }, "key", null, f.deps), () => writeDestination(headers, input(), "key", "id", f.deps)]) await assert.rejects(execute(), { status: role ? 403 : 401 });
  assert.equal(f.writes(), 0);
});
test("strict create/update reject forged fields before writes", async () => {
  for (const field of ["id", "createdAt", "visibility", "role", "userId", "extra"]) for (const id of [null, "id"]) {
    const f = fixture(); await assert.rejects(writeDestination(headers, { ...input(), [field]: "VISIBLE" }, "key", id, f.deps), { status: 400 }); assert.equal(f.writes(), 0);
  }
});
test("text required/length, taxonomy normalized without closed enum", () => {
  const parsed = destinationInputSchema.parse({ ...input(), name: "  Name  ", area: "  ĐỒNG   VĂN ", category: "  NEW CATEGORY " });
  assert.equal(parsed.name, "Name"); assert.equal(parsed.area, "đồng văn"); assert.equal(parsed.category, "new category");
  for (const field of ["name", "description", "area", "category"]) assert.equal(destinationInputSchema.safeParse({ ...input(), [field]: " " }).success, false);
  assert.equal(destinationInputSchema.safeParse({ ...input(), name: "x".repeat(201) }).success, false);
});
test("coordinate boundaries and finite numeric type", () => {
  for (const latitude of [-90, 90]) for (const longitude of [-180, 180]) destinationInputSchema.parse({ ...input(), latitude, longitude });
  for (const latitude of [-91, 91, NaN, Infinity, "23"]) assert.equal(destinationInputSchema.safeParse({ ...input(), latitude }).success, false);
  for (const longitude of [-181, 181, NaN, Infinity]) assert.equal(destinationInputSchema.safeParse({ ...input(), longitude }).success, false);
});
for (const [suggested, minimum] of [[null, null], [60, null], [null, 15], [30, 90]]) test(`independent duration ${suggested}/${minimum}, no minimum<=suggested rule`, () => {
  const parsed = destinationInputSchema.parse({ ...input(), suggestedDurationMinutes: suggested, minimumDurationMinutes: minimum }); assert.equal(parsed.suggestedDurationMinutes, suggested); assert.equal(parsed.minimumDurationMinutes, minimum);
});
test("invalid duration zero/negative/fraction/too long rejected", () => {
  for (const key of ["suggestedDurationMinutes", "minimumDurationMinutes"]) for (const value of [0, -1, 1.2, 10081, "10"]) assert.equal(destinationInputSchema.safeParse({ ...input(), [key]: value }).success, false);
});
for (const status of ["UNKNOWN", "CLOSED", "OPEN"] as const) test(`Monday ${status} explicit state`, () => {
  const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status, intervals: status === "OPEN" ? [{ opensAt: "07:00", closesAt: "11:30" }] : [] };
  assert.equal(destinationInputSchema.parse(body).openingDays[0]!.status, status);
});
test("multiple intervals canonical sorting, adjacent intervals, end of day", () => {
  const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "13:30", closesAt: "24:00" }, { opensAt: "07:00", closesAt: "13:30" }] };
  const parsed = destinationInputSchema.parse(body); assert.equal(parsed.openingDays[0]!.intervals[0]!.opensAt, "07:00"); assert.equal(fromMinute(toMinute("24:00")), "24:00");
});
test("seven unique weekdays required, missing/duplicate rejected", () => {
  const body = input(); assert.equal(body.openingDays.length, 7);
  assert.equal(destinationInputSchema.safeParse({ ...body, openingDays: body.openingDays.slice(1) }).success, false);
  body.openingDays[1] = body.openingDays[0]!; assert.equal(destinationInputSchema.safeParse(body).success, false);
});
test("CLOSED/UNKNOWN cannot contain intervals; OPEN cannot be empty", () => {
  for (const status of ["CLOSED", "UNKNOWN", "OPEN"] as const) { const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status, intervals: status === "OPEN" ? [] : [{ opensAt: "07:00", closesAt: "11:00" }] }; assert.equal(destinationInputSchema.safeParse(body).success, false); }
});
test("overlap, invalid time, overnight and zero-width rejected", () => {
  for (const intervals of [[{ opensAt: "07:00", closesAt: "12:00" }, { opensAt: "11:30", closesAt: "17:00" }], [{ opensAt: "7:00", closesAt: "12:00" }], [{ opensAt: "25:00", closesAt: "26:00" }], [{ opensAt: "23:00", closesAt: "01:00" }], [{ opensAt: "12:00", closesAt: "12:00" }]]) { const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals }; assert.equal(destinationInputSchema.safeParse(body).success, false); }
});
test("Admin create hidden, detail round-trip explicit DTO, list includes hidden and visible", async () => {
  const f = fixture(); const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "07:00", closesAt: "11:30" }, { opensAt: "13:30", closesAt: "17:00" }] };
  const result = await writeDestination(headers, body, "create", null, f.deps); assert.equal(result.status, "SUCCESS");
  const dto = await getDestination(headers, "id-1", f.deps); assert.equal(dto.visibility, "HIDDEN"); assert.deepEqual(dto.openingDays[0]!.intervals, body.openingDays[0]!.intervals); assert.equal(dto.openingDays.length, 7); assert.equal(dto.suggestedDurationMinutes, 90); assert.equal(dto.minimumDurationMinutes, 30);
  assert.deepEqual(Object.keys(dto).sort(), ["id", "name", "description", "area", "category", "latitude", "longitude", "suggestedDurationMinutes", "minimumDurationMinutes", "visibility", "createdAt", "updatedAt", "openingDays"].sort());
  await writeDestination(headers, body, "second", null, f.deps); f.rows().get("id-2").visibility = "VISIBLE";
  const list = await listDestinations(headers, 1, f.deps); assert.equal(list.items.length, 2); assert.deepEqual(list.items.map(item => item.visibility), ["HIDDEN", "VISIBLE"]); assert.equal("description" in list.items[0]!, false);
});
test("missing ID and malformed ID 404; invalid input never changes schedule", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps);
  await assert.rejects(getDestination(headers, "missing", f.deps), { status: 404 }); await assert.rejects(getDestination(headers, "../id", f.deps), { status: 404 });
  const missing = await writeDestination(headers, input(), "missing", "missing", f.deps); assert.equal(missing.status, "FAILED"); if (missing.status === "FAILED") assert.equal(missing.httpStatus, 404);
  await assert.rejects(writeDestination(headers, { ...input(), latitude: 91 }, "invalid", "id-1", f.deps), { status: 400 }); assert.equal((await getDestination(headers, "id-1", f.deps)).openingDays.length, 7);
});
test("update full schedule and field values atomic, visibility unchanged", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps); f.rows().get("id-1").visibility = "VISIBLE";
  const body = input(); body.name = "Edited"; body.minimumDurationMinutes = null; body.openingDays[0]!.status = "CLOSED";
  const result = await writeDestination(headers, body, "update", "id-1", f.deps); assert.equal(result.status, "SUCCESS"); const dto = await getDestination(headers, "id-1", f.deps); assert.equal(dto.name, "Edited"); assert.equal(dto.visibility, "VISIBLE"); assert.equal(dto.minimumDurationMinutes, null); assert.equal(dto.suggestedDurationMinutes, 90); assert.equal(dto.openingDays[0]!.status, "CLOSED");
});
test("transaction failure after schedule deletion restores all prior days and response records", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps); const before = await getDestination(headers, "id-1", f.deps); f.failUpdate();
  const result = await writeDestination(headers, { ...input(), name: "not persisted" }, "rollback", "id-1", f.deps); assert.equal(result.status, "FAILED"); assert.deepEqual(await getDestination(headers, "id-1", f.deps), before); assert.equal(f.records(), 1);
});
test("idempotent create/update replay, conflict and target ID bound in request hash", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps);
  const replay = await writeDestination(headers, input(), "create", null, f.deps); assert.equal(replay.status, "SUCCESS"); if (replay.status === "SUCCESS") assert.equal(replay.replayed, true); assert.equal(f.writes(), 1);
  const body = { ...input(), name: "Updated" }; await writeDestination(headers, body, "update", "id-1", f.deps); await writeDestination(headers, body, "update", "id-1", f.deps); assert.equal(f.writes(), 2);
  for (const [id, payload] of [["id-1", input()], ["id-2", body]] as const) { const conflict = await writeDestination(headers, payload, "update", id, f.deps); assert.equal(conflict.status, "FAILED"); if (conflict.status === "FAILED") assert.equal(conflict.httpStatus, 409); }
});
test("client lost/malformed response UNKNOWN, denied response FAILED, success DTO validated", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps); const dto = await getDestination(headers, "id-1", f.deps);
  assert.equal((await saveDestination(null, input(), "key", async () => { throw new Error("lost"); })).status, "UNKNOWN");
  assert.equal((await saveDestination(null, input(), "key", async () => Response.json({ success: true, operationStatus: "SUCCESS", data: { ...dto, secret: "no" } }))).status, "UNKNOWN");
  assert.equal((await saveDestination(null, input(), "key", async () => Response.json({ success: false, operationStatus: "FAILED", error: { code: "FORBIDDEN" } }, { status: 403 }))).status, "FAILED");
  const response = await saveDestination(null, input(), "key", async (_url, init) => { assert.equal(init!.method, "POST"); assert.equal(new Headers(init!.headers).get("Idempotency-Key"), "key"); return Response.json({ success: true, operationStatus: "SUCCESS", data: dto }); }); assert.equal(response.status, "SUCCESS");
});
test("HTTP parser rejects unknown/repeated query, foreign origin, non-JSON and malformed JSON", async () => {
  for (const query of ["role=ADMIN", "page=0", "page=1&page=2"]) assert.throws(() => destinationPageQuery(new Request(`https://example.test/api?${query}`)), { status: 400 });
  assert.equal(destinationPageQuery(new Request("https://example.test/api?page=2")), 2);
  await assert.rejects(destinationJson(new Request("https://example.test/api", { method: "POST" })), { status: 403 });
  await assert.rejects(destinationJson(new Request("https://example.test/api", { method: "POST", headers: { origin: "https://example.test" } })), { status: 415 });
  await assert.rejects(destinationJson(new Request("https://example.test/api", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: "bad" })), { status: 400 });
});
test("synchronous click/Enter guard only permits one in-flight submission", () => { const lock = { current: false }; assert.equal(claimSubmission(lock), true); assert.equal(claimSubmission(lock), false); releaseSubmission(lock); assert.equal(claimSubmission(lock), true); });
test("save notice requires a confirmed write and is consumed once, never a URL flag", async () => {
  assert.equal(takeDestinationSaved(), false);
  markDestinationSaved(); assert.equal(takeDestinationSaved(), true); assert.equal(takeDestinationSaved(), false);
  const page = await readFile(new URL("../../app/admin/destinations/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /searchParams|saved=/);
});
test("UI source contract, independent server page/API guards and no visibility editor", async () => {
  const ui = await readFile(new URL("../../app/admin/destinations/destination-form.tsx", import.meta.url), "utf8"); assert.match(ui, /method="post"/); assert.ok(ui.includes('disabled={saving || unknown || visibilityAction.busy}')); assert.match(ui, /unknown && attempt.current/); assert.ok(ui.includes('await loadDestination(id)')); assert.ok(ui.includes('attempt.current!.key')); assert.match(ui, /OpeningHoursEditor/); assert.doesNotMatch(ui, /visibility.*onChange/);
  const access = await readFile(new URL("../../app/admin/destinations/page-access.ts", import.meta.url), "utf8"); assert.ok(access.includes('requireActor(await headers(), authorizationDependencies, "admin")'));
  for (const route of ["../../app/api/admin/destinations/route.ts", "../../app/api/admin/destinations/[id]/route.ts"]) assert.ok((await readFile(new URL(route, import.meta.url), "utf8")).includes('requireActor(request.headers, deps, "admin")'));
});
test("hours UI has seven explicit status selectors; CLOSED and UNKNOWN stay distinct", () => {
  const days = unknownSchedule(); days[1]!.status = "CLOSED";
  const html = renderToStaticMarkup(createElement(OpeningHoursEditor, { days, errors: {}, onChange: () => {} }));
  assert.equal((html.match(/<select/g) ?? []).length, 7);
  assert.match(html, /Điểm đến đóng cửa cả ngày này/); assert.match(html, /Không được coi là ngày đóng cửa/);
  assert.doesNotMatch(html, /type="time"/);
});
test("native minute time editor supports two intervals and preserves explicit 24:00", () => {
  const days = unknownSchedule(); days[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "07:00", closesAt: "11:30" }, { opensAt: "13:30", closesAt: "24:00" }] };
  const html = renderToStaticMarkup(createElement(OpeningHoursEditor, { days, errors: { "openingDays.0.intervals": "Overlap test" }, onChange: () => {} }));
  assert.equal((html.match(/type="time"/g) ?? []).length, 3); assert.match(html, /step="60"/);
  assert.match(html, /value="24:00"/); assert.match(html, /checked=""/); assert.match(html, /Xóa khung giờ 2 Thứ Hai/);
  assert.match(html, /Thêm khung giờ/); assert.match(html, /aria-invalid="true"/); assert.match(html, /day-error-0/);
  assert.ok(html.includes('Cuối ngày (24:00), khung giờ 2 Thứ Hai'));
});
test("general feedback uses bottom-right Sonner; UNKNOWN remains persistent and field errors remain local", async () => {
  const ui = await readFile(new URL("../../app/admin/destinations/destination-form.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../../app/admin/destinations/destination-list.tsx", import.meta.url), "utf8");
  assert.match(ui, /toast.error/); assert.match(ui, /toast.warning/); assert.match(ui, /unknown && <div className="destination-uncertain"/);
  assert.ok(ui.includes('error-${key}')); assert.ok(list.includes('takeDestinationSaved()) toast.success'));
  assert.match(list, /position: "bottom-right"/); assert.match(ui, /position: "bottom-right"/);
  const editor = await readFile(new URL("../../app/admin/destinations/opening-hours-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /onInput=.*updateTime/);
});

test("shared compact headers use exact copy and direct navigation actions", () => {
  for (const [mode, title, subtitle] of [
    ["list", "Quản lý điểm đến", "Quản lý thông tin và trạng thái các điểm đến Hà Giang."],
    ["create", "Tạo điểm đến", "Thêm dữ liệu điểm đến mới cho hệ thống."],
    ["edit", "Chỉnh sửa điểm đến", "Cập nhật thông tin, vị trí, thời lượng và giờ hoạt động của điểm đến."],
  ] as const) {
    const html = renderToStaticMarkup(createElement(DestinationPageHeader, { mode }));
    assert.ok(html.includes(title)); assert.ok(html.includes(subtitle));
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.doesNotMatch(html, /destination-eyebrow|destination-title-icon/);
    assert.ok(html.includes(mode === "list" ? 'href="/admin/destinations/new"' : 'href="/admin/destinations"'));
    if (mode !== "list") assert.match(html, /destination-button destination-back/);
  }
  const locked = renderToStaticMarkup(createElement(DestinationPageHeader, { mode: "edit", canGoBack: false }));
  assert.doesNotMatch(locked, /Quay lại|<a /);
});

test("list and form share the header while saving and UNKNOWN still hide back navigation", async () => {
  const form = await readFile(new URL("../../app/admin/destinations/destination-form.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../../app/admin/destinations/destination-list.tsx", import.meta.url), "utf8");
  assert.ok(form.includes('DestinationPageHeader mode={id ? "edit" : "create"} canGoBack={!saving && !unknown && !visibilityAction.busy}'));
  assert.match(list, /DestinationPageHeader mode="list"/);
});

for (const role of [null, "TRAVELER"]) test("visibility denies " + (role ?? "Guest") + " before callback, ignoring forged Admin headers/body", async () => {
  const f = fixture(role);
  await assert.rejects(setDestinationVisibility(new Headers({ role: "ADMIN" }), "id-1", { visibility: "VISIBLE", role: "ADMIN" }, "key", f.deps), { status: role ? 403 : 401 });
  assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
});

test("visibility strict input rejects invalid/missing/extra fields and malformed ID", async () => {
  const f = fixture();
  for (const body of [{}, { visibility: "DRAFT" }, { visibility: null }, { visibility: "visible" }, { visibility: "VISIBLE", role: "ADMIN" }, { visibility: "VISIBLE", name: "replace" }]) {
    await assert.rejects(setDestinationVisibility(headers, "id-1", body, "key", f.deps), { status: 400 });
  }
  await assert.rejects(setDestinationVisibility(headers, "../id", { visibility: "VISIBLE" }, "key", f.deps), { status: 404 });
  const missing = await setDestinationVisibility(headers, "missing", { visibility: "VISIBLE" }, "key", f.deps);
  assert.equal(missing.status, "FAILED"); if (missing.status === "FAILED") assert.equal(missing.httpStatus, 404);
  assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
});

test("Admin visibility transitions and same-state no-op preserve full fields and schedule", async () => {
  const f = fixture(); const body = input(); body.openingDays[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "07:00", closesAt: "11:00" }, { opensAt: "13:00", closesAt: "24:00" }] };
  await writeDestination(headers, body, "create", null, f.deps);
  const before = await getDestination(headers, "id-1", f.deps);
  const shown = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "show", f.deps);
  assert.equal(shown.status, "SUCCESS"); if (shown.status === "SUCCESS") assert.deepEqual(shown.data, { ...before, visibility: "VISIBLE" });
  const writes = f.writes(); const same = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "same", f.deps);
  assert.equal(same.status, "SUCCESS"); assert.equal(f.writes(), writes);
  const hidden = await setDestinationVisibility(headers, "id-1", { visibility: "HIDDEN" }, "hide", f.deps);
  assert.equal(hidden.status, "SUCCESS"); assert.deepEqual(await getDestination(headers, "id-1", f.deps), before);
  assert.equal(f.rows().size, 1);
});

test("visibility idempotency binds target and ID, uses a distinct operation and callback runs once", async () => {
  const f = fixture(); await writeDestination(headers, input(), "same-key", null, f.deps);
  const first = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "same-key", f.deps);
  assert.equal(first.status, "SUCCESS"); const writes = f.writes();
  const replay = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "same-key", f.deps);
  assert.equal(replay.status, "SUCCESS"); if (replay.status === "SUCCESS") assert.equal(replay.replayed, true);
  assert.equal(f.writes(), writes); assert.equal(f.records(), 2);
  for (const [id, visibility] of [["id-1", "HIDDEN"], ["id-2", "VISIBLE"]] as const) {
    const conflict = await setDestinationVisibility(headers, id, { visibility }, "same-key", f.deps);
    assert.equal(conflict.status, "FAILED"); if (conflict.status === "FAILED") assert.equal(conflict.httpStatus, 409);
  }
  assert.equal(f.writes(), writes); assert.equal(f.records(), 2);
});

test("visibility atomic rollback retains data and creates no successful record", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps);
  const before = await getDestination(headers, "id-1", f.deps); f.failUpdate();
  const result = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "show", f.deps);
  assert.equal(result.status, "FAILED"); assert.deepEqual(await getDestination(headers, "id-1", f.deps), before); assert.equal(f.records(), 1);
});

test("visibility rechecks current role inside transaction", async () => {
  const f = fixture(); await writeDestination(headers, input(), "create", null, f.deps);
  let reads = 0; f.deps.database.user.findUnique = (async () => ({ id: "actor", role: ++reads === 1 ? "ADMIN" : "TRAVELER" })) as any;
  const result = await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "show", f.deps);
  assert.equal(result.status, "FAILED"); if (result.status === "FAILED") assert.equal(result.httpStatus, 403);
  assert.equal(f.rows().get("id-1").visibility, "HIDDEN"); assert.equal(f.records(), 1);
});

test("public and new-itinerary canonical predicates reject hidden/missing; persistence only returns existing visible IDs", async () => {
  const f = fixture(); await writeDestination(headers, input(), "a", null, f.deps); await writeDestination(headers, input(), "b", null, f.deps);
  await setDestinationVisibility(headers, "id-1", { visibility: "VISIBLE" }, "show", f.deps);
  assert.deepEqual(visibleDestinationWhere, { visibility: "VISIBLE" });
  for (const predicate of [isDestinationPublic, isDestinationEligibleForNewItinerary]) {
    assert.equal(predicate(f.rows().get("id-1")), true);
    assert.equal(predicate(f.rows().get("id-2")), false);
    assert.equal(predicate(null), false); assert.equal(predicate(undefined), false);
  }
  assert.deepEqual(await findEligibleDestinationIds(["id-1", "id-2", "missing"], f.deps.database), ["id-1"]);
  assert.deepEqual(await findEligibleDestinationIds([], f.deps.database), []);
  assert.equal((await listDestinations(headers, 1, f.deps)).items.length, 2);
});

test("visibility client sends explicit endpoint/target/key and rejects transport or mismatched confirmation as UNKNOWN", async () => {
  const f = fixture(); await writeDestination(headers, input(), "a", null, f.deps);
  const dto = { ...await getDestination(headers, "id-1", f.deps), visibility: "VISIBLE" };
  const result = await changeDestinationVisibility("id-1", "VISIBLE", "key", async (url, init) => {
    assert.equal(url, "/api/admin/destinations/id-1/visibility"); assert.equal(init!.method, "PATCH");
    assert.equal(new Headers(init!.headers).get("Idempotency-Key"), "key"); assert.deepEqual(JSON.parse(init!.body as string), { visibility: "VISIBLE" });
    return Response.json({ success: true, operationStatus: "SUCCESS", data: dto });
  }); assert.equal(result.status, "SUCCESS");
  for (const data of [{ ...dto, visibility: "HIDDEN" }, { ...dto, id: "foreign" }, { ...dto, secret: "bad" }]) {
    assert.equal((await changeDestinationVisibility("id-1", "VISIBLE", "key", async () => Response.json({ success: true, operationStatus: "SUCCESS", data }))).status, "UNKNOWN");
  }
  assert.equal((await changeDestinationVisibility("id-1", "VISIBLE", "key", async () => { throw Error("lost"); })).status, "UNKNOWN");
  assert.equal((await changeDestinationVisibility("id-1", "VISIBLE", "key", async () => Response.json({ success: false, operationStatus: "FAILED", error: { code: "FORBIDDEN" } }, { status: 403 }))).status, "FAILED");
});

test("visibility switches render confirmed OFF/ON with text, explicit type and accessible labels", () => {
  function Buttons() { const controller = useDestinationVisibility(() => {}); return createElement("div", null, controller.action({ id: "a", name: "Visible A", visibility: "VISIBLE" }), controller.action({ id: "b", name: "Hidden B", visibility: "HIDDEN" })); }
  const html = renderToStaticMarkup(createElement(Buttons));
  assert.match(html, /type="button"/); assert.match(html, /aria-label="Ẩn Visible A"/); assert.match(html, /aria-label="Hiển thị Hidden B"/);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 2);
  assert.ok(html.includes('aria-checked="true"')); assert.ok(html.includes('aria-checked="false"'));
  assert.ok(html.includes('Đang ẩn')); assert.ok(html.includes('Đang hiển thị'));
});

test("visibility UI locks pending/UNKNOWN, confirms hide, retries identical attempt after read; generic detail save stays independent", async () => {
  const ui = await readFile(new URL("../../app/admin/destinations/destination-visibility-action.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes('claimSubmission(lock)')); assert.ok(ui.includes('if (!attempt.current && item)'));
  assert.ok(ui.includes('if (uncertain) await loadDestination(current.id)'));
  assert.ok(ui.includes('changeDestinationVisibility(current.id, current.target, current.key)'));
  assert.match(ui, /if \(result.status === "SUCCESS"\) \{\s+onConfirmed\(result.data\)/);
  assert.ok(ui.includes('pending || uncertain || confirmation'));
  assert.match(ui, /<dialog.*aria-labelledby=.*aria-describedby=/); assert.match(ui, /onCancel=/); assert.match(ui, /autoFocus/);
  assert.doesNotMatch(ui, /window.confirm|setVisibility/);
  const list = await readFile(new URL("../../app/admin/destinations/destination-list.tsx", import.meta.url), "utf8");
  assert.equal(list.split('visibilityAction.action(item)').length - 1, 2);
  const form = await readFile(new URL("../../app/admin/destinations/destination-form.tsx", import.meta.url), "utf8");
  assert.ok(form.includes('useDestinationVisibility(dto => setVisibility(dto.visibility), lock)'));
  assert.match(form, /id \? <div className="destination-edit-visibility"/);
  const route = await readFile(new URL("../../app/api/admin/destinations/[id]/visibility/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes('requireActor(request.headers, deps, "admin")')); assert.ok(route.includes('requireIdempotencyKey(request)'));
  const service = await readFile(new URL("./destination-visibility.ts", import.meta.url), "utf8");
  assert.doesNotMatch(service, /deleteMany/); assert.ok(!service.includes('delete('));
  assert.ok(service.includes('data: { visibility: input.visibility }'));
});

test("pending switch stays at the confirmed state and disables clicks without optimistic state", () => {
  for (const visibility of ["HIDDEN", "VISIBLE"] as const) {
    const html = renderToStaticMarkup(createElement(DestinationVisibilitySwitch, { name: "Test", visibility, pending: true, onClick: () => {} }));
    assert.ok(html.includes(`aria-checked="${visibility === "VISIBLE"}"`));
    assert.match(html, /disabled=""/); assert.match(html, /aria-busy="true"/);
    assert.ok(html.includes(visibility === "VISIBLE" ? "Đang hiển thị" : "Đang ẩn"));
    assert.ok(html.includes("Đang cập nhật…"));
  }
});

test("switch is presentation only, list places it in status not action column, mobile and edit reuse it", async () => {
  const component = await readFile(new URL("../../app/admin/destinations/destination-visibility-switch.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /fetch|useState|changeDestinationVisibility|onKeyDown/);
  assert.match(component, /role="switch"/); assert.match(component, /type="button"/);
  const controller = await readFile(new URL("../../app/admin/destinations/destination-visibility-action.tsx", import.meta.url), "utf8");
  assert.ok(controller.includes('visibility={item.visibility}')); assert.ok(controller.includes('disabled={disabled || busy}'));
  assert.ok(controller.includes('if (show) void execute(item); else setConfirmation(item)'));
  assert.ok(controller.includes('dialog.current?.close(); setConfirmation(null);'));
  assert.ok(controller.includes('void execute(item);'));
  const list = await readFile(new URL("../../app/admin/destinations/destination-list.tsx", import.meta.url), "utf8");
  assert.ok(list.includes('<td>{visibilityAction.action(item)}</td>'));
  assert.ok(list.includes('<h3>{item.name}</h3>{visibilityAction.action(item)}'));
  assert.ok(!list.includes('destination-row-actions">{visibilityAction.action'));
  assert.match(list, /aria-label=\{`Chỉnh sửa \$\{item.name\}`\}/);
  const css = await readFile(new URL("../../app/admin/destinations/destinations.css", import.meta.url), "utf8");
  assert.match(css, /aria-checked=true/); assert.match(css, /translateX\(18px\)/);
  assert.match(css, /focus-visible/); assert.match(css, /prefers-reduced-motion/);
});
