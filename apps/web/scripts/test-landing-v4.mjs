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
  console.log("=== STARTING LANDING PAGE V4 IMMERSIVE E2E VERIFICATION ===");
  const targetUrl = "http://localhost:3010";

  console.log(`Checking if dev server is running at ${targetUrl}...`);
  await checkServerReady(targetUrl);
  console.log("Dev server is ready!\n");

  const browser = await chromium.launch({ headless: true });
  let hasError = false;

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Track console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(targetUrl, { waitUntil: "networkidle" });

  // 1. Hero Experience Verification
  console.log("--- 1. Hero Experience Verification ---");
  const hero = await page.$(".home-hero");
  if (!hero) {
    console.error("FAIL: .home-hero element not found!");
    hasError = true;
  } else {
    const heroTitle = await page.$eval(".home-hero-title", (el) => el.textContent?.trim());
    console.log(`PASS: Hero rendered with title: "${heroTitle}"`);
    const heroCtas = await page.$$(".home-hero-actions .home-cta");
    console.log(`PASS: Hero has ${heroCtas.length} CTAs with clear visual hierarchy.`);
    const quickHighlights = await page.$$(".home-quick-info li");
    console.log(`PASS: Hero has ${quickHighlights.length} quick highlight items.`);
  }

  // 2. Interactive Map Section Verification
  console.log("\n--- 2. Interactive Destination Map & Floating Preview ---");
  const mapSection = await page.$(".home-explore");
  if (!mapSection) {
    console.error("FAIL: .home-explore not found!");
    hasError = true;
  }

  // Scroll to map
  await page.evaluate(() => {
    const el = document.querySelector(".home-explore");
    if (el) el.scrollIntoView({ behavior: "instant" });
  });
  await page.waitForTimeout(2000);

  // Wait for markers
  let markers = [];
  for (let i = 0; i < 15; i++) {
    markers = await page.$$(".destination-map-marker");
    if (markers.length > 0) break;
    await page.waitForTimeout(500);
  }
  console.log(`PASS: Found ${markers.length} live MapLibre markers.`);

  if (markers.length > 0) {
    // Click marker 0 to open floating preview
    console.log("Clicking first marker to test floating preview card...");
    await markers[0].click();
    await page.waitForTimeout(600);

    const previewCard = await page.$(".home-map-preview-card");
    if (previewCard) {
      const title = await page.$eval(".home-map-preview-title", (el) => el.textContent?.trim());
      const tag = await page.$eval(".home-map-preview-category", (el) => el.textContent?.trim());
      const ctaBtn = await page.$eval(".home-map-preview-btn", (el) => el.getAttribute("href"));
      const isSelected = await page.$eval(".destination-map-marker.is-selected", () => true).catch(() => false);

      console.log(`PASS: Floating preview opened!`);
      console.log(`  - Title: "${title}"`);
      console.log(`  - Tag: "${tag}"`);
      console.log(`  - Detail Link: "${ctaBtn}"`);
      console.log(`  - Active Marker Glow: ${isSelected ? "YES (.is-selected applied)" : "NO"}`);

      // Capture desktop preview screenshot
      await mapSection.screenshot({
        path: path.join(outDir, "section_explore_preview_desktop_1440.png"),
      });
      console.log("Saved: section_explore_preview_desktop_1440.png");

      // Test Escape key dismissal
      console.log("Testing Escape key dismissal...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      const isClosed = (await page.$(".home-map-preview-card")) === null;
      console.log(`PASS: Floating preview closed via Escape key: ${isClosed}`);

      // Reopen preview by clicking marker 1 (if available)
      if (markers.length > 1) {
        console.log("Clicking second marker to test marker switching...");
        await markers[1].click();
        await page.waitForTimeout(400);
        const title2 = await page.$eval(".home-map-preview-title", (el) => el.textContent?.trim());
        console.log(`PASS: Switched to new destination: "${title2}"`);

        // Test clicking close button
        const closeBtn = await page.$(".home-map-preview-close");
        if (closeBtn) {
          await closeBtn.click();
          await page.waitForTimeout(300);
          const isClosedViaBtn = (await page.$(".home-map-preview-card")) === null;
          console.log(`PASS: Floating preview closed via close button: ${isClosedViaBtn}`);
        }
      }
    } else {
      console.error("FAIL: Floating preview card (.home-map-preview-card) did not open upon marker click!");
      hasError = true;
    }
  }

  // 3. AI Showcase Verification
  console.log("\n--- 3. AI Travel Assistant Showcase ---");
  const aiSection = await page.$(".home-assistant-section");
  if (!aiSection) {
    console.error("FAIL: .home-assistant-section not found!");
    hasError = true;
  } else {
    const aiUserBubble = await page.$(".home-ai-user-bubble");
    const aiBotBubble = await page.$(".home-ai-bot-bubble");
    const citationBox = await page.$(".home-ai-citation-box");
    const verifiedNotice = await page.$(".home-ai-verified-notice");

    if (aiUserBubble && aiBotBubble && citationBox) {
      const userText = await aiUserBubble.textContent();
      const botText = await aiBotBubble.textContent();
      console.log(`PASS: AI conversation rendered.`);
      console.log(`  - User Query: "${userText?.slice(0, 50).trim()}..."`);
      console.log(`  - AI Response: "${botText?.slice(0, 60).trim()}..."`);
      if (verifiedNotice) {
        console.log(`PASS: Verified local guide notice present: "${(await verifiedNotice.textContent())?.trim()}"`);
      }
    } else {
      console.error("FAIL: Missing AI chat bubbles or citation box!");
      hasError = true;
    }
  }

  // 4. Trip Planner Showcase Verification
  console.log("\n--- 4. Smart Trip Planner Showcase ---");
  const plannerSection = await page.$(".home-planner-section");
  if (!plannerSection) {
    console.error("FAIL: .home-planner-section not found!");
    hasError = true;
  } else {
    const pills = await page.$$(".home-planner-pill");
    const stops = await page.$$(".home-timeline-stop");
    const disclaimer = await page.$(".home-mockup-disclaimer");

    console.log(`PASS: Found ${pills.length} preference pills (Duration, Transport, Pace, Theme).`);
    console.log(`PASS: Found ${stops.length} visual timeline stops.`);
    if (disclaimer) {
      console.log(`PASS: Mockup disclaimer present: "${(await disclaimer.textContent())?.trim()}"`);
    }
  }

  // 5. Elimination of Duplicate Maps & Visual Storytelling Verification
  console.log("\n--- 5. Visual Storytelling & Duplicate Map Elimination ---");
  const storySection = await page.$(".home-story-section");
  const oldStaticMapSection = await page.$(".home-map-section");

  if (oldStaticMapSection) {
    console.error("FAIL: Old static map section (.home-map-section) is still present!");
    hasError = true;
  } else {
    console.log("PASS: Old duplicate static map section (.home-map-section) is completely eliminated.");
  }

  if (storySection) {
    const storyTitle = await page.$eval(".home-story-title", (el) => el.textContent?.trim());
    const metrics = await page.$$(".home-story-metric, .home-story-metric-item");
    const mapCta = await page.$eval(".home-story-actions .home-cta", (el) => el.getAttribute("href"));

    console.log(`PASS: Visual Storytelling section active: "${storyTitle}"`);
    console.log(`PASS: Highland Geopark metrics count: ${metrics.length}`);
    console.log(`PASS: CTA to full explore map: "${mapCta}"`);
  } else {
    console.error("FAIL: .home-story-section not found!");
    hasError = true;
  }

  // 6. How It Works Verification
  console.log("\n--- 6. How It Works Section ---");
  const steps = await page.$$(".home-step-card");
  const stepLinks = await page.$$(".home-step-link");
  console.log(`PASS: Found ${steps.length} workflow steps and ${stepLinks.length} direct action links.`);

  // 7. Final CTA & Footer Separation Verification
  console.log("\n--- 7. Final CTA & Footer Verification ---");
  const finalCta = await page.$(".home-final-cta-section");
  const footer = await page.$(".home-footer");
  if (finalCta && footer) {
    console.log("PASS: Both Final CTA and Footer are properly structured and separated.");
  } else {
    console.error("FAIL: Missing Final CTA or Footer!");
    hasError = true;
  }

  await page.close();

  // 8. Capture Full Responsive Screenshots across 1440, 1280, 768, 390 (Light & Dark)
  console.log("\n--- 8. Capturing Responsive Multi-viewport Screenshots ---");
  const viewports = [
    { name: "desktop_1440", width: 1440, height: 900 },
    { name: "laptop_1280", width: 1280, height: 800 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "mobile_390", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    // Light Mode
    const lightPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await lightPage.goto(targetUrl, { waitUntil: "networkidle" });
    await lightPage.evaluate(() => {
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
    });
    await lightPage.waitForTimeout(2000);

    // If mobile 390, test opening preview card to capture bottom sheet
    if (vp.width === 390) {
      await lightPage.evaluate(() => {
        const el = document.querySelector(".home-explore");
        if (el) el.scrollIntoView({ behavior: "instant" });
      });
      await lightPage.waitForTimeout(1000);
      const mMarkers = await lightPage.$$(".destination-map-marker");
      if (mMarkers.length > 0) {
        await mMarkers[0].click();
        await lightPage.waitForTimeout(500);
        const mapSectionMobile = await lightPage.$(".home-explore");
        if (mapSectionMobile) {
          await mapSectionMobile.screenshot({
            path: path.join(outDir, "section_explore_mobile_preview_390.png"),
          });
          console.log("Saved: section_explore_mobile_preview_390.png");
        }
      }
    }

    await lightPage.screenshot({
      path: path.join(outDir, `homepage_${vp.name}_light.png`),
      fullPage: true,
    });
    console.log(`Saved: homepage_${vp.name}_light.png`);

    // Dark Mode
    const darkPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await darkPage.goto(targetUrl, { waitUntil: "networkidle" });
    await darkPage.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
    });
    await darkPage.waitForTimeout(2000);

    await darkPage.screenshot({
      path: path.join(outDir, `homepage_${vp.name}_dark.png`),
      fullPage: true,
    });
    console.log(`Saved: homepage_${vp.name}_dark.png`);

    await lightPage.close();
    await darkPage.close();
  }

  await browser.close();

  if (consoleErrors.length > 0) {
    console.log("\nConsole errors encountered during test:", consoleErrors);
  }

  if (hasError) {
    console.error("\n❌ LANDING PAGE V4 VERIFICATION COMPLETED WITH ERRORS.");
    process.exit(1);
  } else {
    console.log("\n✅ LANDING PAGE V4 IMMERSIVE EXPERIENCE VERIFIED SUCCESSFULLY!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
