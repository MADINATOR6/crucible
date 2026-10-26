// Progress → Body: the day's estimated energy (sleep, lifting, cardio and work entries, everyday movement, digestion),
// the last 7 days, calories per lifting session, bodyweight, and the body details the estimates use. The maths and
// its sources live in src/core/calories.js.
import { ACTIVITIES, EVERYDAY } from '../../core/calories.js';
import { PACES, PACE_LABELS } from '../../core/targets.js';
import { round1, convert } from '../../core/units.js';
import { addDays } from '../../core/weeks.js';
import { lineChart, bindCharts, movingAverage, shortDate, longDate } from '../charts.js';
import { esc, toast, todayIso } from '../dom.js';

const kcal = (n) => (Math.round(n / 10) * 10).toLocaleString('en-AU'); // nearest 10: the estimate is not more precise
const span = ([lo, hi]) => (kcal(lo) === kcal(hi) ? kcal(lo) : `${kcal(lo)}–${kcal(hi)}`);
const mid = ([lo, hi]) => (lo + hi) / 2;
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${Math.round(m % 60) ? ` ${Math.round(m % 60)} min` : ''}` : `${Math.round(m)} min`);
const weekday = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short' });
const GROUPS = [...new Set(Object.values(ACTIVITIES).map((a) => a.group))];
/** "Nursing shift, typical (rounds…)" → "Typical shift"; other labels lose only their bracketed detail. */
const short = (kind) => {
  const label = ACTIVITIES[kind].label.replace(/ \(.*\)$/, '');
  const shift = label.match(/^Nursing shift, (\w+)/);
  return shift ? `${shift[1][0].toUpperCase()}${shift[1].slice(1)} shift` : label;
};

/** Seven bars, one per day ending on `date`; the chosen day is solid and every bar selects its day. */
function weekChart(week, date) {
  const W = 336, H = 150, base = H - 22, top = 20, slot = W / 7, bw = 30;
  const max = Math.max(...week.map((d) => (d.e ? mid(d.e.total) : 0)), 1);
  const bars = week.map((d, i) => {
    const v = d.e ? mid(d.e.total) : 0, h = (v / max) * (base - top), x = i * slot + (slot - bw) / 2, on = d.d === date;
    return `<g class="wk-bar${on ? ' is-on' : ''}" data-day="${d.d}" role="button" tabindex="0" aria-label="${esc(longDate(d.d))}: ${d.e ? `about ${span(d.e.total)} kcal` : 'no estimate'}">
      <rect x="${i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
      ${d.e ? `<rect class="wk-fill" x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="4"/><text class="wk-val" x="${x + bw / 2}" y="${base - h - 6}">${(v / 1000).toFixed(1)}k</text>` : `<text class="wk-val" x="${x + bw / 2}" y="${base - 6}">–</text>`}
      <text class="wk-day" x="${x + bw / 2}" y="${H - 4}">${weekday(d.d)}</text></g>`;
  }).join('');
  return `<svg class="wk-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Estimated kcal for the last 7 days">${bars}</svg>`;
}

export function bodyView(app, ui) {
  const b = (ui.body ||= { date: todayIso() });
  const s = app.settings, unit = s.unit, today = todayIso();
  const toU = (kg) => round1(convert(kg, 'kg', unit));
  const day = app.dayEnergy(b.date);
  const entries = app.activities.filter((a) => a.date === b.date);
  const bw = app.bodyweightPoints();
  const missing = !bw.length ? 'Add a bodyweight below to see your daily energy.' : 'Add your height, birth year and sex (or body fat %) under Your details to see your daily energy.';
  // Your last few distinct activities (kind and length), newest first, for one-tap logging.
  const recent = [...new Map([...app.activities].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map((a) => [`${a.kind}|${a.minutes}`, a])).values()].slice(0, 4);
  const del = (a) => `<button type="button" class="btn ghost small" data-del-act="${esc(a.id)}" aria-label="Remove ${esc(ACTIVITIES[a.kind].label)}">×</button>`;

  let rows = '';
  if (day) {
    const all = mid(day.total), row = (label, sub, k, extra = '') => `<li class="list-row energy-row"><span class="main"><span>${esc(label)}<small>${esc(sub)}</small></span><svg class="ebar" width="100%" height="5" aria-hidden="true"><rect width="${Math.max(2, (mid(k) / all) * 100).toFixed(1)}%" height="5" rx="2.5"/></svg></span><span class="trail">${span(k)}</span>${extra}</li>`;
    rows = [
      ...day.parts.map((p) => row(p.id ? short(entries.find((a) => a.id === p.id).kind) : p.label, dur(p.minutes), p.kcal, p.id ? del(entries.find((a) => a.id === p.id)) : '')),
      row('Everyday movement', `${dur(day.everyday.minutes)} awake · ${(EVERYDAY[s.everyday] ?? EVERYDAY.mixed).label.toLowerCase()}`, [day.everyday.kcal, day.everyday.kcal]),
      row('Sleep', `${dur(day.sleep.minutes)} at resting burn`, [day.sleep.kcal, day.sleep.kcal]),
      row('Digestion', 'about 10% of the day', day.digestion),
    ].join('');
  }
  const week = Array.from({ length: 7 }, (_, i) => addDays(b.date, i - 6)).map((d) => ({ d, e: app.dayEnergy(d) }));
  const known = week.filter((d) => d.e);
  const avg = known.length ? known.reduce((a, d) => a + mid(d.e.total), 0) / known.length : null;

  const sessions = app.sessions.filter((x) => x.date <= today).sort((a, c) => (a.date < c.date ? 1 : -1))
    .map((x) => ({ date: x.date, c: app.sessionCalories(x) })).filter((r) => r.c).slice(0, 10);
  const haveActive = sessions.some((r) => r.c.active);
  const bwSeries = bw.length ? [{ id: 'bw', label: 'Weigh-ins', kind: 'dots', faint: true, points: bw.map((p) => ({ x: p.x, y: toU(p.y) })) }, { id: 'bw', label: '7-day average', kind: 'line', points: movingAverage(bw, 7).map((p) => ({ x: p.x, y: toU(p.y) })) }] : [];
  const field = (key, label, attrs) => `<label class="field"><span>${label}</span><input data-body="${key}" type="number" inputmode="decimal" ${attrs} value="${s[key] ?? ''}"></label>`;
  const method = s.bodyFatPct ? 'from your lean mass (body fat %)' : s.heightCm && s.birthYear && s.sex ? 'from your weight, height, age and sex' : null;

  const { maintenance: m, target: t } = app.eatingTarget(today);
  const g = (n) => `${Math.round(n)}`;
  const kgWk = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)} kg a week`;
  const goalCard = `
    <section class="card goal-card">
      <div class="card-h"><h2>Eat for your goal</h2><span class="muted small">daily average</span></div>
      <div class="seg view-tabs mb-2" role="group" aria-label="Goal">${[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([k, l]) => `<button data-goal="${k}" aria-pressed="${s.goal === k}">${l}</button>`).join('')}</div>
      ${s.goal !== 'maintain' ? `<div class="seg view-tabs mb-3" role="group" aria-label="Pace">${Object.entries(PACES[s.goal]).map(([k, pct]) => `<button data-pace="${k}" aria-pressed="${s.goalPace === k}">${PACE_LABELS[k]} <small>${Math.abs(pct)}%/wk</small></button>`).join('')}</div>` : ''}
      ${t ? `<div class="energy-hero"><b class="figure">${kcal(t.kcal)}<small>kcal a day</small></b>
          <span class="muted small">${s.goal === 'maintain' ? 'to hold your weight' : `about ${kgWk(t.kgPerWeek)}`} · maintenance ${kcal(m.kcal)}, ${m.measured ? `measured from ${m.measured.days} days of intake and your weight trend` : `estimated from your last ${m.estimatedDays} day${m.estimatedDays === 1 ? '' : 's'}`}</span></div>
        <div class="grid-3 macros">
          <div class="stat"><span>Protein</span><b class="figure">${g(t.protein.g)}<small>g</small></b><small>${g(t.protein.lo)}–${g(t.protein.hi)} g</small></div>
          <div class="stat"><span>Fat</span><b class="figure">${g(t.fat.g)}<small>g</small></b><small>${g(t.fat.lo)}–${g(t.fat.hi)} g</small></div>
          <div class="stat"><span>Carbs</span><b class="figure">${g(t.carbs.g)}<small>g</small></b><small>${t.carbs.perKg.toFixed(1)} g/kg</small></div>
        </div>
        ${t.floored ? '<p class="small tone-warn mt-2">Held at your resting burn (or the 1,500 / 1,200 kcal minimum): a bigger deficit risks muscle and health. The change will be slower than the pace you picked.</p>' : ''}
        ${t.lowCarb ? '<p class="small tone-warn mt-2">Carbs are under 3 g/kg, the suggested minimum to fuel training. Consider a slower pace.</p>' : ''}
        ${s.goal === 'lose' && !s.bodyFatPct ? '<p class="small muted mt-2">Cutting: aim for the top of the protein range. Add a body fat % under Your details for a lean-mass protein target.</p>' : ''}
        ${!m.measured ? '<p class="small muted mt-2">Log what you eat with your weigh-ins below. After 2 weeks (14 days of intake, 8 weigh-ins) maintenance is measured from your real weight change instead of estimated.</p>' : ''}`
      : `<p class="muted">${esc(missing)}</p>`}
      <details class="fold mt-3"><summary>How this target works</summary><div class="small muted">
        <p><b>Maintenance</b> is the average of your last 7 days of estimated energy. Once you log intake for 2 weeks, it switches to the measured method: average calories eaten minus your weight trend (a robust Theil–Sen line through 28 days of weigh-ins) × the energy per kg below. This corrects the estimate for your own metabolism.</p>
        <p><b>Pace</b>: losing 0.5–1% of bodyweight a week helps keep muscle (Helms, Aragon &amp; Fitschen 2014); gaining 0.25–0.5% a week suits novice and intermediate lifters (Iraki et al. 2019). <b>Energy per kg</b> depends on how lean you are (Hall 2008): part of each kg is lean tissue, which holds far less energy than fat. ${s.bodyFatPct && t ? `For you that is ${kcal(t.perKg)} kcal per kg.` : 'Without a body fat % the 7,700 kcal rule is used, which overstates it for lean lifters; add one under Your details.'}</p>
        <p><b>Protein</b> 1.6–2.2 g/kg (Morton et al. 2018), or 2.3–3.1 g per kg of lean mass when cutting with a known body fat % (Helms 2014). <b>Fat</b> 0.5–1.5 g/kg (Iraki 2019), or 15–30% of calories when cutting (Helms 2014). <b>Carbs</b> are the rest; at least 3 g/kg fuels training.</p>
        <p>The target never drops below your resting burn or 1,500 kcal (men) / 1,200 kcal (women). Weigh in under the same conditions, judge progress over 2–3 weeks, not day to day. This is general guidance, not medical advice; see a dietitian for health conditions.</p></div></details>
    </section>`;

  const html = `${goalCard}
    <section class="card energy-card mt-4">
      <div class="card-h"><h2>Daily energy</h2><input id="energy-date" class="energy-date" type="date" value="${esc(b.date)}" max="${today}" aria-label="Day"></div>
      ${day ? `<div class="energy-hero"><b class="figure">${span(day.total)}<small>kcal</small></b><span class="muted small">estimated burn ${b.date === today ? 'today' : `on ${esc(longDate(b.date))}`}</span></div>
        ${day.overMinutes ? `<p class="small tone-warn mb-2">Sleep and logged activities add up to ${dur(1440 + day.overMinutes)}, more than a day. Check for a duplicate entry (remove it with ×).</p>` : ''}
        <ul class="list energy">${rows}</ul>`
        : `<p class="muted">${esc(missing)}</p>${entries.length ? `<ul class="list energy">${entries.map((a) => `<li class="list-row"><span class="main">${esc(ACTIVITIES[a.kind].label)}<small>${dur(a.minutes)}</small></span>${del(a)}</li>`).join('')}</ul>` : ''}`}
      ${recent.length ? `<div class="field mt-3"><span>Quick add${b.date === today ? '' : ` to ${esc(shortDate(b.date))}`}</span><div class="chips">${recent.map((a) => `<button type="button" class="chip" data-quick="${esc(a.kind)}|${a.minutes}" aria-label="Add ${esc(ACTIVITIES[a.kind].label)}, ${dur(a.minutes)}">+ ${esc(short(a.kind))} · ${dur(a.minutes)}</button>`).join('')}</div></div>` : ''}
      <form id="act-form" class="act-form mt-3">
        <label class="field"><span>Add cardio, sport or a work shift</span><select name="kind" required><option value="">Choose an activity…</option>${GROUPS.map((g) => `<optgroup label="${esc(g)}">${Object.entries(ACTIVITIES).filter(([, a]) => a.group === g).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <div class="act-time"><label class="field"><span>Hours</span><input name="h" type="number" min="0" max="24" step="1" inputmode="numeric" placeholder="0"></label><label class="field"><span>Minutes</span><input name="m" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="30"></label><button class="btn primary" type="submit">Add</button></div>
      </form>
    </section>
    <section class="card mt-4"><div class="card-h"><h2>Last 7 days</h2><span class="muted small">${avg ? `average ${kcal(avg)} kcal` : ''}</span></div>
      ${known.length ? weekChart(week, b.date) : `<p class="muted">${esc(missing)}</p>`}
      ${known.length ? '<p class="small muted">Tap a day to see its breakdown.</p>' : ''}</section>
    <section class="card mt-4"><div class="card-h"><h2>Lifting sessions</h2><span class="muted small">kcal per session</span></div>
      ${sessions.length ? `<div class="scroll-x"><table class="plain"><thead><tr><th>Date</th><th>Time</th><th>Total</th>${haveActive ? '<th>Active</th>' : ''}</tr></thead><tbody>${sessions.map((r) => `<tr><td>${esc(shortDate(r.date))}</td><td>${dur(r.c.minutes)}</td><td>${span(r.c.total)}</td>${haveActive ? `<td>${r.c.active ? span(r.c.active) : '–'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Appears after a session logged live (at least two sets on the day) with a bodyweight entered.</p>'}
      <p class="small muted mt-2">Active = total minus what you would burn resting anyway.</p></section>
    <section class="card mt-4"><div class="card-h"><h2>Weigh-ins</h2><span class="muted small">${bw.length ? bw.length + ' entries' : ''}</span></div>
      ${bwSeries.length ? lineChart({ series: bwSeries, unit, height: 160, tips: bw.map((p) => ({ x: p.x, lines: [longDate(p.x), `${toU(p.y)} ${unit}${p.estimated ? ' (estimated date)' : ''}`] })), title: 'Bodyweight weigh-ins and their 7-day average' }) : '<p class="muted">No bodyweight yet.</p>'}
      <form id="bwform" class="weigh-form mt-3"><label class="field"><span>Weight (${unit})</span><input name="w" type="number" step="0.1" min="20" inputmode="decimal" required></label>
        <label class="field"><span>Calories eaten (optional)</span><input name="c" type="number" step="10" min="0" max="20000" inputmode="numeric" placeholder="that day"></label>
        <label class="field"><span>Date</span><input name="d" type="date" value="${today}" max="${today}" required></label><button class="btn primary" type="submit">Add</button></form>
      <p class="small muted mt-2">Weigh in each morning after the toilet, before eating. Adding the day's calories lets the goal card measure your real maintenance.</p>
      ${bw.some((p) => p.estimated) ? '<p class="small muted mt-2">Points from the workbook use estimated dates.</p>' : ''}</section>
    <section class="card mt-4" id="body-details"><div class="card-h"><h2>Your details</h2><span class="muted small">${method ? `resting burn ${method}` : 'needed for the estimates'}</span></div>
      <div class="details-grid">${field('heightCm', 'Height (cm)', 'min="100" max="250" step="0.5"')}${field('birthYear', 'Birth year', 'min="1900" max="2100" step="1"')}${field('bodyFatPct', 'Body fat % (optional)', 'min="3" max="60" step="0.5"')}${field('sleepHours', 'Sleep (hours a night)', 'min="3" max="14" step="0.5"')}</div>
      <div class="field mt-2"><span>Everyday movement outside logged activities</span><div class="seg" role="group" aria-label="Everyday movement">${Object.entries(EVERYDAY).map(([k, v]) => `<button data-everyday="${k}" aria-pressed="${s.everyday === k}">${v.label}</button>`).join('')}</div></div>
      <div class="field mt-2"><span>Sex (also your IPF GL category)</span><div class="seg" role="group" aria-label="Sex">${[['male', 'Male'], ['female', 'Female'], ['', 'Not set']].map(([v, t]) => `<button data-sex="${v}" aria-pressed="${(s.sex || '') === v}">${t}</button>`).join('')}</div></div>
      <details class="fold mt-3"><summary>How these estimates work</summary><div class="small muted">
        <p><b>Activities</b> use the 2024 Adult Compendium of Physical Activities: each one's MET (effort as a multiple of rest) × 3.5 ml O₂/kg/min × bodyweight × time, at about 5 kcal per litre of oxygen. Lifting is 3.5–6 METs (codes 02054, 02052, 02050), banded by your session's RPE, timed from when you logged its sets. A nursing shift is a whole-shift average: quiet 1.8, typical 2.3 or busy 3.3 METs (codes 11600, 11650, 11610), because measured ward nurses are active for only about a quarter of a shift (Chappel et al. 2023). Enter the full shift length.</p>
        <p><b>Resting burn</b> uses the ten Haaf &amp; Weijs (2014) equation for athletes, the most precise in a 2023 meta-analysis: lean mass when you give a body fat %, otherwise weight, height, age and sex.</p>
        <p><b>A day</b> = sleep at resting burn + logged activities + the rest of your waking time as everyday movement + digestion (about 10%). Everyday movement is every awake minute you didn't log, at the level you pick: mostly sitting 1.3, mixed 1.5 or on your feet 1.8 METs (Compendium 07026, 07022, 11600). It is the least certain part of the day, which is why the goal card switches to your measured maintenance once you log intake. Without heart rate data, expect roughly ±30% on activities and ±10% on resting burn.</p></div></details>
    </section>`;

  function bind(root, rerender) {
    bindCharts(root);
    const pick = (d) => { b.date = d && d <= today ? d : today; rerender(); };
    root.querySelector('#energy-date')?.addEventListener('change', (e) => pick(e.target.value));
    root.querySelectorAll('[data-day]').forEach((g) => {
      g.addEventListener('click', () => pick(g.dataset.day));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g.dataset.day); } });
    });
    root.querySelector('#act-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), minutes = (Number(f.get('h')) || 0) * 60 + (Number(f.get('m')) || 0);
      if (!(minutes > 0 && minutes <= 1440)) { toast('Enter a time between 1 minute and 24 hours'); return; }
      await app.addActivity(b.date, String(f.get('kind')), minutes);
      const added = app.activities.at(-1);
      toast(`Added ${short(String(f.get('kind'))).toLowerCase()}, ${dur(minutes)}`, 4200, { label: 'Undo', onClick: () => app.deleteActivity(added.id) });
    });
    root.querySelectorAll('[data-quick]').forEach((btn) => btn.addEventListener('click', async () => {
      const [kind, minutes] = btn.dataset.quick.split('|');
      await app.addActivity(b.date, kind, Number(minutes));
      const added = app.activities.at(-1);
      toast(`Added ${short(kind).toLowerCase()}, ${dur(Number(minutes))}`, 4200, { label: 'Undo', onClick: () => app.deleteActivity(added.id) });
    }));
    root.querySelectorAll('[data-del-act]').forEach((btn) => btn.addEventListener('click', async () => {
      const a = app.activities.find((x) => x.id === btn.dataset.delAct);
      if (!a) return;
      await app.deleteActivity(a.id);
      toast('Activity removed', 4200, { label: 'Undo', onClick: () => app.addActivity(a.date, a.kind, a.minutes) });
    }));
    root.querySelector('#bwform')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target); const w = parseFloat(f.get('w')), c = f.get('c') === '' ? null : Number(f.get('c'));
      if (!(w > 20 && w < 500)) { toast('Enter a realistic bodyweight'); return; }
      if (c != null && !(c >= 0 && c < 20000)) { toast('Enter calories between 0 and 20,000'); return; }
      await app.addBodyweight(String(f.get('d')), { value: w, unit }, c);
      toast(c != null ? 'Weigh-in and calories added' : 'Weigh-in added');
    });
    root.querySelectorAll('[data-goal]').forEach((btn) => btn.addEventListener('click', () => app.saveSettings({ goal: btn.dataset.goal, goalPace: btn.dataset.goal === 'lose' ? 'steady' : btn.dataset.goal === 'gain' ? 'lean' : 'hold' })));
    root.querySelectorAll('[data-pace]').forEach((btn) => btn.addEventListener('click', () => app.saveSettings({ goalPace: btn.dataset.pace })));
    root.querySelectorAll('[data-everyday]').forEach((btn) => btn.addEventListener('click', () => app.saveSettings({ everyday: btn.dataset.everyday })));
    root.querySelectorAll('[data-body]').forEach((inp) => inp.addEventListener('change', () => {
      const v = inp.value === '' ? null : Number(inp.value);
      app.saveSettings({ [inp.dataset.body]: inp.dataset.body === 'birthYear' && v != null ? Math.round(v) : v ?? (inp.dataset.body === 'sleepHours' ? 8 : null) });
    }));
    root.querySelectorAll('[data-sex]').forEach((btn) => btn.addEventListener('click', () => app.saveSettings({ sex: btn.dataset.sex || null })));
  }
  return { html, bind };
}
