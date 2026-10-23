/** Production components + synthetic local HTTP adapters. Never contacts live services. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULE_DIR].filter(Boolean) }));
const base = 'http://127.0.0.1:3014';
const out = fileURLToPath(new URL('../.cache/trip-ui/browser/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const results = [];
const failures = [];
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'vi-VN' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  async function capture(step, width, theme) {
    await page.evaluate(() => document.fonts.ready);
    // Let font/layout resize and MapLibre's next paint settle before visual evidence.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const measurement = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      const root = document.documentElement;
      const fields = [...document.querySelectorAll('.trip-shell input:not([type=radio]):not([type=checkbox]), .trip-shell textarea')].filter(el => el.getBoundingClientRect().width > 0);
      return {
        width: innerWidth,
        client: root.clientWidth,
        scroll: root.scrollWidth,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        headings: [...document.querySelectorAll('h1')].filter(el => el.getBoundingClientRect().height > 0).length,
        fieldOverflow: fields.filter(el => el.getBoundingClientRect().right > (el.closest('.trip-field, .trip-natural-language-field') || el.parentElement).getBoundingClientRect().right + 1).map(el => el.id),
        fonts: { body: document.fonts.check('14px "Be Vietnam Pro"'), heading: document.fonts.check('700 24px "Noto Serif"') },
        smallBadges: [...document.querySelectorAll('.planner-badge')].filter(el => el.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(el).fontSize) < 12).length,
        modal: (() => { const el = document.querySelector('dialog:modal'); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, viewportHeight: innerHeight, client: el.clientWidth, scroll: el.scrollWidth }; })(),
      };
    });
    assert.ok(measurement.scroll <= measurement.client, `${step}/${width}/${theme}: horizontal overflow`);
    assert.deepEqual(measurement.duplicateIds, []);
    assert.deepEqual(measurement.fieldOverflow, []);
    assert.equal(measurement.headings, 1);
    assert.equal(measurement.smallBadges, 0);
    assert.ok(measurement.fonts.body && measurement.fonts.heading);
    if (measurement.modal) {
      const m = measurement.modal;
      assert.ok(m.left >= 0 && m.right <= width && m.top >= 0 && m.bottom <= m.viewportHeight, 'Modal remains within viewport');
      assert.ok(m.scroll <= m.client, 'No horizontal overflow inside modal');
    }
    results.push({ step, width, theme, ...measurement });
    await page.screenshot({ path: `${out}/${step}-${width}-${theme}.png`, fullPage: !measurement.modal });
  }
  for (const width of process.env.TRIP_UI_DIALOG_ONLY === '1' ? [] : [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    for (const theme of ['light', 'dark']) {
      await context.request.get(`${base}/fixture-scenario?value=FULL`);
      await page.goto(base);
      if (theme === 'dark') await page.getByRole('button', { name: 'Sáng / Tối', exact: true }).click();
      assert.equal(await page.getByRole('tablist', { name: 'Các bước lập hành trình', exact: true }).getByRole('tab').count(), 2);
      assert.equal(await page.locator('#trip-duration').isVisible(), true);
      await capture('details', width, theme);
      await page.locator('.trip-ai-helper > summary').click();
      assert.equal(await page.locator('#trip-natural-language-text').getAttribute('aria-invalid'), 'false');
      await page.locator('#trip-natural-language-text').fill('Mình muốn đi 2 ngày bằng ô tô, thích thiên nhiên và thư giãn');
      await page.getByRole('button', { name: 'Phân tích nhu cầu', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#trip-duration').value === '2');
      assert.equal(await page.locator('.trip-ai-helper').getAttribute('open'), null);
      await capture('filled', width, theme);
      await page.getByRole('button', { name: 'Xem lại nhu cầu', exact: true }).first().press('Enter');
      await page.getByRole('heading', { name: 'Kiểm tra nhu cầu chuyến đi', exact: true }).waitFor();
      const dialog = page.getByRole('dialog', { name: 'Kiểm tra nhu cầu chuyến đi', exact: true });
      assert.equal(await dialog.isVisible(), true);
      assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Kiểm tra nhu cầu chuyến đi');
      await page.getByRole('button', { name: 'Sửa Ngày bắt đầu', exact: true }).click();
      await capture('review-editor', width, theme);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'trip-review-start-date');
      const cancelContrast = await page.getByRole('button', { name: 'Hủy', exact: true }).evaluate(el => {
        const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = values => values.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const foreground = luminance(rgb(getComputedStyle(el).color));
        const background = luminance(rgb(getComputedStyle(el.closest('.trip-review-screen')).backgroundColor));
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      assert.ok(cancelContrast >= 4.5, `Cancel contrast ${cancelContrast} at ${width}/${theme}`);
      await page.locator('#trip-review-start-date').press('Escape');
      assert.equal(await dialog.isVisible(), true);
      assert.equal(await page.getByRole('button', { name: 'Xác nhận nhu cầu', exact: true }).isEnabled(), false);
      await capture('review', width, theme);
      await page.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).check();
      await page.getByRole('button', { name: 'Xác nhận nhu cầu', exact: true }).click();
      await page.getByRole('button', { name: 'Tạo lịch trình đề xuất', exact: true }).waitFor();
      await capture('ready', width, theme);
      await page.getByRole('button', { name: 'Tạo lịch trình đề xuất', exact: true }).click();
      await page.getByRole('heading', { name: 'Lịch trình đề xuất', exact: true }).waitFor();
      await capture('proposal-day1', width, theme);
      assert.equal(await page.getByRole('button', { name: 'Lưu chuyến đi', exact: true }).isEnabled(), false);
      await page.getByRole('tab', { name: 'Ngày 2 Ngày tương đối', exact: true }).click();
      await capture('proposal-day2', width, theme);
    }
  }
  // Native modal boundaries, saved edits, dismissal and authoritative check recovery.
  await page.setViewportSize({ width: 390, height: 844 });
  await context.request.get(`${base}/fixture-scenario?value=FULL`);
  await page.goto(base);
  await page.locator('#trip-duration').fill('2');
  await page.locator('#trip-transport input[value="CAR"]').check();
  const reviewTrigger = page.getByRole('button', { name: 'Xem lại nhu cầu', exact: true }).first();
  await reviewTrigger.press('Enter');
  const modal = page.getByRole('dialog', { name: 'Kiểm tra nhu cầu chuyến đi', exact: true });
  await modal.waitFor();
  await modal.getByRole('button', { name: 'Quay lại chỉnh sửa trong biểu mẫu', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), true, 'Tab remains in modal');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), true, 'Shift+Tab remains in modal');
  await page.locator('#trip-duration').evaluate(el => el.focus());
  assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), true, 'Background is inert');
  await modal.getByRole('button', { name: 'Sửa Thời lượng chuyến đi', exact: true }).click();
  await page.locator('#trip-review-duration').fill('3');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await modal.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).check();
  await modal.getByRole('button', { name: 'Đóng kiểm tra, quay lại biểu mẫu', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('#trip-duration').inputValue(), '3', 'Saved popup edit returns to form');
  assert.equal(await reviewTrigger.evaluate(el => el === document.activeElement), true, 'Focus returns to trigger');
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await reviewTrigger.press('Enter');
  await modal.waitFor();
  assert.equal(await modal.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).isChecked(), false, 'Fresh review needs fresh acknowledgement');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Escape closes review outside editor');
  await reviewTrigger.press('Enter');
  await modal.waitFor();
  await page.route('**/api/trip-requirements/check', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'CHECK_UNAVAILABLE', message: 'Lỗi kiểm thử: chưa thể kiểm tra. Hãy thử lại.' } }) }));
  await modal.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).check();
  await modal.getByRole('button', { name: 'Xác nhận nhu cầu', exact: true }).click();
  await modal.locator('.trip-review-check-error').waitFor();
  assert.equal(await modal.isVisible(), true);
  assert.equal(await page.locator('#trip-tab-planner').isEnabled(), false, 'Failed server check never unlocks planner');
  await capture('modal-check-error', 390, 'light');
  await page.unroute('**/api/trip-requirements/check');
  await modal.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo lịch trình đề xuất', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Quay lại chỉnh nhu cầu', exact: true }).click();
  assert.equal(await page.locator('#trip-duration').inputValue(), '3', 'Planner back returns to form with reviewed values');

  // Closing a pending read aborts it; its eventual response cannot advance the flow.
  await page.goto(base);
  await page.locator('#trip-duration').fill('2');
  await page.locator('#trip-transport input[value="CAR"]').check();
  await reviewTrigger.press('Enter');
  await modal.waitFor();
  let releaseCheck;
  const checkGate = new Promise(resolve => { releaseCheck = resolve; });
  let finishCheck;
  const checkFinished = new Promise(resolve => { finishCheck = resolve; });
  await page.route('**/api/trip-requirements/check', async route => {
    await checkGate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }).catch(() => {});
    finishCheck();
  });
  await modal.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).check();
  await modal.getByRole('button', { name: 'Xác nhận nhu cầu', exact: true }).click();
  await modal.getByRole('button', { name: 'Đang kiểm tra…', exact: true }).waitFor();
  const abortedCheck = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/trip-requirements/check') });
  await modal.getByRole('button', { name: 'Đóng kiểm tra, quay lại biểu mẫu', exact: true }).click();
  await abortedCheck;
  releaseCheck(); await checkFinished;
  await page.unroute('**/api/trip-requirements/check');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('#trip-duration').inputValue(), '2');
  assert.equal(await page.locator('#trip-tab-planner').isEnabled(), false);

  // The manual path remains independent of extraction; missing inputs stay blocked.
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Xem lại nhu cầu', exact: true }).first().press('Enter');
  assert.equal(await page.locator('#trip-duration').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('#trip-tab-planner').isEnabled(), false);
  // A technical analysis failure keeps the original text and the manual escape hatch.
  await context.request.get(`${base}/fixture-scenario?value=ERROR`);
  await page.goto(base);
  await page.locator('.trip-ai-helper > summary').click();
  const text = 'Mình muốn đi 2 ngày bằng ô tô, thích thiên nhiên và thư giãn';
  await page.locator('#trip-natural-language-text').fill(text);
  await page.getByRole('button', { name: 'Phân tích nhu cầu', exact: true }).click();
  await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
  assert.equal(await page.locator('#trip-natural-language-text').inputValue(), text);
  assert.equal(await page.getByRole('button', { name: 'Nhập bằng biểu mẫu', exact: true }).isEnabled(), true);
  await capture('analysis-error', 360, 'light');
  // Planner errors, missing routes and empty candidate pools keep their own recovery UI.
  await context.request.get(`${base}/fixture-scenario?value=FULL`);
  await page.goto(base);
  await page.locator('.trip-ai-helper > summary').click();
  await page.locator('#trip-natural-language-text').fill(text);
  await page.getByRole('button', { name: 'Phân tích nhu cầu', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#trip-duration').value === '2');
  await page.getByRole('button', { name: 'Xem lại nhu cầu', exact: true }).first().press('Enter');
  await page.getByRole('checkbox', { name: 'Tôi đã kiểm tra các thông tin trên', exact: true }).check();
  await page.getByRole('button', { name: 'Xác nhận nhu cầu', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo lịch trình đề xuất', exact: true }).waitFor();
  await context.request.get(`${base}/fixture-scenario?value=ERROR`);
  await page.getByRole('button', { name: 'Tạo lịch trình đề xuất', exact: true }).click();
  await page.getByRole('heading', { name: 'Chưa thể tạo đề xuất lúc này', exact: true }).waitFor();
  await capture('planner-error', 360, 'light');
  await context.request.get(`${base}/fixture-scenario?value=MISSING_ROUTE`);
  await page.getByRole('button', { name: 'Thử lại cùng yêu cầu', exact: true }).click();
  await page.getByRole('heading', { name: 'Lịch trình đề xuất', exact: true }).waitFor();
  await capture('missing-route', 360, 'light');
  assert.equal(await page.getByRole('button', { name: 'Lưu chuyến đi', exact: true }).isEnabled(), false);
  await context.request.get(`${base}/fixture-scenario?value=EMPTY`);
  await page.getByRole('button', { name: 'Tạo lại lịch trình', exact: true }).click();
  await page.getByRole('heading', { name: 'Chưa đủ điểm đến phù hợp', exact: true }).waitFor();
  await capture('empty', 360, 'light');
  assert.deepEqual(failures, []);
  await writeFile(`${out}/measurements.json`, JSON.stringify({ results, failures, manualPath: 'PASS', analysisRecovery: 'PASS', liveProviders: false }, null, 2));
  console.log(`PASS: ${results.length} captures; no horizontal/input overflow or duplicate IDs; labels/focus, acknowledgement, missing-date save gate, day selection, manual and failure recovery. Synthetic adapters only.`);
} finally {
  await browser.close();
}
