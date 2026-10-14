/** Actual production form + service, TEST in-memory persistence, following the existing Admin UI harness.
 * No Neon/provider writes or authentication bypass in the application. This isolated server is test-only.
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { v3TestStore } from "../src/modules/destination/__fixtures__/v3-store.ts";
import {
  writeDestination,
  getDestination,
  listDestinations,
} from "../src/modules/destination/destination-service.ts";
import { listPublicLocations } from "../src/modules/destination/public-destination-list.ts";
import { unknownSchedule } from "../src/modules/destination/destination-contract.ts";
import { resolveMapsUrl } from "../src/modules/destination/maps-url-resolver.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve("playwright", {
    paths: [
      process.env.PLAYWRIGHT_MODULE_DIR ??
        "C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules",
    ],
  }),
);
const web = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  absWorkingDir: web,
  stdin: {
    contents:
      'import React from "react";import {createRoot} from "react-dom/client";import DestinationForm from "./src/app/admin/destinations/destination-form";import {Toaster} from "sonner";window.mount=(id=null)=>{window.root?.unmount();window.mockNavigation=null;window.root=createRoot(document.getElementById("app"));window.root.render(<><DestinationForm id={id}/><Toaster/></>)};window.mount();',
    resolveDir: web,
    loader: "tsx",
  },
  plugins: [
    {
      name: "offline-next",
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
          path: args.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          loader: "js",
          resolveDir: web,
          contents:
            args.path === "next/link"
              ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}'
              : "export const useRouter=()=>({push:href=>window.mockNavigation=href});",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  outdir: ".cache/destination-v3-ui-bundle",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const store = v3TestStore(),
  headers = new Headers(),
  posts = [];
const legacy = await writeDestination(
  headers,
  {
    name: "TEST Legacy",
    description: "Legacy description",
    area: "đồng văn",
    category: "Legacy",
    latitude: 23,
    longitude: 105,
    suggestedDurationMinutes: 60,
    minimumDurationMinutes: 30,
    openingDays: unknownSchedule(),
    profile: {
      shortDescription: "Legacy short",
      address: "Địa chỉ lịch sử",
      ticketPrice: "100",
      cultureIds: ["culture"],
      areaIds: ["area"],
      sources: [
        {
          title: "Source",
          url: "https://example.org/source",
          websiteRights: "APPROVED",
          rightsEvidence: "Grant",
        },
      ],
      media: [{ url: "https://example.org/image", alt: "Image" }],
    },
  },
  "fixture",
  null,
  store.deps,
);
assert.equal(legacy.status, "SUCCESS");
const legacyId = legacy.data.id;
let mode = "normal",
  addressFailure = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname.startsWith("/api/")) {
    try {
      if (url.pathname.endsWith("/address")) {
        if (addressFailure)
          return send({
            success: true,
            data: {
              available: false,
              communes: [],
              reason: "Provider tạm không khả dụng. Nhập địa chỉ văn bản.",
            },
          });
        return send({
          success: true,
          data: {
            available: true,
            reason: null,
            communes: [
              {
                code: "00691",
                name: "Phường Hà Giang 2",
                provinceCode: "08",
                provinceName: "Tỉnh Tuyên Quang",
              },
            ],
          },
        });
      }
      if (req.method === "GET") {
        if (url.pathname === "/api/destinations")
          return send({
            success: true,
            data: await listPublicLocations({}, store.deps.database),
          });
        return send({
          success: true,
          data:
            url.pathname === "/api/admin/destinations"
              ? await listDestinations(headers, 1, store.deps)
              : await getDestination(
                  headers,
                  url.pathname.split("/").at(-1),
                  store.deps,
                ),
        });
      }
      let raw = "";
      for await (const part of req) raw += part.toString();
      const body = JSON.parse(raw);
      if (url.pathname.endsWith("resolve-maps")) {
        const data = await resolveMapsUrl(body.url);
        if (body.url.includes("query=22"))
          await new Promise((r) => setTimeout(r, 700));
        return send({ success: true, data });
      }
      posts.push({ body: raw, key: req.headers["idempotency-key"] });
      if (mode === "unknown") {
        req.socket.destroy();
        return;
      }
      const id =
        url.pathname === "/api/admin/destinations"
          ? null
          : url.pathname.split("/").at(-1);
      const result = await writeDestination(
        headers,
        body,
        req.headers["idempotency-key"],
        id,
        store.deps,
      );
      return send(
        result.status === "SUCCESS"
          ? { success: true, operationStatus: "SUCCESS", data: result.data }
          : {
              success: false,
              operationStatus: result.status,
              error: result.error,
            },
        result.status === "SUCCESS" ? 200 : (result.httpStatus ?? 503),
      );
    } catch (e) {
      return send(
        {
          success: false,
          operationStatus: "FAILED",
          error: {
            code: e.code ?? "TEST_ERROR",
            message: e.message,
            details: e.details,
          },
        },
        e.status ?? 500,
      );
    }
  }
  res.setHeader(
    "Content-Type",
    url.pathname === "/bundle.js" ? "application/javascript" : "text/html",
  );
  res.end(
    url.pathname === "/bundle.js"
      ? bundle.outputFiles.find((f) => f.path.endsWith(".js")).text
      : '<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
          bundle.outputFiles
            .filter((f) => f.path.endsWith(".css"))
            .map((f) => f.text)
            .join("\n") +
          '</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("heading", { name: "Tạo điểm đến mới" }).waitFor();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      true,
    );
  }
  assert.equal(
    await page
      .locator(
        'input[id="destination-area"],input[id="destination-latitude"],input[id="destination-longitude"]',
      )
      .count(),
    0,
  );
  assert.equal(await page.getByRole("heading", { level: 2 }).count(), 4);
  pass("4 sections, removed inputs, 360/390/768/1440 no overflow");
  await page.getByRole("button", { name: "Tạo điểm đến", exact: true }).click();
  await page.locator("#err-name").waitFor();
  await page.waitForFunction(
    () => document.activeElement.id === "destination-name",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "destination-name",
  );
  pass("inline validation and first-error focus");
  await page.locator("#destination-name").fill("TEST Browser POI");
  await page.locator("#destination-category").selectOption("chợ phiên");
  await page
    .locator("#destination-description")
    .fill("Mô tả điểm đến. Nội dung thử nghiệm.");
  await page
    .locator("#destination-googleMapsUrl")
    .fill("https://google.com/maps/@23,105,10z");
  await page.getByText("Chưa xác định được vị trí", { exact: true }).waitFor();
  const beforeSize = store.rows().size;
  await page.getByRole("button", { name: "Tạo điểm đến", exact: true }).click();
  await page.locator("#err-googleMapsUrl").waitFor();
  assert.equal(store.rows().size, beforeSize);
  pass("camera-only URL fails save without false coordinates");
  await page
    .locator("#destination-googleMapsUrl")
    .fill("https://google.com/maps/search/?query=22,104");
  await page.waitForTimeout(400);
  await page
    .locator("#destination-googleMapsUrl")
    .fill("https://google.com/maps/search/?query=23,105");
  await page.getByText("Đã xác định tọa độ điểm", { exact: true }).waitFor();
  await page.waitForTimeout(900);
  assert.equal(await page.locator("output").textContent(), "23, 105");
  pass("stale Maps result cannot replace latest coordinates");
  await page.getByText("Giờ hoạt động",{exact:true}).click();
  await page.locator("#status-0").selectOption("OPEN");
  await page.locator("#time-0-0-opensAt").fill("08:00");
  await page.locator("#time-0-0-closesAt").fill("07:00");
  await page.getByRole("button",{name:"Tạo điểm đến",exact:true}).click();
  await page.waitForFunction(()=>document.activeElement.id==="time-0-0-closesAt");
  await page.locator("#status-0").selectOption("UNKNOWN");
  await page.getByText("Giờ hoạt động",{exact:true}).click();
  pass("opening-hours validation expands disclosure and focuses exact invalid time");

  await page.locator("#destination-commune").selectOption("00691");
  await page.locator("#destination-address").fill("Nhà số 1");
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Ở lại", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  pass("app-owned unsaved dialog focus and Escape");
  await page
    .getByRole("button", { name: "Xem trước hồ sơ", exact: true })
    .click();
  const preview = page.locator(".af-preview");
  assert.ok((await preview.textContent()).includes("Mô tả điểm đến."));
  assert.equal(
    await preview.getByText("Văn hóa liên quan", { exact: true }).count(),
    0,
  );
  assert.equal(await preview.getByText(/Giá vé:/).count(), 0);
  await page
    .getByRole("button", { name: "Đóng xem trước", exact: true })
    .click();
  pass(
    "V3 preview uses current prose and hides removed price/geography/Culture sections",
  );

  await page
    .getByRole("button", { name: "Tạo điểm đến", exact: true })
    .dblclick();
  await page.waitForFunction(
    () => Boolean(window.mockNavigation?.endsWith("/edit")),
  );
  assert.equal(store.rows().size, beforeSize + 1);
  const created = [...store.rows().values()].at(-1);
  assert.equal(created.visibility, "HIDDEN");
  assert.equal(
    created.address,
    "Nhà số 1, Phường Hà Giang 2, Tỉnh Tuyên Quang",
  );
  assert.equal(
    (await listPublicLocations({}, store.deps.database)).items.length,
    0,
  );
  pass(
    "Create uses real service, single write, HIDDEN and public exclusion, formatted address",
  );
  addressFailure = true;
  await page.evaluate((id) => window.mount(id), legacyId);
  await page.getByRole("heading", { name: "Chỉnh sửa điểm đến" }).waitFor();
  await page.getByText(/Provider tạm không khả dụng/).waitFor();
  const snapshot = structuredClone(store.rows().get(legacyId));
  assert.equal(
    await page.locator("#destination-category").inputValue(),
    "legacy",
  );
  assert.equal(
    await page.locator("#destination-address").inputValue(),
    "Địa chỉ lịch sử",
  );
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.waitForFunction(
    () => Boolean(window.mockNavigation?.endsWith("/edit")),
  );
  assert.deepEqual(store.rows().get(legacyId), snapshot);
  pass(
    "legacy no-change edit, category and AddressKit failure preserve complete fixture snapshot",
  );
  await page.evaluate((id) => window.mount(id), legacyId);
  await page.getByRole("heading", { name: "Chỉnh sửa điểm đến" }).waitFor();
  await page.locator("#destination-description").fill("Mô tả cập nhật.");
  mode = "unknown";
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.getByRole("button", { name: "Đọc lại và thử lại" }).waitFor();
  assert.equal(
    await page.locator("#destination-description").isDisabled(),
    true,
  );
  const first = posts.at(-1);
  mode = "normal";
  await page.getByRole("button", { name: "Đọc lại và thử lại" }).click();
  await page.waitForFunction(
    () => Boolean(window.mockNavigation?.endsWith("/edit")),
  );
  assert.deepEqual(posts.at(-1), first);
  assert.deepEqual(store.rows().get(legacyId).sources, snapshot.sources);
  assert.deepEqual(store.rows().get(legacyId).media, snapshot.media);
  pass(
    "UNKNOWN locks edit, exact payload/key retry, unrelated sources/media retained",
  );
  await page.evaluate((id) => window.mount(id), legacyId);
  await page.getByRole("heading", { name: "Chỉnh sửa điểm đến" }).waitFor();
  await page.locator("#destination-category").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await mkdir(web + "/.cache/destination-v3", { recursive: true });
  for (const [width, theme] of [
    [1440, "light"],
    [390, "light"],
    [390, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    await page.screenshot({
      path: web + `/.cache/destination-v3/edit-${width}-${theme}.png`,
      fullPage: true,
    });
  }
  pass("native category popup keyboard and light/dark screenshots");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks: checks.length,
      passed: checks.length,
      failed: 0,
      evidence:
        "TEST in-memory persistence; no PostgreSQL or live auth/provider acceptance",
    }),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
