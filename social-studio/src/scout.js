// AI scout: calls the Anthropic Messages API from the browser with the user's own key and the
// server-side web search tool, then keeps only claims whose sources the search actually returned.
export const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-opus-5-5';
const MAX_CONTINUES = 3; // pause_turn continuations for long web-search turns

const SCHEMA_HINT = `Return ONLY a JSON object between <json> and </json>:
{"trends":[{"title":"","platforms":["tiktok"|"instagram"|"youtube"],"format":"","why":"","evidence":[{"url":"","date":"YYYY-MM-DD or empty","quote":"short paraphrase of what the source shows"}],"momentum":"rising|steady|fading|unknown","momentumBasis":"what in the sources shows it, or empty","fit":"high|medium|low","fitReason":"","monetization":"","ideas":["",""]}],
 "niches":[{"name":"","demand":"","monetization":"","competition":"","evidence":[{"url":"","date":"","quote":""}]}],
 "questions":[{"question":"","url":""}],
 "notes":""}`;

export function buildPrompt(profile, kind = 'trends') {
  const goals = (profile.goals || []).join(', ') || 'money, views';
  const topics = (profile.topics || []).filter(Boolean).join(', ');
  const competitors = (profile.competitors || []).filter(Boolean).join(', ');
  const platforms = (profile.platforms || ['tiktok', 'instagram', 'youtube']).join(', ');
  const focus = kind === 'niches'
    ? `Find 3-5 niches with clear audience demand and proven ways to earn money (affiliate, products, brand deals, platform payouts). ${topics ? `Consider these interests first: ${topics}.` : 'No niche chosen yet.'}`
    : `Find 4-6 emerging topics, formats or conversations on ${platforms} ${topics ? `for the niche: ${topics}` : 'that a new creator could use to get views and income'}.${competitors ? ` Look at what these accounts are doing: ${competitors}.` : ''} Also list audience questions people are asking.`;
  return `You are a social media research team for a solo creator. Goals: ${goals}. Brand voice: ${profile.voice || 'not set'}.
${focus}
Rules: use web search. Every trend and niche needs at least one evidence URL that your search actually returned, with its date if shown. Never invent numbers, view counts, dates, or sources. If momentum is not shown by a source, set "momentum":"unknown". Income claims must be general paths, never promised amounts. Today is ${new Date().toISOString().slice(0, 10)}.
${SCHEMA_HINT}`;
}

export function buildRequest(profile, kind) {
  return {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: buildPrompt(profile, kind) }],
  };
}

export function headers(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// Runs the scout. fetchImpl is injectable for tests. Throws Error with a user-readable message.
export async function runScout({ apiKey, profile, kind = 'trends', fetchImpl = fetch, signal, timeoutMs = 120000 }) {
  if (!apiKey || !apiKey.trim()) throw new Error('Add your Claude API key in Setup first.');
  const body = buildRequest(profile, kind);
  const content = [];
  const usage = { input_tokens: 0, output_tokens: 0, web_searches: 0 };
  const deadline = Date.now() + timeoutMs; // one limit for the whole run, continuations included
  for (let turn = 0; turn <= MAX_CONTINUES; turn++) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`Scout timed out after ${Math.round(timeoutMs / 1000)} s. Try again.`);
    const data = await post(fetchImpl, apiKey, body, signal, left, 'Scout', timeoutMs);
    usage.input_tokens += data.usage?.input_tokens || 0;
    usage.output_tokens += data.usage?.output_tokens || 0;
    usage.web_searches += data.usage?.server_tool_use?.web_search_requests || 0;
    content.push(...(data.content || []));
    if (data.stop_reason === 'refusal') throw new Error('Claude declined this request. Try different topics.');
    if (data.stop_reason === 'max_tokens') throw new Error('The scout reply was cut off (too long). Try narrower topics.');
    if (data.stop_reason !== 'pause_turn') return { ...parseScout(content), usage, model: data.model || MODEL, stopReason: data.stop_reason };
    body.messages = [body.messages[0], { role: 'assistant', content: content.slice() }];
  }
  throw new Error('The scout took too many steps. Try narrower topics.');
}

// One API call with timeout and cancel. Returns parsed JSON or throws a user-readable Error.
async function post(fetchImpl, apiKey, body, signal, timeoutMs, what, limitMs = timeoutMs) {
  if (signal?.aborted) throw new Error(`${what} cancelled.`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  const onAbort = () => ctrl.abort('cancel');
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetchImpl(API_URL, { method: 'POST', headers: headers(apiKey.trim()), body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(apiError(res.status, data));
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    if (ctrl.signal.aborted) throw new Error(ctrl.signal.reason === 'timeout' ? `${what} timed out after ${Math.round(limitMs / 1000)} s. Try again.` : `${what} cancelled.`);
    throw new Error('Could not reach the Claude API. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
class ApiError extends Error {}

// Platform draft for one content item. No web search: it writes, it does not research,
// so it gets no evidence fields and the app labels the result "AI draft".
export async function draftContent({ apiKey, profile, item, trend, fetchImpl = fetch, signal }) {
  if (!apiKey || !apiKey.trim()) throw new Error('Add your Claude API key in Setup first.');
  const prompt = `Write a ${item.platform || 'short-form'} ${item.format || 'video'} draft for a solo creator.
Title/idea: ${item.title}
Goal it must serve: ${item.goal || 'views'}. Brand voice: ${profile.voice || 'friendly, direct'}.
${item.brief?.angle ? `Angle: ${item.brief.angle}\n` : ''}${trend ? `Based on the trend "${trend.title}": ${trend.why}\n` : ''}Do not state statistics or facts you cannot back up. Include a call to action that serves the goal.
Return ONLY <json>{"hook":"first 2 seconds","script":"beat-by-beat script","caption":"","hashtags":["#a"],"cta":""}</json>`;
  const data = await post(fetchImpl, apiKey, { model: MODEL, max_tokens: 4000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] }, signal, 90000, 'Draft');
  if (data.stop_reason === 'refusal') throw new Error('Claude declined this draft. Rephrase the idea.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/<json>([\s\S]*?)<\/json>/);
  let d;
  try { d = JSON.parse(m?.[1] ?? ''); } catch { throw new Error('The draft reply was not valid JSON. Try again.'); }
  const s = v => (typeof v === 'string' ? v : '');
  return { hook: s(d.hook), script: s(d.script), caption: s(d.caption), cta: s(d.cta), hashtags: (Array.isArray(d.hashtags) ? d.hashtags : []).filter(h => typeof h === 'string'), usage: data.usage };
}

function apiError(status, data) {
  const msg = data?.error?.message || '';
  if (status === 401) return 'Your API key was rejected. Check it in Setup.';
  if (status === 403) return `Access denied by the API${msg ? `: ${msg}` : ''}.`;
  if (status === 429) return 'Rate limited or out of credit. Wait a minute or check your Anthropic billing.';
  if (status === 529 || status >= 500) return 'The Claude API is busy. Try again shortly.';
  return `API error ${status}${msg ? `: ${msg}` : ''}`;
}

// Collects URLs the web search actually returned; claims citing anything else lose that evidence.
// Map of canonical URL -> page date from the search result metadata ('' when none).
export function searchedUrls(content) {
  const urls = new Map();
  for (const b of content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) urls.set(canon(r.url), r.page_age || urls.get(canon(r.url)) || '');
    for (const c of b.citations || []) if (c.url && !urls.has(canon(c.url))) urls.set(canon(c.url), '');
  }
  return urls;
}

const canon = u => String(u).split('#')[0].replace(/\/+$/, '');

export function parseScout(content) {
  const text = content.filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/<json>([\s\S]*?)<\/json>/) || text.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('The scout reply had no results block. Try again.');
  let raw;
  try { raw = JSON.parse(m[1]); } catch { throw new Error('The scout reply was not valid JSON. Try again.'); }
  const seen = searchedUrls(content);
  const searchErrors = content.filter(b => b.type === 'web_search_tool_result' && b.content && !Array.isArray(b.content)).map(b => b.content.error_code || 'unknown');
  let dropped = 0;
  const keepEvidence = list => (Array.isArray(list) ? list : []).filter(e => {
    const ok = e && typeof e.url === 'string' && seen.has(canon(e.url));
    if (!ok) dropped++;
    return ok;
  }).map(e => ({ url: e.url, date: seen.get(canon(e.url)), quote: e.quote || '' })); // date from search metadata only, never the model
  const str = v => (typeof v === 'string' ? v : '');
  const trends = (raw.trends || []).map(t => ({
    title: str(t.title), platforms: (t.platforms || []).filter(p => ['tiktok', 'instagram', 'youtube'].includes(p)),
    format: str(t.format), why: str(t.why), evidence: keepEvidence(t.evidence),
    momentum: ['rising', 'steady', 'fading'].includes(t.momentum) && str(t.momentumBasis) ? t.momentum : 'unknown',
    momentumBasis: str(t.momentumBasis), fit: ['high', 'medium', 'low'].includes(t.fit) ? t.fit : 'unknown',
    fitReason: str(t.fitReason), monetization: str(t.monetization), ideas: (t.ideas || []).filter(i => typeof i === 'string' && i),
  })).filter(t => t.title && t.evidence.length); // no evidence, no trend
  const niches = (raw.niches || []).map(n => ({
    name: str(n.name), demand: str(n.demand), monetization: str(n.monetization), competition: str(n.competition), evidence: keepEvidence(n.evidence),
  })).filter(n => n.name && n.evidence.length);
  const questions = (raw.questions || []).filter(q => {
    if (!q || !str(q.question)) return false;
    const ok = seen.has(canon(q.url || ''));
    if (!ok) dropped++;
    return ok;
  }).map(q => ({ question: q.question, url: q.url }));
  return { trends, niches, questions, notes: str(raw.notes), droppedEvidence: dropped, searchErrors, retrievedAt: new Date().toISOString() };
}
