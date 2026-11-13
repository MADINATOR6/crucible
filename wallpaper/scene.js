'use strict';

// Policy labels: ccx/policy.json. Tool labels: EXTERNAL-TOOLS.md.
// A classic script also importable by Node; rendering has no clock or DOM side effects.
const PALS_LOOP = 16;
const escapeMarkup = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

function normalizeStatus(input, now) {
  const s = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const updated = typeof s.updated === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s.updated)
    ? Date.parse(s.updated) : NaN;
  const live = s.live === true && Number.isFinite(now) && updated <= now && now - updated <= 60000;
  const lane = value => ['working', 'idle', 'limit'].includes(value) ? value : 'idle';
  const count = value => typeof value === 'number' && Number.isFinite(value) ? Math.min(999999, Math.max(0, Math.floor(value))) : 0;
  const until = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d UTC$/.test(value) ? value : '';
  return {
    live, codex: live ? lane(s.codex) : 'idle', gemini: live ? lane(s.gemini) : 'idle',
    claude: live ? lane(s.claude) : 'idle',
    stage: live ? (s.stage === '' ? '' : s.stage === 'verifying' ? 'VERIFY' : 'DISPATCH') : '',
    activeIds: live && Array.isArray(s.activeIds) ? [...new Set(s.activeIds.filter(id => typeof id === 'string' && /^[A-Za-z0-9._-]{1,24}$/.test(id)))].slice(0, 3) : [],
    done: live ? count(s.done) : 0, open: live ? count(s.open) : 0, approvals: live ? count(s.approvals) : 0,
    codexUntil: live && s.codex === 'limit' ? until(s.codexUntil) : '',
    geminiUntil: live && s.gemini === 'limit' ? until(s.geminiUntil) : ''
  };
}

function statusKey(input, now) { return JSON.stringify(normalizeStatus(input, now)); }

function renderScene(state, options = {}) {
  // Callers supply time explicitly. Without it, live freshness cannot be established.
  const s = normalizeStatus(state, options.now);
  const still = options.still === true;
  const e = escapeMarkup;
  const tag = (name, attrs = {}, body = '') => `<${name}${Object.entries(attrs).map(([k, v]) => ` ${k}="${e(v)}"`).join('')}>${body}</${name}>`;
  const rect = (x, y, width, height, fill, extra = {}) => tag('rect', { x, y, width, height, fill, ...extra });
  const text = (x, y, value, fill = '#c9c8dc', size = 18, extra = {}) => tag('text', { x, y, fill, 'font-size': size, ...extra }, e(value));
  const group = (body, attrs = {}) => tag('g', attrs, body);
  const animate = (attrs, name = 'animate') => still ? '' : tag(name, { ...attrs, repeatCount: 'indefinite' });
  const pulse = (duration = '3s') => animate({ attributeName: 'opacity', values: '.4;1;.4', dur: duration });
  const cycle = (count, index) => animate({ attributeName: 'opacity',
    values: Array.from({ length: count + 1 }, (_, i) => i % count === index ? 1 : .4).join(';'),
    keyTimes: Array.from({ length: count + 1 }, (_, i) => i / count).join(';'), calcMode: 'discrete', dur: `${PALS_LOOP}s` });
  const beat = (start, end) => animate({ attributeName: 'opacity', values: '0;1;0;0',
    keyTimes: `0;${start / PALS_LOOP};${end / PALS_LOOP};1`, calcMode: 'discrete', dur: `${PALS_LOOP}s` });
  const panel = (x, y, w, h, title, color) => rect(x, y, w, h, '#12121a', { rx: 6, stroke: color, 'stroke-opacity': .6 }) +
    text(x + 16, y + 28, title, color, 15, { 'letter-spacing': 3, 'font-weight': 700 });
  const pixels = (rows, size, palette) => rows.map((row, r) => [...row].map((c, col) => palette[c] ? rect(col * size, r * size, size, size, palette[c]) : '').join('')).join('');

  const star = [0, 0, 1, 2, 4, 2, 1, 0, 0].map((h, r) => Array.from({ length: 9 }, (_, c) => {
    const dr = r - 4, dc = c - 4;
    if (Math.abs(dc) > h) return '.';
    if (r === 3 && (c === 3 || c === 5)) return 'E';
    return Math.abs(dr) >= Math.abs(dc) ? dr < 0 ? 'R' : dr > 0 ? 'G' : 'B' : dc < 0 ? 'O' : 'B';
  }).join(''));
  const actors = [
    { id: 'claude', role: 'plans', color: '#D97757', x: 890, y: 290, eyes: [[28, 28], [98, 28]],
      palette: { X: '#D97757', E: '#1b1b1b' }, rows: ['..XXXXXX..', '.XXXXXXXX.', 'XXEXXXXEXX', 'XXEXXXXEXX', '.XXXXXXXX.', '.XXXXXXXX.', '.X.X..X.X.', 'X........X'] },
    { id: 'codex', role: 'builds', color: '#7B9BFF', x: 590, y: 630, eyes: [[28, 42], [70, 70]],
      palette: { X: '#A9A3FF', Y: '#7B9BFF', Z: '#4A55FF', W: '#ffffff' }, rows: ['..XX.XXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'YYWYYYYYYY', 'YYYWYYYYYY', 'YYWYYWWYYY', '.ZZZZZZZZ.', '..ZZ..ZZ..'] },
    { id: 'gemini', role: 'reviews', color: '#3186FF', x: 1197, y: 616, eyes: [[42, 42], [70, 42]],
      palette: { R: '#F94B4B', O: '#F9B71A', G: '#12B76A', B: '#3186FF', E: '#ffffff' }, rows: star }
  ];
  function mascot(m) {
    const lane = s[m.id], w = m.rows[0].length * 14, cx = m.x + w / 2;
    const ground = m.y + m.rows.length * 14 + 22;
    const dur = lane === 'working' ? '.7s' : '1.8s';
    const hop = lane === 'limit' ? '' : animate({ attributeName: 'transform', type: 'translate', values: '0 0;0 -12;0 0', dur }, 'animateTransform');
    const blink = group(m.eyes.map(([x, y]) => rect(x, y, 14, 14, m.color)).join('') +
      animate({ attributeName: 'opacity', values: '0;1;0;0', keyTimes: '0;.92;.96;1', calcMode: 'discrete', dur: '4.8s' }), { opacity: 0 });
    const twinkle = m.id === 'gemini' ? group(text(w + 20, 8, '✦', '#F9B71A', 27) + pulse('2.8s'), { opacity: .7 }) : '';
    const marker = lane === 'working' ? '...' : lane === 'limit' ? 'z' : '';
    return group(tag('ellipse', { cx, cy: ground, rx: w * .65, ry: 9, fill: m.color, opacity: .2 }) +
      group(group(hop + pixels(m.rows, 14, m.palette) + blink + twinkle), { transform: `translate(${m.x} ${m.y})` }) +
      text(cx, ground + 44, m.id.toUpperCase(), m.color, 26, { 'text-anchor': 'middle', 'letter-spacing': 5, 'font-weight': 700 }) +
      text(cx, ground + 70, s.live ? `${m.role} · ${lane}` : m.role, '#9c9ab8', 18, { 'text-anchor': 'middle' }) +
      text(m.x + w + 22, m.y + 48, marker, m.color, 28), {
        'data-lane': m.id, 'data-state': lane, opacity: lane === 'limit' ? .38 : 1,
        filter: lane === 'working' ? 'url(#active-glow)' : 'none'
      });
  }
  function providers() {
    const selected = s.codex !== 'limit' ? 'codex' : s.gemini !== 'limit' ? 'gemini' : 'ollama';
    const rows = [['codex', 'gpt-6-astra / sol', '#7B9BFF'], ['gemini', 'cli, auto model', '#3186FF'], ['ollama', 'free cloud model', '#9c9ab8']];
    return panel(230, 240, 340, 190, 'FALLBACK CHAIN', '#7B9BFF') + rows.map(([name, label, color], i) => {
      const y = 304 + i * 32, active = name === selected;
      return group(rect(238, y - 20, 324, 28, color, { 'fill-opacity': .14 }) + text(248, y, i + 1, color) +
        text(274, y, name, color, 18, { 'font-weight': 700 }) + text(354, y, label, '#c9c8dc', 16),
      { 'data-provider': name, 'data-active': active, opacity: active ? 1 : .4, filter: active ? 'url(#active-glow)' : 'none' });
    }).join('') + text(248, 416, 'off: deepseek, ollama local, lmstudio', '#77768d', 14);
  }
  function panels() {
    const tools = [['gjc', 'v0.15.3, smoke ok'], ['lazycodex', 'isolated profile'], ['claude-red', '2 reviewed skills'], ['claw', 'built, not adopted']];
    const routes = [['routine', 'sol', 'low'], ['normal', 'sol', 'medium'], ['complex', 'astra', 'high'], ['critical', 'astra', 'xhigh']];
    const levels = [['L0', 'read, search', 'auto'], ['L1', 'project write', 'auto'], ['L2', 'build, test, dispatch', 'auto'],
      ['L3', 'commit, branch, mirror', 'logged'], ['L4', 'push, PR, publish', 'approve'], ['L5', 'prod, force-push', 'you only']];
    return panel(1430, 240, 380, 190, 'EXTERNAL TOOLS', '#12B76A') + tools.map(([name, label], i) =>
      text(1448, 304 + i * 31, '▪', i === 3 ? '#6b6b7b' : '#12B76A') + text(1468, 304 + i * 31, name, '#e9e8ff', 18) + text(1580, 304 + i * 31, label, '#9c9ab8', 15)).join('') +
      panel(230, 850, 360, 124, 'ROUTE BY CLASS', '#8a86ff') + routes.map(([cls, model, effort], i) =>
        text(248, 902 + i * 20, cls, '#e9e8ff', 16) + text(360, 902 + i * 20, model, '#A9A3FF', 16) + text(450, 902 + i * 20, effort, '#9c9ab8', 16)).join('') +
      panel(1480, 650, 410, 262, 'PERMISSION GATE', '#F9B71A') + levels.map(([lv, label, mode], i) => {
        const color = i < 3 ? '#12B76A' : i === 3 ? '#F9B71A' : '#F94B4B', y = 712 + i * 32;
        return rect(1494, y - 18, 34, 24, color, { 'fill-opacity': .2 }) + text(1500, y, lv, color, 16) +
          text(1538, y, label, '#c9c8dc', 14) + text(1870, y, mode, color, 12, { 'text-anchor': 'end' });
      }).join('');
  }
  const paths = [
    ['spec', 'M915 420 Q780 540 700 622', '#D97757', 'task spec', 790, 470, 2, 4],
    ['diff', 'M740 700 Q960 840 1195 700', '#7B9BFF', 'diff + tests', 960, 800, 5, 7],
    ['retry', 'M1195 680 Q960 765 740 680', '#F94B4B', 'retry', 960, 752, 7, 9],
    ['fixed', 'M740 700 Q960 840 1195 700', '#12B76A', '', 960, 800, 10, 12],
    ['review', 'M1255 608 Q1170 450 1040 414', '#3186FF', 'review notes', 1240, 470, 12, 14]
  ];
  function packets() {
    return paths.map(([id, d, color, label, x, y, start, end]) => {
      const path = id === 'fixed' ? '' : tag('path', { d, fill: 'none', stroke: color, 'stroke-opacity': .28, 'stroke-width': 3, 'stroke-dasharray': '4 10' }) + text(x, y, label, color, 17, { 'text-anchor': 'middle' });
      const motion = animate({ path: d, dur: `${PALS_LOOP}s`, keyPoints: '0;0;1;1', keyTimes: `0;${start / 16};${end / 16};1`, calcMode: 'linear' }, 'animateMotion');
      return path + (still || s.live ? '' : group(beat(start, end) + motion + rect(-7, -7, 14, 14, color) + rect(-2, -2, 4, 4, '#fff'), { opacity: 0, 'data-packet': id }));
    }).join('');
  }
  function bubble(x, y, width, label, color, start, end) {
    return group((still ? '' : beat(start, end)) + rect(x, y, width, 56, '#14141c', { rx: 6, stroke: color, 'stroke-width': 2 }) +
      text(x + width / 2, y + 35, label, color, 19, { 'text-anchor': 'middle', 'font-weight': 700 }), { opacity: still ? (start === 12 ? 1 : 0) : 0 });
  }
  function story() {
    if (s.live) return '';
    return bubble(1070, 268, 300, 'plan ready. spec out', '#D97757', .5, 3) +
      bubble(250, 535, 290, 'building...', '#7B9BFF', 3, 6) +
      bubble(1400, 535, 290, 'found a bug', '#F94B4B', 6, 9) +
      bubble(250, 535, 290, 'fixed. tests green', '#12B76A', 9, 12) +
      bubble(1400, 535, 290, 'approved. LGTM!', '#12B76A', 12, 15) +
      [[650, 545], [980, 225], [1300, 545]].map(([x, y]) => group((still ? '' : beat(14, 15.9)) +
        group(pixels(['.X.X.', 'XXXXX', '.XXX.', '..X..'], 7, { X: '#ff5c7a' }), { transform: `translate(${x} ${y})` }), { opacity: still ? .95 : 0 })).join('');
  }
  function pipeline() {
    return ['ADD', 'ROUTE', 'DISPATCH', 'VERIFY', 'REVIEW', 'DONE', 'MIRROR'].map((step, i) => {
      const active = s.stage ? step === s.stage : i === 3, x = 357 + i * 176;
      return group((s.stage ? '' : cycle(7, i)) + rect(x, 988, 150, 38, '#14141c', { rx: 4, stroke: '#8a86ff', 'stroke-width': 2 }) +
        text(x + 75, 1014, step, '#e9e8ff', 17, { 'text-anchor': 'middle', 'letter-spacing': 2 }), {
        'data-step': step, 'data-active': s.stage ? active : 'demo', opacity: active ? 1 : .4,
        filter: active ? 'url(#active-glow)' : 'none'
      });
    }).join('');
  }
  // Fixed arithmetic positions keep repeated renders deterministic without a global random seed.
  const stars = group(Array.from({ length: 64 }, (_, i) => rect(230 + (i * 397 % 1650), 25 + (i * 173 % 990), i % 5 ? 2 : 4, i % 5 ? 2 : 4, '#A9A3FF', { opacity: .15 + (i % 4) * .07 })).join('') +
    animate({ attributeName: 'transform', type: 'translate', values: '0 0;8 -12;0 0', dur: '48s' }, 'animateTransform'));
  const spin = animate({ attributeName: 'transform', type: 'rotate', from: '0 960 580', to: '360 960 580', dur: '40s' }, 'animateTransform');
  const hub = tag('circle', { cx: 960, cy: 580, r: 100, fill: 'url(#glow)' }) +
    tag('circle', { cx: 960, cy: 580, r: 66, fill: 'none', stroke: '#8a86ff', 'stroke-dasharray': '6 10', 'stroke-opacity': .7 }, spin) +
    text(960, 593, '⑂', '#e9e8ff', 48, { 'text-anchor': 'middle' }) +
    text(960, 661, 'OMNIROUTE', '#e9e8ff', 24, { 'text-anchor': 'middle', 'letter-spacing': 6 }) +
    text(960, 689, 'routes by class, risk, budget', '#9c9ab8', 16, { 'text-anchor': 'middle' });
  const stats = s.live ? `done ${s.done} · open ${s.open} · approvals ${s.approvals}` +
    (s.codexUntil ? ` · codex until ${s.codexUntil}` : '') + (s.geminiUntil ? ` · gemini until ${s.geminiUntil}` : '') : 'plan → build → bug → fix → review → celebrate';
  const defs = `<defs>
    <radialGradient id="bg"><stop stop-color="#2a2552"/><stop offset="1" stop-color="#0b0b10"/></radialGradient>
    <radialGradient id="glow"><stop stop-color="#8a86ff" stop-opacity=".5"/><stop offset="1" stop-color="#8a86ff" stop-opacity="0"/></radialGradient>
    <filter id="active-glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2"/><feComposite in="SourceGraphic" operator="over"/></filter>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#fff" stroke-opacity=".025"/></pattern>
  </defs>`;
  return tag('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 1920 1080', width: 1920, height: 1080,
    role: 'img', 'aria-label': `Three models, one repo. ${s.live ? 'Live status' : 'Demo story'}.`,
    'font-family': "Consolas, 'Courier New', monospace", 'data-mode': s.live ? 'live' : 'demo' },
  defs + rect(0, 0, 1920, 1080, 'url(#bg)') + rect(0, 0, 1920, 1080, 'url(#grid)') + stars +
    text(1050, 108, 'THREE MODELS. ONE REPO.', '#e9e8ff', 48, { 'text-anchor': 'middle', 'letter-spacing': 10, 'font-weight': 700 }) +
    text(1050, 152, 'Claude plans · Codex builds · Gemini reviews · OMNIROUTE routes', '#9c9ab8', 20, { 'text-anchor': 'middle', 'letter-spacing': 2 }) +
    rect(238, 184, 76, 28, s.live ? '#153d31' : '#30294e', { rx: 5 }) + text(276, 204, s.live ? 'LIVE' : 'DEMO', s.live ? '#6de9b0' : '#bcb5ff', 16, { 'text-anchor': 'middle' }) +
    text(336, 205, stats, '#b2aec8', 17) + providers() + panels() + hub + packets() + actors.map(mascot).join('') + story() +
    text(1020, 895, s.live && s.activeIds.length ? `active: ${s.activeIds.join(' · ')}` : s.live ? 'no active task IDs' : 'DEMO STORY · 16 seconds · synthetic activity', '#9c9ab8', 16, { 'text-anchor': 'middle' }) + pipeline());
}

if (typeof module !== 'undefined' && module.exports) module.exports = { renderScene, normalizeStatus, statusKey, escapeMarkup };
