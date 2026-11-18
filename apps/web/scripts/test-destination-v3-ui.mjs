/** Actual production form + service, TEST in-memory persistence, following the existing Admin UI harness.
 * No Neon/provider writes or authentication bypass in the application. This isolated server is test-only.
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";
import { v3TestStore } from "../src/modules/destination/__fixtures__/v3-store.ts";
import {
  writeDestination,
  getDestination,
  listDestinations,
} from "../src/modules/destination/destination-service.ts";
import { listPublicLocations } from "../src/modules/destination/public-destination-list.ts";
import { unknownSchedule } from "../src/modules/destination/destination-contract.ts";
import { resolveMapsUrl } from "../src/modules/destination/maps-url-resolver.ts";
import { createImageIntent, uploadDestinationImage, reviewDestinationImage } from "../src/modules/destination/destination-image-service.ts";
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
const imageAssets = new Map();
const imageCalls = [];
let imagesConfigured = false, imageFailure = "", imageLostResponse = false;
let activeImageUploads = 0, maxImageUploads = 0;
const imageDb = store.deps.database;
// Model serialized database transactions; provider work remains concurrent.
const imageTransaction = imageDb.$transaction;
let transactionTail = Promise.resolve();
imageDb.$transaction = fn => {
  const result = transactionTail.then(() => imageTransaction(fn));
  transactionTail = result.catch(() => {});
  return result;
};
imageDb.$executeRaw = async () => 1;
imageDb.$queryRaw = async () => [{ count: 0n }];
imageDb.idempotencyRecord.count = async () => 0;
const imageProvider = {
  cloud: "offline-fixture", folderMode: async () => "dynamic", inspect: async () => "png",
  find: async intent => imageAssets.get(intent.publicId) ?? null,
  upload: async (intent, bytes) => {
    imageCalls.push({ key: intent.intentKey, name: intent.name });
    if (intent.name === imageFailure) throw Error("TEST provider failure");
    activeImageUploads++; maxImageUploads = Math.max(maxImageUploads, activeImageUploads);
    await new Promise(resolve => setTimeout(resolve, 150));
    activeImageUploads--;
    imageAssets.set(intent.publicId, { asset_id: `asset-${intent.intentKey}`, public_id: intent.publicId,
      secure_url: `https://res.cloudinary.com/offline-fixture/image/upload/v1/${intent.publicId}.png`, resource_type: "image", type: "upload", format: "png", bytes: bytes.length, width: 2, height: 2, version: 1,
      asset_folder: intent.folder, context: { custom: { kltn_intent: intent.intentKey, kltn_sha256: intent.sha256 } } });
  },
};
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
        if (url.pathname === "/api/admin/destination-images/configuration") return send({ success: true, data: { configured: imagesConfigured } });
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
      if (url.pathname.endsWith("/images/upload")) {
        const chunks = []; for await (const part of req) chunks.push(part);
        const result = await uploadDestinationImage(headers, Buffer.concat(chunks), req.headers["idempotency-key"], url.pathname.split("/")[4], store.deps, imageProvider);
        if (imageCalls.some(call => call.key === req.headers["idempotency-key"] && call.name === "auto-first.png")) await new Promise(resolve => setTimeout(resolve, 500));
        const uploadedName = imageCalls.find(call => call.key === req.headers["idempotency-key"])?.name;
        if (imageLostResponse === true || imageLostResponse === uploadedName) { imageLostResponse = false; return send({ success: false, operationStatus: "UNKNOWN", retryWithSameKey: true }, 503); }
        return send({ success: result.status === "SUCCESS", operationStatus: result.status, data: result.data, error: result.error }, result.status === "SUCCESS" ? 200 : result.httpStatus ?? 503);
      }
      let raw = "";
      for await (const part of req) raw += part.toString();
      const body = JSON.parse(raw);
      if (url.pathname.endsWith("/images/intents") || url.pathname.endsWith("/images/review")) {
        const result = await (url.pathname.endsWith("/intents") ? createImageIntent(headers, body, req.headers["idempotency-key"], url.pathname.split("/")[4], store.deps, imageProvider)
          : reviewDestinationImage(headers, body, req.headers["idempotency-key"], url.pathname.split("/")[4], store.deps));
        return send({ success: result.status === "SUCCESS", operationStatus: result.status, data: result.data, error: result.error }, result.status === "SUCCESS" ? 200 : result.httpStatus ?? 503);
      }
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
  await page.route("https://res.cloudinary.com/**", route => route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=","base64")}));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("heading", { name: "Tạo điểm đến mới" }).waitFor();
  await mkdir(web + "/.cache/destination-v3", { recursive: true });
  for (const width of [360,390,768,1024,1440]) for (const theme of ["light","dark"]) {
    await page.setViewportSize({width,height:900}); await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);
    const visual = await page.locator(".dv3-page").evaluate(el=>({width:el.getBoundingClientRect().width,bg:getComputedStyle(el).backgroundColor,card:getComputedStyle(el.querySelector(".af-section")).backgroundColor}));
    assert.equal(visual.width,width);assert.equal(visual.bg,theme==="light"?"rgb(237, 245, 239)":"rgb(16, 33, 25)");assert.equal(visual.card,theme==="light"?"rgb(255, 255, 255)":"rgb(24, 46, 34)");
    assert.equal(await page.locator(".af-actions").evaluate(el=>getComputedStyle(el).position),"static");
    await page.screenshot({ animations: "disabled",path:web+`/.cache/destination-v3/create-${width}-${theme}.png`,fullPage:true});
  }
  await page.evaluate(()=>document.documentElement.classList.remove("dark"));
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
  assert.equal(await page.getByRole("heading", { level: 2 }).count(), 5);
  pass("5 sections including optional images, removed inputs, 360/390/768/1440 no overflow");
  await page.setViewportSize({ width: 390, height: 900 });
  const descriptionField = page.locator("#destination-description");
  const descriptionFieldHeight = await descriptionField.evaluate((el) => el.getBoundingClientRect().height);
  const longDescription = "x".repeat(50_000);
  await descriptionField.fill(longDescription);
  assert.equal(await descriptionField.getAttribute("maxlength"), "50000");
  assert.equal(await descriptionField.evaluate((el) => el.getBoundingClientRect().height), descriptionFieldHeight);
  assert.ok((await page.locator("#description-count").textContent()).includes("50.000 / 50.000"));
  await page.getByRole("button", { name: "Xem thêm và chỉnh sửa" }).click();
  const descriptionDialog = page.getByRole("dialog", { name: "Mô tả điểm đến" });
  await descriptionDialog.waitFor();
  const expandedDescription = descriptionDialog.locator("#destination-description-expanded");
  assert.equal((await expandedDescription.inputValue()).length, 50_000);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dialogBounds = await descriptionDialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, scrollHeight: el.scrollHeight };
    });
    assert.ok(dialogBounds.width <= width && dialogBounds.height <= 900);
    assert.ok(dialogBounds.scrollHeight <= dialogBounds.height);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(await expandedDescription.evaluate((el) => el.scrollHeight > el.clientHeight));
  await expandedDescription.fill("Mô tả dài đã chỉnh sửa.");
  await descriptionDialog.getByRole("button", { name: "Đóng", exact: true }).click();
  assert.equal(await descriptionField.inputValue(), "Mô tả dài đã chỉnh sửa.");
  await page.getByRole("button", { name: "Xem thêm và chỉnh sửa" }).click();
  await page.getByRole("dialog", { name: "Mô tả điểm đến" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "destination-description-expand");
  await descriptionField.fill("Mô tả điểm đến. Nội dung thử nghiệm.");
  pass("50k description, fixed form field, bounded dialog at 390/768/1440px, synced edits, and Escape/focus restore");
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

  await page.getByRole("combobox", { name: /Xã\/phường/ }).fill("Ha Giang");
  await page.getByRole("option", { name: /Phường Hà Giang 2/ }).click();
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
  for (const width of [360,390,768,1024,1440]) for (const theme of ["light","dark"]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ animations: "disabled",
      path: web + `/.cache/destination-v3/edit-${width}-${theme}.png`,
      fullPage: true,
    });
  }
  pass("native category popup keyboard and light/dark screenshots");
  imagesConfigured = true;
  const png = await sharp(web + "/public/images/ha-giang-highland-poster.webp").resize(640,400).png().toBuffer();
  await page.evaluate(() => window.mount());
  await page.waitForFunction(() => !document.querySelector('input[type="file"]').disabled);
  const beforeLocalSelection = posts.length;
  await page.locator('input[type="file"]').setInputFiles(["local-first.png", "local-cover.png", "remove-me.png"].map(name => ({name, mimeType: "image/png", buffer: png})));
  assert.equal(await page.locator(".dimg-local-card").count(), 3);
  assert.equal(await page.getByText("Chưa có ảnh. Hình ảnh là tùy chọn.", {exact:true}).count(), 0);
  await page.locator(".dimg-local-card").last().getByRole("button", {name:"Gỡ ảnh",exact:true}).click();
  await page.locator(".dimg-local-card").last().getByRole("button", {name:"Đặt đại diện",exact:true}).click();
  await page.locator(".dimg-local-card").last().locator("input").fill("TEST Chú thích trước khi tạo");
  await page.locator(".dimg-local-card").last().getByRole("button", {name:/lên trước/}).click();
  assert.equal(await page.locator(".dimg-local-card").first().locator("strong").textContent(), "local-cover.png");
  assert.equal(await page.locator(".dimg-local-card").first().getByText("Ảnh đại diện", {exact:true}).count(), 1);
  assert.equal(await page.locator(".dimg-local-card").first().locator("input").inputValue(), "TEST Chú thích trước khi tạo");
  assert.equal(posts.length, beforeLocalSelection);
  assert.equal(imageCalls.length, 0);
  await page.waitForFunction(() => [...document.querySelectorAll(".dimg-local-card img")].every(img => img.complete && img.naturalWidth > 0));
  await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"));
  for (const [width,theme] of [[1440,"light"],[390,"light"],[390,"dark"]]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(t => document.documentElement.classList.toggle("dark",t==="dark"),theme);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.locator("#dv3-images").screenshot({path:web+`/.cache/destination-v3/local-gallery-${width}-${theme}.png`});
  }
  await page.locator("#destination-name").fill("TEST Local gallery choices");
  await page.locator("#destination-category").selectOption("chợ phiên");
  await page.locator("#destination-description").fill("TEST Local image preview and selection.");
  await page.locator("#destination-googleMapsUrl").fill("https://google.com/maps?q=23,105");
  await page.getByRole("button", {name:"Tạo điểm đến",exact:true}).click();
  await page.waitForFunction(() => Boolean(window.mockNavigation));
  const localGalleryId = await page.evaluate(() => window.mockNavigation.split("/")[3]);
  const localMedia = [...store.rows().get(localGalleryId).media].sort((a,b) => a.position-b.position);
  assert.equal(localMedia.length, 2);
  assert.equal(localMedia[0].caption, "TEST Chú thích trước khi tạo");
  assert.equal(localMedia[0].isCover, true);
  assert.equal(localMedia[1].isCover, false);
  assert.equal(posts.length, beforeLocalSelection+1);
  assert.equal(imageCalls.some(call => call.name === "remove-me.png"), false);
  pass("Create previews and edits local gallery immediately; caption/cover/order survive upload with one Create action");
  imageCalls.length = 0;
  const previousImageAssets = imageAssets.size;
  imageFailure = "failed.png";
  await page.evaluate(() => window.mount());
  await page.getByRole("button", { name: "Chọn ảnh", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('input[type="file"]').disabled);
  await page.locator('input[type="file"]').setInputFiles([{ name: "success.png", mimeType: "image/png", buffer: png }, { name: "failed.png", mimeType: "image/png", buffer: png }]);
  assert.equal(imageCalls.length, 0);
  assert.equal(await page.locator(".dimg-local-card").count(), 2);
  assert.equal(await page.locator(".dimg-card").count(), 2, "Selected photos must appear in the editable gallery before creating the destination");
  await page.locator("#destination-name").fill("TEST Images create");
  await page.locator("#destination-category").selectOption("chợ phiên");
  await page.locator("#destination-description").fill("TEST Synthetic image destination.");
  await page.locator("#destination-googleMapsUrl").fill("https://google.com/maps?q=23,105");
  await page.getByRole("button", { name: "Tạo điểm đến", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.mockNavigation));
  const createdImageId = await page.evaluate(() => window.mockNavigation.split("/")[3]);
  assert.equal(store.rows().get(createdImageId).visibility, "HIDDEN");
  assert.equal(store.rows().get(createdImageId).media.length, 1);
  await page.evaluate(id => window.mount(id), createdImageId);
  await page.getByRole("heading", { name: "Chỉnh sửa điểm đến" }).waitFor();
  await page.getByText(/TEST provider failure|Chưa hoàn tất tải ảnh/).waitFor();
  imageFailure = "";
  await page.getByRole("button", { name: "Tải ảnh chờ / thử lại", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".dimg-card").length === 2);
  assert.equal(imageCalls.filter(call => call.name === "success.png").length, 1);
  assert.equal(imageCalls.filter(call => call.name === "failed.png").length, 2);
  pass("Create queues files until HIDDEN persisted; partial failure hands off to Edit; retry skips success");
  const mediaBefore = structuredClone(store.rows().get(createdImageId).media);
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
  assert.deepEqual(store.rows().get(createdImageId).media, mediaBefore);
  await page.locator('.dimg-card input[id^="media-caption-"]').first().fill("TEST Mountain cover");
  await page.getByRole("button", { name: "Đặt đại diện", exact: true }).nth(1).click();
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
  assert.equal(store.rows().get(createdImageId).media[0].caption, "TEST Mountain cover");
  assert.equal(store.rows().get(createdImageId).media.filter(m => m.isCover).length, 1);
  assert.equal(store.rows().get(createdImageId).media[1].isCover, true);
  pass("Edit no-change preserves exact media; metadata and cover save in place");
  assert.equal(await page.locator('input[id^="media-alt-"]').count(), 0);
  assert.equal(await page.locator('textarea[id^="media-evidence-"]').count(), 0);
  assert.equal(await page.getByRole("button", {name:"Xác nhận duyệt quyền",exact:true}).count(), 0);
  assert.equal(store.rows().get(createdImageId).media[0].websiteRights,"UNKNOWN");
  assert.equal(store.rows().get(createdImageId).media[0].rightsEvidence,null);
  await page.locator('.dimg-card input[id^="media-caption-"]').first().fill("");
  await page.getByRole("button", {name:"Lưu thay đổi",exact:true}).click();
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
  assert.equal(store.rows().get(createdImageId).media[0].caption,null);
  assert.equal(store.rows().get(createdImageId).media[0].alt,"Hình ảnh TEST Images create");
  pass("No alt/evidence/review UI; empty caption saves and server derives Destination alt with legal UNKNOWN");
  await page.waitForFunction(() => !document.querySelector('input[type="file"]').disabled);
  imageLostResponse = true;
  await page.locator('input[type="file"]').setInputFiles([{ name: "unknown.png", mimeType: "image/png", buffer: png }]);
  await page.getByText("unknown.png", { exact: true }).waitFor();
  await page.getByText(/Chưa xác định kết quả.*cùng file/).waitFor();
  assert.equal(store.rows().get(createdImageId).media.length, 3);
  await page.getByRole("button", { name: "Tải ảnh chờ / thử lại", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".dimg-card").length === 3);
  assert.equal(imageCalls.filter(call => call.name === "unknown.png").length, 1);
  pass("Lost upload response reconciles same key without duplicate asset/media");
  await page.waitForFunction(() => !document.querySelector('input[type="file"]').disabled);
  await page.locator("#destination-description").fill("TEST Unsaved prose survives automatic image upload.");
  const postsBeforeAuto = posts.length;
  maxImageUploads = 0;
  imageLostResponse = "auto-first.png";
  await page.locator('input[type="file"]').setInputFiles(["auto-first.png", "auto-second.png", "auto-third.png"].map(name => ({name, mimeType:"image/png", buffer:png})));
  await page.waitForFunction(() => document.querySelectorAll(".dimg-card").length === 6 && !document.querySelector('input[type="file"]').disabled);
  assert.equal(maxImageUploads, 2);
  assert.equal(posts.length, postsBeforeAuto);
  assert.equal(store.rows().get(createdImageId).media.length, 6);
  assert.equal(await page.locator("#destination-description").inputValue(), "TEST Unsaved prose survives automatic image upload.");
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".dimg-card").count(), 6);
  await page.getByRole("button", { name: "Tải ảnh chờ / thử lại", exact: true }).click();
  await page.locator(".dimg-queue-row").filter({hasText:"auto-first.png"}).getByText("Đã lưu", {exact:true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('input[type="file"]').disabled);
  assert.equal(await page.locator(".dimg-card").count(), 6);
  assert.equal(imageCalls.filter(call => call.name === "auto-first.png").length, 1);
  assert.equal(posts.length, postsBeforeAuto);
  pass("Older same-key replay after a lost concurrent response cannot remove newer saved photos");
  pass("Picker auto uploads two at a time without Save; delayed responses preserve latest gallery and unsaved prose");
  const transfer = await page.evaluateHandle(bytes => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], "dragged.png", { type: "image/png" })); return dt;
  }, [...png]);
  await page.locator(".dimg-drop").dispatchEvent("drop", { dataTransfer: transfer });
  await page.getByText("dragged.png", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".dimg-card").length === 7 && !document.querySelector('input[type="file"]').disabled);
  assert.equal(posts.length, postsBeforeAuto);
  await page.locator('input[type="file"]').setInputFiles([{ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") }]);
  await page.getByText(/File “bad.txt” không hợp lệ/).waitFor();
  pass("Drag/drop uploads automatically; invalid file inline feedback");
  const beforeOrder = store.rows().get(createdImageId).media.map(m=>m.id);
  await page.locator(".dimg-card").first().getByText("Xuống",{exact:true}).click();
  await page.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
  const reordered = [...store.rows().get(createdImageId).media].sort((a,b)=>a.position-b.position).map(m=>m.id);
  assert.deepEqual(reordered.slice(0,2),[beforeOrder[1],beforeOrder[0]]);
  const unlinkId = store.rows().get(createdImageId).media[6].id;
  await page.locator(".dimg-card").last().getByRole("button",{name:"Gỡ ảnh",exact:true}).click();
  await page.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll(".dimg-card").length===6 && !document.querySelector('button[type="submit"]').disabled);
  assert.equal(store.rows().get(createdImageId).media.some(m=>m.id===unlinkId),false);
  assert.equal(imageAssets.size,previousImageAssets+7);
  pass("Reorder and unlink persist by ID without deleting Cloudinary assets");
  for (const [width, theme] of [[1440, "light"], [360, "light"], [360, "dark"]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(t => document.documentElement.classList.toggle("dark", t === "dark"), theme);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.screenshot({ animations: "disabled", path: web + `/.cache/destination-v3/images-${width}-${theme}.png`, fullPage: true });
    await page.locator(".dimg-card").first().screenshot({path:web+`/.cache/destination-v3/image-card-${width}-${theme}.png`});
  }
  await page.getByRole("button", { name: "Tải ảnh lên", exact: true }).focus();
  assert.equal(await page.getByRole("button", { name: "Tải ảnh lên", exact: true }).evaluate(el => el === document.activeElement), true);
  pass("Images 360px/desktop light/dark screenshots, keyboard focus and no horizontal overflow");
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
