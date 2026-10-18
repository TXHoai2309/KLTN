import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, summarize, safeOrigin, sampleCount, safeResource, resourceKind, canonicalJson } from "./metrics.mjs";
test("nearest-rank percentiles and unavailable values never invent metrics", () => {
  assert.equal(percentile([], .95), null); assert.equal(percentile([3,1,2], .5), 2); assert.equal(percentile([3,1,2], .95), 3);
  assert.deepEqual(summarize([2,4]), {n:2,p50:2,p95:4,min:2,max:4});
});
test("benchmark bounds prevent credentials and accidental large sample runs", () => {
  for (const url of ["https://user:secret@example.com", "http://example.com", "https://example.com/?token=x"]) assert.throws(()=>safeOrigin(url));
  assert.equal(safeOrigin("http://localhost:3010"), "http://localhost:3010");
  for (const n of [0,6,100,1.5]) assert.throws(()=>sampleCount(n));
});
test("resource evidence omits query credentials and categorizes media", () => {
  assert.deepEqual(safeResource("https://example.com/asset.js?token=secret#key"), {origin:"https://example.com",path:"/asset.js"});
  assert.equal(resourceKind("video", "https://example.com/a.mp4"), "video"); assert.equal(resourceKind("link", "https://example.com/a.woff2"), "font");
});
test("DTO equivalence ignores description-map insertion order but preserves ordered locations", () => {
  assert.equal(canonicalJson({descriptions:{b:"B",a:"A"}}),canonicalJson({descriptions:{a:"A",b:"B"}}));
  assert.notEqual(canonicalJson({items:["a","b"]}),canonicalJson({items:["b","a"]}));
});
