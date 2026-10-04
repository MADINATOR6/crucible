// Data view: import the coach's workbook, settings, backup/restore, reset.
import { esc, openSheet, toast, download, todayIso } from '../dom.js';
import { setsToCsv } from '../../store/backup.js';
import { mondayOf } from '../../core/weeks.js';

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

export function dataView(app, ui) {
  const p = app.programme;
  const rep = p?.report;
  const s = app.settings;
  const startDefault = s.programmeStart || (app.blockStarts().get(p?.blocks?.[0]?.number) ?? '');
  const warnTypes = rep ? Object.entries(rep.warningsByType || {}).sort((a, b) => b[1] - a[1]) : [];

  const html = `
    <div class="topbar"><div><h1>Data</h1><p class="muted small">Everything stays on this device. Nothing is uploaded.</p></div>${app.usingExample ? '<span class="pill example">Example data</span>' : ''}</div>

    <div class="card"><div class="card-h"><h2>Import coach's workbook</h2></div>
      <p class="muted small">Choose your .xlsx. It is read in your browser and never leaves the device. Importing replaces the programme; your logged sets are kept.</p>
      <label class="btn primary" style="cursor:pointer">Choose .xlsx<input id="xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="visually-hidden"></label>
      <div id="import-status" class="small" style="margin-top:10px" aria-live="polite"></div>
      ${rep && !p.isExample ? `<details class="fold" style="margin-top:12px" open><summary>Last import report</summary>
        <div class="grid cols-3"><div class="stat"><b>${rep.blocks}</b><span>blocks</span></div><div class="stat"><b>${rep.weeks}</b><span>weeks</span></div><div class="stat"><b>${rep.sets}</b><span>sets (${rep.completedSets} completed)</span></div></div>
        <p class="small muted" style="margin-top:8px">${rep.dateRepsConverted} date-cells converted to rep ranges · ${rep.placeholders} placeholder cells ignored · ${rep.assumedKgLoads} loads assumed kg · ${rep.unparsedCells.length} cells not understood.</p>
        ${warnTypes.length ? `<table class="plain"><thead><tr><th>Warning</th><th>Count</th></tr></thead><tbody>${warnTypes.map(([k, v]) => `<tr><td><b>${esc(k)}</b><br><span class="muted small">${esc(WARNING_HELP[k] || '')}</span></td><td>${v}</td></tr>`).join('')}</tbody></table>` : ''}
        ${rep.unparsedCells.length ? `<details class="fold"><summary>Cells not understood (${rep.unparsedCells.length})</summary><div class="warnlist"><table class="plain"><tbody>${rep.unparsedCells.slice(0, 200).map((c) => `<tr><td>${esc(c.sheet)} ${esc(c.ref)}</td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      </details>` : ''}
      ${!p?.isExample ? '<button class="btn ghost small" id="use-example" style="margin-top:10px">Switch back to example data</button>' : ''}
    </div>

    <div class="card"><div class="card-h"><h2>Settings</h2></div>
      <div class="grid cols-2">
        <div class="field"><span>Units</span><div class="seg" role="group" aria-label="Units"><button data-unit="kg" aria-pressed="${s.unit === 'kg'}">kg</button><button data-unit="lb" aria-pressed="${s.unit === 'lb'}">lb</button></div></div>
        <div class="field"><span>Theme</span><div class="seg" role="group" aria-label="Theme">${['system', 'dark', 'light'].map((t) => `<button data-theme="${t}" aria-pressed="${s.theme === t}">${t}</button>`).join('')}</div></div>
        <label class="field"><span>Programme start date (Block 1, week 1)</span><input id="start" type="date" value="${esc(startDefault)}"></label>
      </div>
      <details class="fold" style="margin-top:10px"><summary>Block start dates (optional)</summary>
        <p class="small muted">Leave blank to follow on from the previous block. Set a date when a block really began (for example after a break); later blocks then follow it.</p>
        <div class="grid cols-2">${(p?.blocks || []).map((b) => `<label class="field"><span>Block ${b.number} · ${esc(b.name)}</span><input type="date" data-block-start="${b.number}" value="${esc((s.blockStarts || {})[b.number] || '')}"></label>`).join('')}</div>
      </details>
      <p class="small muted" style="margin-top:8px">The workbook has no dates, so charts place sets using this start date and the assumption that blocks follow each other week by week. Treat dates as estimates. A start on any day is moved to that week's Monday.</p>
    </div>

    <div class="card"><div class="card-h"><h2>Backup</h2></div>
      <p class="muted small">A backup is one JSON file with your programme, logged sets and bodyweights. Keep a copy somewhere safe: browsers can clear site data.</p>
      <div class="row"><button class="btn" id="export-json">Export backup (JSON)</button><button class="btn" id="export-csv">Export sets (CSV)</button>
        <label class="btn" style="cursor:pointer">Restore backup<input id="import-json" type="file" accept="application/json,.json" class="visually-hidden"></label></div>
      <p class="small muted" style="margin-top:10px">Storage: ${app.store.persistent ? 'saved on this device' : '<b style="color:var(--warn)">not saved (private window or blocked storage)</b>'}${app.persisted === true ? ' · protected from automatic clearing' : app.persisted === false ? ' · the browser may clear it under storage pressure; export backups' : ''}.</p>
    </div>

    <div class="card"><div class="card-h"><h2>Danger zone</h2></div>
      <p class="muted small">Deletes your imported programme, logged sets and bodyweights from this device.</p>
      <button class="btn" id="wipe" style="border-color:var(--bad);color:var(--bad)">Delete all my data…</button></div>`;

  function bind(root, rerender) {
    const status = root.querySelector('#import-status');
    root.querySelector('#xlsx').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      status.textContent = 'Reading workbook…';
      try {
        const { importProgramme } = await import('../../import/programme.js');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const prog = await importProgramme(bytes, { catalogue: app.catalogue, fileName: file.name });
        await app.setProgramme(prog);
        toast(`Imported ${prog.report.blocks} blocks, ${prog.report.sets} sets`);
        status.textContent = '';
        ui.train = null; ui.muscles = null;
        rerender();
      } catch (err) {
        status.innerHTML = `<b style="color:var(--bad)">Could not import:</b> ${esc(err.message || err)}`;
      }
      e.target.value = '';
    });
    root.querySelector('#use-example')?.addEventListener('click', async () => { await app.useExample(); ui.train = null; ui.muscles = null; toast('Showing example data'); });
    root.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => app.saveSettings({ unit: b.dataset.unit })));
    root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', async () => { await app.saveSettings({ theme: b.dataset.theme }); }));
    root.querySelectorAll('[data-block-start]').forEach((inp) => inp.addEventListener('change', () => {
      const cur = { ...(app.settings.blockStarts || {}) };
      if (inp.value) cur[inp.dataset.blockStart] = mondayOf(inp.value); else delete cur[inp.dataset.blockStart];
      app.saveSettings({ blockStarts: cur });
    }));
    root.querySelector('#start').addEventListener('change', (e) => app.saveSettings({ programmeStart: e.target.value ? mondayOf(e.target.value) : null }));
    root.querySelector('#export-json').addEventListener('click', async () => {
      const data = await app.exportBackup();
      download(`lifting-tracker-backup-${todayIso()}.json`, JSON.stringify(data, null, 2));
      toast('Backup downloaded');
    });
    root.querySelector('#export-csv').addEventListener('click', () => {
      const byId = new Map(app.sessions.map((x) => [x.id, x]));
      download(`lifting-tracker-sets-${todayIso()}.csv`, setsToCsv(app.sets, byId), 'text/csv');
    });
    root.querySelector('#import-json').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 100 * 1024 * 1024) { toast('That file is too large to be a backup'); e.target.value = ''; return; }
      const text = await file.text(); e.target.value = '';
      const sheet = openSheet(`<h2>Restore backup?</h2><p class="muted small">This replaces everything on this device with the contents of <b>${esc(file.name)}</b>.</p><div id="msg"></div><div class="row spread" style="margin-top:14px"><button class="btn ghost" id="no">Cancel</button><button class="btn primary" id="yes">Replace my data</button></div>`);
      sheet.el.querySelector('#no').addEventListener('click', sheet.close);
      sheet.el.querySelector('#yes').addEventListener('click', async () => {
        let r;
        try { r = await app.importBackup(text); } catch (err) { r = { ok: false, errors: [`Could not write to storage: ${err?.message || err}`] }; }
        if (!r.ok) { sheet.el.querySelector('#msg').innerHTML = `<ul>${r.errors.map((x) => `<li style="color:var(--bad)">${esc(x)}</li>`).join('')}</ul><p class="small muted">Nothing was changed.</p>`; return; }
        sheet.close(); toast(`Restored ${r.counts.sets} sets`); ui.train = null; ui.muscles = null;
      });
    });
    root.querySelector('#wipe').addEventListener('click', () => {
      const sheet = openSheet(`<h2>Delete everything?</h2><p>This removes your programme, logged sets and bodyweights from this device. It cannot be undone, so export a backup first.</p><label class="field"><span>Type DELETE to confirm</span><input id="c" autocomplete="off"></label><div class="row spread" style="margin-top:14px"><button class="btn ghost" id="no">Cancel</button><button class="btn" id="yes" disabled style="border-color:var(--bad);color:var(--bad)">Delete all</button></div>`);
      const c = sheet.el.querySelector('#c'), y = sheet.el.querySelector('#yes');
      c.addEventListener('input', () => { y.disabled = c.value.trim() !== 'DELETE'; });
      sheet.el.querySelector('#no').addEventListener('click', sheet.close);
      y.addEventListener('click', async () => { await app.resetAll(); sheet.close(); ui.train = null; ui.muscles = null; toast('All data deleted'); });
    });
  }
  return { html, bind };
}
