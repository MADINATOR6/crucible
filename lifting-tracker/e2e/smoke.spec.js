// Smoke tests for the published app: the few flows that must never break, driven in a real browser.
// Everything here runs against the built-in EXAMPLE programme, so no athlete data is involved.
import { expect, test } from '@playwright/test';

// One marker per view that only that view renders, so a router that fell back to Train cannot pass.
// On example data Coach shows the starter setup (build a first block without a workbook), so that card is its view.
const VIEWS = [['train', '.train-top'], ['plan', '#starter'],
  ['progress', '#meet-date'], ['muscles', 'h1:text-is("Muscles")'], ['plates', '#target'], ['data', '#export-json']];

/** Console errors and uncaught exceptions for the whole test; the app reports real failures through both. */
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

/** The logged rows live inside the Full workout fold, which is closed while a set is still open. */
async function openFullWorkout(page) {
  const details = page.locator('details.train-overview');
  if (!(await details.evaluate((el) => el.open))) await details.locator('summary').click();
  await expect(details.locator('.set-row').first()).toBeVisible();
}

test('the app starts and puts the current set first', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  // The first card on the screen is the current set, above the rest of the workout.
  const cards = page.locator('#view section.card');
  await expect(cards.first()).toHaveClass(/train-focus/);
  await expect(page.locator('.train-focus-lift')).toContainText('Low Bar Squat');
  await expect(page.locator('.pill.example')).toBeVisible();
  await expect(page.locator('[data-focus-log]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a logged set is still there, unchanged, after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('.progress')).toContainText(/0 of \d+ sets/);
  await logCurrentSet(page, { weight: '142.5', reps: '4', rpe: '8.5' });
  // The reload proves it reached IndexedDB, not just the rendered page.
  await page.reload();
  await expect(page.locator('.progress')).toContainText(/1 of \d+ sets/);
  await openFullWorkout(page);
  const row = page.locator('.set-row.is-done').first();
  await expect(row).toContainText(/4\s*×\s*142\.5/); // what was logged, not the planned 5 × 147.5
  await expect(row).toContainText(/@8\.5/);
  expect(errors).toEqual([]);
});

test('every view renders, with no console errors, no sideways scroll and no request off this device', async ({ page }) => {
  const errors = watchErrors(page);
  const offDevice = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['http:', 'https:'].includes(url.protocol)) return; // blob: and data: never leave the page
    if (url.hostname !== '127.0.0.1') offDevice.push(r.url());
  });
  await page.goto('/');
  for (const [tab, marker] of VIEWS) {
    // Click the navigation the athlete uses (the rail on a desktop, the tab bar or gear on a phone).
    await page.locator(`[data-tab="${tab}"]:visible`).first().click();
    await expect(page.locator(`#view ${marker}`)).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `#${tab} scrolls sideways`).toBeLessThanOrEqual(1);
  }
  expect(offDevice, 'the app must not talk to anything but this device').toEqual([]);
  expect(errors).toEqual([]);
});

test('an athlete with no workbook builds a starter programme, and it is still theirs after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  // The starter and its dates are one transaction in real IndexedDB: a settings step that throws must leave no
  // programme behind. The Node suites only prove this against the in-memory store.
  const leftBehind = await page.evaluate(async () => {
    const { openStore } = await import('/src/store/db.js');
    const store = await openStore();
    try { await store.replaceProgramme('null', { blocks: [] }, [], { settings: () => { throw new Error('probe'); } }); }
    catch { return (await store.get('meta', 'programme')) ?? null; }
    return 'the write did not fail';
  });
  expect(leftBehind).toBeNull();
  await page.locator('[data-tab="plan"]:visible').first().click();
  const setup = page.locator('#starter');
  await setup.locator('#st-squat-w').fill('80');
  await setup.locator('#st-squat-r').fill('5');
  await setup.locator('#st-bench-w').fill('50');
  // Picking the days redraws the form: what was typed must still be there.
  await setup.locator('[data-start-days="4"]').click();
  await expect(setup.locator('#st-squat-w')).toHaveValue('80');
  await setup.locator('#st-build').click();
  // Straight to Train on their own block: no example label, the squat first, a load worked out from 80 × 5.
  await expect(page.locator('.train-top')).toContainText('Starter block');
  await expect(page.locator('.pill.example')).toHaveCount(0);
  await expect(page.locator('.train-focus-lift')).toContainText('Low Bar Squat');
  await expect(page.locator('.train-focus')).toContainText(/\d+(\.5)? kg/);
  await page.reload();
  await expect(page.locator('.train-top')).toContainText('Starter block');
  await expect(page.locator('.pill.example')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the service worker installs and the app opens offline', async ({ browserName, context, page }) => {
  // Offline emulation is a Chromium/Firefox capability; the iOS engine still runs every other flow.
  test.skip(browserName === 'webkit', 'WebKit does not emulate going offline');
  const errors = watchErrors(page);
  // The service worker is off on localhost unless asked for (src/ui/app.js), so this is the only page that gets it.
  await page.goto('/?sw=1');
  // `ready` only means a worker is active: wait until it actually controls this page, or the reload below
  // would go to the network and pass for the wrong reason.
  await expect.poll(() => page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) return false;
    for (const key of await caches.keys()) if (await (await caches.open(key)).match('index.html')) return true;
    return false;
  }), { message: 'the service worker never took control of the page', timeout: 20_000 }).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('.train-focus-lift')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  expect(errors).toEqual([]);
});

test('a restored backup brings back a set that was deleted after the export', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await logCurrentSet(page, { weight: '123.5', reps: '2', rpe: '9' });

  await page.locator('[data-tab="data"]:visible').first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-json').click()]);
  const file = await download.path();
  expect(file).toBeTruthy();

  // Delete the set, so a restore that writes nothing cannot pass.
  await page.locator('[data-tab="train"]:visible').first().click();
  await openFullWorkout(page);
  await page.locator('[data-set="0:0"]').click();
  const sheet = page.locator('.sheet[role="dialog"]');
  await sheet.locator('#del').click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.progress')).toContainText(/0 of \d+ sets/);

  await page.locator('[data-tab="data"]:visible').first().click();
  await page.locator('#import-json').setInputFiles(file);
  await expect(sheet).toContainText('Restore backup?');
  await sheet.locator('#review-apply').click();
  await expect(sheet).toBeHidden();

  await page.locator('[data-tab="train"]:visible').first().click();
  await page.reload();
  await expect(page.locator('.progress')).toContainText(/1 of \d+ sets/);
  await openFullWorkout(page);
  const row = page.locator('.set-row.is-done').first();
  await expect(row).toContainText(/2\s*×\s*123\.5/);
  await expect(row).toContainText(/@9/);
  expect(errors).toEqual([]);
});

test('a restored backup brings back every kind of record, not just sets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  // A programme of their own, so the workbook-history choice has something to live on.
  await page.locator('[data-tab="plan"]:visible').first().click();
  const setup = page.locator('#starter');
  await setup.locator('#st-squat-w').fill('80');
  await setup.locator('#st-squat-r').fill('5');
  await setup.locator('#st-bench-w').fill('50');
  await setup.locator('#st-build').click();
  await expect(page.locator('.train-top')).toContainText('Starter block');

  // Synthetic records for every part of backup format 5, written straight to IndexedDB.
  const seeded = {
    bodyweights: [{ id: 'bw-e2e', date: '2026-10-01', weight: { value: 81.5, unit: 'kg' }, calories: 2650, createdAt: '2026-10-01T08:00:00.000Z' }],
    activities: [{ id: 'act-e2e', date: '2026-10-02', kind: 'walk', minutes: 45, createdAt: '2026-10-02T09:00:00.000Z' }],
    intake: [{ id: 'food-e2e', date: '2026-10-02', label: 'Test rice', kcal: 650, protein: 12, fat: 3, carbs: 140, createdAt: '2026-10-02T12:00:00.000Z' }],
    finishedDays: [{ date: '2026-10-02', kcal: 650 }],
  };
  await page.evaluate(async (s) => {
    const { openStore } = await import('/src/store/db.js');
    const store = await openStore();
    await store.putMany('bodyweights', s.bodyweights);
    for (const k of ['activities', 'intake', 'finishedDays']) await store.put('meta', { key: k, value: s[k] });
    const settings = (await store.get('meta', 'settings')) ?? { key: 'settings', value: {} };
    await store.put('meta', { ...settings, value: { ...settings.value, shareBg: 'light' } });
    const programme = await store.get('meta', 'programme');
    await store.put('meta', { ...programme, value: { ...programme.value, workbookHistory: false } });
  }, seeded);
  await page.reload();
  await logCurrentSet(page, { weight: '123.5', reps: '2', rpe: '9' });

  /** Everything a backup is meant to carry, read back from IndexedDB. */
  const readAll = () => page.evaluate(async () => {
    const { openStore } = await import('/src/store/db.js');
    const store = await openStore();
    const meta = async (k) => (await store.get('meta', k))?.value ?? null;
    const sets = (await store.getAll('sets')).map((x) => ({ id: x.id, reps: x.reps, weight: x.weight, rpe: x.rpe }));
    return {
      bodyweights: await store.getAll('bodyweights'), activities: await meta('activities'), intake: await meta('intake'),
      finishedDays: await meta('finishedDays'), shareBg: (await meta('settings'))?.shareBg ?? null,
      workbookHistory: (await meta('programme'))?.workbookHistory ?? null, sets,
    };
  });
  const original = await readAll();
  expect(original.sets).toHaveLength(1);
  expect(original.bodyweights).toEqual(seeded.bodyweights);
  expect(original.workbookHistory).toBe(false);

  await page.locator('[data-tab="data"]:visible').first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-json').click()]);
  const file = await download.path();

  // Change every part, so a restore that skips any one of them cannot pass.
  await page.evaluate(async () => {
    const { openStore } = await import('/src/store/db.js');
    const store = await openStore();
    for (const b of await store.getAll('bodyweights')) await store.delete('bodyweights', b.id);
    for (const s of await store.getAll('sets')) await store.delete('sets', s.id);
    for (const k of ['activities', 'intake', 'finishedDays']) await store.put('meta', { key: k, value: [] });
    const settings = await store.get('meta', 'settings');
    await store.put('meta', { ...settings, value: { ...settings.value, shareBg: 'dark' } });
    const programme = await store.get('meta', 'programme');
    await store.put('meta', { ...programme, value: { ...programme.value, workbookHistory: true } });
  });
  await page.reload();
  const wiped = await readAll();
  expect(wiped.sets).toHaveLength(0);
  expect(wiped.activities).toEqual([]);
  expect(wiped.workbookHistory).toBe(true);

  await page.locator('[data-tab="data"]:visible').first().click();
  await page.locator('#import-json').setInputFiles(file);
  const sheet = page.locator('.sheet[role="dialog"]');
  await expect(sheet).toContainText('Restore backup?');
  await sheet.locator('#review-apply').click();
  await expect(sheet).toBeHidden();
  await page.reload();

  const restored = await readAll();
  expect(restored.sets).toEqual(original.sets);
  expect(restored.bodyweights).toEqual(seeded.bodyweights);
  expect(restored.activities).toEqual(seeded.activities);
  expect(restored.intake).toEqual(seeded.intake);
  expect(restored.finishedDays).toEqual(seeded.finishedDays);
  expect(restored.shareBg).toBe('light');
  expect(restored.workbookHistory).toBe(false);
  expect(errors).toEqual([]);
});
