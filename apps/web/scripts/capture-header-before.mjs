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
  const browser = await chromium.launch({ headless: true });
  
  const viewports = [
    { name: "desktop_1440", width: 1440, height: 900 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "mobile_375", width: 375, height: 812 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto("http://localhost:3010", { waitUntil: "networkidle" });
    const header = await page.$(".site-header");
    if (header) {
      await header.screenshot({ path: path.join(outDir, `header_before_${vp.name}.png`) });
    }
    await page.screenshot({ path: path.join(outDir, `page_before_${vp.name}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(300, vp.height) } });
    console.log(`Captured before ${vp.name}`);
    await page.close();
  }

  await browser.close();
  console.log("Before screenshots saved successfully!");
}

run().catch(console.error);
