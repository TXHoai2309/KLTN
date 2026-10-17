// Isolated real-browser QA of production AssistantChat. No app API/DB/provider.
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({ entryPoints: [join(root, "development/assistant-context-fixture.tsx")], bundle: true, write: false, outdir: "memory", platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const assets = new Map(bundle.outputFiles.map(file => [file.path.endsWith(".js") ? "/fixture.js" : "/fixture.css", file]));
const server = createServer((req, res) => {
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  const asset = assets.get(req.url);
  if (asset) { res.setHeader("Content-Type", req.url.endsWith(".js") ? "text/javascript" : "text/css"); return res.end(asset.contents); }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistant improvement isolated QA</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0}output{display:block;overflow-wrap:anywhere}#root{max-width:100%}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = process.env.QA_ASSISTANT_BROWSER_OUTPUT ?? join(tmpdir(), "kltn-ai-completion-browser");
await mkdir(output, { recursive: true });
const results = [], errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/u, route => route.abort());
  const url = `http://127.0.0.1:${server.address().port}`;
  const composer = page.getByRole("textbox", { name: "Câu hỏi của bạn" });
  async function load(mode, width = 1440, theme = "light") {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(url);
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value === "dark"), theme);
    await page.locator("#fixture-scenario").selectOption(mode);
  }
  async function ask(question = "Giới thiệu về Điểm kiểm thử A") {
    await composer.fill(question);
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await page.locator(".assistant-answer").last().waitFor();
  }
  for (const width of [360, 390, 768, 1440]) for (const theme of ["light", "dark"]) {
    await load("table", width, theme); await ask("So sánh hai thông tin trong nguồn");
    assert.equal(await page.locator(".assistant-answer-table tbody tr").count(), 2);
    assert.equal(await page.locator(".assistant-answer-sources[open]").count(), 0);
    assert.equal(await page.locator(".assistant-citation summary").first().isVisible(), false);
    await page.screenshot({ path: join(output, `answer-${width}-${theme}.png`) });
    await page.locator(".assistant-answer-sources > summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".assistant-answer-sources[open]").count(), 1);
    await page.locator(".assistant-citation summary").first().click();
    assert.equal(await page.locator("details[open]").count(), 2);
    assert.equal(await page.getByRole("region", { name: "Nguồn cho ý 1", exact: true }).count(), 1);
    const metrics = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, tableWidth: document.querySelector(".assistant-answer-table-scroll").clientWidth, tableScroll: document.querySelector(".assistant-answer-table-scroll").scrollWidth }));
    assert.ok(metrics.width <= metrics.viewport + 1, JSON.stringify(metrics));
    const sourceBox = await page.locator(".assistant-citation summary").first().boundingBox();
    if (width <= 390) assert.ok(sourceBox.x + sourceBox.width <= width, "mobile sources must remain visible");
    await page.locator(".assistant-answer-table-scroll").focus();
    await page.keyboard.press("ArrowRight");
    await page.locator(".assistant-answer-table-scroll").evaluate(el => { el.scrollLeft = 0; });
    await page.screenshot({ path: join(output, `table-${width}-${theme}.png`) });
    results.push({ mode: "table", width, theme, metrics });
  }
  await load("paragraphs", 390); await ask();
  assert.equal(await page.locator(".assistant-answer-list, .assistant-answer-table").count(), 0);
  assert.equal(await page.locator(".assistant-answer-sources").count(), 1);
  assert.equal(await page.locator(".assistant-citation summary").first().isVisible(), false);
  await page.screenshot({ path: join(output, "paragraphs-390-light.png") });
  const suggestions = page.getByRole("navigation", { name: "Câu hỏi tiếp nối" });
  assert.equal(await suggestions.getByRole("button").count(), 3);
  const before = await page.getByLabel("Recorded requests").textContent();
  await suggestions.getByRole("button").first().focus(); await page.keyboard.press("Enter");
  assert.equal(await composer.evaluate(el => el === document.activeElement), true);
  assert.ok((await composer.inputValue()).includes("địa chất"));
  assert.equal(await page.getByLabel("Recorded requests").textContent(), before, "suggestions must not auto-send");
  await composer.fill("Nội dung đang viết"); assert.equal(await suggestions.getByRole("button").first().isDisabled(), true);
  await page.getByRole("button", { name: "Toggle auth revalidation" }).click();
  assert.equal(await composer.isDisabled(), true); assert.equal(await composer.inputValue(), "Nội dung đang viết");
  results.push({ mode: "suggestions", keyboard: true, noAutoSend: true, draftPreserved: true, authRevalidation: true });
  for (const mode of ["list", "partial", "excerpts", "verification", "success", "no-evidence", "missing-support", "technical", "unknown", "slow"]) {
    const question = ["no-evidence", "missing-support", "verification"].includes(mode) ? "Giá vé hôm nay?" : "Câu hỏi kiểm thử";
    await load(mode, 360); await composer.fill(question);
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    if (mode === "technical") {
      await page.getByRole("button", { name: "Sửa câu hỏi" }).click(); assert.equal(await composer.inputValue(), "Câu hỏi kiểm thử");
    } else if (mode === "unknown") {
      await page.getByRole("button", { name: "Thử xác nhận lại" }).waitFor();
      assert.equal(await page.getByRole("combobox", { name: "Chọn bối cảnh hỏi đáp" }).isDisabled(), true);
      const requestsBefore = JSON.parse(await page.getByLabel("Recorded requests").textContent());
      await page.getByRole("button", { name: "Thử xác nhận lại" }).click();
      await page.getByRole("button", { name: "Thử xác nhận lại" }).waitFor();
      const requestsAfter = JSON.parse(await page.getByLabel("Recorded requests").textContent());
      assert.equal(requestsBefore[0], requestsAfter[1]);
    } else {
      await page.locator(".assistant-answer").last().waitFor();
      if (mode === "list") assert.equal(await page.locator(".assistant-answer-list > li").count(), 2);
      if (mode === "partial") assert.ok((await page.locator(".assistant-unanswered").textContent()).includes("thời điểm"));
      if (mode === "verification") assert.ok((await page.locator(".assistant-source-reply").textContent()).includes("đã tìm thấy tài liệu"));
      if (["no-evidence", "missing-support", "verification"].includes(mode)) {
        const reply = await page.locator(".assistant-source-reply").textContent();
        assert.ok(reply.includes("mức giá đang áp dụng"));
        assert.ok(reply.includes("vé vào cửa chung"));
        assert.equal(await page.locator(".assistant-answer details, .assistant-source-notice").count(), 0);
        const requests = JSON.parse(await page.getByLabel("Recorded requests").textContent());
        assert.equal(requests.length, 1, "a contextual missing reply must not send another request");
      }
      if (mode === "excerpts") assert.ok((await page.locator(".assistant-source-notice").textContent()).includes("trích nguyên văn"));
      if (["verification", "success"].includes(mode)) assert.equal(await page.locator(".assistant-answer details").count(), 0);
    }
    await page.screenshot({ path: join(output, `${mode}-360.png`) });
    results.push({ mode, width: 360, passed: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load("list", 390); await ask();
  assert.equal(await page.locator("html").getAttribute("lang"), "vi");
  assert.deepEqual(errors, []);
  await writeFile(join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ groups: results.length, passed: true, output }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
