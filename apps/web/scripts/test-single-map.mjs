import { createRequire } from "module";
import fs from "fs";
import path from "path";
import http from "http";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js"));
}

const outDir = "C:/Users/User/.gemini/antigravity-ide/brain/de89dbfd-5802-411d-824c-0645cd0d097b/screenshots";
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function checkServerReady(url, maxTries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          clearInterval(interval);
          resolve(true);
        }
      }).on("error", () => {
        if (tries >= maxTries) {
          clearInterval(interval);
          reject(new Error(`Server at ${url} did not respond within ${maxTries} seconds.`));
        }
      });
    }, 1000);
  });
}

async function run() {
  console.log("=== STARTING SINGLE MAP SECTION VERIFICATION ===");
  const targetUrl = "http://localhost:3010";

  console.log(`Checking if server is running at ${targetUrl}...`);
  await checkServerReady(targetUrl);
  console.log("Server is ready!");

  const browser = await chromium.launch({ headless: true });
  let hasError = false;

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(targetUrl, { waitUntil: "networkidle" });

  // 1. Verify Bento Grid is REMOVED
  console.log("\n--- Verifying Bento Grid Removal ---");
  const bentoExists = await page.$(".home-destinations-bento");
  const bentoCards = await page.$$(".home-dest-card");
  const secondaryCol = await page.$(".home-dest-secondary-col");
  const staticMapImg = await page.$(".home-explore img[src*='ha-giang-map-card.webp']");

  if (bentoExists) {
    console.error("FAIL: .home-destinations-bento still exists!");
    hasError = true;
  } else {
    console.log("PASS: .home-destinations-bento is completely removed.");
  }

  if (bentoCards.length > 0) {
    console.error(`FAIL: Found ${bentoCards.length} .home-dest-card elements!`);
    hasError = true;
  } else {
    console.log("PASS: No individual .home-dest-card elements exist.");
  }

  if (secondaryCol) {
    console.error("FAIL: .home-dest-secondary-col still exists!");
    hasError = true;
  } else {
    console.log("PASS: .home-dest-secondary-col is removed.");
  }

  if (staticMapImg) {
    console.error("FAIL: Static image ha-giang-map-card.webp was found in .home-explore!");
    hasError = true;
  } else {
    console.log("PASS: No static satellite image used in .home-explore.");
  }

  // 2. Verify Single Large Map is PRESENT
  console.log("\n--- Verifying Single Large Interactive Map ---");
  const mapCard = await page.$(".home-explore-map-card");
  if (!mapCard) {
    console.error("FAIL: .home-explore-map-card not found!");
    hasError = true;
  } else {
    console.log("PASS: .home-explore-map-card is rendered.");
  }

  // Scroll map into view to trigger lazy loading
  await page.evaluate(() => {
    const el = document.querySelector(".home-explore");
    if (el) el.scrollIntoView({ behavior: "instant" });
  });

  // Wait for map canvas or markers
  console.log("Waiting for MapLibre map and markers to mount...");
  await page.waitForTimeout(2000);

  const mapCanvas = await page.$(".destination-map-canvas");
  if (mapCanvas) {
    console.log("PASS: .destination-map-canvas mounted.");
  } else {
    console.warn("WARNING: .destination-map-canvas not yet mounted; checking skeleton...");
  }

  // Check Badge
  const badge = await page.$(".home-map-status-badge");
  if (badge) {
    const badgeText = await badge.textContent();
    console.log(`PASS: Badge rendered with text: "${badgeText.trim()}"`);
  } else {
    console.error("FAIL: .home-map-status-badge not found!");
    hasError = true;
  }

  // Check single CTA
  const cta = await page.$(".home-explore-footer .home-map-cta-pill");
  if (cta) {
    const ctaText = await cta.textContent();
    const ctaHref = await cta.getAttribute("href");
    console.log(`PASS: Section CTA rendered with text "${ctaText.trim()}" and href "${ctaHref}"`);
    if (ctaHref !== "/explore?view=map") {
      console.error(`FAIL: Expected href /explore?view=map, got ${ctaHref}`);
      hasError = true;
    }
  } else {
    console.error("FAIL: .home-explore-footer .home-map-cta-pill not found!");
    hasError = true;
  }

  // Wait up to 6s for markers
  let markers = [];
  for (let i = 0; i < 12; i++) {
    markers = await page.$$(".destination-map-marker");
    if (markers.length > 0) break;
    await page.waitForTimeout(500);
  }
  console.log(`Found ${markers.length} destination markers on the live map.`);

  if (markers.length > 0) {
    console.log("PASS: Live markers successfully loaded on MapLibre!");
    // Click first marker to test popup
    await markers[0].click();
    await page.waitForTimeout(600);
    const popup = await page.$(".maplibregl-popup");
    if (popup) {
      const popupText = await popup.textContent();
      console.log(`PASS: Marker popup opened successfully with content: "${popupText.trim()}"`);
      const section = await page.$(".home-explore");
      if (section) {
        await section.screenshot({
          path: path.join(outDir, "section_explore_popup_1440_light.png"),
        });
        console.log("Saved: section_explore_popup_1440_light.png");
      }
    } else {
      console.warn("Popup did not open immediately.");
    }
  }

  await page.close();

  // 3. Capturing Screenshots across required viewports: 1440px, 768px, 390px (Light & Dark)
  console.log("\n--- Capturing Screenshots ---");
  const viewports = [
    { name: "desktop_1440", width: 1440, height: 900 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "mobile_390", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    // Light mode
    const lightPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await lightPage.goto(targetUrl, { waitUntil: "networkidle" });
    await lightPage.evaluate(() => {
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
      const el = document.querySelector(".home-explore");
      if (el) el.scrollIntoView({ behavior: "instant" });
    });
    await lightPage.waitForTimeout(2500);

    // Section screenshot
    const sectionLight = await lightPage.$(".home-explore");
    if (sectionLight) {
      await sectionLight.screenshot({
        path: path.join(outDir, `section_explore_${vp.name}_light.png`),
      });
      console.log(`Saved: section_explore_${vp.name}_light.png`);
    }

    // Full page screenshot
    await lightPage.screenshot({
      path: path.join(outDir, `homepage_${vp.name}_light.png`),
      fullPage: true,
    });
    console.log(`Saved: homepage_${vp.name}_light.png`);

    // Dark mode
    const darkPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await darkPage.goto(targetUrl, { waitUntil: "networkidle" });
    await darkPage.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
      const el = document.querySelector(".home-explore");
      if (el) el.scrollIntoView({ behavior: "instant" });
    });
    await darkPage.waitForTimeout(2500);

    const sectionDark = await darkPage.$(".home-explore");
    if (sectionDark) {
      await sectionDark.screenshot({
        path: path.join(outDir, `section_explore_${vp.name}_dark.png`),
      });
      console.log(`Saved: section_explore_${vp.name}_dark.png`);
    }

    await darkPage.screenshot({
      path: path.join(outDir, `homepage_${vp.name}_dark.png`),
      fullPage: true,
    });
    console.log(`Saved: homepage_${vp.name}_dark.png`);

    await lightPage.close();
    await darkPage.close();
  }

  await browser.close();

  if (hasError) {
    console.error("\n❌ SINGLE MAP VERIFICATION COMPLETED WITH ERRORS.");
    process.exit(1);
  } else {
    console.log("\n✅ SINGLE MAP VERIFICATION COMPLETED SUCCESSFULLY!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
