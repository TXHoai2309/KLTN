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
  console.log("=== STARTING LANDING PAGE V2 E2E VERIFICATION ===");
  const targetUrl = "http://localhost:3010";

  console.log(`Checking if server is running at ${targetUrl}...`);
  await checkServerReady(targetUrl);
  console.log("Server is ready!");

  const browser = await chromium.launch({ headless: true });
  let hasError = false;

  // 1. Semantic HTML & Headings verification on standard desktop
  console.log("\n--- Checking Semantic HTML & Headings ---");
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktopPage.goto(targetUrl, { waitUntil: "networkidle" });

  const h1Count = await desktopPage.$$eval("h1", (els) => els.length);
  const h1Text = await desktopPage.$eval("h1", (el) => el.textContent?.trim());
  console.log(`H1 count: ${h1Count}`);
  console.log(`H1 content: "${h1Text}"`);

  if (h1Count !== 1) {
    console.error(`ERROR: Expected exactly 1 H1, found ${h1Count}`);
    hasError = true;
  } else {
    console.log("PASS: Exactly 1 H1 present.");
  }

  const h2Texts = await desktopPage.$$eval("h2", (els) => els.map((el) => el.textContent?.trim()));
  console.log(`H2 headings (${h2Texts.length}):`);
  h2Texts.forEach((t, i) => console.log(`  ${i + 1}. "${t}"`));

  // 2. Section presence verification
  console.log("\n--- Verifying All 7 Core Sections Presence ---");
  const sectionChecks = [
    { name: "Hero Section", selector: ".home-hero" },
    { name: "Discover Section", selector: ".home-explore" },
    { name: "AI Assistant Section", selector: ".home-assistant-section" },
    { name: "Trip Planner Section", selector: ".home-planner-section" },
    { name: "Explore Map Section", selector: ".home-map-section" },
    { name: "How It Works Section", selector: ".home-steps-section" },
    { name: "Final CTA Section", selector: ".home-final-cta-section" },
    { name: "Site Footer", selector: ".home-footer" },
  ];

  for (const s of sectionChecks) {
    const exists = await desktopPage.$(s.selector);
    if (!exists) {
      console.error(`ERROR: Missing section ${s.name} (${s.selector})`);
      hasError = true;
    } else {
      console.log(`PASS: ${s.name} is rendered.`);
    }
  }

  // 3. CTA and Links Route Verification
  console.log("\n--- Verifying CTA Routes & Links ---");
  const linkChecks = [
    { name: "Hero Primary CTA", selector: ".home-hero-actions .home-cta-primary", expected: "/explore" },
    { name: "Hero Secondary CTA", selector: ".home-hero-actions .home-cta-secondary", expected: "/trips/new" },
    { name: "Discover All CTA", selector: ".home-dest-footer .home-link-pill", expected: "/explore" },
    { name: "AI Assistant CTA", selector: ".home-assistant-section .home-cta-primary", expected: "/assistant" },
    { name: "Trip Planner CTA", selector: ".home-planner-section .home-cta-primary", expected: "/trips/new" },
    { name: "Map CTA", selector: ".home-map-actions .home-cta-primary", expected: "/explore?view=map" },
    { name: "Final CTA Primary", selector: ".home-final-actions .home-cta-primary", expected: "/explore" },
    { name: "Final CTA Secondary", selector: ".home-final-actions .home-cta-secondary", expected: "/trips/new" },
  ];

  for (const l of linkChecks) {
    const el = await desktopPage.$(l.selector);
    if (!el) {
      console.error(`ERROR: Link ${l.name} not found with selector ${l.selector}`);
      hasError = true;
      continue;
    }
    const href = await el.getAttribute("href");
    if (href !== l.expected) {
      console.error(`ERROR: ${l.name} href expected "${l.expected}", got "${href}"`);
      hasError = true;
    } else {
      console.log(`PASS: ${l.name} -> "${href}"`);
    }
  }

  // 4. Multi-viewport Responsive & Overflow Verification
  console.log("\n--- Checking Viewports & Horizontal Overflow ---");
  const viewports = [
    { name: "mobile_375", width: 375, height: 812 },
    { name: "mobile_390", width: 390, height: 844 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "laptop_1024", width: 1024, height: 768 },
    { name: "laptop_1280", width: 1280, height: 800 },
    { name: "desktop_1440", width: 1440, height: 900 },
    { name: "desktop_1920", width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(targetUrl, { waitUntil: "networkidle" });

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): Horizontal Overflow = ${overflow}`);
    if (overflow) {
      console.error(`ERROR: Horizontal overflow detected on ${vp.name}!`);
      hasError = true;
    }
    await page.close();
  }

  // 5. Capture High-Resolution Screenshots (Light & Dark) across required viewports:
  // Required: 1440px, 1280px, 768px, 390px
  console.log("\n--- Capturing Full-Page Screenshots ---");
  const screenshotViewports = [
    { name: "desktop_1440", width: 1440, height: 900 },
    { name: "laptop_1280", width: 1280, height: 800 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "mobile_390", width: 390, height: 844 },
  ];

  for (const vp of screenshotViewports) {
    // Light Mode Screenshot
    const lightPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await lightPage.goto(targetUrl, { waitUntil: "networkidle" });
    // Trigger scroll reveals so all cards are visible
    await lightPage.evaluate(() => {
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
    });
    await lightPage.waitForTimeout(600);
    const lightPath = path.join(outDir, `homepage_${vp.name}_light.png`);
    await lightPage.screenshot({ path: lightPath, fullPage: true });
    console.log(`Saved: homepage_${vp.name}_light.png`);

    // Dark Mode Screenshot
    const darkPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await darkPage.goto(targetUrl, { waitUntil: "networkidle" });
    await darkPage.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.querySelectorAll("[data-home-reveal]").forEach((el) => {
        el.removeAttribute("data-home-reveal-pending");
        el.setAttribute("data-home-revealed", "true");
      });
    });
    await darkPage.waitForTimeout(600);
    const darkPath = path.join(outDir, `homepage_${vp.name}_dark.png`);
    await darkPage.screenshot({ path: darkPath, fullPage: true });
    console.log(`Saved: homepage_${vp.name}_dark.png`);

    await lightPage.close();
    await darkPage.close();
  }

  await desktopPage.close();
  await browser.close();

  if (hasError) {
    console.error("\n❌ E2E Verification failed with errors.");
    process.exit(1);
  } else {
    console.log("\n✅ ALL LANDING PAGE V2 E2E CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
