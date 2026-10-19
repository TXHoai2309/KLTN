import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js");

async function testLongUser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Route any get-session call
  await page.route("**/api/auth/**", async route => {
    const url = route.request().url();
    if (url.includes("get-session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "u1",
            name: "Nguyễn Hoàng Minh Trí Siêu Dài Traveler Admin VIP",
            email: "nguyen.hoang.minh.tri.long.email@example.com",
            role: "ADMIN"
          },
          session: { id: "s1" }
        })
      });
    } else {
      await route.continue();
    }
  });

  await page.goto("http://localhost:3010", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Check if user menu trigger exists
  const trigger = await page.$(".user-menu-trigger");
  if (trigger) {
    const text = await trigger.textContent();
    console.log("User menu trigger rendered text:", text.trim());
    const box = await trigger.boundingBox();
    console.log("User menu trigger box:", box);

    // Click to open dropdown
    await trigger.click();
    await page.waitForTimeout(300);

    // Verify dropdown content
    const dropdown = await page.$('[data-slot="dropdown-menu-content"]');
    console.log("Dropdown menu content rendered:", !!dropdown);
    if (dropdown) {
      const emailText = await dropdown.$eval('text="nguyen.hoang.minh.tri.long.email@example.com"', el => el.textContent);
      console.log("Found email in dropdown:", emailText);
    }
  }

  // Check header horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log("Desktop 1280 with long username: Overflow =", overflow);

  await browser.close();
}

testLongUser().catch(console.error);
