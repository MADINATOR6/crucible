import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretRequest } from '../../src/core/request.js';

const NO_GOAL = 'I did not recognise a goal; pick one below.';
const opts = (text) => interpretRequest(text).options;
const entry = (r, key) => r.understood.find((u) => u.key === key);

// 1 ---------------------------------------------------------------------------------------------------------

test('"I need a maintenance block": focus, understood entry quoting the words, summary, nothing unclear', () => {
  const r = interpretRequest('I need a maintenance block');
  assert.deepEqual(r.options, { focus: 'maintenance' });
  assert.equal(r.understood.length, 1);
  const e = entry(r, 'focus');
  assert.equal(e.value, 'maintenance');
  assert.ok(e.because.includes('maintenance') && e.because.length < 60, e.because);
  assert.equal(r.summary, 'Maintenance block.');
  assert.deepEqual(r.unclear, []);
});

// 2 ---------------------------------------------------------------------------------------------------------

test('"maintenance block, 3 days a week for 4 weeks"', () => {
  const r = interpretRequest('maintenance block, 3 days a week for 4 weeks');
  assert.deepEqual(r.options, { focus: 'maintenance', daysPerWeek: 3, weeks: 4 });
  assert.equal(r.summary, 'Maintenance block, 4 weeks, 3 days a week.');
  assert.deepEqual(r.unclear, []);
  assert.deepEqual(r.understood.map((u) => u.key).sort(), ['daysPerWeek', 'focus', 'weeks']);
});

// 3 ---------------------------------------------------------------------------------------------------------

test('a layoff phrase is the layoff, not the block length', () => {
  const r = interpretRequest("I've been off for 6 weeks with a sore shoulder, ease me back in");
  assert.deepEqual(r.options, { focus: 'return', layoffWeeks: 6 });
  assert.ok(!('weeks' in r.options));
  assert.deepEqual(r.unclear, []);
});

test('layoff: months count as 4 weeks, and the layoff is clamped to 1..52', () => {
  assert.equal(opts('2 months away').layoffWeeks, 8);
  assert.equal(opts('2 months away').focus, 'return');
  assert.equal(opts('off for 80 weeks').layoffWeeks, 52);
  assert.equal(opts('off for 80 weeks').focus, 'return');
  assert.equal(opts('back from injury, 6 weeks off').layoffWeeks, 6);
  assert.equal(opts('back from injury, 6 weeks off').weeks, undefined);
  assert.equal(opts('back from injury, away for 0 weeks').layoffWeeks, 1);
});

test('a block length can sit beside a layoff', () => {
  assert.deepEqual(opts("I've been off for 6 weeks, ease me back in over 4 weeks"), { focus: 'return', layoffWeeks: 6, weeks: 4 });
});

test('layoffWeeks is only produced with the return focus', () => {
  // "6 weeks out" is the time to the meet here, so it is the block length, not a layoff
  assert.deepEqual(opts("peak for my meet, I'm 6 weeks out"), { focus: 'peak', weeks: 6 });
  assert.deepEqual(opts('my meet is 8 weeks away'), { focus: 'peak', weeks: 8 });
});

// 4 ---------------------------------------------------------------------------------------------------------

test('"build size for 5 weeks, 4x a week, keep the same exercises"', () => {
  const r = interpretRequest('build size for 5 weeks, 4x a week, keep the same exercises');
  assert.deepEqual(r.options, { focus: 'volume', weeks: 5, daysPerWeek: 4, rotate: 0 });
  // "build" belongs to "build size"; it is not a second goal
  assert.deepEqual(r.unclear, []);
});

// 5 ---------------------------------------------------------------------------------------------------------

test('"bring up my bench, sumo deadlift, aggressive"', () => {
  const r = interpretRequest('bring up my bench, sumo deadlift, aggressive');
  assert.deepEqual(r.options, { focus: 'specialise', emphasis: 'bench', deadliftStance: 'sumo', progression: 'aggressive' });
  assert.deepEqual(r.unclear, []);
});

test('emphasis: lift names, "dead", "bench press", reversed and "weak" forms', () => {
  assert.deepEqual(opts('focus on squats'), { focus: 'specialise', emphasis: 'squat' });
  assert.deepEqual(opts('specialise in bench press'), { focus: 'specialise', emphasis: 'bench' });
  assert.deepEqual(opts('bring up my dead'), { focus: 'specialise', emphasis: 'deadlift' });
  assert.deepEqual(opts('emphasis on deadlift'), { focus: 'specialise', emphasis: 'deadlift' });
  assert.deepEqual(opts('my squat is weak'), { focus: 'specialise', emphasis: 'squat' });
  assert.deepEqual(opts('weak bench'), { focus: 'specialise', emphasis: 'bench' });
  assert.deepEqual(opts('bring up my conventional deadlift'), { focus: 'specialise', emphasis: 'deadlift', deadliftStance: 'conventional' });
});

test('specialise without a lift asks which one; the lift is only an option with specialise', () => {
  const r = interpretRequest('bring up my weak points');
  assert.deepEqual(r.options, { focus: 'specialise' });
  assert.ok(r.unclear.some((u) => /which lift/i.test(u)), r.unclear.join('|'));
  // a higher-priority goal wins, so there is no emphasis to carry
  const q = interpretRequest('back from injury, bring up my bench');
  assert.equal(q.options.focus, 'return');
  assert.equal(q.options.emphasis, undefined);
  assert.ok(q.unclear.includes('also mentioned: specialise'));
});

test('stance: conv and conventional', () => {
  assert.equal(opts('conv deadlift').deadliftStance, 'conventional');
  assert.equal(opts('conventional').deadliftStance, 'conventional');
  assert.equal(opts('sumo please').deadliftStance, 'sumo');
});

// 6 ---------------------------------------------------------------------------------------------------------

test('single-word goals', () => {
  assert.deepEqual(opts('peak for my meet'), { focus: 'peak' });
  assert.deepEqual(opts('deload'), { focus: 'deload' });
  assert.deepEqual(opts('get stronger'), { focus: 'strength' });
});

test('every goal keyword set from GENERATOR.md maps to its goal', () => {
  const table = {
    maintenance: ['maintain', 'maintenance', 'hold my strength', 'keep my strength', 'stay strong', 'stay where I am', 'low fatigue', 'busy', 'time poor', 'life is crazy'],
    return: ['back from', 'coming back', 'return', 'layoff', 'lay-off', 'break', 'time off', 'injured', 'injury', 'sick', 'illness', 'holiday', 'vacation'],
    peak: ['peak', 'meet', 'comp', 'competition', 'taper'],
    deload: ['deload', 'recover', 'recovery week', 'easy week'],
    volume: ['volume', 'size', 'hypertrophy', 'muscle', 'bodybuilding', 'gain muscle'],
    strength: ['strength', 'stronger', 'heavier', 'build', 'get strong', 'progress'],
  };
  for (const [focus, phrases] of Object.entries(table)) {
    for (const p of phrases) {
      for (const text of [p, `I want ${p} please`, p.toUpperCase()]) {
        assert.equal(interpretRequest(text).options.focus, focus, `${JSON.stringify(text)} -> ${focus}`);
      }
    }
  }
  assert.equal(opts('specialise').focus, 'specialise');
  assert.equal(opts('specialize').focus, 'specialise');
  assert.equal(opts('bring up').focus, 'specialise');
  assert.equal(opts('weak point').focus, 'specialise');
});

// 7 ---------------------------------------------------------------------------------------------------------

test('priority: return, peak, deload, specialise, maintenance, volume, strength', () => {
  const r = interpretRequest('maintenance but also build strength');
  assert.equal(r.options.focus, 'maintenance');
  assert.ok(r.unclear.includes('also mentioned: strength'));

  const q = interpretRequest('back from injury, peak for comp');
  assert.deepEqual(q.options, { focus: 'return' });
  assert.deepEqual(q.unclear, ['also mentioned: peak']);

  const order = ['return', 'peak', 'deload', 'specialise', 'maintenance', 'volume', 'strength'];
  const words = { return: 'injury', peak: 'peak', deload: 'deload', specialise: 'specialise', maintenance: 'maintain', volume: 'hypertrophy', strength: 'stronger' };
  for (let i = 0; i < order.length; i++) {
    const text = order.slice(i).map((f) => words[f]).reverse().join(' and ');
    const r2 = interpretRequest(text);
    assert.equal(r2.options.focus, order[i], text);
    assert.deepEqual(r2.unclear.filter((u) => u.startsWith('also mentioned')), order.slice(i + 1).map((f) => `also mentioned: ${f}`), text);
  }
});

test('words inside a longer phrase are not a second goal', () => {
  assert.deepEqual(interpretRequest('just maintain my strength').unclear, []);
  assert.deepEqual(interpretRequest('hold my strength').unclear, []);
  assert.deepEqual(interpretRequest('keep my strength, stay strong').unclear, []);
  assert.deepEqual(interpretRequest('gain muscle').unclear, []);
});

// 8 ---------------------------------------------------------------------------------------------------------

test('"no deload, test my maxes"', () => {
  const r = interpretRequest('no deload, test my maxes');
  assert.deepEqual(r.options, { deloadWeek: 'none', checkIn: true });
  // "deload" in "no deload" is not a deload goal, and "strength" in "test my strength" is not a strength goal
  assert.equal(r.options.focus, undefined);
  assert.equal(opts('test my strength').focus, undefined);
  assert.deepEqual(opts('test my strength'), { checkIn: true });
});

test('check-in phrases', () => {
  assert.deepEqual(opts('no check-in'), { checkIn: false });
  assert.deepEqual(opts('no test'), { checkIn: false });
  assert.deepEqual(opts('check-in at the end'), { checkIn: true });
  assert.deepEqual(opts('checkin'), { checkIn: true });
  assert.deepEqual(opts('maintenance with a check in'), { focus: 'maintenance', checkIn: true });
});

test('deload placement', () => {
  assert.deepEqual(opts('end with a deload'), { deloadWeek: 'last' });
  assert.deepEqual(opts('deload at the end'), { deloadWeek: 'last' });
  assert.deepEqual(opts('deload last'), { deloadWeek: 'last' });
  assert.deepEqual(opts('strength, no deload'), { focus: 'strength', deloadWeek: 'none' });
  assert.deepEqual(opts('a deload week'), { focus: 'deload' });
});

test('rotation', () => {
  assert.deepEqual(opts('mix it up'), { rotate: 0.7 });
  assert.deepEqual(opts('I want variety'), { rotate: 0.7 });
  assert.deepEqual(opts('fresh accessories'), { rotate: 0.7 });
  assert.deepEqual(opts('change up the exercises'), { rotate: 0.7 });
  assert.deepEqual(opts('keep the same accessories'), { rotate: 0 });
  assert.deepEqual(opts('no rotation'), { rotate: 0 });
  assert.deepEqual(opts('no changes'), { rotate: 0 });
  assert.deepEqual(opts('no new exercises'), { rotate: 0 });
});

test('progression', () => {
  assert.deepEqual(opts('slow and steady'), { progression: 'conservative' });
  for (const w of ['conservative', 'cautious', 'gentle']) assert.equal(opts(w).progression, 'conservative', w);
  for (const w of ['aggressive', 'fast', 'ambitious']) assert.equal(opts(w).progression, 'aggressive', w);
  assert.deepEqual(opts('standard progression'), {});
  assert.equal(opts('not too aggressive').progression, undefined);
});

test('days per week, every phrasing', () => {
  for (const text of ['three days a week', '3-day', '3x a week', '3 training days', '3 days per week', '3 days each week', '3 days/week', '3 day', 'three days', '3 times a week', '3x/week', '3 days a week']) {
    assert.deepEqual(opts(text), { daysPerWeek: 3 }, text);
  }
  assert.equal(opts('four days').daysPerWeek, 4);
  assert.equal(opts('4 day split').daysPerWeek, 4);
  assert.equal(opts('7 days a week').daysPerWeek, 7);
  assert.equal(opts('1 day a week').daysPerWeek, 1);
  assert.equal(opts('twice a week').daysPerWeek, 2);
});

test('days per week outside 1..7 is ignored with an unclear line', () => {
  for (const text of ['9 days a week', '0 days a week', '8x a week']) {
    const r = interpretRequest(text);
    assert.equal(r.options.daysPerWeek, undefined, text);
    assert.ok(r.unclear.length >= 1, text);
  }
  assert.ok(interpretRequest('9 days a week').unclear.some((u) => u.includes('9 days a week')));
});

test('"3 days off" and "a week off" are not days per week', () => {
  assert.equal(opts('3 days off').daysPerWeek, undefined);
  assert.equal(opts('off for 3 days').daysPerWeek, undefined);
  assert.equal(opts('hypertrophy, 4 days a week for 5 weeks').daysPerWeek, 4);
});

// 9 ---------------------------------------------------------------------------------------------------------

test('weeks outside 3..8 are clamped with an unclear line', () => {
  const r = interpretRequest('12 weeks');
  assert.deepEqual(r.options, { weeks: 8 });
  assert.ok(r.unclear.includes('12 weeks is outside 3-8; using 8'), r.unclear.join('|'));

  const q = interpretRequest('two weeks');
  assert.deepEqual(q.options, { weeks: 3 });
  assert.ok(q.unclear.includes('2 weeks is outside 3-8; using 3'), q.unclear.join('|'));
});

test('weeks: word numbers one..eight, digits, "-week", months', () => {
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  words.forEach((w, i) => {
    const expected = Math.min(8, Math.max(3, i + 1));
    assert.equal(opts(`${w} weeks`).weeks, expected, w);
    assert.equal(opts(`${i + 1} weeks`).weeks, expected, String(i + 1));
  });
  assert.equal(opts('a 5-week block').weeks, 5);
  assert.equal(opts('6 week block').weeks, 6);
  assert.equal(opts('6wks').weeks, 6);
  assert.equal(opts('peak me for nationals in 6 weeks').weeks, 6);
  assert.equal(opts('over the next month').weeks, 4);
  assert.equal(opts('2 months').weeks, 8);
  assert.equal(opts('3 weeks').weeks, 3);
  assert.equal(opts('8 weeks').weeks, 8);
  assert.deepEqual(interpretRequest('3 weeks').unclear, []);
  assert.deepEqual(interpretRequest('8 weeks').unclear, []);
});

test('past references are not a block length', () => {
  assert.equal(opts('I started lifting 6 months ago, get stronger').weeks, undefined);
  assert.equal(opts('after the last 6 weeks of squatting').weeks, undefined);
});

// 10 --------------------------------------------------------------------------------------------------------

test('empty, whitespace, gibberish and non-strings', () => {
  for (const input of ['', '   ', '\n\t', 'asdf qwer zxcv', '!!!', undefined, null, 42, {}, [], ['maintenance'], true, () => 'maintenance', Symbol('x')]) {
    const r = interpretRequest(input);
    assert.deepEqual(r, { options: {}, understood: [], unclear: [NO_GOAL], summary: '' }, String(typeof input));
  }
});

test('returns fresh objects each call', () => {
  const a = interpretRequest('');
  a.unclear.push('x');
  a.options.focus = 'strength';
  assert.deepEqual(interpretRequest(''), { options: {}, understood: [], unclear: [NO_GOAL], summary: '' });
});

// 11 --------------------------------------------------------------------------------------------------------

test('case and punctuation do not matter', () => {
  const expected = { focus: 'maintenance', weeks: 4, daysPerWeek: 3 };
  for (const text of [
    'maintenance block, 3 days a week for 4 weeks',
    'MAINTENANCE BLOCK, 3 DAYS A WEEK FOR 4 WEEKS',
    'Maintenance Block!!! 3 days/week; 4 weeks.',
    '  maintenance...block --- 3 days a week (4 weeks)  ',
    'maintenance\nblock\n3 days a week\n4 weeks',
  ]) assert.deepEqual(opts(text), expected, text);
  assert.equal(opts('I’ve been off for 6 weeks').layoffWeeks, 6); // curly apostrophe
  assert.deepEqual(opts("I've been off for 6 weeks"), opts('Ive been OFF for 6 WEEKS'));
});

test('defaults are accepted and never alter the result', () => {
  const text = 'maintenance block, 3 days a week';
  const plain = interpretRequest(text);
  const defaults = Object.freeze({ focus: 'strength', weeks: 6, daysPerWeek: 4, rotate: 0.3 });
  assert.deepEqual(interpretRequest(text, { defaults }), plain);
  assert.deepEqual(interpretRequest(text, {}), plain);
  assert.deepEqual(interpretRequest(text, null), plain);
  assert.deepEqual(interpretRequest(text, 'x'), plain);
  assert.deepEqual(interpretRequest('', { defaults }).options, {});
});

// 12 --------------------------------------------------------------------------------------------------------

test('no mutation of inputs', () => {
  const defaults = Object.freeze({ focus: 'strength' });
  const options = Object.freeze({ defaults });
  const before = JSON.stringify(options);
  interpretRequest('maintenance 3 days a week 4 weeks', options);
  assert.equal(JSON.stringify(options), before);
  // results do not share state between calls
  const a = interpretRequest('maintenance');
  const b = interpretRequest('maintenance');
  assert.notEqual(a.options, b.options);
  assert.notEqual(a.understood, b.understood);
});

test('a 5,000-character input of repeated words is fast; longer input is cut', () => {
  const inputs = [
    'maintenance '.repeat(500),
    'week '.repeat(1000),
    'a '.repeat(2500),
    '3 days a week '.repeat(400),
    'bring up my '.repeat(500),
    'build some more '.repeat(400),
    'keep the same exercises no deload test my maxes '.repeat(120),
    'off for 6 weeks '.repeat(400),
    'break '.repeat(900),
    'x'.repeat(5000),
    ' '.repeat(5000),
    '-'.repeat(5000),
  ];
  for (const input of inputs) {
    const t0 = performance.now();
    const r = interpretRequest(input);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `${ms.toFixed(1)} ms for ${JSON.stringify(input.slice(0, 20))}`);
    assert.ok(r && typeof r.summary === 'string');
  }
  const long = `${'x '.repeat(3000)}maintenance`; // the goal sits past the 5,000-character cut
  assert.deepEqual(interpretRequest(long), { options: {}, understood: [], unclear: [NO_GOAL], summary: '' });
});

test('never throws on odd text', () => {
  for (const input of ['\u0000\u0001', '\ud800', 'İİİ', '3.5 weeks', '1,000 weeks', '99999999999 weeks', '-3 days a week', '3 days a week '.repeat(3), '🏋️ maintenance 💪']) {
    assert.doesNotThrow(() => interpretRequest(input), JSON.stringify(input));
  }
  assert.equal(opts('🏋️ maintenance 💪').focus, 'maintenance');
});

// Extra behaviour ------------------------------------------------------------------------------------------

test('summary sentences', () => {
  assert.equal(interpretRequest('return block, off for 6 weeks, 4 weeks, 3 days a week').summary, 'Return block after 6 weeks off, 4 weeks, 3 days a week.');
  assert.equal(interpretRequest('bring up my bench, sumo deadlift, aggressive').summary, 'Bench specialisation block, sumo deadlift, aggressive progression.');
  assert.equal(interpretRequest('hypertrophy, 1 day a week, no deload, no check-in, mix it up').summary, 'Volume block, 1 day a week, more variety, no deload, no check-in.');
  assert.equal(interpretRequest('3 days a week').summary, '3 days a week.');
});

test('understood entries quote the matched words', () => {
  const r = interpretRequest("I've been off for 6 weeks with a sore shoulder, ease me back in");
  assert.ok(entry(r, 'layoffWeeks').because.includes('off for 6 weeks'));
  const q = interpretRequest('maintenance block, 3 days a week for 4 weeks');
  assert.ok(entry(q, 'weeks').because.includes('4 weeks'));
  assert.ok(entry(q, 'daysPerWeek').because.includes('3 days a week'));
  for (const u of q.understood) assert.ok(typeof u.because === 'string' && u.because.length > 0 && u.because.length < 80);
});

test('conflicting mentions use the first and say so', () => {
  const r = interpretRequest('aggressive but slow');
  assert.equal(r.options.progression, 'aggressive');
  assert.ok(r.unclear.some((u) => u.includes('aggressive') && u.includes('conservative')), r.unclear.join('|'));
  assert.equal(interpretRequest('sumo or conventional').options.deadliftStance, 'sumo');
});

test('false friends are not read as goals', () => {
  assert.deepEqual(opts('I want to break my bench PR'), {});
  assert.deepEqual(opts("I'm sick of the same exercises"), {});
  assert.deepEqual(opts('I need to meet my goals'), {});
  assert.deepEqual(opts('avoid injury'), {});
  assert.deepEqual(opts("I'll do it"), {}); // "i'll" must not become "ill"
  assert.equal(opts('build me a 4 week plan').focus, undefined);
});

test('a goal or stance said with a negation is not selected; the affirmative one is', () => {
  assert.equal(opts('no peak, maintenance').focus, 'maintenance');
  assert.equal(opts('not maintenance, build strength').focus, 'strength');
  assert.equal(opts("dont want a deload, I want to build strength").focus, 'strength');
  assert.equal(opts('maintenance, not a peak').focus, 'maintenance');
  assert.equal(opts('instead of volume, strength').focus, 'strength');
  assert.equal(opts('not sumo, conventional').deadliftStance, 'conventional');
  assert.equal(opts('conventional, not sumo').deadliftStance, 'conventional');
  assert.equal(opts('sumo deadlift').deadliftStance, 'sumo');
  assert.equal(opts('peak for my meet').focus, 'peak');
  assert.equal(opts('I have no time, keep me ticking over').focus, 'maintenance'); // "no time" is itself the maintenance cue
  assert.equal(opts('not peaking').focus, undefined);
});

test('a deload block cannot also carry a deload-week option (it is a deload every week)', () => {
  const r = interpretRequest('deload block, no deload');
  assert.equal(r.options.focus, 'deload');
  assert.equal(r.options.deloadWeek, undefined);
  assert.ok(r.unclear.some((u) => /deload every week/.test(u)), r.unclear.join('|'));
  assert.equal(interpretRequest('strength block, no deload').options.deloadWeek, 'none');
});
