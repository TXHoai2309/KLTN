import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js");

const outDir = "C:/Users/User/.gemini/antigravity-ide/brain/66b6eb54-6273-4fcd-a7fa-d4960f6dda1d/screenshots";
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log("=== STARTING HEADER & NAVIGATION E2E VERIFICATION ===");
  const browser = await chromium.launch({ headless: true });
  let hasError = false;

  const viewports = [
    { name: "mobile_375", width: 375, height: 812, isMobile: true },
    { name: "mobile_390", width: 390, height: 844, isMobile: true },
    { name: "tablet_portrait_768", width: 768, height: 1024, isMobile: true },
    { name: "tablet_landscape_1024", width: 1024, height: 768, isMobile: true },
    { name: "desktop_small_1280", width: 1280, height: 800, isMobile: false },
    { name: "desktop_standard_1440", width: 1440, height: 900, isMobile: false },
    { name: "desktop_wide_1920", width: 1920, height: 1080, isMobile: false },
  ];

  // 1. Viewports & Overflow verification + After screenshots
  console.log("\n--- Checking Viewports & No Horizontal Overflow ---");
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });

    // Check header dimensions
    const headerBox = await page.$eval(".site-header", el => {
      const rect = el.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });

    // Check horizontal scrollbar
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): Header height = ${headerBox.height.toFixed(1)}px, Width = ${headerBox.width.toFixed(1)}px, Overflow = ${hasHorizontalOverflow}`);

    if (hasHorizontalOverflow) {
      console.error(`ERROR: Horizontal overflow detected on ${vp.name}!`);
      hasError = true;
    }

    if (vp.name === "desktop_standard_1440" || vp.name === "tablet_portrait_768" || vp.name === "mobile_375") {
      const header = await page.$(".site-header");
      if (header) {
        await header.screenshot({ path: path.join(outDir, `header_after_${vp.name}.png`) });
      }
      await page.screenshot({ path: path.join(outDir, `page_after_${vp.name}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(300, vp.height) } });
      console.log(`Saved after screenshot for ${vp.name}`);
    }

    await page.close();
  }

  // 2. Desktop Navigation Functionality & Active States
  console.log("\n--- Checking Desktop Navigation Functionality (1440x900) ---");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });

    // Verify brand logo links to /
    const brandHref = await page.$eval(".site-brand", el => el.getAttribute("href"));
    console.log(`Brand link href: ${brandHref} (expected: /)`);
    if (brandHref !== "/") {
      console.error("ERROR: Brand link does not point to /");
      hasError = true;
    }

    // Verify all nav links in .site-nav
    const navLinks = await page.$$eval(".site-nav .site-nav-link", links =>
      links.map(l => ({
        label: l.querySelector("span")?.textContent?.trim() || l.textContent?.trim(),
        href: l.getAttribute("href"),
        active: l.getAttribute("data-active"),
        ariaCurrent: l.getAttribute("aria-current")
      }))
    );
    console.log("Desktop Navigation Links on Home:", JSON.stringify(navLinks, null, 2));

    const homeLink = navLinks.find(l => l.href === "/");
    if (!homeLink || homeLink.active !== "true" || homeLink.ariaCurrent !== "page") {
      console.error("ERROR: Home link is not active on /");
      hasError = true;
    }

    // Navigate to /explore
    await page.click('.site-nav a[href="/explore"]');
    await page.waitForURL("**/explore");
    const exploreActive = await page.$eval('.site-nav a[href="/explore"]', el => ({
      active: el.getAttribute("data-active"),
      ariaCurrent: el.getAttribute("aria-current")
    }));
    console.log("Navigated to /explore, active status:", exploreActive);
    if (exploreActive.active !== "true" || exploreActive.ariaCurrent !== "page") {
      console.error("ERROR: /explore link is not active on /explore");
      hasError = true;
    }

    // Navigate to /assistant
    await page.click('.site-nav a[href="/assistant"]');
    await page.waitForURL("**/assistant");
    const assistantActive = await page.$eval('.site-nav a[href="/assistant"]', el => ({
      active: el.getAttribute("data-active"),
      ariaCurrent: el.getAttribute("aria-current")
    }));
    console.log("Navigated to /assistant, active status:", assistantActive);
    if (assistantActive.active !== "true" || assistantActive.ariaCurrent !== "page") {
      console.error("ERROR: /assistant link is not active on /assistant");
      hasError = true;
    }

    // Check Assistant page scroll: verify no double scrollbars
    const assistantScrolls = await page.evaluate(() => {
      const docScroll = document.documentElement.scrollHeight > window.innerHeight;
      const bodyScroll = document.body.scrollHeight > window.innerHeight;
      return { docScroll, bodyScroll, winHeight: window.innerHeight, docHeight: document.documentElement.scrollHeight };
    });
    console.log("Assistant page scroll metrics:", assistantScrolls);

    await page.close();
  }

  // 3. Mobile Navigation Drawer & Interactions (375x812)
  console.log("\n--- Checking Mobile Navigation Drawer (375x812) ---");
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });

    // Drawer should initially be hidden
    const drawerInitialHidden = await page.$eval("#site-mobile-drawer", el =>
      window.getComputedStyle(el).visibility === "hidden" || el.getAttribute("aria-hidden") === "true"
    );
    console.log("Drawer initially hidden:", drawerInitialHidden);

    // Click Hamburger button to open
    const toggleBtn = await page.$(".site-mobile-toggle");
    if (!toggleBtn) {
      console.error("ERROR: .site-mobile-toggle not found on 375px mobile!");
      hasError = true;
    } else {
      await toggleBtn.click();
      await page.waitForTimeout(350);

      // Drawer should now be visible
      const drawerOpen = await page.$eval("#site-mobile-drawer", el =>
        el.classList.contains("site-mobile-drawer-open") && window.getComputedStyle(el).visibility === "visible"
      );
      console.log("Drawer open after toggle click:", drawerOpen);
      if (!drawerOpen) {
        console.error("ERROR: Drawer failed to open!");
        hasError = true;
      }

      // Check body scroll lock
      const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
      console.log("Body overflow when drawer open:", bodyOverflow);
      if (bodyOverflow !== "hidden") {
        console.error("ERROR: Body overflow should be hidden while drawer is open!");
        hasError = true;
      }

      // Capture drawer screenshot
      await page.screenshot({ path: path.join(outDir, "header_mobile_drawer_open.png") });
      console.log("Saved mobile drawer screenshot");

      // Test close button
      await page.click(".site-mobile-drawer-close");
      await page.waitForTimeout(350);
      const drawerClosed = await page.$eval("#site-mobile-drawer", el =>
        !el.classList.contains("site-mobile-drawer-open")
      );
      const bodyOverflowAfterClose = await page.evaluate(() => document.body.style.overflow);
      console.log("Drawer closed after X button:", drawerClosed, "Body overflow restored:", bodyOverflowAfterClose);

      // Re-open and test Escape key
      await page.click(".site-mobile-toggle");
      await page.waitForTimeout(350);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
      const drawerClosedEsc = await page.$eval("#site-mobile-drawer", el =>
        !el.classList.contains("site-mobile-drawer-open")
      );
      console.log("Drawer closed after Escape key:", drawerClosedEsc);

      // Re-open and test navigation link click & auto-close
      await page.click(".site-mobile-toggle");
      await page.waitForTimeout(350);
      await page.click('.site-mobile-nav a[href="/explore"]');
      await page.waitForURL("**/explore");
      await page.waitForTimeout(350);
      const drawerClosedNav = await page.$eval("#site-mobile-drawer", el =>
        !el.classList.contains("site-mobile-drawer-open")
      );
      console.log("Drawer closed after navigation link click:", drawerClosedNav);
    }

    await page.close();
  }

  // 4. Dark Mode & Light Mode Visual Appearance
  console.log("\n--- Checking Dark Mode & Theme Toggle ---");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });

    // Open Theme toggle dropdown
    await page.click(".site-header .site-theme-toggle");
    await page.waitForTimeout(200);

    // Click "Tối" (Dark)
    const darkOption = await page.$('text="Tối"');
    if (darkOption) {
      await darkOption.click();
      await page.waitForTimeout(300);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      console.log("Switched to Dark Mode, document has 'dark':", isDark);

      // Capture dark mode screenshot
      const header = await page.$(".site-header");
      if (header) {
        await header.screenshot({ path: path.join(outDir, "header_after_dark_desktop_1440.png") });
        console.log("Saved dark mode screenshot");
      }
    }

    // Switch back to "Sáng" (Light)
    await page.click(".site-header .site-theme-toggle");
    await page.waitForTimeout(200);
    const lightOption = await page.$('text="Sáng"');
    if (lightOption) {
      await lightOption.click();
      await page.waitForTimeout(300);
      const isLight = await page.evaluate(() => !document.documentElement.classList.contains("dark"));
      console.log("Switched back to Light Mode:", isLight);
    }

    await page.close();
  }

  // 5. Browser Zoom 125% and 150% Verification
  console.log("\n--- Checking Zoom 125% and 150% ---");
  for (const zoom of [1.25, 1.5]) {
    const page = await browser.newPage({
      viewport: { width: Math.round(1280 / zoom), height: Math.round(800 / zoom) }
    });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`Zoom ${zoom * 100}% effective width ${Math.round(1280 / zoom)}px: Horizontal overflow = ${overflow}`);
    if (overflow) {
      console.error(`ERROR: Horizontal overflow on zoom ${zoom * 100}%!`);
      hasError = true;
    }
    await page.close();
  }

  await browser.close();

  if (hasError) {
    console.error("\n=== SOME TESTS FAILED ===");
    process.exit(1);
  } else {
    console.log("\n=== ALL HEADER & NAVIGATION VERIFICATION TESTS PASSED! ===");
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
