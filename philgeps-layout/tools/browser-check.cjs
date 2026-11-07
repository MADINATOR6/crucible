// Loads the real unpacked extension in Chromium and drives a popup like the one PhilGEPS opens.
// Every philgeps.gov.ph request is answered locally, so this never touches the live site. Synthetic page text only.
// Needs Playwright from lifting-tracker. Run from the repo root: node philgeps-layout/tools/browser-check.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');
const repo = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(repo, 'lifting-tracker', 'node_modules', '@playwright', 'test'));
const ext = path.resolve(__dirname, '..');
const shot = process.argv[2];

const fails = [];
const check = (name, got, want) => {
  const ok = typeof want === 'function' ? want(got) : got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${String(got).replace(/\s+/g, ' ').slice(0, 110)}`);
  if (!ok) fails.push(name);
};

const FORMAT = no => `<!doctype html><html><head><title>Sample Printable Format</title></head><body>
<h1>Sample Printable Format</h1><table><tr><td>Reference</td><td id="ref">REF-${no}</td></tr>
<tr><td>Blank line</td><td id="blank">to be filled in</td></tr></table>
<p id="para">This synthetic sentence has a part to fill right here in it.</p></body></html>`;

async function openPopup(context, opener, no) {
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    opener.evaluate(() => { window.__p = window.open('about:blank', '_blank'); }),
  ]);
  await popup.waitForTimeout(150);
  // The site writes the page after opening the tab, which wipes anything already there.
  await opener.evaluate(html => { const d = window.__p.document; d.open(); d.write(html); d.close(); }, FORMAT(no));
  await popup.waitForTimeout(1500);
  return popup;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-check-'));
  // Uses an installed browser with a throwaway profile. Playwright's own Chromium builds do not start on this machine.
  const browsers = [
    process.env.PA_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(b => b && fs.existsSync(b));
  console.log('browser:', browsers[0]);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: browsers[0], headless: true, viewport: { width: 1280, height: 950 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'],
  });
  const errors = [];
  await context.route('https://www.philgeps.gov.ph/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Stub</title><p>Stub opener</p>' }));
  const opener = await context.newPage();
  await opener.goto('https://www.philgeps.gov.ph/printable');
  check('normal site has no sidebar', await opener.locator('#pa-sidebar-host').count(), 0);

  const p = await openPopup(context, opener, 1);
  p.on('pageerror', e => errors.push(e.message));
  check('sidebar is there after the site rewrites the tab', await p.locator('#pa-sidebar-host').count(), 1);
  const end = p.locator('.enddate');

  await p.fill('[data-end="proceed"]', '2026-03-02');
  check('Holy Week end date', await end.innerText(), s => s.includes('April 6, 2026') && s.startsWith('Monday'));
  check('skipped days listed', await p.locator('.endbox li').count(), 4);

  await p.fill('[data-end="proceed"]', '2026-01-25');
  check('special working day stays', await end.innerText(), s => s.includes('February 25, 2026'));

  await p.fill('[data-end="proceed"]', '2026-01-31');
  check('month end explained', await p.locator('.endbox .hint').innerText(), s => s.includes("month's last day"));

  await p.fill('[data-end="proceed"]', '2026-10-16');
  check('NCR off keeps 16 Nov', await end.innerText(), s => s.includes('November 16, 2026'));
  check('NCR off warns', await p.locator('.endbox .warn').innerText(), s => s.includes('Proclamation No. 1447'));
  await p.check('[data-end="ncr"]');
  check('NCR on moves to 19 Nov', await end.innerText(), s => s.includes('November 19, 2026'));
  await p.uncheck('[data-end="ncr"]');

  await p.fill('[data-end="proceed"]', '2028-03-15');
  check('2028 not confirmed', await p.locator('.endbox .warn').innerText(), s => s.includes('Not confirmed'));
  await p.fill('[data-end="proceed"]', '2027-02-10');
  check('2027 Eid warning', await p.locator('.endbox .warn').innerText(), s => s.includes('Eid dates not declared'));

  await p.fill('[data-end="proceed"]', '2026-02-19');
  check('before adding a day', await end.innerText(), s => s.includes('March 19, 2026'));
  await p.locator('summary', { hasText: 'Add a non-working day' }).click();
  await p.fill('[data-ui="adddate"]', '2026-03-19');
  await p.fill('[data-ui="addname"]', 'Test <b>x</b>');
  await p.click('[data-act="addday"]');
  check('added day moves the result', await end.innerText(), s => s.includes('March 23, 2026'));
  check('name shows as plain text', await p.locator('.added b').count(), 0);

  // A later rewrite of the same tab keeps the date already entered.
  await opener.evaluate(html => { const d = window.__p.document; d.open(); d.write(html); d.close(); }, FORMAT(1));
  await p.waitForTimeout(1200);
  check('date survives a rewrite', await p.locator('[data-end="proceed"]').inputValue(), '2026-02-19');
  check('result survives a rewrite', await end.innerText(), s => s.includes('March 23, 2026'));

  // The field tools still work beside it.
  await p.evaluate(() => {
    const t = document.getElementById('blank').firstChild;
    const r = document.createRange(); r.selectNodeContents(t);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await p.fill('[data-ui="newname"]', 'Blank line');
  await p.click('[data-act="add"]');
  await p.fill('.field input', 'Filled value');
  check('a field still fills in', await p.locator('#blank').innerText(), 'Filled value');
  await p.waitForTimeout(500);

  // The sidebar never prints.
  await p.emulateMedia({ media: 'print' });
  check('sidebar hidden in print', await p.evaluate(() => getComputedStyle(document.getElementById('pa-sidebar-host')).display), 'none');
  await p.emulateMedia({ media: 'screen' });
  if (shot) await p.screenshot({ path: shot });

  // A second popup keeps added days, and starts with no proceed date.
  await p.close();
  const p2 = await openPopup(context, opener, 2);
  check('added day saved across popups', await p2.locator('.added').count(), 1);
  check('new popup has an empty proceed date', await p2.locator('[data-end="proceed"]').inputValue(), '');
  await p2.locator('summary', { hasText: 'Add a non-working day' }).click();
  await p2.click('.added button');
  check('remove works', await p2.locator('.added').count(), 0);

  // Two popups open at once must not overwrite each other's saved days.
  const p3 = await openPopup(context, opener, 3);
  await p2.fill('[data-ui="adddate"]', '2026-03-19');
  await p2.click('[data-act="addday"]');
  await p3.waitForTimeout(300);
  check('a day added in one popup reaches the other', await p3.locator('.added').count(), 1);
  await p3.check('[data-end="ncr"]');
  await p2.waitForTimeout(300);
  check('NCR choice reaches the other popup', await p2.locator('[data-end="ncr"]').isChecked(), true);

  // Both popups save at the same moment, before either hears about the other.
  await p3.locator('summary', { hasText: 'Add a non-working day' }).click();
  await p2.fill('[data-ui="adddate"]', '2026-03-24');
  await p3.fill('[data-ui="adddate"]', '2026-03-25');
  await Promise.all([p2.click('[data-act="addday"]'), p3.click('[data-act="addday"]')]);
  await p3.waitForTimeout(300);
  check('simultaneous saves both reach popup A', await p2.locator('.added').count(), 3);
  check('simultaneous saves both reach popup B', await p3.locator('.added').count(), 3);
  await p2.click('.added button');
  await p3.waitForTimeout(300);
  check('a removal reaches the other popup', await p3.locator('.added').count(), 2);
  await p2.close();
  await p3.close();
  const p4 = await openPopup(context, opener, 4);
  check('both popups\' changes were saved: days', await p4.locator('.added').count(), 2);
  check('both popups\' changes were saved: NCR', await p4.locator('[data-end="ncr"]').isChecked(), true);

  // Typing a year passes through values like 0002: show a prompt, not a wrong date or a crash.
  await p4.fill('[data-end="proceed"]', '0002-03-02');
  check('a part-typed year shows a prompt', await p4.locator('.endbox .hint').innerText(), s => s.includes('valid proceed date'));
  await p4.fill('[data-end="proceed"]', '9999-12-01');
  check('the last possible year shows a prompt', await p4.locator('.endbox .hint').innerText(), s => s.includes('valid proceed date'));

  check('no page errors', errors.join(' | '), '');
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
