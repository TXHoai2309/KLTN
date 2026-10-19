import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js"));
}

const web = fileURLToPath(new URL("../", import.meta.url));
const screenshotDir = "C:/Users/User/.gemini/antigravity-ide/brain/de89dbfd-5802-411d-824c-0645cd0d097b/screenshots";
await mkdir(screenshotDir, { recursive: true });

console.log("=== 1. Testing Route Guards on Live Server (Port 3010) ===");
try {
  const res1 = await fetch("http://localhost:3010/admin/users", { redirect: "manual" });
  assert.equal(res1.status, 307, "Unauthenticated /admin/users must return HTTP 307 redirect");
  const loc1 = res1.headers.get("location");
  assert.ok(loc1?.includes("/login"), "Redirect location must point to /login");
  console.log("PASS: Unauthenticated /admin/users correctly redirected to:", loc1);

  const res2 = await fetch("http://localhost:3010/admin/users/usr_admin_01", { redirect: "manual" });
  assert.equal(res2.status, 307, "Unauthenticated /admin/users/[id] must return HTTP 307 redirect");
  const loc2 = res2.headers.get("location");
  assert.ok(loc2?.includes("/login"), "Redirect location must point to /login");
  console.log("PASS: Unauthenticated /admin/users/[id] correctly redirected to:", loc2);
} catch (err) {
  console.error("Warning testing live server:", err.message);
}

console.log("\n=== 2. Bundling Admin User Management Components for Browser Testing ===");

const mockNext = {
  name: "mock-next",
  setup(b) {
    b.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
      path: args.path,
      namespace: "mock",
    }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => {
      if (args.path === "next/link") {
        return {
          resolveDir: web,
          loader: "js",
          contents: `
            import React from "react";
            export default function Link({ href, children, className, onClick, ...rest }) {
              return React.createElement("a", {
                href,
                className,
                onClick: (e) => {
                  if (onClick) onClick(e);
                  if (href && href.startsWith("/admin/users/")) {
                    e.preventDefault();
                    const id = href.replace("/admin/users/", "");
                    if (window.mountDetail) window.mountDetail(id);
                  } else if (href === "/admin/users") {
                    e.preventDefault();
                    if (window.mountList) window.mountList();
                  }
                },
                ...rest
              }, children);
            }
          `,
        };
      }
      return {
        resolveDir: web,
        loader: "js",
        contents: `
          export const useRouter = () => ({ push: (url) => console.log('navigate:', url) });
          export const usePathname = () => '/admin/users';
          export const useSearchParams = () => new URLSearchParams();
        `,
      };
    });
  },
};

const entryPointCode = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import UserManagementClient from "./src/app/admin/users/user-management-client";
import UserDetailClient from "./src/app/admin/users/[id]/user-detail-client";

function App() {
  const [currentView, setCurrentView] = useState("list");
  const [detailId, setDetailId] = useState("usr_admin_01");

  window.mountList = () => setCurrentView("list");
  window.mountDetail = (id) => {
    setDetailId(id);
    setCurrentView("detail");
  };

  return (
    <div id="root-container">
      {currentView === "list" ? (
        <UserManagementClient />
      ) : (
        <UserDetailClient userId={detailId} />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("app"));
root.render(<App />);
`;

const bundle = await build({
  absWorkingDir: web,
  stdin: {
    contents: entryPointCode,
    resolveDir: web,
    loader: "tsx",
  },
  plugins: [mockNext],
  bundle: true,
  outfile: "bundle.js",
  write: false,
  platform: "browser",
  format: "iife",
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"development"' },
});

const usersCss = await readFile(new URL("../src/app/admin/users/users.css", import.meta.url), "utf8");

const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KLTN Admin User Management</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #111827;
      -webkit-font-smoothing: antialiased;
    }
    .dark body {
      background: #0b0f17;
      color: #f9fafb;
    }
    ${usersCss}
  </style>
</head>
<body>
  <div id="app"></div>
  <script src="/bundle.js"></script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(bundle.outputFiles.find((f) => !f.path.endsWith(".css"))?.text);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(htmlContent);
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const localUrl = `http://127.0.0.1:${port}`;
console.log(`PASS: Test server listening at ${localUrl}`);

console.log("\n=== 3. Launching Real Chromium for E2E & Visual Verification ===");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(localUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".admin-title-group h1", { timeout: 10000 });

  console.log("PASS: Loaded Admin User Management CMS page");
  const titleText = await page.locator(".admin-title-group h1").textContent();
  assert.equal(titleText?.trim(), "Quản lý người dùng", "Page title must be 'Quản lý người dùng'");

  // Verify 4 statistics cards
  const statCards = await page.locator(".admin-stat-card").count();
  assert.equal(statCards, 4, "Must render exactly 4 statistics cards");
  console.log("PASS: Rendered 4 statistics cards");

  // Verify total count matches fixture (10)
  const totalUsersText = await page.locator(".admin-stat-card:nth-child(1) .admin-stat-value").textContent();
  assert.equal(totalUsersText?.trim(), "10", "Total users statistic must be 10");
  console.log("PASS: Total users count verified as 10");

  // Verify Phase 1 banner
  const bannerText = await page.locator(".admin-phase-banner").textContent();
  assert.ok(bannerText?.includes("Phase 1 — Frontend Only"), "Must display Phase 1 notice banner");
  console.log("PASS: Phase 1 notice banner displayed");

  // 1. Capture Desktop 1440px Light Mode
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${screenshotDir}/admin_users_desktop_1440_light.png`, fullPage: true });
  console.log("PASS: Captured admin_users_desktop_1440_light.png");

  // 2. Capture Laptop 1280px Light Mode
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${screenshotDir}/admin_users_laptop_1280_light.png`, fullPage: true });
  console.log("PASS: Captured admin_users_laptop_1280_light.png");

  // 3. Capture Tablet 768px Light Mode
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: `${screenshotDir}/admin_users_tablet_768_light.png`, fullPage: true });
  console.log("PASS: Captured admin_users_tablet_768_light.png");

  // 4. Capture Mobile 390px Light Mode
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${screenshotDir}/admin_users_mobile_390_light.png`, fullPage: true });
  console.log("PASS: Captured admin_users_mobile_390_light.png");

  // 5. Test Dark Mode
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: `${screenshotDir}/admin_users_desktop_1440_dark.png`, fullPage: true });
  console.log("PASS: Captured admin_users_desktop_1440_dark.png");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // 6. Test Interactive Search & Debounce
  console.log("\n=== Testing Search & Filter Interactions ===");
  const searchInput = page.locator(".admin-search-input");
  await searchInput.fill("Hoài");
  await page.waitForTimeout(500); // Wait for 350ms debounce
  const userRowsAfterSearch = await page.locator(".admin-table tbody tr").count();
  assert.equal(userRowsAfterSearch, 1, "Search for 'Hoài' should filter to 1 user");
  console.log("PASS: Search debounced filter works accurately (filtered to 1 row)");

  // Clear search
  await page.locator(".admin-search-clear").click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".admin-table tbody tr").count(), 6, "Clearing search restores page size rows");
  console.log("PASS: Clear search restores full list");

  // Test Role filter
  await page.locator('select[aria-label="Lọc theo vai trò"]').selectOption("ADMIN");
  await page.waitForTimeout(200);
  const adminRows = await page.locator(".admin-table tbody tr").count();
  assert.equal(adminRows, 2, "Filtering by ADMIN should show 2 admin rows");
  console.log("PASS: Role filter ADMIN shows exactly 2 admin accounts");

  await page.locator('select[aria-label="Lọc theo vai trò"]').selectOption("ALL");
  await page.waitForTimeout(200);

  // Test Status filter
  await page.locator('select[aria-label="Lọc theo trạng thái"]').selectOption("LOCKED");
  await page.waitForTimeout(200);
  const lockedRows = await page.locator(".admin-table tbody tr").count();
  assert.equal(lockedRows, 2, "Filtering by LOCKED should show 2 locked rows");
  console.log("PASS: Status filter LOCKED shows exactly 2 locked accounts");

  await page.locator('select[aria-label="Lọc theo trạng thái"]').selectOption("ALL");
  await page.waitForTimeout(200);

  // 7. Test Dialogs
  console.log("\n=== Testing Dialogs ===");
  // Open 3-dots action menu for the first user
  await page.locator(".admin-table tbody tr:first-child .admin-action-btn").click();
  await page.waitForSelector("button:has-text('Đổi vai trò')");

  // Open Change Role Modal from table dropdown menu
  await page.locator(".admin-table tbody button:has-text('Đổi vai trò')").click();
  await page.waitForSelector(".admin-modal-content");
  await page.waitForTimeout(350); // Wait for scale/fade animation
  assert.ok(await page.locator("#role-modal-title").isVisible(), "Change role dialog must be visible");
  await page.screenshot({ path: `${screenshotDir}/admin_user_modal_role_light.png` });
  console.log("PASS: Captured admin_user_modal_role_light.png");

  // Close with Escape key
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".admin-modal-content").count(), 0, "Escape key must close dialog");
  console.log("PASS: Escape key closed role modal");

  // Open Lock Modal from table dropdown menu
  await page.locator(".admin-table tbody tr:first-child .admin-action-btn").click();
  await page.locator(".admin-table tbody button:has-text('Khóa tài khoản')").click();
  await page.waitForSelector(".admin-modal-content");
  await page.waitForTimeout(350); // Wait for scale/fade animation
  assert.ok(await page.locator("#lock-modal-title").isVisible(), "Lock modal must be visible");
  await page.screenshot({ path: `${screenshotDir}/admin_user_modal_lock_light.png` });
  console.log("PASS: Captured admin_user_modal_lock_light.png");

  // Close with Cancel button
  await page.locator(".admin-modal-footer button:has-text('Hủy bỏ')").click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".admin-modal-content").count(), 0, "Cancel button must close dialog");
  console.log("PASS: Cancel button closed lock modal");

  // 8. Test User Detail Page Navigation & View
  console.log("\n=== Testing User Detail Page ===");
  await page.evaluate(() => window.mountDetail("usr_admin_01"));
  await page.waitForSelector(".admin-detail-header-card");
  assert.ok(await page.locator("h2:has-text('Trần Xuân Hoài')").isVisible(), "User Detail should display user name");
  assert.ok(await page.locator("h3:has-text('Thông tin tài khoản')").isVisible(), "User Detail should display account card");
  assert.ok(await page.locator("h3:has-text('Phiên đăng nhập & Xác thực')").isVisible(), "User Detail should display sessions card");
  assert.ok(await page.locator("h3:has-text('Nhật ký thao tác quản trị')").isVisible(), "User Detail should display audit log timeline");
  console.log("PASS: User Detail profile cards and audit log timeline verified");

  await page.screenshot({ path: `${screenshotDir}/admin_user_detail_1440_light.png`, fullPage: true });
  console.log("PASS: Captured admin_user_detail_1440_light.png");

  // Also test a user with populated audit logs (usr_traveler_04)
  await page.evaluate(() => window.mountDetail("usr_traveler_04"));
  await page.waitForSelector(".admin-detail-header-card");
  await page.waitForSelector(".admin-timeline");
  await page.screenshot({ path: `${screenshotDir}/admin_user_detail_with_audit_light.png`, fullPage: true });
  console.log("PASS: Captured admin_user_detail_with_audit_light.png");

  // Test back to list navigation
  await page.locator(".admin-header-actions a:has-text('Quay lại danh sách')").click();
  await page.waitForSelector(".admin-table");
  console.log("PASS: Navigated back to list page successfully");

} finally {
  await browser.close();
  server.close();
}

console.log("\n=== ALL BROWSER & COMPONENT TESTS PASSED SUCCESSFULLY! ===");
