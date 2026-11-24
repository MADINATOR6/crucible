// Turns imported metrics into Observations (facts from the data) and Hypotheses (guesses, labelled,
// with sample size) plus recommended actions. Deterministic: no AI, no invented numbers.
import { engagementRate } from './importer.js';

export function median(nums) {
  const s = nums.filter(n => n != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmt = n => (n == null ? 'n/a' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));
const pct = r => (r == null ? 'n/a' : `${(r * 100).toFixed(1)}%`);

// posts: imported metric rows; items: pipeline items (to group by goal/format via linked posts).
export function buildInsights(posts, items = []) {
  const withViews = posts.filter(p => p.metrics?.views != null);
  if (!withViews.length) return { observations: [], hypotheses: [], actions: [], top: [], bottom: [], summary: null };
  const sorted = [...withViews].sort((a, b) => b.metrics.views - a.metrics.views);
  const med = median(withViews.map(p => p.metrics.views));
  const top = sorted.slice(0, 3), bottom = sorted.length > 3 ? sorted.slice(-3).reverse() : [];
  // null when no post reports the metric: unknown is not zero.
  const total = k => (posts.some(p => p.metrics?.[k] != null) ? posts.reduce((a, p) => a + (p.metrics?.[k] || 0), 0) : null);
  const summary = { posts: posts.length, views: total('views'), follows: total('follows'), clicks: total('clicks'), revenue: total('revenue'), medianViews: med };

  const observations = [];
  observations.push({ text: `${withViews.length} posts with view data; median ${fmt(med)} views.`, evidence: 'Imported CSV' });
  for (const p of top) observations.push({ text: `"${short(p.title)}" (${p.platform}) got ${fmt(p.metrics.views)} views, ${ratio(p.metrics.views, med)} your median.`, evidence: p.url || p.title, post: p });
  const byPlatform = groupMedian(withViews, p => p.platform);
  if (byPlatform.length > 1) observations.push({ text: `Median views by platform: ${byPlatform.map(([k, v, n]) => `${k} ${fmt(v)} (${n} posts)`).join(', ')}.`, evidence: 'Imported CSV' });
  const er = withViews.map(p => [p, engagementRate(p.metrics)]).filter(([, r]) => r != null).sort((a, b) => b[1] - a[1]);
  if (er.length) observations.push({ text: `Highest engagement rate: "${short(er[0][0].title)}" at ${pct(er[0][1])}.`, evidence: er[0][0].url || er[0][0].title, post: er[0][0] });

  // Hypotheses from linked pipeline items: which formats / goals beat the median.
  const hypotheses = [], actions = [];
  const linked = items.filter(i => i.metrics?.views != null);
  for (const [format, v, n] of groupMedian(linked, i => i.format)) {
    if (!format || med == null) continue;
    if (v > med * 1.5) {
      hypotheses.push({ text: `The "${format}" format may be working: its median is ${fmt(v)} views vs your ${fmt(med)}.`, sample: n, confidence: n >= 5 ? 'medium' : 'low' });
      actions.push({ text: `Make another "${format}" post and compare.`, format, reason: `Format beat your median (${n} post${n > 1 ? 's' : ''}).` });
    } else if (v < med * 0.5) {
      hypotheses.push({ text: `The "${format}" format may be underperforming: median ${fmt(v)} vs your ${fmt(med)}.`, sample: n, confidence: n >= 5 ? 'medium' : 'low' });
      actions.push({ text: `Try a stronger first-second hook on the next "${format}" post, or pause the format.`, format, reason: `Format below half your median (${n} post${n > 1 ? 's' : ''}).` });
    }
  }
  if (top[0] && top[0].metrics.views > (med || 0)) actions.push({ text: `Follow up on "${short(top[0].title)}" with a part 2 or a reply to its comments.`, reason: 'Your best post by views.', post: top[0] });
  if (summary.clicks === 0 && (summary.revenue === 0 || summary.revenue === null)) actions.push({ text: 'Add a clear call to action (link in bio, product, lead magnet) to your next post: the imported data shows 0 link clicks.', reason: 'Money is your main goal and no post has driven a click yet.' });
  return { observations, hypotheses, actions, top, bottom, summary };
}

// Real data wins: SAMPLE rows are only used while nothing real has been imported.
export function choosePosts(posts) {
  const real = posts.filter(p => !p.sample);
  const out = real.length ? real : posts.filter(p => p.sample);
  out.usingSample = !real.length && out.length > 0;
  return out;
}

function groupMedian(list, key) {
  const g = new Map();
  for (const x of list) { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x.metrics.views); }
  return [...g].map(([k, v]) => [k, median(v), v.length]).sort((a, b) => b[1] - a[1]);
}
const short = t => { t = String(t || 'Untitled'); return t.length > 50 ? t.slice(0, 47) + '...' : t; };
function ratio(v, med) { if (!med) return 'vs'; const r = v / med; return r >= 1 ? `${r.toFixed(1)}x` : `${Math.round(r * 100)}% of`; }
