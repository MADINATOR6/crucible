// Request interpreter: turns a typed request ("maintenance block, 3 days a week for 4 weeks") into generator
// options plus a plain-English account of what was understood, so the app can show it for confirmation.
// Rule-based and deterministic: no network, no model. See GENERATOR.md, section "Request interpreter".
//
// How it works: the text is lowercased and cut into words; punctuation becomes a "|" boundary so that phrases
// never run across a comma. Phrases that set an option ("no deload", "test my strength") are matched first and
// their words are claimed, so they cannot also be read as a goal. Then the layoff/length/day phrases are read
// from the words, then the goal (focus) by priority, then the lift to bring up.
//
// Safety: input is cut to 5,000 characters; every regular expression uses only literal alternatives and
// bounded repeats of single words (no nested or overlapping quantifiers), so matching is linear; nothing throws.

const MAX_CHARS = 5000;
const NO_GOAL = 'I did not recognise a goal; pick one below.';
const FOCUS_ORDER = ['return', 'peak', 'deload', 'specialise', 'maintenance', 'volume', 'strength'];
const WEEKS_MIN = 3;
const WEEKS_MAX = 8;
const LAYOFF_MAX = 52;

const WORD_NUMBERS = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8],
  ['nine', 9], ['ten', 10], ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14], ['fifteen', 15],
  ['sixteen', 16], ['seventeen', 17], ['eighteen', 18], ['nineteen', 19], ['twenty', 20],
]);

/** A whole word that is a number (digits or one..twenty), else null. */
function numOf(word) {
  if (typeof word !== 'string' || word === '') return null;
  if (/^[0-9]{1,6}$/.test(word)) return Number(word);
  return WORD_NUMBERS.has(word) ? WORD_NUMBERS.get(word) : null;
}

/**
 * Lowercase; drop apostrophes; hyphens, slashes and underscores become spaces; any other punctuation or newline
 * becomes a " | " boundary; split a digit from a following letter ("3x" -> "3 x", "6wks" -> "6 wks").
 */
function normalise(text) {
  const raw = typeof text === 'string' ? text.slice(0, MAX_CHARS) : '';
  return raw
    .toLowerCase()
    .replace(/[‘’ʼ'`]/g, '')
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, (run) => (/^[ \t_\/-]+$/.test(run) ? ' ' : ' | '))
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/ +/g, ' ')
    .trim();
}

function tokenise(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    let j = s.indexOf(' ', i);
    if (j === -1) j = s.length;
    toks.push({ w: s.slice(i, j), start: i, end: j });
    i = j + 1;
  }
  return toks;
}

// Claimed characters: words already used by an option phrase cannot also be read as something else.
const isClaimed = (mask, a, b) => {
  for (let i = a; i < b; i++) if (mask[i]) return true;
  return false;
};
const claim = (mask, a, b) => { mask.fill(1, a, b); };

const def = (re, extra) => ({ re, ...extra });
const tail = (s, start, n = 30) => s.slice(Math.max(0, start - n), start);

/** All unclaimed, guard-passing matches of the given definitions, earliest first. */
function collect(s, mask, defs) {
  const hits = [];
  for (const d of defs) {
    for (const m of s.matchAll(d.re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (isClaimed(mask, start, end)) continue;
      if (d.guard && !d.guard(s, start, end)) continue;
      hits.push({ start, end, text: m[0], def: d, groups: m.groups || null });
    }
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Collect in stages (earlier stages win a contested word), then claim every hit unless `keep` is false. */
function group(s, mask, stages, keep = true) {
  const all = [];
  for (const defs of stages) {
    const hits = collect(s, mask, defs);
    if (keep) for (const h of hits) claim(mask, h.start, h.end);
    all.push(...hits);
  }
  return all.sort((a, b) => a.start - b.start || b.end - a.end);
}

// ---------------------------------------------------------------------------------------------------------------
// Option phrases (matched first; they claim their words)
// ---------------------------------------------------------------------------------------------------------------

const NEGATION = 'no|not|dont|never|skip|skipping|without';

const DELOAD_NONE = [
  def(new RegExp(`\\b(?:${NEGATION})(?: (?:the|a|any|that|my|more))? de ?load(?:s|ing)?(?: weeks?)?\\b`, 'g'), { value: 'none' }),
];
const DELOAD_LAST = [
  def(/\bde ?load(?:s|ing)? (?:at the (?:very )?end|in the (?:last|final)(?: week)?|on the (?:last|final)(?: week)?|at the (?:last|final) week|last|final)\b/g, { value: 'last' }),
  def(/\b(?:end|ending|finish|finishing) (?:with|on|in)(?: a| an| the)? de ?load(?:s|ing)?\b/g, { value: 'last' }),
];

const CHECKIN_NO = [
  def(new RegExp(`\\b(?:${NEGATION})(?: (?:the|a|any|my))? (?:check ?ins?|tests?|testing|retest(?:ing)?)(?: weeks?)?\\b`, 'g'), { value: false }),
];
const CHECKIN_YES = [
  def(/\btest(?:ing)?(?: (?:my|your|the|our))? (?:strength|maxes|maxs|max|maximums?|1 rm|rms?|lifts|singles|e1rm|numbers)\b/g, { value: true }),
  def(/\bcheck ?ins?\b/g, { value: true }),
  def(/\b(?:test|testing|retest) weeks?\b/g, { value: true }),
];

const ROTATE_SAME = [
  def(/\bkeep (?:the |my |all )?same (?:exercises|accessories|movements|lifts)\b/g, { value: 0 }),
  def(/\bkeep (?:the |my |all )?(?:exercises|accessories) (?:the )?same\b/g, { value: 0 }),
  def(/\bno (?:rotation|rotating|rotate|changes?|swaps?|swapping|variety|new exercises|new accessories)\b/g, { value: 0 }),
  def(/\b(?:dont|do not|never) (?:change|swap|rotate|vary|switch)\b/g, { value: 0 }),
];
const ROTATE_NEW = [
  def(/\b(?:fresh|new|different|other|various|varied) (?:accessories|exercises|movements)\b/g, { value: 0.7 }),
  def(/\b(?:change|changes|changing|switch|switching|swap|swapping|rotate|rotating|vary|varying|freshen|refresh|shake)(?: up)?(?: (?:all|some))?(?: of)?(?: (?:the|my))? (?:accessories|exercises|movements)\b/g, { value: 0.7 }),
  def(/\bmix(?:ing)? (?:it|things|them|everything) up\b/g, { value: 0.7 }),
  def(/\bvariety\b/g, { value: 0.7 }),
];

// "not too aggressive", "nothing fast": a negation just before the word means we cannot infer anything.
const negatedBefore = (s, start) => /\b(?:not|no|dont|never|nothing|without|isnt|wont|nor)(?: \w+){0,2} $/.test(tail(s, start));
const PROGRESSION = [
  def(/\b(?:conservative(?:ly)?|slow(?:ly)?|cautious(?:ly)?|gentle|gently|careful(?:ly)?)\b/g, { value: 'conservative', guard: (s, a) => !negatedBefore(s, a) }),
  def(/\b(?:aggressive(?:ly)?|fast|faster|ambitious)\b/g, { value: 'aggressive', guard: (s, a) => !negatedBefore(s, a) }),
];

const STANCE = [
  def(/\bsumo\b/g, { value: 'sumo' }),
  def(/\b(?:conventional|conv)\b/g, { value: 'conventional' }),
];

// ---------------------------------------------------------------------------------------------------------------
// Goals (focus)
// ---------------------------------------------------------------------------------------------------------------

const injuryGuard = (s, start, end) =>
  !/\b(?:without|avoid(?:ing)?|prevent(?:ing)?|no|free of|risk of|against)(?: \w+){0,2} $/.test(tail(s, start)) &&
  !/^ (?:prevention|free|proof|risk|resilient|resistant)\b/.test(s.slice(end, end + 15));

// "meet" the competition, not "to meet" or "meet my goals".
const meetGuard = (s, start, end) =>
  !/\b(?:to|can|will|would|could|should|must|cant|wont|might|may) $/.test(tail(s, start, 12)) &&
  !/^ (?:(?:my|your|the|our|these|those) (?:goals?|targets?|needs?|standards?|requirements?|demands?|expectations?|deadlines?)|up)\b/.test(s.slice(end, end + 30));

// A meet that is over ("after my meet", "recover from nationals") is not something to peak for.
const pastEvent = (s, start) => /\b(?:after|post|from|following|since)(?: (?:my|the|a|our))? $/.test(tail(s, start, 16));

// "build me a 6 week block" is a request for a plan, not for strength.
const PLAN_NOUNS = new Set(['block', 'plan', 'programme', 'program', 'cycle', 'phase', 'template', 'routine', 'schedule']);
const buildGuard = (s, start, end) => !s.slice(end + 1, end + 60).split(' ').slice(0, 5).some((w) => PLAN_NOUNS.has(w));

const LIFT = '(?<lift>squats?|bench(?: press)?|benching|deadlifts?|deads?|dl)';
const SPECIALISE_TRIGGER = 'bring(?:ing)? up|specialis(?:e|ing)|specializ(?:e|ing)|focus(?:ing)? on|emphasi[sz](?:e|ing)|emphasis on|prioriti[sz](?:e|ing)|concentrat(?:e|ing) on|weak(?:est)?|lagging';
const SPECIALISE_FILL = 'my|the|a|an|our|your|up|in|on|is|are|of|for|sumo|conventional|conv|weak|weakest|lagging|point|spot|lift';

const FOCUS_DEFS = {
  return: [
    def(/\breturn(?:s|ed|ing)?\b/g),
    def(/\bback from\b/g),
    def(/\bcom(?:e|es|ing) back\b/g),
    def(/\blay ?offs?\b/g),
    def(/\bbreak\b(?! (?:through|my|your|the|records?|prs?|pbs?|plateaus?|barriers?|up|down|out)\b)/g),
    def(/\btime off\b/g),
    def(/\binjur(?:y|ies|ed)\b/g, { guard: injuryGuard }),
    def(/\bsick\b(?! of\b)/g),
    def(/\b(?:illness(?:es)?|sickness|unwell|flu|covid|surgery|rehab|rehabilitation)\b/g),
    def(/\b(?:holidays?|vacations?)\b/g),
    def(/\beas(?:e|ed|es|ing) (?:me |myself )?(?:back|in|into)\b/g),
    def(/\bget(?:ting)? back (?:in|into|to)\b/g),
    def(/\bbeen (?:off|away)\b/g),
    def(/\brecover(?:ing|ed)? from (?:(?:an|a|my|the) )?(?:injury|injuries|illness|sickness|flu|covid|surgery|operation|accident|strain|sprain|tear)\b/g),
    def(/\b(?:havent|hasnt|have not|has not|didnt|did not) (?:trained|lifted|been (?:training|lifting|to the gym)|gone to the gym)\b/g),
  ],
  peak: [
    def(/\bpeak(?:s|ed|ing)?\b/g),
    def(/\bmeets?\b/g, { guard: (s, a, b) => meetGuard(s, a, b) && !pastEvent(s, a) }),
    def(/\b(?:comp|competition|competitions|competing|compete|contest|nationals|regionals)\b/g, { guard: (s, a) => !pastEvent(s, a) }),
    def(/\btaper(?:s|ed|ing)?\b/g),
  ],
  deload: [
    def(/\bde ?load(?:s|ed|ing)?\b/g),
    def(/\brecover(?:y|ing)?\b/g),
    def(/\b(?:easy|light|rest|down) weeks?\b/g),
  ],
  specialise: [
    def(/\bbring(?:ing)? up\b/g),
    def(/\b(?:specialis|specializ)(?:e|es|ed|ing|ation)\b/g),
    def(/\bweak(?:est)? (?:points?|spots?|lifts?|areas?)\b/g),
    // a trigger followed (within a few filler words) by a lift: "bring up my bench", "focus on squat", "weak deadlift"
    def(new RegExp(`\\b(?:${SPECIALISE_TRIGGER}) (?:(?:${SPECIALISE_FILL}) ){0,3}${LIFT}\\b`, 'g')),
    // a lift described as lagging: "my bench is weak", "squat specialisation"
    def(new RegExp(`\\b${LIFT} (?:(?:is|are|being|feels|feel|seems) )?(?:(?:my|our|the) )?(?:weak|weakest|lagging|behind)\\b`, 'g')),
    def(new RegExp(`\\b${LIFT} (?:specialis|specializ)(?:e|es|ed|ing|ation)\\b`, 'g')),
  ],
  maintenance: [
    def(/\bmaintenance\b/g),
    def(/\bmaintain(?:s|ed|ing)?\b/g),
    def(/\b(?:maintain|maintaining|hold|holding|keep|keeping|retain|retaining|preserve|preserving|protect|protecting)(?: on to| onto)?(?: (?:my|the|your|some|all))?(?: (?:current|existing))? (?:strength|gains|lifts|numbers|progress|fitness)\b/g),
    def(/\bstrength (?:maintenance|maintaining)\b/g),
    def(/\bmaintenance (?:of|for) (?:my |the )?(?:strength|gains|lifts)\b/g),
    def(/\bstay(?:ing)? (?:strong|where i am)\b/g),
    def(/\blow fatigue\b/g),
    def(/\b(?:busy|hectic|swamped|slammed)\b/g),
    def(/\btime poor\b/g),
    def(/\b(?:life|work|things) (?:is|are|gets|has been|have been) (?:crazy|mad|insane|hectic|busy)\b/g),
    def(/\b(?:short|pressed|tight) (?:on|for) time\b/g),
    def(/\b(?:no|little|limited|not much|not enough) time\b/g),
  ],
  volume: [
    def(/\b(?:volume|size|hypertrophy|bodybuilding|bigger|mass|bulk|bulking)\b/g),
    def(/\bmuscles?\b/g),
    def(/\bbuild(?:ing)? (?:(?:up|some|more|my|me) ){0,3}(?:muscle|size|mass|bulk)\b/g),
    def(/\bgrow(?:ing)? (?:(?:my|the) )?(?:muscle|size)\b/g),
  ],
  strength: [
    def(/\bstrength\b/g),
    def(/\bstrong(?:er|est)?\b/g),
    def(/\bheav(?:y|ier|iest)\b/g),
    def(/\bbuild(?:ing|s)?\b/g, { guard: buildGuard }),
    def(/\bprogress(?:ing)?\b/g),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Numbers of weeks, layoffs and days (read from the words)
// ---------------------------------------------------------------------------------------------------------------

const WEEK_UNITS = new Set(['week', 'weeks', 'wk', 'wks']);
const MONTH_UNITS = new Set(['month', 'months']);
const isTimeUnit = (w) => WEEK_UNITS.has(w) || MONTH_UNITS.has(w);

const LAYOFF_SKIP = new Set(['for', 'about', 'around', 'roughly', 'nearly', 'almost', 'over', 'like', 'some', 'just', 'only']);
const LAYOFF_BEFORE = new Set(['off', 'away', 'out', 'sick', 'unwell', 'injured', 'injury', 'illness', 'sickness', 'flu', 'covid', 'missed', 'gone', 'resting', 'rest', 'break', 'layoff', 'holiday', 'vacation', 'hiatus', 'rehab']);
const LAYOFF_AFTER = new Set(['off', 'break', 'layoff', 'lay', 'sick', 'unwell', 'injured', 'injury', 'rest', 'resting', 'hiatus', 'since', 'without', 'holiday', 'vacation', 'flu', 'illness', 'sickness', 'covid', 'rehab']);
const LAYOFF_AFTER_OF = new Set(['rest', 'injury', 'illness', 'sickness', 'flu', 'covid', 'break', 'holiday', 'vacation', 'rehab', 'layoff']);
const OUT_NOT_LAYOFF = new Set(['from', 'until', 'till', 'before', 'to', 'at', 'for']);
const BEFORE_EXCLUDED_OUT = new Set(['work', 'working', 'works', 'worked', 'try', 'trying', 'check', 'test', 'max', 'find', 'figure']);
const BEFORE_EXCLUDED_OFF = new Set(['kick', 'kicking', 'start', 'starting', 'set', 'setting']);
const TRAINED = new Set(['trained', 'lifted', 'training', 'lifting', 'gym', 'squatted', 'exercised']);
const NEGATORS = new Set(['havent', 'hasnt', 'didnt', 'not', 'never', 'cant', 'couldnt', 'wont']);
const PAST_BEFORE = new Set(['last', 'past', 'previous']);
const PAST_AFTER = new Set(['ago', 'old', 'later']);
const FREQUENCY_BEFORE = new Set(['once', 'twice', 'per', 'every', 'each', 'times']);

/**
 * Time phrases: "<n> weeks", "<n> months", "a couple of weeks", "next month". Each is classified by its neighbours:
 *   strong  a layoff ("off for 6 weeks", "6 weeks off", "sick for 3 weeks", "3 weeks of rest")
 *   weak    "6 weeks away" / "6 weeks out": a layoff only when nothing else says otherwise ("my meet is 6 weeks away")
 *   plain   a block length
 * Past references ("6 weeks ago", "the last 6 weeks") are dropped.
 */
function scanTimes(toks, mask) {
  const out = [];
  const w = (k) => (k >= 0 && k < toks.length ? toks[k].w : '');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].w;
    let amount = null;
    let unit = -1;
    let first = i;
    let article = false;
    const num = numOf(t);
    if (num !== null && isTimeUnit(w(i + 1))) {
      amount = num; unit = i + 1;
    } else if ((t === 'a' || t === 'an') && isTimeUnit(w(i + 1))) {
      amount = 1; unit = i + 1; article = true;
    } else if (t === 'couple' && (isTimeUnit(w(i + 1)) || (w(i + 1) === 'of' && isTimeUnit(w(i + 2))))) {
      amount = 2; unit = isTimeUnit(w(i + 1)) ? i + 1 : i + 2;
      if (w(i - 1) === 'a') first = i - 1;
    } else if (t === 'few' && isTimeUnit(w(i + 1))) {
      amount = 3; unit = i + 1;
      if (w(i - 1) === 'a') first = i - 1;
    } else if ((t === 'next' || t === 'this' || t === 'coming' || t === 'following') && MONTH_UNITS.has(w(i + 1))) {
      amount = 1; unit = i + 1; article = true;
    }
    if (amount === null) continue;
    if (isClaimed(mask, toks[first].start, toks[unit].end)) continue;

    const isMonth = MONTH_UNITS.has(w(unit));
    if (article && !isMonth && !(t === 'a' || t === 'an')) continue;
    if (article && isMonth && (t === 'a' || t === 'an') && FREQUENCY_BEFORE.has(w(first - 1))) continue;

    const weeks = isMonth ? amount * 4 : amount;
    const prev = w(first - 1);
    const next = w(unit + 1);
    const next2 = w(unit + 2);
    if (PAST_BEFORE.has(prev) || PAST_AFTER.has(next)) continue;

    let cls = 'plain';
    let from = first;
    let to = unit;
    // layoff word before: "off for 6 weeks", "sick 3 weeks", "missed 2 weeks", "havent trained in 3 weeks"
    let j = first - 1;
    let skips = 0;
    while (j >= 0 && skips < 3 && LAYOFF_SKIP.has(w(j))) { j--; skips++; }
    const bw = w(j);
    if (LAYOFF_BEFORE.has(bw) &&
        !(bw === 'out' && BEFORE_EXCLUDED_OUT.has(w(j - 1))) &&
        !(bw === 'off' && BEFORE_EXCLUDED_OFF.has(w(j - 1)))) {
      cls = 'strong'; from = j;
    } else if (bw === 'in' && TRAINED.has(w(j - 1))) {
      cls = 'strong'; from = j - 1;
    } else if (TRAINED.has(bw) && NEGATORS.has(w(j - 1)) && skips > 0) {
      cls = 'strong'; from = j - 1;
    } else if (LAYOFF_AFTER.has(next)) {
      cls = 'strong'; to = next === 'lay' && (next2 === 'off' || next2 === 'offs') ? unit + 2 : unit + 1;
    } else if (next === 'of' && LAYOFF_AFTER_OF.has(next2)) {
      cls = 'strong'; to = unit + 2;
    } else if (next === 'out') {
      if (next2 === 'of') { cls = 'strong'; to = unit + 2; }
      else if (!OUT_NOT_LAYOFF.has(next2)) { cls = 'weak'; to = unit + 1; }
    } else if (next === 'away') {
      cls = 'weak'; to = unit + 1;
    }

    // "a week" is only a time phrase when it names a layoff; elsewhere it is "3 days a week".
    if (article && !isMonth && cls !== 'strong') continue;

    out.push({ cls, weeks, start: toks[from].start, end: toks[to].end });
  }
  return out;
}

const DAY_WORDS = new Set(['day', 'days']);
const SESSION_WORDS = new Set(['times', 'time', 'sessions', 'session', 'workouts', 'workout']);
const TRAINING_ADJ = new Set(['training', 'gym', 'lifting', 'workout']);
const PER = new Set(['a', 'per', 'each', 'every']);
const WEEKLY = new Set(['week', 'weekly', 'wk']);
const BARE_DAYS_BEFORE_EXCLUDED = new Set(['for', 'in', 'after', 'last', 'past', 'next', 'every', 'within', 'over', 'than', 'until', 'till', 'by']);
const BARE_DAYS_AFTER_EXCLUDED = new Set(['off', 'away', 'out', 'break', 'ago', 'later', 'since', 'rest', 'straight', 'before', 'until', 'till', 'from', 'ahead', 'old', 'long', 'sick', 'at']);

/** Days per week said with the word "week" ("3 days a week", "3x a week", "3 training days", "twice a week"). */
function scanDaysExplicit(toks) {
  const out = [];
  const w = (k) => (k >= 0 && k < toks.length ? toks[k].w : '');
  const weekAfter = (k) => {
    let m = k;
    if (PER.has(w(m))) m++;
    return WEEKLY.has(w(m)) ? m : -1;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].w;
    let n = numOf(t);
    let last = -1;
    if (n === null) {
      if (t === 'twice' || t === 'once') {
        n = t === 'twice' ? 2 : 1;
        if (PER.has(w(i + 1)) && WEEKLY.has(w(i + 2))) last = i + 2;
      }
    } else {
      const u = w(i + 1);
      if (DAY_WORDS.has(u) || u === 'x' || SESSION_WORDS.has(u)) last = weekAfter(i + 2);
      else if (TRAINING_ADJ.has(u) && (DAY_WORDS.has(w(i + 2)) || w(i + 2) === 'sessions')) last = i + 2;
    }
    if (n === null || last < 0) continue;
    out.push({ n, start: toks[i].start, end: toks[last].end });
  }
  return out;
}

/** "3-day", "4 day split", "three days": a number of days with no "week" next to it. */
function scanDaysBare(toks, mask) {
  const out = [];
  const w = (k) => (k >= 0 && k < toks.length ? toks[k].w : '');
  for (let i = 0; i < toks.length; i++) {
    const n = numOf(toks[i].w);
    if (n === null || n < 1 || n > 7 || !DAY_WORDS.has(w(i + 1))) continue;
    if (isClaimed(mask, toks[i].start, toks[i + 1].end)) continue;
    if (BARE_DAYS_BEFORE_EXCLUDED.has(w(i - 1)) || BARE_DAYS_AFTER_EXCLUDED.has(w(i + 2))) continue;
    out.push({ n, start: toks[i].start, end: toks[i + 1].end });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------------------------

const TITLES = {
  strength: 'Strength block', volume: 'Volume block', peak: 'Peak block', deload: 'Deload block',
  maintenance: 'Maintenance block', return: 'Return block', specialise: 'Specialisation block',
};
const SHOWN = {
  deloadWeek: { none: 'no deload', last: 'a deload at the end', all: 'a deload every week' },
  checkIn: { true: 'a check-in', false: 'no check-in' },
  rotate: { 0: 'the same exercises', 0.7: 'new exercises' },
};
const show = (key, value) => (SHOWN[key] ? SHOWN[key][String(value)] : String(value));

const quote = (text) => {
  const t = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return `you said "${t}"`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const liftName = (text) => (/^squat/.test(text) ? 'squat' : /^bench/.test(text) ? 'bench' : 'deadlift');

function buildSummary(options) {
  if (!Object.keys(options).length) return '';
  const parts = [];
  if (options.focus) {
    let title = TITLES[options.focus];
    if (options.focus === 'specialise' && options.emphasis) title = `${options.emphasis[0].toUpperCase()}${options.emphasis.slice(1)} specialisation block`;
    if (options.focus === 'return' && options.layoffWeeks) title += ` after ${plural(options.layoffWeeks, 'week')} off`;
    parts.push(title);
  }
  if (options.weeks) parts.push(`${options.weeks} weeks`);
  if (options.daysPerWeek) parts.push(`${plural(options.daysPerWeek, 'day')} a week`);
  if (options.deadliftStance) parts.push(`${options.deadliftStance} deadlift`);
  if (options.progression) parts.push(`${options.progression} progression`);
  if (options.rotate !== undefined) parts.push(options.rotate === 0 ? 'same exercises' : 'more variety');
  if (options.deloadWeek) parts.push(options.deloadWeek === 'none' ? 'no deload' : options.deloadWeek === 'last' ? 'deload in the last week' : 'deload every week');
  if (options.checkIn !== undefined) parts.push(options.checkIn ? 'with a check-in' : 'no check-in');
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function emptyResult() {
  return { options: {}, understood: [], unclear: [NO_GOAL], summary: '' };
}

function interpret(text) {
  const s = normalise(text);
  if (!s) return emptyResult();
  const toks = tokenise(s);
  const mask = new Uint8Array(s.length + 1);
  const unclear = [];
  const found = new Map(); // option key -> { value, because }

  const settle = (key, hits) => {
    if (!hits.length) return;
    const first = hits[0];
    found.set(key, { value: first.def.value, because: quote(first.text) });
    const other = hits.find((h) => h.def.value !== first.def.value);
    if (other) unclear.push(`Both ${show(key, first.def.value)} and ${show(key, other.def.value)} were mentioned; using ${show(key, first.def.value)}`);
  };

  // 1. Option phrases. Matched first so that "no deload" or "test my strength" is not also read as a goal.
  settle('deloadWeek', group(s, mask, [DELOAD_NONE, DELOAD_LAST]));
  settle('checkIn', group(s, mask, [CHECKIN_NO, CHECKIN_YES]));
  settle('rotate', group(s, mask, [ROTATE_SAME, ROTATE_NEW]));
  // No claim: "bring up my sumo deadlift" still needs "sumo" for the lift to bring up.
  settle('progression', group(s, mask, [PROGRESSION], false));
  settle('deadliftStance', group(s, mask, [STANCE], false));

  // 2. Days per week said with "week".
  const daysExplicit = scanDaysExplicit(toks);
  for (const d of daysExplicit) claim(mask, d.start, d.end);

  // 3. Time phrases (layoff or block length).
  const times = scanTimes(toks, mask).map((t) => ({ ...t, text: s.slice(t.start, t.end) }));
  const strong = times.filter((t) => t.cls === 'strong');
  const weak = times.filter((t) => t.cls === 'weak');
  for (const t of strong) claim(mask, t.start, t.end);

  // 4. Goal, by priority; the other goals that were mentioned go to `unclear`.
  const matches = {};
  let emphasisHits = [];
  for (const f of FOCUS_ORDER) {
    const hits = collect(s, mask, FOCUS_DEFS[f]);
    for (const h of hits) claim(mask, h.start, h.end);
    if (hits.length) matches[f] = hits[0];
    if (f === 'specialise') emphasisHits = hits.filter((h) => h.groups && h.groups.lift);
  }
  if (strong.length && (!matches.return || strong[0].start < matches.return.start)) {
    matches.return = { start: strong[0].start, end: strong[0].end, text: strong[0].text };
  }
  if (!Object.keys(matches).length && weak.length) {
    matches.return = { start: weak[0].start, end: weak[0].end, text: weak[0].text };
  }
  const focus = FOCUS_ORDER.find((f) => matches[f]) || null;
  if (focus) found.set('focus', { value: focus, because: quote(matches[focus].text) });

  // 5. Layoff (only with the return focus) and block length (every other time phrase).
  let layoff = null;
  if (focus === 'return') layoff = strong[0] || weak[0] || null;
  if (layoff) {
    found.set('layoffWeeks', {
      value: Math.min(LAYOFF_MAX, Math.max(1, layoff.weeks)),
      because: quote(layoff.text),
    });
  }
  const lengths = times.filter((t) => t.cls === 'plain' || (t.cls === 'weak' && t !== layoff));
  if (lengths.length) {
    const t = lengths[0];
    const clamped = Math.min(WEEKS_MAX, Math.max(WEEKS_MIN, t.weeks));
    found.set('weeks', { value: clamped, because: quote(t.text) });
    if (clamped !== t.weeks) unclear.push(`${plural(t.weeks, 'week')} is outside ${WEEKS_MIN}-${WEEKS_MAX}; using ${clamped}`);
    const other = lengths.find((x) => x.weeks !== t.weeks);
    if (other) unclear.push(`Several lengths were mentioned; using the first (${plural(t.weeks, 'week')}), not ${plural(other.weeks, 'week')}`);
  }

  // 6. Days per week.
  let days = null;
  for (const d of daysExplicit) {
    if (d.n >= 1 && d.n <= 7) { days = d; break; }
  }
  for (const d of daysExplicit) {
    if (d.n < 1 || d.n > 7) unclear.push(`${s.slice(d.start, d.end)} is outside 1-7; ignoring it`);
  }
  if (!days) days = scanDaysBare(toks, mask)[0] || null;
  if (days) found.set('daysPerWeek', { value: days.n, because: quote(s.slice(days.start, days.end)) });

  // 7. The lift to bring up (only with the specialise focus, where it is required).
  if (focus === 'specialise') {
    const lifted = emphasisHits.map((h) => ({ lift: liftName(h.groups.lift), text: h.text }));
    if (lifted.length) {
      found.set('emphasis', { value: lifted[0].lift, because: quote(lifted[0].text) });
      const other = lifted.find((x) => x.lift !== lifted[0].lift);
      if (other) unclear.push(`I can bring up one lift at a time; using ${lifted[0].lift} (you also said ${other.lift})`);
    } else {
      unclear.push('Say which lift to bring up: squat, bench or deadlift.');
    }
  }

  for (const f of FOCUS_ORDER) {
    if (matches[f] && f !== focus) unclear.push(`also mentioned: ${f}`);
  }

  // 8. Report in a fixed order.
  const ORDER = ['focus', 'layoffWeeks', 'weeks', 'daysPerWeek', 'emphasis', 'deadliftStance', 'progression', 'rotate', 'deloadWeek', 'checkIn'];
  const options = {};
  const understood = [];
  for (const key of ORDER) {
    const hit = found.get(key);
    if (!hit) continue;
    options[key] = hit.value;
    understood.push({ key, value: hit.value, because: hit.because });
  }
  if (!understood.length) unclear.push(NO_GOAL);
  return { options, understood, unclear, summary: buildSummary(options) };
}

/**
 * interpretRequest(text, { defaults = {} } = {}) -> { options, understood: [{ key, value, because }], unclear: [string], summary }
 * `options` holds only the keys the text actually set. `defaults` is accepted so callers can pass context later;
 * it never changes the result. Never throws; non-string input is treated as empty.
 */
export function interpretRequest(text) {
  try {
    return interpret(text);
  } catch {
    return emptyResult();
  }
}
