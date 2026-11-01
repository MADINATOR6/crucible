// Smoke tests for the published app: the few flows that must never break, driven in a real browser.
// Everything here runs against the built-in EXAMPLE programme, so no athlete data is involved.
import { expect, test } from '@playwright/test';

/** Console errors and uncaught exceptions for the whole test; the app logs real failures through both. */
function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Log the current set through the sheet, the way the athlete does it. */
async function logCurrentSet(page, { weight = '100', reps = '3', rpe = '8' } = {}) {
  await page.locator('[data-focus-log]').first().click();
  const sheet = page.locator('.sheet[role="dialog"]');
  await expect(sheet).toBeVisible();
  await sheet.locator('#w').fill(weight);
  await sheet.locator('#r').fill(reps);
  await sheet.locator('#e').fill(rpe);
  await sheet.locator('#save').click();
  await expect(sheet).toBeHidden();
}

test('the app starts and puts the current set first', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('.train-focus-lift')).toContainText('Low Bar Squat');
  await expect(page.locator('.pill.example')).toBeVisible();
  await expect(page.locator('[data-focus-log]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a logged set is still there after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('.progress')).toContainText(/0 of \d+ sets/);
  await logCurrentSet(page);
  await expect(page.locator('.toast')).toContainText(/Set saved|New PR/);
  // The reload proves it reached IndexedDB, not just the rendered page.
  await page.reload();
  await expect(page.locator('.progress')).toContainText(/1 of \d+ sets/);
  await page.locator('details.train-overview summary').click();
  await expect(page.locator('.set-row.is-done').first()).toContainText('100');
  expect(errors).toEqual([]);
});

test('every view renders, with no console errors and nothing off the side of the screen', async ({ page }) => {
  const errors = watchErrors(page);
  for (const tab of ['train', 'plan', 'progress', 'muscles', 'plates', 'data']) {
    await page.goto(`/#${tab}`);
    await expect(page.locator('#view .card, #view .empty, #view .topbar').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `#${tab} scrolls sideways`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('the service worker installs and the app opens offline', async ({ context, page }) => {
  // The service worker is off on localhost unless asked for (src/ui/app.js), so this is the only page that gets it.
  await page.goto('/?sw=1');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(async () => {
    for (const key of await caches.keys()) if (await (await caches.open(key)).match('index.html')) return true;
    return false;
  }), { message: 'the shell never finished caching', timeout: 20_000 }).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('.train-focus-lift')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('a backup exports and restores from the file it wrote', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await logCurrentSet(page, { weight: '123.5', reps: '2', rpe: '9' });
  await page.goto('/#data');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-json').click()]);
  const file = await download.path();
  expect(file).toBeTruthy();

  await page.locator('#import-json').setInputFiles(file);
  const sheet = page.locator('.sheet[role="dialog"]');
  await expect(sheet).toContainText('Restore backup?');
  await sheet.locator('#review-apply').click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.toast')).toContainText(/Restored 1 logged set/);

  await page.goto('/#train');
  await expect(page.locator('.progress')).toContainText(/1 of \d+ sets/);
  expect(errors).toEqual([]);
});
