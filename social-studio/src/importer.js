// Maps a platform analytics CSV export to canonical post measurements by header name.
// Header names differ by platform and change over time, so matching is by alias, and
// anything unrecognised is reported back to the user instead of guessed.
import { parseCsv, toNumber, fingerprint } from './csv.js';
import { postIdentity } from './pipeline.js';

export const PLATFORMS = ['tiktok', 'instagram', 'youtube'];
export const PLATFORM_LABEL = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };

// Canonical field -> normalised header aliases (lowercase, letters and digits only, units removed).
// Distinct meanings stay distinct: impressions are not views, total followers are not new followers.
const ALIASES = {
  title: ['title', 'videotitle', 'posttitle', 'description', 'caption', 'contenttitle'],
  url: ['url', 'link', 'videolink', 'postlink', 'permalink', 'videourl', 'posturl'],
  postId: ['id', 'videoid', 'postid', 'mediaid', 'contentid', 'content'],
  date: ['date', 'posttime', 'publishtime', 'published', 'publishdate', 'videopublishtime', 'createtime', 'createdate', 'postdate'],
  views: ['views', 'videoviews', 'totalviews', 'plays', 'totalplays'],
  impressions: ['impressions', 'totalimpressions'],
  reach: ['reach', 'accountsreached', 'uniqueviewers'],
  likes: ['likes', 'totallikes', 'likecount'],
  comments: ['comments', 'totalcomments', 'commentcount'],
  shares: ['shares', 'totalshares', 'sharecount'],
  saves: ['saves', 'totalsaves', 'favorites', 'addtofavorites'],
  follows: ['follows', 'newfollowers', 'followersgained', 'subscribersgained', 'subscribers'],
  watchTime: ['watchtime', 'totalwatchtime', 'totalplaytime'],
  avgViewSeconds: ['averageviewduration', 'avgwatchtime', 'averagewatchtime'],
  profileVisits: ['profilevisits', 'profileviews'],
  clicks: ['clicks', 'linkclicks', 'websitetaps', 'externallinkclicks', 'websiteclicks'],
  revenue: ['revenue', 'estimatedrevenue', 'earnings', 'estimatedpartnerrevenue'],
};
export const METRICS = ['views', 'impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'watchHours', 'avgViewSeconds', 'profileVisits', 'clicks', 'revenue'];
export const METRIC_LABEL = { views: 'Views', impressions: 'Impressions', reach: 'Reach', likes: 'Likes', comments: 'Comments', shares: 'Shares', saves: 'Saves', follows: 'New followers', watchHours: 'Watch hours', avgViewSeconds: 'Avg view (s)', profileVisits: 'Profile visits', clicks: 'Link clicks', revenue: 'Revenue' };

const norm = h => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const unitOf = h => (/(minute|\bmin\b)/i.test(h) ? 'minutes' : /hour|\bhrs?\b/i.test(h) ? 'hours' : /second|\bsec\b|\(s\)/i.test(h) ? 'seconds' : null);
const currencyOf = h => (h.match(/\b(USD|EUR|GBP|PHP|CAD|AUD|JPY|INR)\b/i)?.[1] || (/\$/.test(h) ? 'USD' : /€/.test(h) ? 'EUR' : /£/.test(h) ? 'GBP' : null))?.toUpperCase() ?? null;

export function mapHeaders(headers) {
  const map = {}, unmatched = [];
  for (const h of headers) {
    const n = norm(h);
    const field = Object.keys(ALIASES).find(f => !map[f] && ALIASES[f].includes(n));
    if (field) map[field] = h; else unmatched.push(h);
  }
  return { map, unmatched };
}

// Returns { posts, mapping, unmatched, skipped, ragged, warnings, errors, hash }.
// Never invents values: a missing metric is null; ambiguous units are rejected, not guessed.
export function importCsv(text, platform, importedAt = new Date().toISOString()) {
  const empty = { posts: [], mapping: {}, unmatched: [], skipped: 0, ragged: 0, warnings: [], hash: fingerprint(String(text ?? '')) };
  if (!PLATFORMS.includes(platform)) return { ...empty, errors: [`Unknown platform "${platform}".`] };
  const { headers, rows, errors: csvErrors, ragged, delim } = parseCsv(text);
  if (!headers.length) return { ...empty, errors: ['The file is empty.'] };
  if (csvErrors.length) return { ...empty, ragged, errors: csvErrors };
  const { map, unmatched } = mapHeaders(headers);
  const errors = [], warnings = [];
  if (!map.title && !map.url && !map.postId) errors.push('No title, link or ID column found, so rows cannot be matched to posts.');
  if (!METRICS.some(m => map[m === 'watchHours' ? 'watchTime' : m])) errors.push('No metric columns recognised (views, likes, comments, shares, saves, followers...).');
  const watchUnit = map.watchTime ? unitOf(map.watchTime) : null;
  if (map.watchTime && !watchUnit) errors.push(`"${map.watchTime}" has no unit (minutes or hours), so it was not guessed. Rename the column, e.g. "Watch time (hours)".`);
  if (errors.length) return { ...empty, mapping: map, unmatched, skipped: rows.length, ragged, errors };
  const currency = map.revenue ? currencyOf(map.revenue) : null;
  if (map.revenue && !currency) warnings.push(`Revenue column "${map.revenue}" names no currency; it is shown without one.`);
  if (ragged) warnings.push(`${ragged} row(s) had a different number of columns than the header.`);
  if (map.impressions && !map.views) warnings.push('This file has impressions but no views; rankings use views, so these posts are not ranked.');
  const avgUnit = map.avgViewSeconds ? (unitOf(map.avgViewSeconds) || 'seconds') : null;
  let skipped = 0, ambiguous = 0;
  const num = v => { const n = toNumber(v, { decimalComma: delim === ';' }); if (n === undefined) { ambiguous++; return null; } return n; };
  const posts = [];
  for (const [index, r] of rows.entries()) {
    const title = map.title ? r[map.title] : '';
    const url = map.url ? r[map.url] : '';
    const rawId = map.postId ? r[map.postId] : '';
    if ((!title && !url && !rawId) || /^totals?$/i.test(title)) { skipped++; continue; } // summary rows
    const metrics = Object.fromEntries(METRICS.map(m => [m, null]));
    for (const m of METRICS) if (map[m]) metrics[m] = num(r[map[m]]);
    if (map.watchTime) { const v = num(r[map.watchTime]); metrics.watchHours = v == null ? null : watchUnit === 'minutes' ? v / 60 : watchUnit === 'seconds' ? v / 3600 : v; }
    if (metrics.avgViewSeconds != null) metrics.avgViewSeconds *= avgUnit === 'minutes' ? 60 : avgUnit === 'hours' ? 3600 : 1;
    const identity = postIdentity(platform, url) || idFromRaw(platform, rawId);
    const date = map.date ? normDate(r[map.date]) : '';
    posts.push({
      id: `${platform}:${identity || `title:${title}|${date}`}`, platform, identity, linkable: !!identity,
      title, url, date, metrics, currency, importedAt, row: index + 2, source: 'csv',
    });
  }
  if (ambiguous) warnings.push(`${ambiguous} value(s) like "1,5" could mean 1.5 or 15, so they were left empty instead of guessed.`);
  // Same post twice in one file: keep the last row. Same title-only row twice: keep both, kept apart by row.
  const byId = new Map(), dupes = new Set();
  for (const p of posts) {
    if (byId.has(p.id)) {
      if (p.linkable) dupes.add(p.title || p.id);
      else { const first = byId.get(p.id); if (!first.id.includes('#row')) { byId.delete(p.id); first.id += `#row${first.row}`; byId.set(first.id, first); } p.id += `#row${p.row}`; }
    }
    byId.set(p.id, p);
  }
  if (dupes.size) warnings.push(`The same post appeared more than once (${[...dupes].slice(0, 3).join(', ')}); the last row was kept.`);
  const titleOnly = [...byId.values()].filter(p => p.id.includes('#row')).length;
  if (titleOnly) warnings.push(`${titleOnly} rows share a title and have no link or ID, so they are kept as separate posts; re-importing them will add them again. Export with a link or ID column to avoid this.`);
  return { posts: [...byId.values()], mapping: map, unmatched, skipped, ragged, warnings, errors: [], hash: empty.hash };
}

// A bare ID column: YouTube video IDs and TikTok numeric IDs match the URL identity; others stay platform-local.
function idFromRaw(platform, raw) {
  raw = String(raw || '').trim();
  if (!raw) return null;
  if (platform === 'youtube' && /^[\w-]{11}$/.test(raw)) return `yt:${raw}`;
  if (platform === 'tiktok' && /^\d{8,}$/.test(raw)) return `tt:${raw}`;
  return `id:${raw}`;
}

function normDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v)) return v; // 03/04/2026: day/month order unknown, kept as written
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
}

// Engagement rate = (likes + comments + shares + saves) / views, or null when views are unknown.
export function engagementRate(m) {
  if (!m || !m.views) return null;
  const parts = ['likes', 'comments', 'shares', 'saves'].map(k => m[k]).filter(v => v != null);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / m.views;
}
