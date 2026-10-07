import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { destinationQueryParams, destinationRequestKey, destinationSearchHref, parsePublicListQuery } from "./public-destination-query";
import { startDestinationRequest, type DestinationRequestState } from "./destination-search-client";
import { DestinationSearchForm, DestinationResultStatus } from "../../app/explore/destination-search-form";
import DestinationCard from "../../app/explore/destination-card";
import { buildExploreReturnTo } from "./destination-detail-navigation";
import { commitExploreNavigation, destinationDetailHref } from "../map/map-model";

// tsx compiles the UI workspace's preserved JSX with the classic runtime.
// Next supplies the automatic runtime in production; keep this shim test-local.
const jsxGlobal = globalThis as unknown as { React?: typeof React };
const previousReact = jsxGlobal.React;
before(() => { jsxGlobal.React = React; });
after(() => { if (previousReact) jsxGlobal.React = previousReact; else delete jsxGlobal.React; });

const data = { items: [], filters: { categories: ["heritage"], regions: ["dong-van"] } };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test("URL build/clear preserves view/Culture and removes obsolete paging", () => {
  const params = new URLSearchParams("view=map&culturePage=2&page=3&q=old&category=old&region=old");
  const href = destinationSearchHref(params, { q: "Mèo Vạc", category: "heritage", region: "dong-van" });
  const next = new URL(href, "http://localhost");
  assert.deepEqual(Object.fromEntries(next.searchParams), { view: "map", culturePage: "2", q: "Mèo Vạc", category: "heritage", region: "dong-van" });
  assert.equal(destinationSearchHref(next.searchParams, {}), "/explore?view=map&culturePage=2");
  assert.equal(destinationSearchHref(new URLSearchParams("q=x"), {}), "/explore");
  assert.equal(new URL(destinationSearchHref(next.searchParams, { q: "Mèo Vạc", region: "dong-van" }), "http://localhost").searchParams.has("category"), false);
  assert.equal(params.get("q"), "old");
});
test("committed combined search pushes a history entry and detail Back returns to the exact URL", () => {
  const history = ["/", "/explore"];
  let index = history.length - 1;
  let retries = 0;
  const back = () => { index = Math.max(0, index - 1); return history[index]!; };
  const pushes: { href: string; scroll?: boolean }[] = [];
  const router = { push(href: string, options?: { scroll?: boolean }) {
    pushes.push({ href, scroll: options?.scroll });
    history.splice(index + 1);
    history.push(href);
    index++;
  } };
  const href = destinationSearchHref(new URLSearchParams("culturePage=2"), { q: "Manual", category: "văn hóa", region: "đồng văn" });
  commitExploreNavigation(href, history[index]!, () => router.push(href, { scroll: false }), () => { retries++; });
  assert.equal(href, "/explore?culturePage=2&q=Manual&category=v%C4%83n+h%C3%B3a&region=%C4%91%E1%BB%93ng+v%C4%83n");
  assert.deepEqual(pushes, [{ href, scroll: false }]);
  assert.deepEqual(history, ["/", "/explore", href]);

  // Destination links carry the Explore URL; browser Back still returns to the entry it came from.
  const returnTo = buildExploreReturnTo(new URL(href, "http://localhost").searchParams);
  const detailHref = destinationDetailHref("cmutr90km00015o9w4t64ozfd", returnTo);
  history.push(detailHref);
  index++;
  assert.equal(history[index], `/destinations/cmutr90km00015o9w4t64ozfd?returnTo=${encodeURIComponent(href)}`);
  assert.equal(back(), href);
  assert.deepEqual(Object.fromEntries(new URL(href, "http://localhost").searchParams), {
    culturePage: "2", q: "Manual", category: "văn hóa", region: "đồng văn",
  });
  assert.equal(retries, 0);
  commitExploreNavigation(href, href, () => router.push(href, { scroll: false }), () => { retries++; });
  assert.equal(pushes.length, 1);
  assert.equal(retries, 1);
});
test("direct/reloaded/Back URL independently hydrates form including unavailable selected option", () => {
  const original = new URLSearchParams("q=meo-vac&category=heritage&region=dong-van&view=list&culturePage=2");
  assert.deepEqual(parsePublicListQuery(destinationQueryParams(original)), { q: "meo-vac", category: "heritage", region: "dong-van" });
  for (const url of [original.toString(), new URLSearchParams(original).toString()]) {
    const html = renderToStaticMarkup(<DestinationSearchForm params={new URLSearchParams(url)} filters={{ categories: [], regions: [] }} onSearch={() => {}} onClear={() => {}} />);
    assert.match(html, /value="meo-vac"/); assert.match(html, /checked=""[^>]*value="heritage"|value="heritage"[^>]*checked=""/); assert.match(html, /checked=""[^>]*value="dong-van"|value="dong-van"[^>]*checked=""/);
    assert.ok(html.includes('for="destination-q"') && html.includes('id="destination-q"'));
    assert.match(html, /<legend[^>]*>Danh mục<\/legend>/);
    assert.match(html, /<legend[^>]*>Khu vực<\/legend>/);
    assert.match(html, /type="submit"/); assert.match(html, /Xóa bộ lọc/);
  }
});
test("unfiltered form has no clear action; filtered empty has clear and never retry", () => {
  const html = renderToStaticMarkup(<DestinationSearchForm params={new URLSearchParams()} filters={data.filters} onSearch={() => {}} onClear={() => {}} />);
  assert.doesNotMatch(html, /Xóa bộ lọc/);
  const empty = renderToStaticMarkup(<DestinationResultStatus state={{ status: "ready", data }} filtered onRetry={() => {}} onClear={() => {}} />);
  assert.match(empty, /Xóa bộ lọc/);
  assert.doesNotMatch(empty, /role="alert"|Thử lại/);
});
test("destination card links to the existing detail and renders public text safely", () => {
  const html = renderToStaticMarkup(<DestinationCard destination={{ id: "destination-a", name: "<script>private</script>", area: "Đồng Văn", category: "Văn hóa", latitude: null, longitude: null }} />);
  assert.match(html, /href="\/destinations\/destination-a"/);
  assert.match(html, /&lt;script&gt;private&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /Xem chi tiết/);
});
test("filtered Explore destination card carries exact safe Explore context to Detail", () => {
  const source = "/explore?q=Manual&category=v%C4%83n+h%C3%B3a&region=%C4%91%E1%BB%93ng+v%C4%83n&view=list&culturePage=2";
  const returnTo = buildExploreReturnTo(new URL(source, "http://localhost").searchParams);
  const html = renderToStaticMarkup(<DestinationCard destination={{ id: "destination-a", name: "Điểm đến", area: "Đồng Văn", category: "Văn hóa", latitude: null, longitude: null }} returnTo={returnTo} />);
  assert.match(html, new RegExp(`href="/destinations/destination-a\\?returnTo=${encodeURIComponent(source)}"`));
  assert.equal(returnTo, source);
});
test("API request sends only search params, no-store and signal; loading then successful empty", async () => {
  const states: DestinationRequestState[] = [];
  const stop = startDestinationRequest(new URLSearchParams("q=Mèo&category=heritage&region=dong-van"), state => states.push(state), async (url, init) => {
    const query = new URL(String(url), "http://localhost").searchParams;
    assert.deepEqual(Object.fromEntries(query), { q: "Mèo", category: "heritage", region: "dong-van" });
    assert.equal(init?.cache, "no-store"); assert.ok(init?.signal instanceof AbortSignal);
    return Response.json({ success: true, data });
  });
  await tick(); assert.deepEqual(states, [{ status: "loading" }, { status: "ready", data }]); stop();
});
test("invalid direct URL cannot turn into a successful unfiltered client read", async () => {
  for (const query of ["role=ADMIN", "view=evil", "view=list&view=map", "q=a&q=b"]) {
    const states: DestinationRequestState[] = []; let calls = 0;
    const stop = startDestinationRequest(new URLSearchParams(destinationRequestKey(new URLSearchParams(`${query}&culturePage=2`))), state => states.push(state), async () => { calls++; return Response.json({ success: true, data }); });
    await tick(); assert.equal(calls, 0); assert.deepEqual(states.map(state => state.status), ["loading", "error"]); stop();
    const cleared = destinationSearchHref(new URLSearchParams(query), {});
    assert.deepEqual(parsePublicListQuery(new URL(cleared, "http://localhost").searchParams), {});
  }
});
test("list/map mode and Culture navigation do not change destination request scope", () => {
  assert.equal(destinationRequestKey(new URLSearchParams("q=abc&view=map&culturePage=2")), "q=abc");
  assert.equal(destinationRequestKey(new URLSearchParams("q=abc&view=list&culturePage=3")), "q=abc");
});
for (const failure of ["network", "500", "400", "bad-json", "invalid-data"]) test(`request ${failure} is error, not empty`, async () => {
  const states: DestinationRequestState[] = [];
  const stop = startDestinationRequest(new URLSearchParams(), state => states.push(state), async () => {
    if (failure === "network") throw Error("private network");
    if (failure === "bad-json") return new Response("invalid");
    if (failure === "invalid-data") return Response.json({ success: true, data: { ...data, items: [{ visibility: "HIDDEN" }] } });
    return Response.json({ success: false, error: { code: "FAILED", message: "fixture" } }, { status: Number(failure) });
  });
  await tick(); assert.deepEqual(states.map(state => state.status), ["loading", "error"]); stop();
});
test("new request cancels old signal and ignores old success/error even if transport ignores abort", async () => {
  for (const rejectOld of [false, true]) {
    let resolve!: (value: Response) => void, reject!: (error: Error) => void;
    let signal: AbortSignal | null | undefined;
    const states: DestinationRequestState[] = [];
    const stop = startDestinationRequest(new URLSearchParams("q=old"), state => states.push(state), async (_url, init) => {
      signal = init?.signal; return new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
    });
    stop(); assert.equal(signal?.aborted, true);
    const stopNew = startDestinationRequest(new URLSearchParams("q=new"), state => states.push(state), async () => Response.json({ success: true, data }));
    await tick(); if (rejectOld) reject(Error("late")); else resolve(Response.json({ success: true, data: { ...data, items: [] } }));
    await tick(); assert.deepEqual(states.map(state => state.status), ["loading", "loading", "ready"]); stopNew();
  }
});
test("unmount prevents late result; retry starts a fresh successful request", async () => {
  const states: DestinationRequestState[] = [];
  let resolve!: (response: Response) => void;
  const stop = startDestinationRequest(new URLSearchParams(), state => states.push(state), () => new Promise(res => { resolve = res; }));
  stop(); resolve(Response.json({ success: true, data })); await tick(); assert.equal(states.length, 1);
  const retry = startDestinationRequest(new URLSearchParams(), state => states.push(state), async () => Response.json({ success: true, data }));
  await tick(); assert.equal(states.at(-1)?.status, "ready"); retry();
});
test("rendered loading/empty/error are separate accessible feedback", () => {
  const render = (state: DestinationRequestState, filtered = false) => renderToStaticMarkup(<DestinationResultStatus state={state} filtered={filtered} onRetry={() => {}} />);
  assert.match(render({ status: "loading" }), /aria-busy="true"/);
  assert.match(render({ status: "loading" }), /Đang tải điểm đến/);
  assert.match(render({ status: "ready", data }, true), /Không tìm thấy điểm đến phù hợp/);
  assert.match(render({ status: "ready", data }), /Chưa có điểm đến công khai/);
  assert.doesNotMatch(render({ status: "ready", data }, true), /role="alert"|Thử lại/);
  assert.match(render({ status: "error" }), /role="alert"/); assert.match(render({ status: "error" }), /Thử lại/);
});
