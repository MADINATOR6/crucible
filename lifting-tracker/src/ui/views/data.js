// Data view: import the coach's workbook, settings, backup/restore, reset.
import { esc, openSheet, toast, download, todayIso } from '../dom.js';
import { setsToCsv, validateBackup } from '../../store/backup.js';
import { mondayOf } from '../../core/weeks.js';
import { setWeeklySummary } from '../summary.js';
import { APP_VERSION } from '../updates.js';

const WARNING_HELP = {
  reps_date_converted: 'Excel turned a rep range into a date; converted back (day = low, month = high).',
  rpe_above_10: 'RPE above 10 (your sheets use 11 as a to-failure marker). Kept as written.',
  rpe_out_of_range: 'A number outside RPE range (often a bodyweight typed in the wrong column). Ignored.',
  rpe_text_cleaned: 'RPE had stray characters; the leading number was used.',
  load_unit_unknown: 'Load had an unrecognised unit; assumed kg.',
  load_range: 'Load was a range; kept as a range, no single load.',
  load_text: 'Load was text; ignored.',
  reps_text: 'Reps were text; kept as the original text.',
  unknown_exercise: 'Exercise not in the catalogue; kept under its own name (add it to data/exercises.json to count its muscles).',
  week_label_missing: 'A week had no "Week N" label; numbered in order.',
  empty_week_group: 'A week column group had no sets and was skipped.',
  orphan_set: 'A set row had no exercise name; attached to the previous exercise.',
  sheet_ignored: 'A sheet that is not a Block or the overview was skipped.',
  load_assumed_kg: 'A load with no unit was read as kg (the workbook gives totals in kg). Loads written like "235 pounds" keep their unit.',
  numeric_comment_as_reps: 'A bare number in Athlete Comments on a rep-range set was read as the reps you actually did (an assumption; check a few sets).',
  rpe_not_half_step: 'RPE that is not a multiple of 0.5. Kept as written.',
  load_invalid: 'A load that is zero, negative or a date. Ignored.',
  redacted_number: 'A long digit run in free text was removed (could be a phone number).',
};

export function canShareBackup() {
  try { return !!navigator.canShare?.({ files: [new File(['{}'], 'b.json', { type: 'application/json' })] }); }
  catch { return false; }
}

export async function saveBackup(app, share = false) {
  const data = await app.exportBackup();
  const name = `lifting-tracker-backup-${todayIso()}.json`;
  const text = JSON.stringify(data, null, 2);
  let shared = false;
  if (share && canShareBackup()) {
    try {
      await navigator.share({ files: [new File([text], name, { type: 'application/json' })], title: 'Lifting Tracker backup' });
      shared = true;
    } catch (err) { if (err?.name === 'AbortError') return; }
  }
  if (!shared) download(name, text);
  await app.saveSettings({ lastBackupAt: todayIso(), backupSnoozeUntil: null });
  toast(shared ? 'Backup shared' : 'Backup downloaded');
}

const plannedSets = (programme) => (programme?.blocks || []).reduce((total, block) => total + block.weeks.reduce((weeks, week) => weeks + week.days.reduce((days, day) => days + day.entries.reduce((entries, entry) => entries + entry.sets.length, 0), 0), 0), 0);
const counts = (programme) => ({ blocks: programme?.blocks?.length || 0, sets: plannedSets(programme) });
const updateText = {
  checking: 'Checking for an update…', current: 'This is the latest version available to this device.',
  available: 'An update is ready. You can apply it when you finish your workout.',
  reload: 'Another window updated the app. Reload when you finish your workout to use the new version.',
  offline: 'Offline. The installed version is still available.', error: 'Could not check for updates. Try again later.',
  unsupported: 'Update checks are not available in this browser.', development: 'Update checks are off on this development server.',
};

function openReview(app, ui, { title, details, source, apply, done }) {
  const sheet = openSheet(`<h2>${esc(title)}</h2>${details}<p class="small muted mt-3">Your current data stays in place until you choose Apply.</p>
    <div id="review-error" class="tone-bad mt-3" role="alert"></div>
    <div class="actions mt-4"><button class="btn" id="review-backup">Back up current data first</button><button class="btn ghost" id="review-cancel">Cancel</button><button class="btn primary" id="review-apply">Apply</button></div>`);
  const q = (selector) => sheet.el.querySelector(selector);
  let writing = false, backingUp = false, stale = false;
  q('#review-cancel').addEventListener('click', () => { if (!writing && !backingUp) sheet.close(); });
  q('#review-backup').addEventListener('click', async (event) => {
    if (backingUp || writing) return;
    const button = event.currentTarget;
    backingUp = true; button.disabled = true; q('#review-apply').disabled = true;
    try { await saveBackup(app, true); } catch (err) { q('#review-error').textContent = `Could not back up: ${err?.message || err}`; }
    finally { backingUp = false; button.disabled = false; if (!stale) q('#review-apply').disabled = false; }
  });
  q('#review-apply').addEventListener('click', async () => {
    if (writing || backingUp || stale) return;
    const button = q('#review-apply');
    if (app.dataRevision !== source.revision || app.programme !== source.programme) {
      stale = true;
      button.disabled = true;
      q('#review-error').textContent = 'Your training data changed since this preview. Choose the file again for a fresh preview.';
      return;
    }
    writing = true; button.disabled = true; q('#review-error').textContent = '';
    try {
      await apply();
      sheet.close(); ui.train = null; ui.muscles = null; ui.plan = null; done();
    } catch (err) {
      q('#review-error').textContent = `Could not apply: ${err?.message || err}. Your current data was kept.`;
      button.disabled = false;
    } finally { writing = false; }
  });
  return sheet;
}

export function dataView(app, ui) {
  const p = app.programme;
  const rep = p?.report;
  const s = app.settings;
  const startDefault = s.programmeStart || (app.blockStarts().get(p?.blocks?.[0]?.number) ?? '');
  const warnTypes = rep ? Object.entries(rep.warningsByType || {}).sort((a, b) => b[1] - a[1]) : [];
  const updates = ui.updates;
  const updateStatus = updates?.status || 'unsupported';

  const html = `
    <div class="topbar"><div><h1>Data</h1><p class="muted small">Everything stays on this device. Nothing is uploaded.</p></div>${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>

    <div class="card"><div class="card-h"><h2>Import coach's workbook</h2></div>
      <p class="muted small">Choose your .xlsx. It is read in your browser and never leaves the device. Importing replaces the programme; your logged sets are kept.</p>
      <label class="btn primary">Choose .xlsx<input id="xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="visually-hidden"></label>
      <div id="import-status" class="small mt-3" aria-live="polite"></div>
      ${rep && !p.isExample ? `<details class="fold mt-3" data-keep-open="import-report" open><summary>Last import report</summary>
        <div class="grid-3"><div class="stat"><b>${rep.blocks}</b><span>blocks</span></div><div class="stat"><b>${rep.weeks}</b><span>weeks</span></div><div class="stat"><b>${rep.sets}</b><span>sets (${rep.completedSets} completed)</span></div></div>
        <p class="small muted mt-2">${rep.dateRepsConverted} date-cells converted to rep ranges · ${rep.placeholders} placeholder cells ignored · ${rep.assumedKgLoads} loads assumed kg · ${rep.unparsedCells.length} cells not understood.</p>
        ${warnTypes.length ? `<table class="plain"><thead><tr><th>Warning</th><th>Count</th></tr></thead><tbody>${warnTypes.map(([k, v]) => `<tr><td><b>${esc(k)}</b><br><span class="muted small">${esc(WARNING_HELP[k] || '')}</span></td><td>${v}</td></tr>`).join('')}</tbody></table>` : ''}
        ${rep.unparsedCells.length ? `<details class="fold" data-keep-open="import-cells"><summary>Cells not understood (${rep.unparsedCells.length})</summary><div class="warnlist"><table class="plain"><tbody>${rep.unparsedCells.slice(0, 200).map((c) => `<tr><td>${esc(c.sheet)} ${esc(c.ref)}</td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      </details>` : ''}
      ${!p?.isExample ? '<button class="btn ghost small mt-3" id="use-example">Switch back to example data</button>' : ''}
    </div>

    <div class="card"><div class="card-h"><h2>Settings</h2></div>
      <div class="grid cols-2">
        <div class="field"><span>Units</span><div class="seg" role="group" aria-label="Units"><button data-unit="kg" aria-pressed="${s.unit === 'kg'}">kg</button><button data-unit="lb" aria-pressed="${s.unit === 'lb'}">lb</button></div></div>
        <div class="field"><span>Theme</span><div class="seg" role="group" aria-label="Theme">${['system', 'dark', 'light'].map((t) => `<button data-theme="${t}" aria-pressed="${s.theme === t}">${t}</button>`).join('')}</div></div>
        <label class="field"><span>Programme start date (Block 1, week 1)</span><input id="start" type="date" value="${esc(startDefault)}"></label>
      </div>
      <details class="fold mt-3" data-keep-open="block-starts"><summary>Block start dates (optional)</summary>
        <p class="small muted">Leave blank to follow on from the previous block. Set a date when a block really began (for example after a break); later blocks then follow it.</p>
        <div class="grid cols-2">${(p?.blocks || []).map((b) => `<label class="field"><span>Block ${b.number} · ${esc(b.name)}</span><input type="date" data-block-start="${b.number}" value="${esc((s.blockStarts || {})[b.number] || '')}"></label>`).join('')}</div>
      </details>
      <label class="row mt-3"><input type="checkbox" data-setting="keepAwake" ${s.keepAwake ? 'checked' : ''}> Keep the screen on while training</label>
      <label class="row mt-3"><input type="checkbox" data-setting="vibrate" ${s.vibrate ? 'checked' : ''}> Vibrate on one-tap logs and when rest ends</label>
      <label class="row mt-3"><input type="checkbox" id="weekly-summary" ${s.weeklySummary ? 'checked' : ''}> Weekly summary notification<small class="muted">&nbsp;(Android, installed app)</small></label>
      <p class="small muted mt-2">The workbook has no dates, so charts place sets using this start date and the assumption that blocks follow each other week by week. Treat dates as estimates. A start on any day is moved to that week's Monday.</p>
    </div>

    <div class="card"><div class="card-h"><h2>Backup</h2></div>
      <p class="muted small">A backup is one JSON file with your programme, logged sets and bodyweights. Keep a copy somewhere safe: browsers can clear site data.</p>
      <p class="small muted">${s.lastBackupAt ? `Last backup: ${esc(new Date(s.lastBackupAt + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'long' }))}` : 'No backup yet'}</p>
      <div class="actions">${canShareBackup() ? '<button class="btn primary" id="share-backup">Share backup</button>' : ''}<button class="btn" id="export-json">Export backup (JSON)</button><button class="btn" id="export-csv">Export sets (CSV)</button>
        <label class="btn">Restore backup<input id="import-json" type="file" accept="application/json,.json" class="visually-hidden"></label></div>
      <div id="restore-status" class="small mt-3" role="alert"></div>
      <p class="small muted mt-3">Storage: ${app.store.persistent ? 'saved on this device' : '<b class="tone-warn">not saved (private window or blocked storage)</b>'}${app.persisted === true ? ' · protected from automatic clearing' : app.persisted === false ? ' · the browser may clear it under storage pressure; export backups' : ''}.</p>
    </div>

    <div class="card"><div class="card-h"><h2>App version</h2><span class="pill">${esc(APP_VERSION)}</span></div>
      <p class="small muted">${esc(updateText[updateStatus] || updateText.error)}</p>
      <div class="actions"><button class="btn" id="check-update" ${updateStatus === 'checking' || updateStatus === 'unsupported' || updateStatus === 'development' ? 'disabled' : ''}>Check for updates</button>${['available', 'reload'].includes(updateStatus) ? `<button class="btn primary" id="apply-update">${updateStatus === 'reload' ? 'Reload app' : 'Apply update and reload'}</button>` : ''}</div>
    </div>

    <div class="card"><div class="card-h"><h2>Danger zone</h2></div>
      <p class="muted small">Deletes your imported programme, logged sets and bodyweights from this device.</p>
      <button class="btn danger" id="wipe">Delete all my data…</button></div>`;

  function bind(root, rerender) {
    const status = root.querySelector('#import-status');
    root.querySelector('#xlsx').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      const source = { revision: app.dataRevision, programme: app.programme };
      status.textContent = 'Reading workbook…';
      try {
        const { importProgramme } = await import('../../import/programme.js');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const prog = await importProgramme(bytes, { catalogue: app.catalogue, fileName: file.name });
        const old = counts(app.programme), incoming = counts(prog);
        const warnings = Object.entries(prog.report?.warningsByType || {}).sort((a, b) => b[1] - a[1]);
        const warningDetails = warnings.length ? `<ul class="bullets">${warnings.map(([type, count]) => `<li>${count} × ${esc(WARNING_HELP[type] || type)}</li>`).join('')}</ul>` : '<p>Warnings: none.</p>';
        const details = `<p class="muted small">${esc(file.name)} was read on this device. Review it before replacing the programme.</p>
          <p><b>Planned programme:</b> ${old.blocks} blocks and ${old.sets} planned sets → ${incoming.blocks} blocks and ${incoming.sets} planned sets.</p>
          <p><b>Kept:</b> ${app.sets.length} logged sets, ${app.sessions.length} logged sessions, ${app.bodyweights.length} bodyweights, and your settings.</p>
          <p><b>Warnings:</b></p>${warningDetails}${prog.report?.unparsedCells?.length ? `<p>${prog.report.unparsedCells.length} cells not understood.</p>` : ''}`;
        openReview(app, ui, { title: 'Import workbook?', details, source,
          apply: () => app.setProgramme(prog, { expectedRevision: source.revision }), done: () => { toast(`Imported ${incoming.blocks} blocks, ${incoming.sets} planned sets`); rerender(); } });
        status.textContent = '';
      } catch (err) {
        status.innerHTML = `<b class="tone-bad">Could not import:</b> ${esc(err.message || err)}`;
      }
      e.target.value = '';
    });
    root.querySelector('#use-example')?.addEventListener('click', async () => { await app.useExample(); ui.train = null; ui.muscles = null; ui.plan = null; toast('Showing example data'); });
    root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => app.saveSettings({ unit: b.dataset.unit })));
    root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', async () => { await app.saveSettings({ theme: b.dataset.theme }); }));
    root.querySelectorAll('[data-block-start]').forEach((inp) => inp.addEventListener('change', () => {
      const cur = { ...(app.settings.blockStarts || {}) };
      if (inp.value) cur[inp.dataset.blockStart] = mondayOf(inp.value); else delete cur[inp.dataset.blockStart];
      app.saveSettings({ blockStarts: cur });
    }));
    root.querySelector('#start').addEventListener('change', (e) => app.saveSettings({ programmeStart: e.target.value ? mondayOf(e.target.value) : null }));
    root.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', () => app.saveSettings({ [input.dataset.setting]: input.checked })));
    root.querySelector('#weekly-summary')?.addEventListener('change', (e) => setWeeklySummary(app, e.target.checked));
    root.querySelector('#export-json').addEventListener('click', () => saveBackup(app));
    root.querySelector('#share-backup')?.addEventListener('click', () => saveBackup(app, true));
    root.querySelector('#export-csv').addEventListener('click', () => {
      const byId = new Map(app.sessions.map((x) => [x.id, x]));
      download(`lifting-tracker-sets-${todayIso()}.csv`, setsToCsv(app.sets, byId), 'text/csv');
    });
    root.querySelector('#import-json').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      const restoreStatus = root.querySelector('#restore-status');
      restoreStatus.textContent = 'Reading backup…';
      const source = { revision: app.dataRevision, programme: app.programme };
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('That file is too large to be a backup.');
        const text = await file.text();
        const validation = validateBackup(text);
        if (!validation.ok) throw new Error(validation.errors.join(' '));
        const incomingProgramme = validation.snapshot.meta.find((x) => x.key === 'programme')?.value || null;
        const old = counts(app.programme), incoming = counts(incomingProgramme);
        const details = `<p class="muted small">${esc(file.name)} passed backup validation. Applying replaces all local app data.</p>
          <p><b>Planned programme:</b> ${old.blocks} blocks and ${old.sets} planned sets → ${incoming.blocks} blocks and ${incoming.sets} planned sets${incomingProgramme ? '' : ' (example programme will be shown)'}.</p>
          <p><b>Logged sets:</b> ${app.sets.length} current → ${validation.counts.sets} in backup. <b>Sessions:</b> ${app.sessions.length} → ${validation.counts.sessions}. <b>Bodyweights:</b> ${app.bodyweights.length} → ${validation.counts.bodyweights}.</p>
          <p><b>Settings:</b> replaced with the backup settings, or reset to defaults if absent. No current logged records are kept.</p>
          <p><b>Warnings:</b> none from validation.</p>`;
        openReview(app, ui, { title: 'Restore backup?', details, source,
          apply: async () => { const result = await app.importBackup(text, { expectedRevision: source.revision }); if (!result.ok) throw new Error(result.errors.join(' ')); },
          done: () => toast(`Restored ${validation.counts.sets} logged sets`) });
        restoreStatus.textContent = '';
      } catch (err) { restoreStatus.innerHTML = `<b class="tone-bad">Could not preview backup:</b> ${esc(err?.message || err)}`; }
      e.target.value = '';
    });
    root.querySelector('#check-update')?.addEventListener('click', async () => { if (!updates?.check) return; await updates.check(); rerender(); });
    root.querySelector('#apply-update')?.addEventListener('click', async () => { if (!updates?.apply) return; await updates.apply(); rerender(); });
    root.querySelector('#wipe').addEventListener('click', () => {
      const sheet = openSheet(`<h2>Delete everything?</h2><p>This removes your programme, logged sets and bodyweights from this device. It cannot be undone, so export a backup first.</p><label class="field"><span>Type DELETE to confirm</span><input id="c" autocomplete="off"></label><div class="row spread mt-4"><button class="btn ghost" id="no">Cancel</button><button class="btn danger" id="yes" disabled>Delete all</button></div>`);
      const c = sheet.el.querySelector('#c'), y = sheet.el.querySelector('#yes');
      c.addEventListener('input', () => { y.disabled = c.value.trim() !== 'DELETE'; });
      sheet.el.querySelector('#no').addEventListener('click', sheet.close);
      y.addEventListener('click', async () => { await app.resetAll(); sheet.close(); ui.train = null; ui.muscles = null; ui.plan = null; toast('All data deleted'); });
    });
  }
  return { html, bind };
}
