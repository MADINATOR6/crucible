// Plan view: tell the app what you need ("maintenance block, 3 days") and it builds the next block from your
// own recent training. Everything it proposes is editable afterwards; it is a planning aid, not coaching advice.
import { convert, formatWeight, round1, toKg } from '../../core/units.js';
import { esc, toast, todayIso } from '../dom.js';
import { renderHeatmap, renderLegend, renderMuscleList, fmtSets } from '../heatmap.js';
import { coachReview, applyExtras } from '../../core/coach.js';

let mods = null; // the planning modules are loaded on first use, so the rest of the app never depends on them
async function loadMods() {
  if (mods) return mods;
  const [athlete, template, generator, request] = await Promise.all([
    import('../../core/athlete.js'), import('../../core/template.js'), import('../../core/generator.js'), import('../../core/request.js'),
  ]);
  mods = { ...athlete, ...template, ...generator, ...request };
  return mods;
}

const FOCI = [
  { id: 'maintenance', label: 'Maintain', blurb: 'Hold your strength with less volume and fatigue.' },
  { id: 'strength', label: 'Build strength', blurb: 'Progress the main lifts week to week.' },
  { id: 'volume', label: 'Build size', blurb: 'More sets, steady loads.' },
  { id: 'return', label: 'Back from a break', blurb: 'Ease back in after time off.' },
  { id: 'peak', label: 'Peak for a meet', blurb: 'Sharpen towards heavy singles.' },
  { id: 'specialise', label: 'Bring up a lift', blurb: 'Extra work on one lift.' },
  { id: 'deload', label: 'Deload', blurb: 'An easy block to recover.' },
];
const LIFTS = ['squat', 'bench', 'deadlift'];

function pickTemplateBlock(programme) {
  const blocks = [...programme.blocks].sort((a, b) => a.number - b.number);
  const doneWeeks = (b) => b.weeks.filter((w) => w.days.some((d) => d.entries.some((e) => e.sets.some((s) => s.completed)))).length;
  const withDone = blocks.filter((b) => doneWeeks(b) >= 2);
  return (withDone.at(-1) || blocks.filter((b) => b.weeks.length).at(-1) || null)?.number ?? null;
}

function nextBlockNumber(programme) { return Math.max(0, ...programme.blocks.map((b) => b.number)) + 1; }

/** Athlete model with the user's own e1RM entries applied on top. */
function athleteFor(app, ui) {
  const m = mods;
  const model = m.buildAthleteModel({ events: app.events(), catalogue: app.catalogue, programme: app.programme });
  const o = ui.plan.overrides || {};
  const lifts = { ...model.lifts };
  for (const f of LIFTS) {
    const v = parseFloat(o[f]);
    if (Number.isFinite(v) && v > 0) lifts[f] = { ...lifts[f], e1rmKg: round1(toKg({ value: v, unit: app.settings.unit })), confidence: 'high', basis: 'entered by you', n: lifts[f]?.n ?? 0 };
  }
  return { ...model, lifts };
}

function templateFor(app, athlete) {
  const m = mods;
  const blockNumber = pickTemplateBlock(app.programme);
  if (blockNumber == null) return null;
  // The athlete's e1RM when that block was run: events up to the end of the block, else today's numbers.
  const block = app.programme.blocks.find((b) => b.number === blockNumber);
  const lastWeek = block?.weeks.at(-1);
  const end = lastWeek ? app.dateFor({ blockNumber, weekNumber: lastWeek.number, dayNumber: lastWeek.days.at(-1)?.number ?? 1 }) : null;
  let reference = Object.fromEntries(LIFTS.map((f) => [f, athlete.lifts[f]?.e1rmKg ?? null]));
  if (end) {
    const then = m.buildAthleteModel({ events: app.events().filter((e) => e.date <= end), catalogue: app.catalogue, asOf: end });
    reference = Object.fromEntries(LIFTS.map((f) => [f, then.lifts[f]?.e1rmKg ?? reference[f]]));
  }
  return m.learnTemplate({ programme: app.programme, catalogue: app.catalogue, referenceE1rm: reference, blockNumber });
}

function optionsFrom(p) {
  const o = { focus: p.focus };
  if (p.weeks) o.weeks = p.weeks;
  if (p.days) o.daysPerWeek = p.days;
  if (p.progression && p.progression !== 'standard') o.progression = p.progression;
  if (p.rotate != null) o.rotate = p.rotate;
  if (p.stance && p.stance !== 'auto') o.deadliftStance = p.stance;
  if (p.deloadWeek && p.deloadWeek !== 'auto') o.deloadWeek = p.deloadWeek;
  if (p.focus === 'specialise') o.emphasis = p.emphasis || 'bench';
  if (p.focus === 'return') o.layoffWeeks = p.layoffWeeks || 4;
  if (p.focus === 'maintenance') o.checkIn = p.checkIn !== false;
  return o;
}

function blockAsText(block, unit) {
  const lines = [`${block.name} (generated)`, ''];
  for (const w of block.weeks) {
    lines.push(w.label);
    for (const d of w.days) {
      lines.push(`  Day ${d.number}`);
      for (const e of d.entries) {
        lines.push(`    ${e.name}: ` + e.sets.map((s) => `${s.repsRaw ?? (s.repsMin === s.repsMax ? s.repsMin : s.repsMin + '-' + s.repsMax)}${s.targetRpe != null ? '@' + s.targetRpe : ''}${s.load ? ' ' + formatWeight(s.load, unit) : ''}`).join(', '));
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function planView(app, ui) {
  const unit = app.settings.unit;
  ui.plan ||= { text: '', focus: 'strength', weeks: null, days: null, progression: 'standard', rotate: null, stance: 'auto', emphasis: 'bench', layoffWeeks: 4, checkIn: true, deloadWeek: 'auto', seed: 'a', overrides: {}, understood: null, result: null, error: '', week: 1, revise: null, extras: [], applied: [] };
  const p = ui.plan;
  if (app.usingExample) {
    return { html: `<div class="topbar"><div><h1>Plan</h1></div><span class="pill example">Example data</span></div>
      <div class="card empty"><h2>Import your workbook first</h2><p>The block generator learns from your own recent training, so it needs your programme. Import your coach's workbook in Data, then come back.</p><a class="btn primary" href="#data">Go to Data</a></div>`, bind() {} };
  }
  if (!mods) return { html: '<div class="topbar"><div><h1>Plan</h1></div></div><p class="muted">Loading…</p>', bind(root, rerender) { loadMods().then(rerender).catch((err) => { root.innerHTML = `<div class="card"><h2>Could not load the planner</h2><p class="muted">${esc(err.message || err)}</p></div>`; }); } };

  let athlete, template, err = '';
  try { athlete = athleteFor(app, ui); template = templateFor(app, athlete); } catch (e) { err = e.message || String(e); }
  if (err || !template) {
    return { html: `<div class="topbar"><div><h1>Plan</h1></div></div><div class="card empty"><h2>Not enough to learn from yet</h2><p>${esc(err || 'No block with training days was found in your programme.')}</p></div>`, bind() {} };
  }
  if (!p._rev || p._rev.events !== app.events() || p._rev.athlete !== athlete) {
    let review = null;
    try { review = coachReview({ events: app.events(), programme: app.programme, catalogue: app.catalogue, athlete, bodyweight: app.bodyweightPoints(), unit }); } catch { review = null; }
    p._rev = { events: app.events(), athlete, review };
  }
  const review = p._rev.review;
  const R = p.result;
  const wk = R ? R.block.weeks.find((w) => w.number === p.week) || R.block.weeks[0] : null;
  const generatedBlocks = app.programme.blocks.filter((b) => b.generated);
  const focusInfo = FOCI.find((f) => f.id === p.focus);

  const liftRows = LIFTS.map((f) => {
    const l = athlete.lifts[f] || {};
    return `<tr><td><b>${f[0].toUpperCase() + f.slice(1)}</b>${f === 'deadlift' && l.stance ? ` <span class="muted small">(${l.stance})</span>` : ''}</td>
      <td class="num">${l.e1rmKg != null ? formatWeight({ value: l.e1rmKg, unit: 'kg' }, unit) : '–'}</td>
      <td><span class="pill ${l.confidence === 'high' ? 'pr' : ''}">${esc(l.confidence || 'none')}</span></td>
      <td class="small muted">${esc(l.basis || '')}</td>
      <td><input type="number" inputmode="decimal" step="0.5" min="0" data-ovr="${f}" value="${esc(p.overrides[f] ?? '')}" placeholder="${l.e1rmKg != null ? round1(convert(l.e1rmKg, 'kg', unit)) : ''}" aria-label="Enter your own ${f} e1RM in ${unit}" style="min-height:38px;width:92px"></td></tr>`;
  }).join('');

  const html = `
    <div class="topbar"><div><h1>Plan</h1><p class="muted small">Tell me what you need. I build the next block from your recent training: same shape as your last block, new numbers.</p></div></div>

    ${coachCard(review, p)}
    <div class="card" style="margin-top:14px">
      <div class="card-h"><h2>What do you need?</h2></div>
      <form id="ask" class="row" style="align-items:end"><label class="field" style="flex:1;min-width:220px"><span>In your own words</span><input id="ask-text" value="${esc(p.text)}" placeholder='e.g. "maintenance block, 3 days a week for 4 weeks"' autocomplete="off"></label><button class="btn primary" type="submit">Understand</button></form>
      ${p.understood ? `<div class="small" style="margin-top:10px"><b>${esc(p.understood.summary || 'Here is what I understood')}</b>${p.understood.understood.length ? '<ul style="margin:6px 0 0;padding-left:18px">' + p.understood.understood.map((u) => `<li>${esc(u.key)}: <b>${esc(String(u.value))}</b> <span class="muted">(${esc(u.because)})</span></li>`).join('') + '</ul>' : ''}${p.understood.unclear.map((u) => `<p style="color:var(--warn);margin:6px 0 0">${esc(u)}</p>`).join('')}</div>` : ''}
      <div class="chips" style="margin-top:12px" role="group" aria-label="Quick goals">${FOCI.map((f) => `<button class="chip" data-focus="${f.id}" aria-pressed="${p.focus === f.id}" title="${esc(f.blurb)}">${esc(f.label)}</button>`).join('')}</div>
      <p class="small muted">${esc(focusInfo?.blurb || '')}</p>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-h"><h2>Settings</h2><span class="muted small">leave blank to let the app choose</span></div>
      <div class="grid cols-3">
        <label class="field"><span>Weeks (3-8)</span><input id="p-weeks" type="number" min="3" max="8" step="1" value="${esc(p.weeks ?? '')}" placeholder="auto"></label>
        <label class="field"><span>Days per week</span><input id="p-days" type="number" min="1" max="7" step="1" value="${esc(p.days ?? '')}" placeholder="auto (${template.daysPerWeek} in your last block)"></label>
        <label class="field"><span>Progression</span><select id="p-prog">${['conservative', 'standard', 'aggressive'].map((x) => `<option ${p.progression === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Exercise rotation</span><select id="p-rot"><option value="" ${p.rotate == null ? 'selected' : ''}>auto</option><option value="0" ${p.rotate === 0 ? 'selected' : ''}>keep my exercises</option><option value="0.3" ${p.rotate === 0.3 ? 'selected' : ''}>change a few</option><option value="0.7" ${p.rotate === 0.7 ? 'selected' : ''}>change lots</option></select></label>
        <label class="field"><span>Deadlift stance</span><select id="p-stance">${['auto', 'sumo', 'conventional'].map((x) => `<option ${p.stance === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Deload week</span><select id="p-deload">${['auto', 'none', 'last', 'all'].map((x) => `<option ${p.deloadWeek === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        ${p.focus === 'specialise' ? `<label class="field"><span>Lift to bring up</span><select id="p-emph">${LIFTS.map((x) => `<option ${p.emphasis === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        ${p.focus === 'return' ? `<label class="field"><span>Weeks since proper training</span><input id="p-layoff" type="number" min="1" max="52" step="1" value="${esc(p.layoffWeeks)}"></label>` : ''}
        ${p.focus === 'maintenance' ? `<label class="row" style="align-self:end"><input id="p-checkin" type="checkbox" ${p.checkIn ? 'checked' : ''} style="width:auto;min-height:0"> Heavy single check-in in the last week</label>` : ''}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-h"><h2>What I'm basing it on</h2><span class="muted small">Template: Block ${template.fromBlock} ${esc(template.blockName)}, ${template.daysPerWeek} days</span></div>
      <div style="overflow-x:auto"><table class="plain"><thead><tr><th>Lift</th><th>Working e1RM</th><th>Confidence</th><th>From</th><th>Use ${esc(unit)}</th></tr></thead><tbody>${liftRows}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">Estimated from your RPE-rated sets in the last 8 weeks with the RPE chart. If a number looks wrong, type your own in the last column.</p>
      <div style="margin-top:10px"><button class="btn primary" id="gen">Generate block ${nextBlockNumber(app.programme)}</button></div>
      ${p.error ? `<p style="color:var(--bad);margin-top:10px">${esc(p.error)}</p>` : ''}
    </div>

    ${R ? previewHtml(app, p, R, wk, unit) : ''}

    ${generatedBlocks.length ? `<div class="card" style="margin-top:14px"><div class="card-h"><h2>Your generated blocks</h2></div>${generatedBlocks.map((b) => `<div class="row spread" style="padding:8px 0;border-top:1px solid var(--line)"><span><b>Block ${b.number}</b> ${esc(b.name)} <span class="muted small">${esc(b.generated.focus)}, ${b.weeks.length} weeks</span></span><span class="row"><button class="btn small" data-revise="${b.number}">Re-load remaining weeks</button><button class="btn small ghost" data-remove="${b.number}">Remove</button></span></div>`).join('')}${p.revise ? reviseHtml(p.revise, unit) : ''}</div>` : ''}`;

  function bind(root, rerender) {
    const set = (patch) => { Object.assign(p, patch); rerender(); };
    root.querySelector('#ask').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = root.querySelector('#ask-text').value;
      const r = mods.interpretRequest(text);
      const o = r.options;
      set({ text, understood: r, focus: o.focus ?? p.focus, weeks: o.weeks ?? p.weeks, days: o.daysPerWeek ?? p.days, progression: o.progression ?? p.progression, rotate: o.rotate ?? p.rotate,
        stance: o.deadliftStance ?? p.stance, deloadWeek: o.deloadWeek ?? p.deloadWeek, emphasis: o.emphasis ?? p.emphasis, layoffWeeks: o.layoffWeeks ?? p.layoffWeeks, checkIn: o.checkIn ?? p.checkIn });
    });
    root.querySelectorAll('[data-coach]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.coach;
      const f = review?.findings.find((x) => x.id === id);
      if (!f?.action) return;
      const a = f.action;
      const on = p.applied.includes(id);
      if (on) { p.applied = p.applied.filter((x) => x !== id); if (a.type === 'addExercise') p.extras = p.extras.filter((x) => x.exerciseId !== a.exerciseId); rerender(); return; }
      p.applied = [...p.applied, id];
      if (a.type === 'emphasis') { p.focus = 'specialise'; p.emphasis = a.lift; }
      else if (a.type === 'focus') p.focus = a.focus;
      else if (a.type === 'progression') p.progression = a.value;
      else if (a.type === 'days') p.days = a.value;
      else if (a.type === 'deloadWeek') p.deloadWeek = a.value;
      else if (a.type === 'rotate') p.rotate = a.value;
      else if (a.type === 'addExercise') p.extras = [...p.extras.filter((x) => x.exerciseId !== a.exerciseId), { exerciseId: a.exerciseId, sets: a.sets, reps: a.reps, rpe: a.rpe }];
      rerender();
    }));
    root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => set({ focus: b.dataset.focus, understood: null, applied: [], extras: [] })));
    const num = (id) => { const v = parseInt(root.querySelector(id)?.value, 10); return Number.isFinite(v) ? v : null; };
    root.querySelector('#p-weeks').addEventListener('change', () => { p.weeks = num('#p-weeks'); });
    root.querySelector('#p-days').addEventListener('change', () => { p.days = num('#p-days'); });
    root.querySelector('#p-prog').addEventListener('change', (e) => { p.progression = e.target.value; });
    root.querySelector('#p-rot').addEventListener('change', (e) => { p.rotate = e.target.value === '' ? null : Number(e.target.value); });
    root.querySelector('#p-stance').addEventListener('change', (e) => { p.stance = e.target.value; });
    root.querySelector('#p-deload').addEventListener('change', (e) => { p.deloadWeek = e.target.value; });
    root.querySelector('#p-emph')?.addEventListener('change', (e) => { p.emphasis = e.target.value; });
    root.querySelector('#p-layoff')?.addEventListener('change', () => { p.layoffWeeks = Math.min(52, Math.max(1, num('#p-layoff') ?? 4)); });
    root.querySelector('#p-checkin')?.addEventListener('change', (e) => { p.checkIn = e.target.checked; });
    root.querySelectorAll('[data-ovr]').forEach((i) => i.addEventListener('change', () => { p.overrides = { ...p.overrides, [i.dataset.ovr]: i.value }; rerender(); }));

    const generate = (seedSuffix = '') => {
      try {
        const res = mods.generateBlock({ catalogue: app.catalogue, template, athlete, blockNumber: nextBlockNumber(app.programme), ...optionsFrom(p), seed: p.seed + seedSuffix, now: () => new Date() });
        let out = res;
        if (p.extras.length) { const x = applyExtras(res.block, p.extras, app.catalogue); out = { ...res, block: x.block, rationale: [...res.rationale, ...x.rationale] }; }
        if (['maintenance', 'return'].includes(p.focus)) out = { ...out, warnings: out.warnings.filter((w) => !/volume changes from/.test(w)) };
        set({ result: out, week: 1, error: '' });
      } catch (e) { set({ error: e instanceof RangeError ? e.message : `Could not generate: ${e.message || e}`, result: null }); }
    };
    root.querySelector('#gen').addEventListener('click', () => generate());
    root.querySelector('#again')?.addEventListener('click', () => { p.seed = p.seed + 'x'; generate(); });
    root.querySelectorAll('[data-pweek]').forEach((b) => b.addEventListener('click', () => set({ week: Number(b.dataset.pweek) })));
    root.querySelector('#copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(blockAsText(R.block, unit)); toast('Plan copied'); } catch { toast('Could not copy'); } });
    root.querySelector('#add')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const block = { ...R.block, generated: { ...R.block.generated, rationale: R.rationale, warnings: R.warnings } };
        await app.addBlock(block);
        ui.train = { block: block.number, week: 1, day: 1 }; ui.plan.result = null;
        toast(`Block ${block.number} added to your programme`);
        location.hash = '#train';
      } catch (err) { toast(err.message || String(err), 4200); e.target.disabled = false; }
    });
    root.querySelectorAll('[data-revise]').forEach((b) => b.addEventListener('click', () => {
      const block = app.programme.blocks.find((x) => x.number === Number(b.dataset.revise));
      const firstOpen = block.weeks.find((w) => !w.days.some((d) => d.entries.some((e) => e.sets.some((s) => s.completed))));
      if (!firstOpen) { toast('Every week already has training logged'); return; }
      try {
        const r = mods.reviseBlock({ block, athlete, catalogue: app.catalogue, fromWeek: firstOpen.number });
        set({ revise: { number: block.number, fromWeek: firstOpen.number, block: r.block, changes: r.changes } });
      } catch (err) { toast(err.message || String(err), 4200); }
    }));
    root.querySelector('#apply-revise')?.addEventListener('click', async () => {
      try { await app.replaceBlock({ ...p.revise.block }); toast('Remaining weeks updated'); p.revise = null; rerender(); } catch (err) { toast(err.message || String(err), 4200); }
    });
    root.querySelector('#cancel-revise')?.addEventListener('click', () => set({ revise: null }));
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Remove generated block ${b.dataset.remove}? Sets you logged stay in your history.`)) return;
      try { await app.removeBlock(Number(b.dataset.remove)); toast('Block removed'); } catch (err) { toast(err.message || String(err), 4200); }
    }));
    root.querySelectorAll('.hm-region').forEach((el) => el.addEventListener('click', () => { p.sel = p.sel === el.dataset.muscle ? null : el.dataset.muscle; rerender(); }));
    root.querySelectorAll('.hm-row').forEach((el) => el.addEventListener('click', () => { p.sel = p.sel === el.dataset.muscle ? null : el.dataset.muscle; rerender(); }));
    root.querySelectorAll('[data-pview]').forEach((b) => b.addEventListener('click', () => set({ view: b.dataset.pview })));
  }
  return { html, bind };
}

const SEV_LABEL = { high: 'Fix first', medium: 'Worth fixing', low: 'Note', good: 'Going well' };

function findingHtml(f, p) {
  const applied = p.applied.includes(f.id);
  return `<article class="coach-find sev-${f.severity}">
    <div class="row spread"><b>${esc(f.title)}</b><span class="pill ${f.severity === 'good' ? 'pr' : f.severity === 'high' ? 'accent' : ''}">${esc(SEV_LABEL[f.severity])}</span></div>
    ${f.because.length ? `<ul class="small muted" style="margin:6px 0 0;padding-left:18px">${f.because.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p style="margin:8px 0 0"><b>Do this:</b> ${esc(f.suggestion)}</p>
    <div class="row spread" style="margin-top:8px"><span class="small muted">Confidence: ${esc(f.confidence)}</span>
      ${f.action ? `<button class="btn small ${applied ? '' : 'primary'}" data-coach="${esc(f.id)}" aria-pressed="${applied}">${applied ? '✓ In the plan (tap to undo)' : esc(f.action.label)}</button>` : ''}</div>
  </article>`;
}

function coachCard(review, p) {
  if (!review) return '';
  const { priorities, strengths, notes } = review;
  return `<div class="card coach">
    <div class="card-h"><h2>Coach's review</h2><span class="muted small">${review.asOf ? 'from your training up to ' + esc(review.asOf) : ''}</span></div>
    <p class="coach-headline">${esc(review.headline)}</p>
    ${priorities.length ? `<h3 style="margin:12px 0 6px">What to improve</h3>${priorities.map((f) => findingHtml(f, p)).join('')}` : ''}
    ${strengths.length ? `<h3 style="margin:14px 0 6px">What is working</h3>${strengths.map((f) => findingHtml(f, p)).join('')}` : ''}
    ${notes.length ? `<details class="fold" style="margin-top:10px"><summary>More notes (${notes.length})</summary>${notes.map((f) => findingHtml(f, p)).join('')}</details>` : ''}
    <p class="small muted" style="margin-top:10px">These come from patterns in your own numbers, using common powerlifting practice. They are suggestions, not a diagnosis. Check anything that matters with your coach. Tap a button to build the fix into the next block.</p>
  </div>`;
}

function previewHtml(app, p, R, wk, unit) {
  const b = R.block;
  const vol = R.volume.perWeek.find((x) => x.week === wk.number)?.muscles || {};
  const typical = R.volume.typical || null;
  const view = p.view || 'front';
  return `<div class="card" style="margin-top:14px">
    <div class="card-h"><h2>${esc(b.name)}</h2><span class="pill accent">${esc(b.generated.focus)} · ${b.weeks.length} weeks · ${b.weeks[0].days.length} days</span></div>
    <p class="muted small">${esc(b.goal)}</p>
    <div class="chips" role="group" aria-label="Week">${b.weeks.map((w) => `<button class="chip" data-pweek="${w.number}" aria-pressed="${w.number === wk.number}">${esc(w.label.length > 26 ? 'Week ' + w.number : w.label)}</button>`).join('')}</div>
    ${wk.days.map((d) => `<section class="entry"><h3>Day ${d.number}</h3>${d.entries.map((e) => `<div style="margin:6px 0 10px"><b>${esc(e.name)}</b>${e.supersetGroup ? ` <span class="pill">${esc(e.supersetGroup)}</span>` : ''}${e.tempo ? ` <span class="muted small">tempo ${esc(e.tempo)}</span>` : ''}
      <table class="sets"><tbody>${e.sets.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.repsRaw ?? (s.repsMin === s.repsMax ? String(s.repsMin) : s.repsMin + '-' + s.repsMax))} reps${s.targetRpe != null ? ` @ ${s.targetRpe}` : ''}</td><td class="num">${s.load ? esc(formatWeight(s.load, unit)) : '<span class="muted">find a load</span>'}</td><td class="muted small">${s.gen?.kind === 'top' ? 'top set' : s.gen?.kind === 'backoff' ? 'back-off' : s.gen?.kind === 'single' ? 'single' : ''}</td></tr>`).join('')}</tbody></table>
      ${e.cues?.length ? `<p class="cue">${e.cues.map(esc).join(' · ')}</p>` : ''}</div>`).join('')}</section>`).join('')}
  </div>
  <div class="card" style="margin-top:14px"><div class="card-h"><h2>Weekly volume, week ${wk.number}</h2><div class="seg hm-view-toggle" role="group" aria-label="Body view"><button data-pview="front" aria-pressed="${view === 'front'}">Front</button><button data-pview="back" aria-pressed="${view === 'back'}">Back</button></div></div>
    ${renderHeatmap(vol, { selected: p.sel || null, view, prev: typical })}${renderLegend()}
    <p class="small muted" style="margin-top:8px">Arrows compare with the same week of your last block. Tap a muscle to highlight it.</p>
    <div style="margin-top:12px">${renderMuscleList(vol, p.sel || null, typical)}</div></div>
  <div class="card" style="margin-top:14px"><div class="card-h"><h2>Why it looks like this</h2></div>
    <ul style="margin:0;padding-left:18px">${R.rationale.map((r) => `<li class="small">${esc(r.text)}</li>`).join('')}</ul>
    ${R.warnings.length ? `<div class="banner" style="margin-top:12px;display:block"><b>Check these</b><ul style="margin:6px 0 0;padding-left:18px">${R.warnings.map((w) => `<li class="small">${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn primary" id="add">Add to my programme</button><button class="btn" id="again">Another version</button><button class="btn ghost" id="copy">Copy as text</button></div>
    <p class="small muted" style="margin-top:8px">These are suggestions built from your numbers. Change anything that does not fit when you log it, and tell your coach if you have one.</p></div>`;
}

function reviseHtml(r, unit) {
  return `<div style="margin-top:12px;padding:12px;border:1px solid var(--line-strong);border-radius:12px"><b>Block ${r.number}: from week ${r.fromWeek}</b>
    ${r.changes.length ? `<ul class="small" style="margin:6px 0;padding-left:18px">${r.changes.slice(0, 40).map((c) => `<li>Week ${c.week} day ${c.day}: ${esc(c.exerciseId)} set ${c.setIndex + 1}: ${esc(formatWeight({ value: c.from, unit: 'kg' }, unit))} → <b>${esc(formatWeight({ value: c.to, unit: 'kg' }, unit))}</b></li>`).join('')}</ul>${r.changes.length > 40 ? `<p class="small muted">…and ${r.changes.length - 40} more</p>` : ''}` : '<p class="small muted">Your numbers have not moved enough to change any load.</p>'}
    <div class="row"><button class="btn primary small" id="apply-revise" ${r.changes.length ? '' : 'disabled'}>Apply</button><button class="btn ghost small" id="cancel-revise">Cancel</button></div></div>`;
}
