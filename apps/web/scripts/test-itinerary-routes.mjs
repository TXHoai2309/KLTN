/** Real MapLibre/production UI, synthetic loopback data. No external traffic. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULE_DIR].filter(Boolean) }));
const out = new URL('../.cache/itinerary-routes/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const receipts = [], errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', locale: 'vi-VN' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const source = () => page.evaluate(async () => await window.fixtureMaps?.at(-1)?.getSource('itinerary-routes')?.getData());
  async function ready() {
    const mapTab = page.getByRole('tab', { name: /^Bản đồ/ });
    if (await mapTab.isVisible()) await mapTab.click();
    await page.locator('.planner-map-canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.fixtureMaps?.at(-1)?.isStyleLoaded());
    await page.waitForFunction(() => window.fixtureMaps?.at(-1)?.getStyle().layers[0]?.paint['background-color'] === (document.documentElement.classList.contains('dark') ? '#16271e' : '#e8eee6'));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function capture(name) {
    const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvases: document.querySelectorAll('.planner-map canvas').length, markers: document.querySelectorAll('.planner-map-marker').length }));
    assert.ok(measure.scroll <= measure.width, `${name}: document overflow`);
    assert.equal(measure.canvases, 1);
    receipts.push({ name, ...measure, routeFeatures: (await source())?.features?.length ?? 0 });
    await page.locator('.planner-map-workspace').screenshot({ path: new URL(`${name}.png`, out).pathname.replace(/^\/(\w:)/, '$1') });
  }
  async function changeScenario(name) {
    const maps = await page.evaluate(() => window.fixtureMaps.length);
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(count => window.fixtureMaps.length > count, maps);
    await ready();
  }
  await page.goto('http://127.0.0.1:3016'); await ready();
  assert.equal((await source()).features.length, 2);
  await capture('day-desktop-light');
  const count = (await (await context.request.get('http://127.0.0.1:3016/stats')).json()).requests;
  await page.getByRole('button', { name: 'Toàn hành trình', exact: true }).focus();
  await page.keyboard.press('Enter'); await ready();
  assert.equal((await source()).features.length, 6);
  assert.equal(new Set((await source()).features.map(f => f.properties.color)).size, 3);
  assert.equal(await page.locator('.planner-map-marker').count(), 7);
  const anchorError = await page.evaluate(async () => {
    const map = window.fixtureMaps.at(-1), data = await map.getSource('itinerary-routes').getData();
    const projected = map.project(data.features.at(-1).geometry.coordinates.at(-1));
    const host = map.getContainer().getBoundingClientRect(), marker = document.querySelector('.planner-map-marker[data-destination-id="g"]').getBoundingClientRect();
    return { x: Math.abs(marker.x + marker.width / 2 - host.x - projected.x), y: Math.abs(marker.bottom + 6 - host.y - projected.y) };
  });
  assert.ok(anchorError.x < 2 && anchorError.y < 2, `Route endpoint and marker must coincide: ${JSON.stringify(anchorError)}`);
  assert.equal(await page.getByRole('list', { name: 'Màu tuyến theo ngày' }).locator('li').count(), 3);
  assert.equal((await (await context.request.get('http://127.0.0.1:3016/stats')).json()).requests, count);
  await capture('trip-desktop-light');
  const mapCount = await page.evaluate(() => window.fixtureMaps.length);
  await page.locator('.planner-map-marker[data-trip-day="3"]').last().click();
  await page.locator('#planner-tab-3[aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#planner-tab-3').getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Toàn hành trình', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.fixtureMaps.length), mapCount);
  await page.getByRole('button', { name: 'Vừa bản đồ', exact: true }).click();
  await page.getByRole('button', { name: 'Sáng / Tối', exact: true }).click();
  await page.waitForFunction(async () => (await window.fixtureMaps?.at(-1)?.getSource('itinerary-routes')?.getData())?.features.some(f => f.properties.color === '#83bde8'));
  assert.equal(await page.evaluate(() => window.fixtureMaps.length), mapCount);
  await capture('trip-desktop-dark');
  await page.getByRole('button', { name: 'Ngày 3', exact: true }).click(); await ready();
  assert.equal((await source()).features.length, 2);
  assert.equal(await page.locator('.planner-map-marker').first().textContent(), '0');
  await capture('day-transfer-desktop-dark');

  for (const width of [768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const mapTab = page.getByRole('tab', { name: /^Bản đồ/ });
    if (await mapTab.isVisible()) await mapTab.click();
    await page.getByRole('button', { name: 'Toàn hành trình', exact: true }).click(); await ready();
    await capture(`trip-${width}-dark`);
    await page.getByRole('button', { name: 'Sáng / Tối', exact: true }).click(); await ready();
    await capture(`trip-${width}-light`);
    await page.getByRole('button', { name: 'Sáng / Tối', exact: true }).click(); await ready();
  }
  await changeScenario('Thiếu hình tuyến');
  assert.equal(await source(), undefined);
  await page.getByText('Chưa có hình tuyến cho 6 chặng; các điểm dừng vẫn hiển thị.', { exact: true }).waitFor();
  await capture('missing-shapes-mobile');
  await changeScenario('Thiếu dữ liệu đường');
  assert.equal(await source(), undefined); await capture('missing-routes-mobile');
  await changeScenario('Không có điểm');
  assert.equal(await page.locator('.planner-map-marker').count(), 0); await capture('empty-mobile');

  await page.route('**/map-style.json*', route => route.abort());
  await page.getByRole('button', { name: 'Đầy đủ', exact: true }).click();
  await page.getByRole('tab', { name: /^Bản đồ/ }).click();
  await page.getByRole('button', { name: 'Thử lại bản đồ', exact: true }).waitFor();
  await page.unroute('**/map-style.json*');
  await page.getByRole('button', { name: 'Thử lại bản đồ', exact: true }).click(); await ready();
  await capture('map-retry-mobile');
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', out), JSON.stringify({ receipts, errors }, null, 2));
  console.log(JSON.stringify({ captures: receipts.length, errors, output: out.href }));
} finally { await browser.close(); }
