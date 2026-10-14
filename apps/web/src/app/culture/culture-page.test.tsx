import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Culture browse page uses Next 16 searchParams and the server service", async () => {
  const page = await source("./page.tsx");

  assert.match(page, /searchParams: CultureSearchParams/);
  assert.match(page, /const rawSearchParams = await searchParams/);
  assert.match(page, /listPublicCulture\(state\.query, db\)/);
  assert.doesNotMatch(page, /fetch\(/);
  assert.match(page, /href=\{cultureDetailHref\(item\.slug\)\}/);
});

test("Culture browse page exposes shareable filters and distinct states", async () => {
  const [page, filter, loading, error, header] = await Promise.all([
    source("./page.tsx"),
    source("./culture-filter-bar.tsx"),
    source("./loading.tsx"),
    source("./error.tsx"),
    source("../../components/header.tsx"),
  ]);

  assert.match(page, /Không tìm thấy nội dung phù hợp/);
  assert.match(page, /Chưa có nội dung văn hóa công khai/);
  assert.match(page, /culturePageHref/);
  assert.match(filter, /params\.set\("q"/);
  assert.match(filter, /params\.set\("destination"/);
  assert.match(filter, /router\.push\(href as Route\)/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /Không thể tải nội dung văn hóa/);
  assert.match(error, /reset\(\)/);
  assert.match(header, /to: "\/culture", label: "Văn hóa"/);
});
