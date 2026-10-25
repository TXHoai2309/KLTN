// Production form -> planner -> confirmation -> save in an offline browser.
// Review confirmation, Next navigation and the map are isolated adapters.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules")] }));
const root = fileURLToPath(new URL("..", import.meta.url));
const output = process.env.QA_TRIP_SAVE_OUTPUT;
const bundle = await build({
  absWorkingDir: root, entryPoints: [join(root, "development/trip-save-recovery-fixture.tsx")], bundle: true, write: false, outdir: "memory", platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "offline-adapters", setup(plugin) {
    plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    plugin.onResolve({ filter: /^\.\/itinerary-map$/ }, () => ({ path: "map", namespace: "fixture" }));
    plugin.onResolve({ filter: /^\.\/trip-review-screen$/ }, () => ({ path: "review", namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "tsx", resolveDir: root, contents:
      path === "navigation" ? 'export const useRouter=()=>({replace:href=>window.tripSaveFixture.navigations.push(href)});' :
      path === "link" ? 'export default function Link({children,...props}){return <a {...props}>{children}</a>}' :
      path === "map" ? 'export function ItineraryMap(){return <div aria-label="Bản đồ kiểm thử"/>}' :
      `import { buildPayload } from "./src/modules/trip-requirement/trip-requirement-form-logic"; import { tripRequirementInputSchema } from "./src/modules/trip-requirement/trip-requirement-contract";
      export default function Review({draft,onConfirmed}){return <button onClick={()=>onConfirmed({requirement:tripRequirementInputSchema.parse(buildPayload({startDate:"2027-01-01",durationDays:"2",transport:"MOTORCYCLE",companionType:"",companionGroupSize:"",interests:[],pace:"",mobilityFlags:[],mobilityNote:""})),usesRelativeDays:false,eligibleForFinalConfirmation:true,warnings:[],checkedAt:"2026-10-21T00:00:00Z"},draft)}>TEST xác nhận nhu cầu</button>}`,
    }));
    // Seed valid input only; all form handlers and save lifecycle remain real.
    plugin.onLoad({ filter: /trip-requirement-form\.tsx$/ }, async ({ path }) => ({ loader: "tsx", resolveDir: join(root, "src/app/trips/new"), contents: (await readFile(path, "utf8")).replace("useState<TripRequirementFormFields>(INITIAL_FIELDS)", 'useState<TripRequirementFormFields>({...INITIAL_FIELDS,startDate:"2027-01-01",durationDays:"2",transport:"MOTORCYCLE"})') }));
  } }],
});
const assets = new Map(bundle.outputFiles.map(file => [file.path.endsWith(".js") ? "/fixture.js" : "/fixture.css", file.contents]));
const html = '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline Trip Save recovery</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0}*{box-sizing:border-box}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>';
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  const url = "http://127.0.0.1:3011";
  // Fulfill every fixture asset in memory; no local/network connection required.
  await page.route("**/*", route => {
    const target = new URL(route.request().url());
    if (target.origin !== url) return route.abort();
    const asset = assets.get(target.pathname);
    return route.fulfill({ contentType: asset ? target.pathname.endsWith(".js") ? "text/javascript" : "text/css" : "text/html; charset=utf-8", body: asset ? Buffer.from(asset) : html });
  });
  async function load() {
    await page.goto(url);
    await page.getByRole("button", { name: "Bỏ qua và nhập bằng biểu mẫu" }).click();
    await page.getByRole("button", { name: "Xem lại và tạo lịch trình", exact: true }).click();
    await page.getByRole("button", { name: "TEST xác nhận nhu cầu" }).click();
    await page.getByRole("button", { name: "Tạo lịch trình đề xuất", exact: true }).click();
    await page.getByRole("button", { name: "Lưu chuyến đi", exact: true }).waitFor().catch(async error => {
      console.error({ errors, fixtureText: (await page.locator("body").innerText()).slice(-1800) });
      throw error;
    });
    await page.waitForFunction(() => !document.querySelector('.planner-confirmation button.planner-primary[disabled]'));
  }
  await load();
  await page.getByRole("button", { name: "Lưu chuyến đi", exact: true }).click();
  await page.waitForFunction(() => window.tripSaveFixture.requests.length === 1);
  assert.equal(await page.getByRole("tab", { name: /2\. Bổ sung/ }).isDisabled(), true, "pending Save must lock outer steps");
  await page.evaluate(() => { document.getElementById("trip-tab-details").click(); });
  assert.equal(await page.locator("#trip-tabpanel-planner").isVisible(), true);
  await page.evaluate(() => window.tripSaveFixture.release());
  await page.getByRole("button", { name: "Kiểm tra lại kết quả lưu", exact: true }).waitFor();
  assert.equal(await page.getByRole("tab", { name: /2\. Bổ sung/ }).isDisabled(), true, "UNKNOWN must lock outer steps");
  await page.evaluate(() => {
    document.getElementById("trip-tab-details").click();
    const input = document.getElementById("trip-duration");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "3");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.getByRole("button", { name: "Kiểm tra lại kết quả lưu", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Kiểm tra lại kết quả lưu", exact: true }).click();
  await page.waitForFunction(() => window.tripSaveFixture.requests.length === 2);
  const attempts = await page.evaluate(() => window.tripSaveFixture.requests);
  assert.ok(attempts[0].key);
  assert.deepEqual(attempts[1], attempts[0], "retry must retain identical key and payload");
  await page.evaluate(() => { window.tripSaveFixture.mode = "success"; window.tripSaveFixture.release(); });
  await page.waitForFunction(() => window.tripSaveFixture.navigations.includes("/trips"));
  assert.equal((await page.evaluate(() => window.tripSaveFixture.navigations)).length, 1);
  // An earlier evaluation must not discard a Save that started while it waited.
  await load();
  await page.evaluate(() => { window.tripSaveFixture.deferEvaluation = true; });
  await page.getByRole("tab", { name: /2\. Bổ sung/ }).click();
  await page.getByRole("button", { name: "Xem lại và tạo lịch trình", exact: true }).click();
  await page.getByRole("tab", { name: /4\. Đề xuất/ }).click();
  await page.getByRole("button", { name: "Lưu chuyến đi", exact: true }).click();
  await page.waitForFunction(() => window.tripSaveFixture.requests.length === 1);
  await page.evaluate(() => window.tripSaveFixture.releaseEvaluation());
  await page.waitForFunction(() => window.tripSaveFixture.completedEvaluations === 2);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByText("Đang xác nhận và lưu chuyến đi…", { exact: true }).isVisible(), true, "late evaluation must retain the pending save");
  await page.evaluate(() => window.tripSaveFixture.release());
  await page.getByRole("button", { name: "Kiểm tra lại kết quả lưu", exact: true }).waitFor();
  await load();
  await page.getByRole("button", { name: "Lưu chuyến đi", exact: true }).click();
  await page.waitForFunction(() => window.tripSaveFixture.requests.length === 1);
  await page.evaluate(() => { window.tripSaveFixture.mode = "failed"; window.tripSaveFixture.release(); });
  await page.getByText("TEST cần kiểm tra lại.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("tab", { name: /2\. Bổ sung/ }).isEnabled(), true, "known failure must release navigation");
  await page.getByRole("tab", { name: /2\. Bổ sung/ }).click();
  await page.locator("#trip-duration").fill("3");
  assert.equal(await page.getByRole("tab", { name: /4\. Đề xuất/ }).isDisabled(), true);
  for (const width of [360, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 });
    await load();
    await page.evaluate(value => { document.documentElement.classList.toggle("dark", value === "dark"); document.documentElement.style.colorScheme = value; }, theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${theme} overflow`);
    if (output) { await mkdir(output, { recursive: true }); await page.locator(".planner-confirmation").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, `trip-save-${width}-${theme}.png`) }); }
  }
  assert.deepEqual(errors, []);
  console.log("PASS: pending/UNKNOWN navigation guards, blocked edits, identical retry, confirmed /trips navigation, FAILED recovery, 360/1440 Light/Dark");
} finally {
  await browser?.close();
}
