import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve("playwright", {
    paths: process.env.PLAYWRIGHT_MODULE_DIR
      ? [process.env.PLAYWRIGHT_MODULE_DIR]
      : undefined,
  }),
);
const web = fileURLToPath(new URL("../", import.meta.url));
const mock = {
  name: "offline-next",
  setup(b) {
    b.onResolve({ filter: new RegExp("^next/(link|navigation)$") }, (args) => ({
      path: args.path,
      namespace: "mock",
    }));
    b.onResolve({ filter: new RegExp("destination-location-picker$") }, () => ({
      path: "map",
      namespace: "mock",
    }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
      resolveDir: web,
      loader: "js",
      contents:
        args.path === "next/link"
          ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}'
          : args.path === "map"
            ? 'import React from "react";export default function Map(){return React.createElement("div",{"aria-label":"Offline pin preview"},"Pin preview mock")}'
            : "export const useRouter=()=>({push:href=>window.mockNavigation=href});",
    }));
  },
};
const bundle = await build({
  absWorkingDir: web,
  stdin: {
    contents:
      'import React from "react";import {createRoot} from "react-dom/client";import CultureForm from "./src/app/admin/culture/culture-form";import DestinationForm from "./src/app/admin/destinations/destination-form";window.mount=(kind,id=null)=>{window.root?.unmount();window.mockNavigation=null;window.root=createRoot(document.getElementById("app"));window.root.render(kind==="culture"?<CultureForm id={id}/>:<DestinationForm id={id}/>)};window.mount("culture");',
    resolveDir: web,
    loader: "tsx",
  },
  plugins: [
    ...(process.env.ADMIN_UI_BASELINE
      ? [
          {
            name: "baseline-source",
            setup(b) {
              b.onLoad(
                {
                  filter:
                    /[\\/]src[\\/](app[\\/]admin[\\/](culture[\\/]culture-form|destinations[\\/]destination-form)|components[\\/]admin[\\/]content-profile-editor)\.tsx$/,
                },
                (args) => ({
                  loader: "tsx",
                  contents: execFileSync(
                    "git",
                    [
                      "show",
                      "861bee4:" +
                        args.path
                          .replaceAll("\\", "/")
                          .split("/apps/web/")[1]
                          .replace(/^/, "apps/web/"),
                    ],
                    { cwd: web, encoding: "utf8" },
                  ),
                }),
              );
            },
          },
        ]
      : []),
    mock,
  ],
  bundle: true,
  outfile: "bundle.js",
  write: false,
  platform: "browser",
  format: "iife",
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css =
  bundle.outputFiles
    .filter((f) => f.path.endsWith(".css"))
    .map((f) => f.text)
    .join("\n") +
  (await readFile(
    new URL("../src/app/admin/destinations/destinations.css", import.meta.url),
    "utf8",
  )) +
  (await readFile(
    new URL("../src/app/admin/culture/culture.css", import.meta.url),
    "utf8",
  ));
const server = createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/bundle.js" ? "application/javascript" : "text/html",
  );
  res.end(
    req.url === "/bundle.js"
      ? bundle.outputFiles.find((f) => !f.path.endsWith(".css")).text
      : '<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}' +
          css +
          '</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const posts = [],
    taxonomyPosts = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const areas = [
      { id: "area-1", name: "Synthetic locality" },
      { id: "area-2", name: "Synthetic region", kind: "REGION" },
    ],
    communities = [
      { id: "community-1", name: "Synthetic community one" },
      { id: "community-2", name: "Synthetic community two" },
    ];
  let mode = "success",
    savedCulture = null;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname === "/api/admin/content-taxonomy") {
      if (req.method() === "GET")
        return route.fulfill({
          json: {
            success: true,
            data: {
              items:
                url.searchParams.get("type") === "AREA"
                  ? areas
                  : url.searchParams.get("type") === "COMMUNITY"
                    ? communities
                    : [],
            },
          },
        });
      taxonomyPosts.push({
        body: req.postData(),
        key: req.headers()["idempotency-key"],
      });
      if (mode === "unknown") return route.abort();
      if (!areas.some((a) => a.id === "created-area"))
        areas.push({ id: "created-area", name: "Synthetic new area" });
      return route.fulfill({
        json: {
          success: true,
          operationStatus: "SUCCESS",
          data: { id: "created-area", name: "Synthetic new area" },
        },
      });
    }
    if (req.method() === "GET") {
      if (url.pathname === "/api/admin/culture/legacy")
        return route.fulfill({
          json: {
            success: true,
            data: savedCulture ?? {
              id: "legacy",
              title: "Legacy title",
              content: "Legacy content",
              sourceTitle: "Legacy source",
              sourceUrl: null,
              destinationIds: [],
              destinations: [],
              visibility: "HIDDEN",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        });
      return route.fulfill({
        json: { success: true, data: { items: [], page: 1, hasMore: false } },
      });
    }
    const input = JSON.parse(req.postData());
    posts.push({
      url: url.pathname,
      body: req.postData(),
      key: req.headers()["idempotency-key"],
    });
    if (mode === "unknown") return route.abort();
    const dto = {
      ...input,
      id: url.pathname.endsWith("legacy") ? "legacy" : "synthetic-created",
      visibility: "HIDDEN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(url.pathname.includes("culture") ? { destinations: [] } : {}),
    };
    if (url.pathname.includes("culture")) savedCulture = dto;
    return route.fulfill({
      json: { success: true, operationStatus: "SUCCESS", data: dto },
    });
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await mkdir(web + "/.cache/admin-redesign-ui", { recursive: true });
  if (process.env.ADMIN_UI_BASELINE) {
    for (const kind of ["culture", "destination"]) {
      await page.evaluate((kind) => window.mount(kind), kind);
      await page
        .getByRole("button", {
          name: kind === "culture" ? "Tạo nội dung văn hóa" : "Tạo điểm đến",
          exact: true,
        })
        .waitFor();
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path:
            web +
            "/.cache/admin-redesign-ui/before-" +
            kind +
            "-" +
            width +
            ".png",
          fullPage: true,
        });
      }
    }
    console.log("BASELINE_SCREENSHOTS=PASS");
    process.exitCode = 0;
  } else {
    await page.locator("#cf-title").fill("Synthetic independent culture");
    await page
      .getByRole("textbox", { name: "Nội dung văn hóa", exact: true })
      .fill("Synthetic original content");
    await page.getByLabel("Synthetic locality", { exact: true }).check();
    await page
      .getByLabel("Synthetic region (Vùng văn hóa)", { exact: true })
      .check();
    await page.getByLabel("Synthetic community one", { exact: true }).check();
    await page.getByLabel("Synthetic community two", { exact: true }).check();
    const areaSection = page
      .getByRole("heading", { name: "Phạm vi địa lý", exact: true })
      .locator("xpath=ancestor::section[1]");
    await areaSection
      .getByText("Tạo mục mới nếu chưa có trong danh sách", { exact: true })
      .click();
    await areaSection
      .getByLabel("Tên mới", { exact: false })
      .fill("Synthetic new area");
    mode = "unknown";
    await areaSection
      .getByRole("button", { name: "Tạo và chọn", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await areaSection
      .getByRole("button", { name: "Thử lại cùng key", exact: true })
      .waitFor();
    assert.equal(taxonomyPosts.length, 1);
    await page.waitForFunction(
      () => document.querySelector('button[type="submit"]').disabled,
    );
    assert.equal(
      await areaSection.getByLabel("Tên mới", { exact: false }).isDisabled(),
      true,
    );
    const taxonomyLost = taxonomyPosts[0];
    mode = "success";
    await areaSection
      .getByRole("button", { name: "Thử lại cùng key", exact: true })
      .click();
    await page.getByLabel("Synthetic new area", { exact: true }).waitFor();
    assert.deepEqual(taxonomyPosts.at(-1), taxonomyLost);
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]').disabled,
    );

    const editor = page.getByRole("textbox", {
      name: "Nội dung văn hóa",
      exact: true,
    });
    await editor.fill("Synthetic heading");
    await page
      .getByRole("button", { name: "Tiêu đề H2 (Ctrl+Alt+2)", exact: true })
      .click();
    assert.equal(await editor.locator("h2").textContent(), "Synthetic heading");
    await editor.press("End");
    await editor.press("Enter");
    await editor.type("Synthetic paragraph");
    await editor.press("Control+a");
    await page
      .getByRole("button", { name: "In đậm (Ctrl+B)", exact: true })
      .click();
    assert.ok((await editor.locator("strong").count()) > 0);
    await page
      .getByRole("button", { name: "Hoàn tác (Ctrl+Z)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Làm lại (Ctrl+Y)", exact: true })
      .click();

    await editor.press("Control+a");
    await editor.evaluate((el) => {
      const data = new DataTransfer();
      data.setData(
        "text/html",
        '<h2>Synthetic heading</h2><h3>Synthetic subheading</h3><p><strong>Bold</strong> <em>Italic</em> <a href="https://example.org/safe" onclick="window.unsafePaste=1">Safe link</a><a href="javascript:window.unsafePaste=1">Unsafe link text</a></p><ul><li>Bullet item</li></ul><ol start="4"><li>Ordered item</li></ol><blockquote><p>Quote</p></blockquote><script>window.unsafePaste=1</script>',
      );
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(
      await editor.locator("h3").textContent(),
      "Synthetic subheading",
    );
    assert.equal(await editor.locator("ul li").textContent(), "Bullet item");
    assert.equal(await editor.locator("ol").getAttribute("start"), "4");
    assert.equal(await editor.locator("blockquote").textContent(), "Quote");
    assert.equal(await editor.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.unsafePaste), undefined);
    await editor.press("Control+a");
    await page
      .getByRole("button", { name: "Xóa định dạng", exact: true })
      .click();
    assert.equal(await editor.locator("h2").count(), 0);
    await page
      .getByRole("button", { name: "Hoàn tác (Ctrl+Z)", exact: true })
      .click();
    assert.equal(await editor.locator("h2").textContent(), "Synthetic heading");
    await page
      .getByRole("button", { name: "Chỉnh sửa liên kết", exact: true })
      .count()
      .then(async (count) => {
        await page
          .getByRole("button", {
            name: count ? "Chỉnh sửa liên kết" : "Chèn liên kết",
            exact: true,
          })
          .click();
      });
    await page
      .getByRole("textbox", { name: "URL liên kết", exact: true })
      .fill("https://example.org/editor");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    assert.ok(
      (await editor.locator('a[href="https://example.org/editor"]').count()) >
        0,
    );
    await page
      .getByRole("combobox", { name: "Danh mục văn hóa", exact: true })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Tìm kiếm danh mục", exact: true })
      .fill("le hoi");
    await page
      .getByRole("option", { name: "Lễ hội", exact: true })
      .press("Enter");
    assert.equal(
      await page
        .getByRole("combobox", { name: "Danh mục văn hóa", exact: true })
        .textContent(),
      "Lễ hội",
    );
    let guardDialogs = 0;
    const cancel = (dialog) => {
      guardDialogs++;
      dialog.dismiss();
    };
    page.on("dialog", cancel);
    await page.getByRole("link", { name: "Hủy", exact: true }).click();
    assert.equal(guardDialogs, 1);
    assert.equal(
      await page.locator("#cf-title").inputValue(),
      "Synthetic independent culture",
    );
    page.off("dialog", cancel);
    page.on("dialog", cancel);
    if (await page.evaluate(() => !!window.navigation)) {
      await page.evaluate(() => history.pushState(null, "", "/dirty-history"));
      await page.evaluate(() => history.back());
      await page.waitForTimeout(100);
      assert.equal(new URL(page.url()).pathname, "/dirty-history");
      assert.equal(guardDialogs, 2);
      await page.evaluate(() => history.replaceState(null, "", "/"));
    }
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      true,
    );
    page.off("dialog", cancel);

    const original = await editor.innerHTML();
    await page
      .getByRole("button", { name: "Nguồn & quyền", exact: true })
      .click();
    assert.equal(await editor.innerHTML(), original);
    await page
      .getByRole("button", { name: "Xem trước hồ sơ", exact: true })
      .click();
    assert.ok(
      (await page
        .getByRole("article", { name: "Xem trước hồ sơ" })
        .locator("h2")
        .count()) > 0,
    );
    assert.equal(posts.length, 0);
    await page.getByRole("button", { name: "Thêm nguồn", exact: true }).click();
    await page
      .getByLabel("Tên nguồn *", { exact: false })
      .fill("Synthetic source");
    await page
      .getByLabel("Quyền lập chỉ mục cho hỏi đáp (RAG)", { exact: false })
      .selectOption("APPROVED");
    await page
      .getByRole("button", { name: "Tạo nội dung văn hóa", exact: true })
      .click();
    assert.equal(posts.length, 0);
    await page
      .getByLabel("Bằng chứng / quyết định quyền", { exact: false })
      .fill("Synthetic grant");
    await page.getByRole("button", { name: "Thêm ảnh", exact: true }).click();
    await page
      .getByLabel("URL ảnh *", { exact: false })
      .fill("https://127.0.0.1/private.jpg");
    assert.equal(
      await page.locator('img[src="https://127.0.0.1/private.jpg"]').count(),
      0,
    );
    await page
      .getByLabel("URL ảnh *", { exact: false })
      .fill("https://example.org/synthetic.jpg");
    await page
      .getByLabel("Mô tả ảnh cho trình đọc màn hình *", { exact: false })
      .fill("Synthetic image");
    await page.getByLabel("Ảnh đại diện", { exact: false }).check();

    for (const kind of ["culture", "destination"]) {
      if (kind === "destination") {
        await page.evaluate(() => window.mount("destination"));
        await page
          .locator("#destination-name")
          .fill("Synthetic destination with a long name to test wrapping");
        await page.locator("#destination-description").fill("Synthetic only");
        await page.locator("#destination-area").fill("Synthetic area");
        await page.locator("#destination-category").fill("Test");
        await page.locator("#destination-latitude").fill("23.1");
        await page.locator("#destination-longitude").fill("105.2");
        await page
          .getByLabel("Bằng chứng xác nhận vị trí pin", { exact: false })
          .fill("Synthetic map comparison");
        await page
          .getByLabel(
            "Tôi đã đối chiếu tọa độ/pin với bản đồ và ghi bằng chứng",
            { exact: false },
          )
          .check();
        await page.locator("#destination-latitude").fill("23.2");
        assert.equal(
          await page
            .getByLabel(
              "Tôi đã đối chiếu tọa độ/pin với bản đồ và ghi bằng chứng",
              { exact: false },
            )
            .isChecked(),
          false,
        );
        assert.equal(
          await page
            .getByLabel("Bằng chứng xác nhận vị trí pin", { exact: false })
            .inputValue(),
          "",
        );
        await page
          .getByText("Đã thay đổi tọa độ, cần xác nhận lại.", { exact: true })
          .waitFor();
        await page.getByRole("button", { name: /Mở bản đồ chọn pin/ }).click();
        await page.getByLabel("Offline pin preview").waitFor();
      }
      for (const width of [320, 360, 390, 768, 1280, 1440])
        for (const dark of [false, true]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(
            (d) => document.documentElement.classList.toggle("dark", d),
            dark,
          );
          await page.waitForTimeout(180);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path:
              web +
              "/.cache/admin-redesign-ui/after-" +
              kind +
              "-" +
              width +
              "-" +
              (dark ? "dark" : "light") +
              "-top.png",
          });
          await page
            .locator(kind === "culture" ? "#cf-visibility" : "#df-visibility")
            .scrollIntoViewIfNeeded();
          assert.equal(
            await page.evaluate(() => {
              const section = document.querySelector('[id$="-visibility"]');
              const actions = document.querySelector(".af-actions");
              return (
                section.getBoundingClientRect().top <
                actions.getBoundingClientRect().top
              );
            }),
            true,
          );
          await page.screenshot({
            path:
              web +
              "/.cache/admin-redesign-ui/after-" +
              kind +
              "-" +
              width +
              "-" +
              (dark ? "dark" : "light") +
              ".png",
            fullPage: true,
          });
        }
      if (kind === "culture") {
        mode = "unknown";
        await page
          .getByRole("button", { name: "Tạo nội dung văn hóa", exact: true })
          .evaluate(el => { el.click(); el.click(); });
        await page
          .getByRole("button", { name: "Đọc lại và thử lại", exact: true })
          .waitFor();
        assert.equal(await page.locator("#cf-title").isDisabled(), true);
        assert.equal(posts.length, 1);
        const lost = posts.at(-1);
        mode = "success";
        await page
          .getByRole("button", { name: "Đọc lại và thử lại", exact: true })
          .click();
        await page.waitForFunction(
          () => window.mockNavigation === "/admin/culture",
        );
        assert.deepEqual(posts.at(-1), lost);
        assert.equal(
          await page.evaluate(() => {
            const event = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
          }),
          false,
        );
        const payload = JSON.parse(lost.body);
        assert.deepEqual(payload.destinationIds, []);
        assert.ok(payload.content.startsWith("KLTN_RICH_TEXT_V1\n"));
        assert.equal(payload.profile.category, "le-hoi");
        assert.equal(payload.profile.areaIds.length, 3);
        assert.equal(payload.profile.communityIds.length, 2);
        assert.equal(payload.profile.sources[0].openAiRights, "UNKNOWN");
        assert.equal(payload.profile.media[0].websiteRights, "UNKNOWN");
        await page.evaluate(() => window.mount("culture", "legacy"));
        await page
          .getByRole("textbox", { name: "Nội dung văn hóa", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("textbox", { name: "Nội dung văn hóa", exact: true })
            .locator("h2")
            .textContent(),
          "Synthetic heading",
        );
        assert.equal(
          await page
            .getByRole("combobox", { name: "Danh mục văn hóa", exact: true })
            .textContent(),
          "Lễ hội",
        );
        const reopened = page.getByRole("textbox", {
          name: "Nội dung văn hóa",
          exact: true,
        });
        assert.equal(
          await reopened.locator("h3").textContent(),
          "Synthetic subheading",
        );
        assert.equal(
          await reopened.locator("ul li").textContent(),
          "Bullet item",
        );
        assert.ok(await reopened.locator("strong").count() > 0);
        assert.ok(await reopened.locator("em").count() > 0);
        assert.equal(await reopened.locator("ol").getAttribute("start"), "4");
        assert.equal(
          await reopened.locator("blockquote").textContent(),
          "Quote",
        );
        assert.ok(
          (await reopened
            .locator('a[href="https://example.org/editor"]')
            .count()) > 0,
        );
      } else {
        await page
          .getByRole("button", { name: "Tạo điểm đến", exact: true })
          .click();
        await page.waitForFunction(
          () => window.mockNavigation === "/admin/destinations",
        );
        assert.equal(
          JSON.parse(posts.at(-1).body).profile.locationVerified,
          false,
        );
      }
    }
    savedCulture = null;
    await page.evaluate(() => window.mount("culture", "legacy"));
    await page.locator("#cf-title").waitFor();
    assert.equal(await page.locator("#cf-title").inputValue(), "Legacy title");
    assert.equal(
      await page.getByLabel("Tên nguồn", { exact: false }).inputValue(),
      "Legacy source",
    );
    await page.locator("#cf-shortDescription").fill("Legacy extended");
    await page
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await page.waitForFunction(
      () => window.mockNavigation === "/admin/culture",
    );
    assert.equal(JSON.parse(posts.at(-1).body).sourceTitle, "Legacy source");
    assert.equal(JSON.parse(posts.at(-1).body).content, "Legacy content");
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.evaluate(() => window.mount("culture"));
    await page.locator("#cf-title").waitFor();
    const writeCount = posts.length;
    await page
      .getByRole("button", { name: "Tạo nội dung văn hóa", exact: true })
      .click();
    await page.waitForFunction(() => document.activeElement?.id === "cf-title");
    assert.equal(posts.length, writeCount);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: web + "/.cache/admin-redesign-ui/after-culture-mobile-top.png",
    });
  }
  if (!process.env.ADMIN_UI_BASELINE)
    console.log(
      "ADMIN_UI=PASS: create/edit legacy, multi-area/community, independent culture, rights evidence validation, sources/media defaults, coordinate verification invalidation, pin preview, UNKNOWN same-key retry, 320/360/390/768/1280/1440 light/dark overflow; rich formatting/paste/link/undo/roundtrip, category keyboard search, dirty cancel, first-error focus, previews, sticky final controls, no live backend/provider.",
    );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
