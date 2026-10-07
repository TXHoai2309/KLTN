import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@KLTN/db";
import { cultureInputSchema, cultureVisibilityInputSchema, type CultureInput } from "./culture-contract";
import { getCulture, listCulture, lookupCultureDestinations, writeCulture, setCultureVisibility, type CultureDependencies } from "./culture-service";
import { isCulturePublic, visibleCultureWhere } from "./culture-eligibility";
import { cultureJson, culturePageQuery, cultureLookupQuery, privateCultureResponse } from "./culture-http";
import { AppError } from "../../server/http/app-error";
import { saveCulture, changeCultureVisibility, loadCulture, loadCultureList, lookupDestinations } from "../../lib/culture-client";
import { markCultureSaved, takeCultureSaved } from "../../lib/culture-save-notice";
import { claimSubmission, releaseSubmission } from "../../lib/auth-submission-guard";
import CulturePageHeader from "../../app/admin/culture/culture-page-header";
import DestinationPicker from "../../app/admin/culture/destination-picker";
import { useCultureVisibility } from "../../app/admin/culture/culture-visibility-action";
const input = (destinationIds: string[] = []): CultureInput => ({ title: "Văn hóa", content: "Nội dung", sourceTitle: "Tài liệu", sourceUrl: null, destinationIds });
const headers = new Headers();
function fixture(initialRole: string | null = "ADMIN") {
  let role = initialRole; let rows = new Map<string, any>(); let records = new Map<string, any>(); let writes = 0; let fail = false; let revoke = false;
  const destinations = [{ id: "d-a", name: "Visible destination", visibility: "VISIBLE" }, { id: "d-b", name: "Hidden destination", visibility: "HIDDEN" }];
  const links = (data: any) => data.create.map((d: any) => { const item = destinations.find(item => item.id === d.destinationId)!; return { destination: { id: item.id, name: item.name } }; });
  const db: any = {
    user: { findUnique: async () => ({ id: "actor", role }) },
    destination: { findMany: async ({ where, skip = 0, take = 25 }: any) => destinations.filter(d => !where?.id?.in || where.id.in.includes(d.id)).slice(skip, skip + take).map(({ id, name }) => ({ id, name })) },
    cultureContent: {
      findMany: async ({ skip, take }: any) => [...rows.values()].slice(skip, skip + take),
      findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
      create: async ({ data }: any) => { writes++; const row = { ...data, id: `c-${rows.size + 1}`, createdAt: new Date("2026-10-05T00:00:00Z"), updatedAt: new Date("2026-10-05T01:00:00Z"), destinations: links(data.destinations) }; rows.set(row.id, row); return row; },
      update: async ({ where, data }: any) => { writes++; const row = rows.get(where.id); Object.assign(row, { ...data, destinations: data.destinations ? links(data.destinations) : row.destinations }); if (fail) throw new AppError("FIXTURE_FAILURE", "Rollback", 400); return row; },
    },
    idempotencyRecord: {
      findUnique: async ({ where }: any) => records.get(JSON.stringify(where.scope_key)) ?? null,
      create: async ({ data }: any) => { const key = JSON.stringify({ scope: data.scope, key: data.key }); if (records.has(key)) throw Error("duplicate"); records.set(key, data); },
      update: async ({ where, data }: any) => Object.assign(records.get(JSON.stringify(where.scope_key)), data),
    },
    $transaction: async (fn: any) => { const snapshot = structuredClone({ rows, records }); if (revoke) role = "TRAVELER"; try { return await fn(db); } catch (error) { rows = snapshot.rows; records = snapshot.records; throw error; } },
  };
  const deps: CultureDependencies = { database: db as Database, resolveSession: async () => role ? { user: { id: "actor" } } : null };
  return { deps, writes: () => writes, records: () => records.size, rows: () => rows, fail: () => { fail = true; }, revoke: () => { revoke = true; }, failRecordRead: () => { db.idempotencyRecord.findUnique = async () => { throw Error("fixture unavailable"); }; } };
}
for (const role of [null, "TRAVELER"]) test(`${role ?? "Guest"} denied every Culture operation/lookup despite forged role`, async () => {
  const f = fixture(role);
  for (const call of [() => listCulture(headers, 1, f.deps), () => getCulture(headers, "c-1", f.deps), () => lookupCultureDestinations(headers, "", 1, f.deps), () => writeCulture(headers, { ...input(), role: "ADMIN" }, "k", null, f.deps), () => writeCulture(headers, input(), "k", "c-1", f.deps), () => setCultureVisibility(headers, "c-1", { visibility: "VISIBLE" }, "k", f.deps)]) await assert.rejects(call(), { status: role ? 403 : 401 });
  assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
});
test("strict input rejects server-owned fields and excessive text", () => {
  for (const extra of ["id", "role", "visibility", "createdAt", "updatedAt", "unknown"]) assert.equal(cultureInputSchema.safeParse({ ...input(), [extra]: "ADMIN" }).success, false);
  for (const [field, value] of [["title", " "], ["content", " "], ["title", "x".repeat(201)], ["content", "x".repeat(20001)], ["sourceTitle", "x".repeat(301)]]) assert.equal(cultureInputSchema.safeParse({ ...input(), [field!]: value }).success, false);
});
test("NFC/trim preserves title/prose case and canonicalizes relation set", () => {
  const result = cultureInputSchema.parse({ ...input(["d-b", "d-a", "d-b"]), title: "  Va\u0306n Ho\u0301a  ", content: "  Nội Dung  " });
  assert.equal(result.title, "Văn Hóa"); assert.equal(result.content, "Nội Dung"); assert.deepEqual(result.destinationIds, ["d-a", "d-b"]);
});
test("source name without URL, URL without name, and absent source allowed; unsafe schemes/credentials rejected", () => {
  for (const source of [{ sourceTitle: "Metadata", sourceUrl: null }, { sourceTitle: null, sourceUrl: "https://example.test/source" }, { sourceTitle: "", sourceUrl: "" }]) cultureInputSchema.parse({ ...input(), ...source });
  for (const sourceUrl of ["javascript:alert(1)", "data:text/plain,x", "//example.test", "https://user:secret@example.test", "not-url", "https://exa mple.test", "https://example.test/\nx"]) assert.equal(cultureInputSchema.safeParse({ ...input(), sourceUrl }).success, false);
});
for (const ids of [[], ["d-a"], ["d-a", "d-b"], ["d-a", "d-a"]]) test(`create HIDDEN with ${ids.length} submitted links, source and exact DTO`, async () => {
  const f = fixture(); assert.equal((await writeCulture(headers, input(ids), "create", null, f.deps)).status, "SUCCESS");
  const dto = await getCulture(headers, "c-1", f.deps); assert.equal(dto.visibility, "HIDDEN"); assert.deepEqual(dto.destinationIds, [...new Set(ids)].sort()); assert.equal(dto.sourceTitle, "Tài liệu"); assert.equal(dto.sourceUrl, null);
  const list = await listCulture(headers, 1, f.deps); assert.equal(list.items.length, 1); assert.equal(list.items[0]!.id, dto.id);
});
test("missing/invalid destination rejected before write; missing/malformed Culture404", async () => {
  const f = fixture(); assert.equal((await writeCulture(headers, input(["missing"]), "k", null, f.deps)).status, "FAILED"); assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
  await assert.rejects(writeCulture(headers, input(["../bad"]), "k", null, f.deps), { status: 400 });
  for (const id of ["missing", "../bad", "a".repeat(129)]) await assert.rejects(getCulture(headers, id, f.deps), { status: 404 });
  const missing = await writeCulture(headers, input(), "u", "missing", f.deps); assert.equal(missing.status, "FAILED"); if (missing.status === "FAILED") assert.equal(missing.httpStatus, 404);
});
test("update replaces links/source/content atomically and preserves visibility", async () => {
  const f = fixture(); await writeCulture(headers, input(["d-a"]), "c", null, f.deps); await setCultureVisibility(headers, "c-1", { visibility: "VISIBLE" }, "v", f.deps);
  await writeCulture(headers, { ...input(["d-b"]), title: "Edited", content: "Updated", sourceTitle: null, sourceUrl: "https://example.test" }, "u", "c-1", f.deps);
  const dto = await getCulture(headers, "c-1", f.deps); assert.equal(dto.title, "Edited"); assert.equal(dto.content, "Updated"); assert.equal(dto.visibility, "VISIBLE"); assert.deepEqual(dto.destinationIds, ["d-b"]); assert.equal(dto.sourceTitle, null);
});
test("failure after relation replacement rolls back fields/links/source/idempotency", async () => {
  const f = fixture(); await writeCulture(headers, input(["d-a"]), "c", null, f.deps); const before = await getCulture(headers, "c-1", f.deps); f.fail();
  const result = await writeCulture(headers, { ...input(["d-b"]), title: "Bad", sourceTitle: "Bad" }, "u", "c-1", f.deps); assert.equal(result.status, "FAILED"); assert.deepEqual(await getCulture(headers, "c-1", f.deps), before); assert.equal(f.records(), 1);
});
test("role revoked in transaction denies write and rolls back response record", async () => {
  const f = fixture(); f.revoke(); const result = await writeCulture(headers, input(), "k", null, f.deps); assert.equal(result.status, "FAILED"); if (result.status === "FAILED") assert.equal(result.httpStatus, 403); assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
});
test("visibility strict contract, same-state no-op, hide/show preserves relations/source/prose", async () => {
  const f = fixture(); await writeCulture(headers, input(["d-a", "d-b"]), "c", null, f.deps); const before = await getCulture(headers, "c-1", f.deps);
  for (const body of [{ visibility: "DRAFT" }, { visibility: "VISIBLE", title: "no" }, {}]) assert.equal(cultureVisibilityInputSchema.safeParse(body).success, false);
  await setCultureVisibility(headers, "c-1", { visibility: "HIDDEN" }, "same", f.deps); assert.equal(f.writes(), 1);
  for (const visibility of ["VISIBLE", "HIDDEN"] as const) { await setCultureVisibility(headers, "c-1", { visibility }, visibility, f.deps); const after = await getCulture(headers, "c-1", f.deps); assert.deepEqual(after, { ...before, visibility }); }
  const missing = await setCultureVisibility(headers, "missing", { visibility: "VISIBLE" }, "miss", f.deps); assert.equal(missing.status, "FAILED"); if (missing.status === "FAILED") assert.equal(missing.httpStatus, 404);
});
for (const operation of ["create", "update", "visibility"]) test(`${operation} replay executes once; changed payload/ID conflict409`, async () => {
  const f = fixture(); if (operation !== "create") await writeCulture(headers, input(), "initial", null, f.deps);
  const call = (changed = false) => operation === "visibility" ? setCultureVisibility(headers, "c-1", { visibility: changed ? "HIDDEN" : "VISIBLE" }, "k", f.deps) : writeCulture(headers, { ...input(), title: changed ? "Changed" : "Original" }, "k", operation === "create" ? null : "c-1", f.deps);
  assert.equal((await call()).status, "SUCCESS"); const writes = f.writes(); const replay = await call(); assert.equal(replay.status, "SUCCESS"); if (replay.status === "SUCCESS") assert.equal(replay.replayed, true); assert.equal(f.writes(), writes);
  const conflict = await call(true); assert.equal(conflict.status, "FAILED"); if (conflict.status === "FAILED") assert.equal(conflict.httpStatus, 409); assert.equal(f.writes(), writes);
  if (operation !== "create") { const result = operation === "visibility" ? await setCultureVisibility(headers, "other", { visibility: "VISIBLE" }, "k", f.deps) : await writeCulture(headers, { ...input(), title: "Original" }, "k", "other", f.deps); assert.equal(result.status, "FAILED"); if (result.status === "FAILED") assert.equal(result.httpStatus, 409); }
});
test("Admin lookup includes both Destination states, bounded pagination and invalid query rejects", async () => {
  const f = fixture(); assert.deepEqual((await lookupCultureDestinations(headers, "", 1, f.deps)).items.map(d => d.id), ["d-a", "d-b"]);
  for (const page of [0, 1.2, 10001]) await assert.rejects(listCulture(headers, page, f.deps), { status: 400 });
  await assert.rejects(lookupCultureDestinations(headers, "x".repeat(201), 1, f.deps), { status: 400 });
});
test("HTTP strict queries/origin/JSON and no-store; public eligibility canonical", async () => {
  for (const query of ["role=ADMIN", "page=0", "page=1&page=2"]) assert.throws(() => culturePageQuery(new Request(`https://example.test/api?${query}`)), { status: 400 });
  assert.equal(culturePageQuery(new Request("https://example.test/api?page=2")), 2);
  assert.deepEqual(cultureLookupQuery(new Request("https://example.test/api?q=name&page=2")), { query: "name", page: 2 });
  assert.throws(() => cultureLookupQuery(new Request("https://example.test/api?q=x&q=y")), { status: 400 });
  await assert.rejects(cultureJson(new Request("https://example.test/api", { method: "POST" })), { status: 403 });
  await assert.rejects(cultureJson(new Request("https://example.test/api", { method: "POST", headers: { Origin: "https://example.test" } })), { status: 415 });
  await assert.rejects(cultureJson(new Request("https://example.test/api", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: "bad" })), { status: 400 });
  assert.deepEqual(visibleCultureWhere, { visibility: "VISIBLE" }); assert.equal(isCulturePublic({ visibility: "HIDDEN" }), false); assert.equal(isCulturePublic({ visibility: "VISIBLE" }), true);
  assert.equal(privateCultureResponse(Response.json({})).headers.get("Cache-Control"), "private, no-store");
});
test("transport UNKNOWN/FAILED and validated SUCCESS with unchanged key/payload", async () => {
  const f = fixture(); await writeCulture(headers, input(), "c", null, f.deps); const dto = await getCulture(headers, "c-1", f.deps);
  for (const transport of [async () => { throw Error("lost"); }, async () => Response.json({}), async () => Response.json({ success: true, operationStatus: "SUCCESS", data: { ...dto, secret: "bad" } })]) assert.equal((await saveCulture(null, input(), "key", transport)).status, "UNKNOWN");
  assert.equal((await saveCulture(null, input(), "key", async () => Response.json({ success: false, operationStatus: "FAILED", error: { code: "FORBIDDEN" } }, { status: 403 }))).status, "FAILED");
  const result = await saveCulture(null, input(), "key", async (url, init) => { assert.equal(url, "/api/admin/culture"); assert.equal(init!.method, "POST"); assert.equal(new Headers(init!.headers).get("Idempotency-Key"), "key"); assert.deepEqual(JSON.parse(String(init!.body)), input()); return Response.json({ success: true, operationStatus: "SUCCESS", data: dto }); }); assert.equal(result.status, "SUCCESS");
  assert.equal((await changeCultureVisibility(dto.id, "VISIBLE", "key", async () => Response.json({ success: true, operationStatus: "SUCCESS", data: dto }))).status, "UNKNOWN");
  assert.equal((await saveCulture("other", input(), "key", async () => Response.json({ success: true, operationStatus: "SUCCESS", data: dto }))).status, "UNKNOWN");
  assert.equal((await loadCulture(dto.id, async () => Response.json({ success: true, data: dto }))).id, dto.id);
  const { content, createdAt, destinationIds, ...listItem } = dto;
  assert.equal((await loadCultureList(1, async () => Response.json({ success: true, data: { items: [listItem], page: 1, hasMore: false } }))).items.length, 1);
  assert.equal((await lookupDestinations("", 1, async () => Response.json({ success: true, data: { items: [], hasMore: false } }))).items.length, 0);
});
test("synchronous submit lock and one-time success notices", () => { const lock = { current: false }; assert.equal(claimSubmission(lock), true); assert.equal(claimSubmission(lock), false); releaseSubmission(lock); assert.equal(claimSubmission(lock), true); markCultureSaved(true); assert.equal(takeCultureSaved(), "Đã tạo nội dung văn hóa."); assert.equal(takeCultureSaved(), null); markCultureSaved(false); assert.equal(takeCultureSaved(), "Đã cập nhật nội dung văn hóa."); });
test("SSR headers/loading visibility, no optimistic publication; UI contracts/accessibility/retry", async () => {
  for (const mode of ["list", "create", "edit"] as const) assert.match(renderToStaticMarkup(createElement(CulturePageHeader, { mode })), /nội dung văn hóa/);
  function Demo() { return useCultureVisibility(() => {}).action({ id: "c-1", title: "Culture", visibility: "HIDDEN" }); }
  assert.match(renderToStaticMarkup(createElement(Demo)), /role="switch"[^>]*aria-checked="false"/);
  const form = await readFile(new URL("../../app/admin/culture/culture-form.tsx", import.meta.url), "utf8");
  for (const pattern of [/method="post"/, /event.preventDefault\(\)/, /claimSubmission/, /unknown && attempt.current/, /if \(unknown\)/, /disabled=\{saving \|\| unknown \|\| visibilityAction.busy\}/, /markCultureSaved/]) assert.match(form, pattern);
  const initialPicker = renderToStaticMarkup(createElement(DestinationPicker, { selected: [], onChange() {} }));
  assert.match(initialPicker, /role="combobox"/); assert.match(initialPicker, /aria-expanded="false"/); assert.match(initialPicker, /placeholder="Tìm điểm đến\.\.\."/); assert.doesNotMatch(initialPicker, /Trang trước|Trang sau|Trang 1/);
  const picker = await readFile(new URL("../../app/admin/culture/destination-picker.tsx", import.meta.url), "utf8");
  for (const pattern of [/role="combobox"/, /aria-multiselectable="true"/, /ArrowDown/, /ArrowUp/, /event\.key === "Enter"/, /event\.key === "Escape"/, /pointerdown/, /lookupDestinations/, /setTimeout\(\(\) =>/, /loadDestination\(id\)/, /visibility === "HIDDEN"/, /Không tìm thấy điểm đến phù hợp/, /Không thể tải danh sách điểm đến/, /Thử lại/, /Bỏ liên kết/, /Đã chọn/]) assert.match(picker, pattern);
  assert.doesNotMatch(picker, /Tìm và chọn điểm đến|Điểm đến đã chọn \(\$\{selected\.length\}\)|culture-picker-search/);
  assert.doesNotMatch(picker, /Trang trước|Trang sau|Trang 1|type="checkbox"/);
  assert.match(form, /new URL\(anchor\.href, window\.location\.href\)/); assert.match(form, /target\.origin !== window\.location\.origin/); assert.match(form, /beforeunload/); assert.match(form, /showModal\(\)/); assert.match(form, /dirtyRef\.current = false/);
  const styles = await readFile(new URL("../../app/admin/culture/culture.css", import.meta.url), "utf8");
  for (const pattern of [/\.culture-picker-panel[^\n]*max-height: min\(320px/, /\.culture-picker-options[^\n]*overflow-y: auto/, /\.dark \.culture-picker-hidden/, /\.culture-form-page \.destination-form-actions/, /@media \(max-width: 600px\)/]) assert.match(styles, pattern);
  const action = await readFile(new URL("../../app/admin/culture/culture-visibility-action.tsx", import.meta.url), "utf8");
  for (const pattern of [/if \(uncertainIdsRef.current.has\(id\)\) await loadCulture\(current.id\)/, /current.target, current.key/, /pendingIds.has\(item.id\)/, /uncertainIds.has\(item.id\)/, /disabled=\{disabled \|\| pending \|\| uncertain\}/, /activeIds.current.has\(id\)/, /onCancel=/, /autoFocus/, /opener.current\?\.focus/, /cancelConfirmation/, /result.status === "SUCCESS"/]) assert.match(action, pattern);
  assert.doesNotMatch(action, /disabled=\{disabled \|\| busy\}/);
});

test("visibility mutation rechecks persisted role in transaction; malformed/extra body rejected", async () => {
  const f = fixture(); await writeCulture(headers, input(["d-a"]), "c", null, f.deps); const before = structuredClone(f.rows().get("c-1"));
  for (const body of [{}, { visibility: "DRAFT" }, { visibility: "VISIBLE", role: "ADMIN" }]) await assert.rejects(setCultureVisibility(headers, "c-1", body, "v", f.deps), { status: 400 });
  f.revoke(); const result = await setCultureVisibility(headers, "c-1", { visibility: "VISIBLE" }, "v", f.deps); assert.equal(result.status, "FAILED"); assert.deepEqual(f.rows().get("c-1"), before); assert.equal(f.records(), 1);
});
test("list bounded25 + hasMore; missing link edit retains existing fields/relations", async () => {
  const f = fixture(); for (let i = 0; i < 27; i++) await writeCulture(headers, input(["d-a"]), `c-${i}`, null, f.deps);
  assert.equal((await listCulture(headers, 1, f.deps)).items.length, 25); assert.equal((await listCulture(headers, 1, f.deps)).hasMore, true);
  assert.equal((await listCulture(headers, 2, f.deps)).items.length, 2); assert.equal((await listCulture(headers, 2, f.deps)).hasMore, false);
  const before = await getCulture(headers, "c-1", f.deps); assert.equal((await writeCulture(headers, input(["missing"]), "bad", "c-1", f.deps)).status, "FAILED"); assert.deepEqual(await getCulture(headers, "c-1", f.deps), before);
});
test("database transport failure returns UNKNOWN rather than fake SUCCESS", async () => {
  const f = fixture(); f.failRecordRead();
  const result = await writeCulture(headers, input(), "k", null, f.deps); assert.equal(result.status, "UNKNOWN"); assert.equal(f.writes(), 0); assert.equal(f.records(), 0);
});
test("all thin Admin routes establish canonical authorization before inputs; pages protect first", async () => {
  for (const suffix of ["route.ts", "[id]/route.ts", "[id]/visibility/route.ts", "destination-lookup/route.ts"]) {
    const source = await readFile(new URL(`../../app/api/admin/culture/${suffix}`, import.meta.url), "utf8"); assert.match(source, /requireActor\(request.headers, deps, "admin"\)/); assert.doesNotMatch(source, /\.cultureContent\.|\.destination\./);
  }
  for (const suffix of ["page.tsx", "new/page.tsx", "[id]/edit/page.tsx"]) assert.match(await readFile(new URL(`../../app/admin/culture/${suffix}`, import.meta.url), "utf8"), /culturePageAccess/);
  const list = await readFile(new URL("../../app/admin/culture/culture-list.tsx", import.meta.url), "utf8"); for (const pattern of [/Đang tải danh sách/, /Chưa có nội dung/, /Thử lại/, /destination-mobile-list/, /visibilityAction.action/, /takeCultureSaved/]) assert.match(list, pattern);
});
