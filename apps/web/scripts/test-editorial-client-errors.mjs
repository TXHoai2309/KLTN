// Offline browser coverage for Editorial GET/DTO and deterministic layout failures.
// Uses only synthetic data and blocks all outbound browser traffic.
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: ["C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"] }));
const web = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  absWorkingDir: web,
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import EditorialEditor from './src/app/admin/destinations/editorial-editor';window.mount=()=>{window.root?.unmount();window.root=createRoot(document.getElementById('app'));window.root.render(<EditorialEditor id="fixture"/>)};window.mount();`,
    resolveDir: web,
    loader: "tsx",
  },
  plugins: [{ name: "offline-next", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ loader: "js", resolveDir: web, contents: "import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}" }));
    builder.onResolve({ filter: /components\/map\/destination-map$/ }, args => ({ path: args.path, namespace: "map" }));
    builder.onLoad({ filter: /.*/, namespace: "map" }, () => ({ loader: "js", resolveDir: web, contents: "import React from 'react';export default function Map(){return React.createElement('div')}" }));
  } }],
  bundle: true,
  write: false,
  outdir: ".cache/editorial-client-errors",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});

let mode = "normal";
let getCount = 0;
const paragraph = index => `Đoạn thông tin nguồn ${index} ghi nhận đặc điểm cụ thể của địa hình và cảnh quan quanh điểm đến.`;
function responseState() {
  const context = {
    id: "fixture", name: "Điểm đến thử nghiệm", description: "Mô tả fixture", category: "", area: "Hà Giang",
    latitude: 23, longitude: 105, suggestedDurationMinutes: null, openingDays: [], media: [], sources: [],
  };
  if (mode === "layout-limit") {
    context.description = Array.from({ length: 55 }, (_, index) => `## Chương ${index + 1}\n${paragraph(index + 1)}`).join("\n\n");
  }
  return {
    available: true, reason: null, context, draft: null, published: null, previousPublished: null,
    draftRevision: 0, publishedRevision: 0, updatedAt: null, publishedAt: null, contentChanged: false, aiConfigured: false,
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const send = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (url.pathname === "/") {
    const styles = bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return response.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;font-family:system-ui}*{box-sizing:border-box}${styles}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  }
  if (url.pathname === "/bundle.js") {
    response.writeHead(200, { "Content-Type": "application/javascript" });
    return response.end(bundle.outputFiles.find(file => file.path.endsWith(".js")).text);
  }
  if (url.pathname === "/api/admin/destinations/fixture/editorial" && request.method === "GET") {
    getCount++;
    if (mode === "unauthorized") return send({ success: false }, 401);
    if (mode === "invalid-dto") return send({ success: true, data: { context: { description: "private fixture text" } } });
    return send({ success: true, data: responseState() });
  }
  response.writeHead(404); response.end();
});

let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const requests = [];
  const clientErrors = [];
  page.on("request", request => requests.push(request.url()));
  page.on("console", message => { if (message.type() === "error") clientErrors.push(message.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });

    mode = "unauthorized";
    getCount = 0;
    await page.reload();
    const loadAlert = page.getByRole("alert");
    await loadAlert.getByText("Phiên Admin không còn hợp lệ", { exact: false }).waitFor();
    const retryLoad = loadAlert.getByRole("button", { name: "Thử tải lại", exact: true });
    await retryLoad.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Phiên Admin"));
    assert.equal(getCount, 2, "data retry repeats the GET");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "load error fits the viewport");

    mode = "invalid-dto";
    getCount = 0;
    await page.reload();
    await page.getByRole("alert").getByText("Phản hồi dữ liệu biên tập không hợp lệ", { exact: false }).waitFor();
    assert.equal(getCount, 1, "malformed DTO is presented as a response failure");

    mode = "layout-limit";
    getCount = 0;
    await page.reload();
    const layoutAlert = page.getByRole("alert");
    await layoutAlert.getByText("Dữ liệu đã tải", { exact: false }).waitFor();
    await layoutAlert.getByText("50 node", { exact: false }).waitFor();
    assert.equal(await layoutAlert.getByText("Phiên Admin không còn hợp lệ", { exact: false }).count(), 0);
    const retryLayout = layoutAlert.getByRole("button", { name: "Thử tạo lại bố cục", exact: true });
    await retryLayout.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Dữ liệu đã tải"));
    assert.equal(getCount, 1, "layout retry repeats the local builder without another GET");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "layout error fits the viewport");
  }

  assert(requests.every(url => url.startsWith("http://127.0.0.1:")), "browser traffic stays on the local fixture server");
  assert(requests.filter(url => url.includes("/api/")).every(url => url.endsWith("/editorial")), "no client telemetry endpoint is requested");
  const diagnosticText = clientErrors.join("\n");
  assert(diagnosticText.includes('"stage":"DATA_LOAD"'));
  assert(diagnosticText.includes('"stage":"DATA_RESPONSE"'));
  assert(diagnosticText.includes('"stage":"INITIAL_LAYOUT_GENERATION"'));
  assert(diagnosticText.includes('"code":"NODE_LIMIT"'));
  assert(!diagnosticText.includes("private fixture text"));
  assert(!diagnosticText.includes("Mô tả fixture"));
  assert(!diagnosticText.includes("fixture"));
  console.log("PASS Editorial client errors: GET/DTO/layout stages, accessible alert and retry target, keyboard, 1440/390px, no overflow, redacted console and no telemetry");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
