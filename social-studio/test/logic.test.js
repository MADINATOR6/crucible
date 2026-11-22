// Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toNumber } from '../src/csv.js';
import { importCsv, engagementRate } from '../src/importer.js';
import { move, nextAction, matchPost, postIdentity, isApproved } from '../src/pipeline.js';
import { parseScout, runScout, buildRequest, draftContent } from '../src/scout.js';
import { buildInsights, median, choosePosts } from '../src/insights.js';

test('parseCsv handles BOM, quotes, embedded commas/newlines, CRLF and semicolons', () => {
  const r = parseCsv('﻿Title,Views\r\n"Hello, ""world""",1\r\n"two\nlines",2\r\n\r\n');
  assert.deepEqual(r.headers, ['Title', 'Views']);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].Title, 'Hello, "world"');
  assert.equal(r.rows[1].Title, 'two\nlines');
  assert.equal(parseCsv('a;b\n1;2').rows[0].b, '2');
});

test('csv rejects duplicate headers and unterminated quotes, counts ragged rows', () => {
  assert.match(parseCsv('Views,Views\n1,2').errors[0], /Duplicate/);
  assert.match(parseCsv('Title,Views\n"open,1').errors[0], /never closed/);
  assert.equal(parseCsv('a,b\n1\n1,2').ragged, 1);
  assert.match(importCsv('Title,Views,Views\nA,1,2', 'tiktok').errors[0], /Duplicate/);
});

test('toNumber parses formats and keeps missing data missing', () => {
  assert.equal(toNumber('1,234'), 1234);
  assert.equal(toNumber('1.5K'), 1500);
  assert.equal(toNumber('2M'), 2e6);
  assert.equal(toNumber('12%'), 12);
  assert.equal(toNumber('$3.50'), 3.5);
  assert.equal(toNumber('0'), 0);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('--'), null);
  assert.equal(toNumber('abc'), undefined, 'unreadable is flagged, not silently missing');
});

test('importCsv maps aliases, reports unknown headers, skips total rows', () => {
  const csv = 'Video title,Video link,Post time,Total views,Total likes,Mystery\nA,https://www.tiktok.com/@me/video/11111111111,2026-11-01,1000,50,?\nTotal,,,1000,50,\n';
  const r = importCsv(csv, 'tiktok', 'T');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.unmatched, ['Mystery']);
  assert.equal(r.skipped, 1);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].metrics.views, 1000);
  assert.equal(r.posts[0].metrics.comments, null);
  assert.equal(r.posts[0].date, '2026-11-01');
});

test('importCsv refuses files it cannot match, never guesses', () => {
  assert.match(importCsv('Foo,Bar\n1,2', 'youtube').errors[0], /No title, link or ID/);
  assert.match(importCsv('Title,Foo\nA,2', 'youtube').errors[0], /No metric columns/);
  assert.match(importCsv('', 'youtube').errors[0], /empty/);
  assert.match(importCsv('Title,Views\nA,1', 'myspace').errors[0], /Unknown platform/);
});

test('import keeps metric meanings and units apart', () => {
  const yt = importCsv('Content,Video title,Video publish time,Impressions,Views,Watch time (hours),Subscribers gained,Estimated revenue (USD)\nabcdefghijk,Clip,2026-11-02,900,100,2.5,3,1.20\n', 'youtube');
  assert.deepEqual(yt.errors, []);
  const m = yt.posts[0].metrics;
  assert.equal(m.views, 100); assert.equal(m.impressions, 900); assert.equal(m.watchHours, 2.5); assert.equal(m.follows, 3); assert.equal(m.revenue, 1.2);
  assert.equal(yt.posts[0].currency, 'USD');
  assert.equal(yt.posts[0].title, 'Clip');
  assert.equal(yt.posts[0].identity, 'yt:abcdefghijk', 'bare YouTube ID column links');
  assert.equal(importCsv('Title,Watch time (minutes)\nA,90', 'youtube').posts[0].metrics.watchHours, 1.5);
  assert.match(importCsv('Title,Watch time\nA,90', 'youtube').errors[0], /no unit/);
  assert.equal(importCsv('Title,Impressions\nA,5', 'instagram').posts[0].metrics.views, null, 'impressions are not views');
});

test('import gives each platform post a stable identity and keeps title-only rows unlinked', () => {
  const ig = importCsv('Permalink,Description,Reach,Likes\nhttps://www.instagram.com/reel/AbC_1/,Reel,50,4\n,Story only,10,1\n', 'instagram');
  assert.equal(ig.posts[0].identity, 'ig:AbC_1');
  assert.equal(ig.posts[0].id, 'instagram:ig:AbC_1');
  assert.equal(ig.posts[1].linkable, false);
  const tt = importCsv('Video link,Total views\nhttps://www.tiktok.com/@me/video/7300000000000000001?lang=en,10\n', 'tiktok');
  assert.equal(tt.posts[0].identity, 'tt:7300000000000000001');
  assert.equal(importCsv('Video link,Total views\nx,1', 'tiktok').hash, importCsv('Video link,Total views\nx,1', 'tiktok').hash, 'same file, same hash');
});

test('engagementRate needs views', () => {
  assert.equal(engagementRate({ views: 100, likes: 5, comments: 5, shares: null, saves: null }), 0.1);
  assert.equal(engagementRate({ views: null, likes: 5 }), null);
});

test('postIdentity is platform aware', () => {
  assert.equal(postIdentity('youtube', 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=3'), 'yt:AAAAAAAAAAA');
  assert.notEqual(postIdentity('youtube', 'https://youtube.com/watch?v=A'), postIdentity('youtube', 'https://youtube.com/watch?v=B'));
  assert.equal(postIdentity('youtube', 'https://youtu.be/AAAAAAAAAAA'), 'yt:AAAAAAAAAAA');
  assert.equal(postIdentity('youtube', 'https://www.youtube.com/shorts/AAAAAAAAAAA'), 'yt:AAAAAAAAAAA');
  assert.equal(postIdentity('instagram', 'https://www.tiktok.com/@me/video/1'), null, 'wrong platform');
  assert.equal(postIdentity('tiktok', 'javascript:alert(1)'), null);
  assert.notEqual(postIdentity('instagram', 'https://www.instagram.com/p/abc/'), postIdentity('instagram', 'https://www.instagram.com/p/ABC/'), 'case-sensitive codes');
});

test('pipeline enforces order, approval of the exact content, platform URL and measurement', () => {
  const idea = { id: '1', stage: 'idea', platform: 'tiktok' };
  assert.equal(move(idea, 'ready').ok, false);
  assert.equal(move({ ...idea, stage: 'drafting' }, 'ready').ok, false, 'needs a draft');
  const ready = move({ ...idea, stage: 'drafting', draft: 'hook' }, 'ready').item;
  const approved = move(ready, 'approved').item;
  assert.ok(isApproved(approved));
  assert.equal(move(approved, 'posted').ok, false, 'needs URL');
  assert.equal(move(approved, 'posted', { postUrl: 'https://www.instagram.com/reel/x/' }).ok, false, 'wrong platform URL');
  const edited = { ...approved, caption: 'changed after approval' };
  assert.match(move(edited, 'posted', { postUrl: 'https://www.tiktok.com/@me/video/123' }).error, /changed after approval/);
  assert.match(nextAction(edited), /approve again/);
  const posted = move(approved, 'posted', { postUrl: 'https://www.tiktok.com/@me/video/123' });
  assert.ok(posted.ok);
  assert.equal(move({ ...ready, stage: 'approved' }, 'posted', { postUrl: 'https://www.tiktok.com/@me/video/1' }).ok, false, 'never approved');
  assert.match(move(posted.item, 'measured').error, /Import/);
  assert.ok(move({ ...posted.item, measuredBy: 'tiktok:tt:123' }, 'measured').ok);
  assert.equal(move(approved, 'drafting').item.approvedKey, null, 'editing resets approval');
  assert.match(nextAction(approved), /post it by hand/i);
});

test('matchPost links by platform identity only', () => {
  const items = [{ id: 'a', platform: 'youtube', postUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }];
  assert.equal(matchPost(items, { platform: 'youtube', identity: 'yt:AAAAAAAAAAA' }).id, 'a');
  assert.equal(matchPost(items, { platform: 'youtube', identity: 'yt:BBBBBBBBBBB' }), null);
  assert.equal(matchPost(items, { platform: 'tiktok', identity: 'yt:AAAAAAAAAAA' }), null);
  assert.equal(matchPost(items, { platform: 'youtube', identity: null }), null);
});

const searchBlock = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://real.test/a', title: 'A', page_age: 'November 3, 2026' }] };
const reply = obj => [searchBlock, { type: 'text', text: `Here you go <json>${JSON.stringify(obj)}</json>` }];

test('parseScout drops evidence the search never returned, and trends left without evidence', () => {
  const r = parseScout(reply({
    trends: [
      { title: 'Real', platforms: ['tiktok', 'myspace'], evidence: [{ url: 'https://real.test/a/' }, { url: 'https://made.up/x' }], momentum: 'rising', momentumBasis: '', fit: 'high' },
      { title: 'Fake', evidence: [{ url: 'https://made.up/y' }] },
    ],
    niches: [{ name: 'N', evidence: [{ url: 'https://real.test/a' }] }],
    questions: [{ question: 'Q?', url: 'https://made.up/q' }],
  }));
  assert.equal(r.trends.length, 1);
  assert.deepEqual(r.trends[0].platforms, ['tiktok']);
  assert.equal(r.trends[0].evidence.length, 1);
  assert.equal(r.trends[0].evidence[0].date, 'November 3, 2026', 'date comes from the search result metadata');
  assert.equal(r.trends[0].momentum, 'unknown', 'momentum without a basis is unknown');
  assert.equal(r.niches.length, 1);
  assert.equal(r.questions.length, 0);
  assert.equal(r.droppedEvidence, 3, '2 evidence links + 1 unsupported question');
});

test('parseScout errors clearly on missing or broken JSON', () => {
  assert.throws(() => parseScout([{ type: 'text', text: 'no block' }]), /no results block/);
  assert.throws(() => parseScout([{ type: 'text', text: '<json>{bad</json>' }]), /not valid JSON/);
});

test('runScout sends browser headers, continues pause_turn, maps API errors', async () => {
  const calls = [];
  const responses = [
    { ok: true, status: 200, json: async () => ({ stop_reason: 'pause_turn', content: [searchBlock], usage: { input_tokens: 10, output_tokens: 1 } }) },
    { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '<json>{"trends":[{"title":"T","evidence":[{"url":"https://real.test/a"}]}]}</json>' }], usage: { input_tokens: 5, output_tokens: 2 } }) },
  ];
  const fetchImpl = async (url, opts) => { calls.push(opts); return responses.shift(); };
  const r = await runScout({ apiKey: ' k ', profile: {}, fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(calls[0].headers['x-api-key'], 'k');
  const second = JSON.parse(calls[1].body);
  assert.equal(second.messages[1].role, 'assistant');
  assert.equal(second.messages[1].content[0].type, 'web_search_tool_result', 'continuation re-sends prior blocks');
  assert.equal(r.trends.length, 1, 'evidence from the first turn counts');
  assert.equal(r.usage.input_tokens, 15);
  await assert.rejects(runScout({ apiKey: '', profile: {}, fetchImpl }), /API key/);
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) }), /rejected/);
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: async () => { throw new TypeError('net'); } }), /reach the Claude API/);
  assert.equal(buildRequest({}, 'trends').tools[0].type, 'web_search_20260209');
});

test('scout reports search errors inside HTTP 200, cut-off replies, timeouts and cancel', async () => {
  const r = parseScout([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }, { type: 'text', text: '<json>{"trends":[{"title":"T","evidence":[{"url":"https://x.test"}]}]}</json>' }]);
  assert.deepEqual(r.searchErrors, ['max_uses_exceeded']);
  assert.equal(r.trends.length, 0, 'no search results -> no evidence -> no trend');
  const ok = body => async () => ({ ok: true, status: 200, json: async () => body });
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: ok({ stop_reason: 'max_tokens', content: [] }) }), /cut off/);
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: ok({ stop_reason: 'refusal', content: [] }) }), /declined/);
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), /Rate limited/);
  const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: hang, timeoutMs: 20 }), /timed out/);
  const ctrl = new AbortController();
  const p = runScout({ apiKey: 'k', profile: {}, fetchImpl: hang, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, /cancelled/);
});

test('draftContent parses a draft and rejects bad replies', async () => {
  const ok = text => async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });
  const d = await draftContent({ apiKey: 'k', profile: {}, item: { title: 'T' }, fetchImpl: ok('<json>{"hook":"H","script":"S","caption":"C","hashtags":["#a",3]}</json>') });
  assert.equal(d.hook, 'H'); assert.deepEqual(d.hashtags, ['#a']);
  await assert.rejects(draftContent({ apiKey: 'k', profile: {}, item: { title: 'T' }, fetchImpl: ok('nope') }), /not valid JSON/);
});

test('insights separate observations from hypotheses and need data', () => {
  assert.equal(buildInsights([]).summary, null);
  assert.equal(median([3, 1, 2]), 2);
  const post = (t, v, extra = {}) => ({ platform: 'tiktok', title: t, url: `https://x.test/${t}`, metrics: { views: v, likes: 1, comments: 0, shares: 0, saves: 0, follows: 0, clicks: 0, revenue: 0, ...extra } });
  const posts = [post('a', 100), post('b', 200), post('c', 5000), post('d', 150)];
  const items = [{ format: 'Tutorial', metrics: { views: 5000 } }, { format: 'Vlog', metrics: { views: 10 } }];
  const r = buildInsights(posts, items);
  assert.equal(r.summary.medianViews, 175);
  assert.equal(r.top[0].title, 'c');
  assert.ok(r.observations.length >= 2);
  assert.ok(r.hypotheses.every(h => h.sample >= 1 && h.confidence));
  assert.ok(r.hypotheses.some(h => /Tutorial.*may be working/.test(h.text)));
  assert.ok(r.actions.some(a => /call to action/.test(a.text)), 'no clicks or revenue -> CTA action');
});

test('choosePosts excludes SAMPLE data once real data exists', () => {
  const real = { id: 'r', sample: false }, fake = { id: 's', sample: true };
  assert.deepEqual(choosePosts([fake]).map(p => p.id), ['s']);
  assert.deepEqual(choosePosts([fake, real]).map(p => p.id), ['r']);
  assert.equal(choosePosts([fake]).usingSample, true);
});

// Regressions from Codex's SS-1 verify run (one test per finding).
test('import keeps same-title rows apart instead of overwriting, and dedupes the same post', () => {
  const r = importCsv('Title,Views\nSame,100\nSame,200\n', 'youtube');
  assert.equal(r.posts.length, 2);
  assert.equal(new Set(r.posts.map(p => p.id)).size, 2);
  assert.ok(r.warnings.some(w => /share a title/.test(w)));
  const d = importCsv('Video link,Total views\nhttps://www.tiktok.com/@a/video/11111111111,1\nhttps://www.tiktok.com/@a/video/11111111111,5\n', 'tiktok');
  assert.equal(d.posts.length, 1); assert.equal(d.posts[0].metrics.views, 5);
  assert.ok(d.warnings.some(w => /more than once/.test(w)));
});

test('insights keep unknown metrics unknown and do not claim missing conversions', () => {
  const r = buildInsights(importCsv('Title,Views\nA,100\n', 'youtube').posts);
  assert.equal(r.summary.follows, null); assert.equal(r.summary.clicks, null); assert.equal(r.summary.revenue, null);
  assert.ok(!r.actions.some(a => /call to action/.test(a.text)));
});

test('duration units convert and ambiguous decimal commas are not guessed', () => {
  assert.equal(importCsv('Title,Average watch time (minutes)\nA,2', 'youtube').posts[0].metrics.avgViewSeconds, 120);
  assert.equal(importCsv('Title,Average view duration\nA,45', 'youtube').posts[0].metrics.avgViewSeconds, 45);
  assert.equal(importCsv('Title;Watch time (hours)\nA;1,5', 'youtube').posts[0].metrics.watchHours, 1.5, 'semicolon file uses decimal comma');
  const amb = importCsv('Title,Views\nA,"1,5"', 'youtube');
  assert.equal(amb.posts[0].metrics.views, null);
  assert.ok(amb.warnings.some(w => /1,5/.test(w)));
  assert.equal(toNumber('1,234,567'), 1234567);
  assert.equal(toNumber('1.234,5', { decimalComma: true }), 1234.5);
});

test('an already-cancelled scout never sends a request', async () => {
  let calls = 0;
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, signal: ctrl.signal, fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; } }), /cancelled/);
  assert.equal(calls, 0);
});

test('unsupported audience questions count as dropped', () => {
  const r = parseScout(reply({ trends: [], questions: [{ question: 'Q?', url: 'https://made.up/q' }] }));
  assert.equal(r.questions.length, 0);
  assert.equal(r.droppedEvidence, 1);
});

// Regressions from Codex's SS-1 verify round 2.
import { validateBackup } from '../src/db.js';
test('backup restore validates the whole file before writing', () => {
  assert.throws(() => validateBackup({ app: 'social-studio', version: 999, items: [] }), /version 999/);
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, items: [{ id: 'a' }] }), /missing title, stage, platform/);
  assert.throws(() => validateBackup({ app: 'x' }), /Not a Social Studio/);
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, profile: { setupDone: true } }), /profile is incomplete/);
  validateBackup({ app: 'social-studio', version: 1, profile: { goals: [], platforms: [] }, items: [{ id: 'a', title: 't', stage: 'idea', platform: 'tiktok' }] });
  // Security review: values that end up in HTML attributes must be from the known set.
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, profile: { goals: [], platforms: ['"><img src=x onerror=alert(1)>'] } }), /unknown platform/);
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, posts: [{ id: 'p', platform: '<b>', metrics: {} }] }), /unknown platform/);
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, posts: [{ id: 'p', platform: 'tiktok', metrics: { views: '<img>' } }] }), /must be numbers/);
  assert.throws(() => validateBackup({ app: 'social-studio', version: 1, imports: [{ id: 'i', at: 'x', platform: 'tiktok', count: '<b>' }] }), /invalid counts/);
});

test('scout dates come from search metadata, never the model', () => {
  const r = parseScout([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://real.test/a', page_age: '2026-01-01' }] },
    { type: 'text', text: '<json>{"trends":[{"title":"T","evidence":[{"url":"https://real.test/a","date":"2099-12-31"}]}]}</json>' }]);
  assert.equal(r.trends[0].evidence[0].date, '2026-01-01');
  const none = parseScout([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://real.test/b' }] },
    { type: 'text', text: '<json>{"trends":[{"title":"T","evidence":[{"url":"https://real.test/b","date":"2026-05-05"}]}]}</json>' }]);
  assert.equal(none.trends[0].evidence[0].date, '', 'no metadata date -> unknown, model date ignored');
});

test('scout timeout is one deadline across continuations', async () => {
  const slow = () => new Promise(res => setTimeout(() => res({ ok: true, status: 200, json: async () => ({ stop_reason: 'pause_turn', content: [] }) }), 50));
  await assert.rejects(runScout({ apiKey: 'k', profile: {}, fetchImpl: slow, timeoutMs: 80 }), /timed out after 0 s|timed out/);
});

test('csv rejects text after a closing quote', () => {
  assert.match(parseCsv('Title,Views\n"A"garbage,100').errors[0], /after a closing quote/);
  assert.deepEqual(parseCsv('Title,Views\n"A",100').errors, []);
});
