import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  safeCultureSourceUrl,
  sortCultureSources,
} from "./[slug]/culture-source-utils";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Culture detail uses Next 16 params, service data and dynamic metadata", async () => {
  const page = await source("./[slug]/page.tsx");

  assert.match(page, /params: Promise<\{ slug: string \}>/);
  assert.match(page, /const \[\{ slug \}, rawSearchParams\] = await Promise\.all/);
  assert.match(page, /getPublicCulture\(slug, db\)/);
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /timeZone: "Asia\/Ho_Chi_Minh"/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test("Culture detail keeps unavailable data private and reserves future slots", async () => {
  const [page, notFound, error, slots, sources, related, loading] = await Promise.all([
    source("./[slug]/page.tsx"),
    source("./[slug]/not-found.tsx"),
    source("./[slug]/error.tsx"),
    source("./[slug]/culture-detail-slots.tsx"),
    source("./[slug]/culture-sources.tsx"),
    source("./[slug]/related-destinations.tsx"),
    source("./[slug]/loading.tsx"),
  ]);

  assert.match(page, /CULTURE_CONTENT_UNAVAILABLE/);
  assert.match(page, /if \(isUnavailableCultureError\(error\)\) notFound\(\)/);
  assert.match(notFound, /Nội dung không khả dụng/);
  assert.match(notFound, /href="\/culture"/);
  assert.match(error, /Không thể tải nội dung văn hóa/);
  assert.match(error, /reset\(\)/);
  assert.match(page, /sources=\{detail\.sources\}/);
  assert.match(page, /destinations=\{detail\.destinations\}/);
  assert.match(sources, /data-culture-slot="sources"/);
  assert.match(sources, /Nội dung này chưa có nguồn tham khảo được công bố/);
  assert.match(sources, /target="_blank"/);
  assert.match(sources, /rel="noopener noreferrer"/);
  assert.match(sources, /safeCultureSourceUrl/);
  assert.match(related, /data-culture-slot="related-destinations"/);
  assert.match(related, /destinations\.length === 0/);
  assert.match(related, /destinations\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(slots, /data-culture-slot="favorite"/);
  assert.match(loading, /aria-busy="true"/);
});

test("Culture source links accept only HTTP(S) and preserve sort order", () => {
  assert.equal(safeCultureSourceUrl("javascript:alert(1)"), null);
  assert.equal(safeCultureSourceUrl("data:text/plain,unsafe"), null);
  assert.equal(safeCultureSourceUrl("  https://example.test/source  "), "https://example.test/source");
  assert.equal(safeCultureSourceUrl("   "), null);
  assert.equal(
    safeCultureSourceUrl("https://example.test/source"),
    "https://example.test/source",
  );
  assert.deepEqual(
    sortCultureSources([
      { id: "second", sortOrder: 2 },
      { id: "first", sortOrder: 1 },
      { id: "same-order", sortOrder: 1 },
    ]),
    [
      { id: "first", sortOrder: 1 },
      { id: "same-order", sortOrder: 1 },
      { id: "second", sortOrder: 2 },
    ],
  );
});

test("Culture detail source and related components keep truthful empty states and safe long text", async () => {
  const [sources, related, css] = await Promise.all([
    source("./[slug]/culture-sources.tsx"),
    source("./[slug]/related-destinations.tsx"),
    source("./[slug]/culture-detail.css"),
  ]);

  assert.match(sources, /Nội dung này chưa có nguồn tham khảo được công bố/);
  assert.match(sources, /publisher\?\.trim\(\)/);
  assert.match(sources, /citation\?\.trim\(\)/);
  assert.match(sources, /target="_blank"/);
  assert.match(sources, /rel="noopener noreferrer"/);
  assert.match(related, /if \(destinations\.length === 0\) return null/);
  assert.match(related, /destinations\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /word-break: break-word/);
});
