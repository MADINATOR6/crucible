# Task

## Mode and Owner
LT-9c · normal · risk low (parses a typed request into options the user then confirms) · Dispatch in worktree `.ccx-worktrees/codex-LT-9c`, branch `codex/lt-9c`, parallel with LT-9a and LT-9b. Codex implements; Claude reviews and commits.

## Goal
Implement `interpretRequest` exactly as written in `lifting-tracker/GENERATOR.md`, section "Request interpreter". Read that section and the "Generator" option list (so you know the option names and value types) first.

## Write Allowlist
- `lifting-tracker/src/core/request.js` (new)
- `lifting-tracker/test/core/request.test.js` (new)
- No other files. Plain ES modules, no dependencies, no regex backtracking hazards (inputs up to 5,000 characters must finish in well under 50 ms; cut longer input to 5,000), Node 18+, never throws.

## Worked examples the tests must assert
1. `"I need a maintenance block"` -> `options: { focus: 'maintenance' }`, `understood` contains `{ key: 'focus', value: 'maintenance' }` with a short `because` quoting the matched words, `summary: 'Maintenance block.'`, `unclear: []`.
2. `"maintenance block, 3 days a week for 4 weeks"` -> `{ focus: 'maintenance', daysPerWeek: 3, weeks: 4 }`, summary `Maintenance block, 4 weeks, 3 days a week.`
3. `"I've been off for 6 weeks with a sore shoulder, ease me back in"` -> `{ focus: 'return', layoffWeeks: 6 }` and no `weeks` (that phrase is the layoff). `"2 months away"` -> `layoffWeeks: 8`. `"off for 80 weeks"` -> `layoffWeeks: 52`.
4. `"build size for 5 weeks, 4x a week, keep the same exercises"` -> `{ focus: 'volume', weeks: 5, daysPerWeek: 4, rotate: 0 }`.
5. `"bring up my bench, sumo deadlift, aggressive"` -> `{ focus: 'specialise', emphasis: 'bench', deadliftStance: 'sumo', progression: 'aggressive' }`.
6. `"peak for my meet"` -> `{ focus: 'peak' }`; `"deload"` -> `{ focus: 'deload' }`; `"get stronger"` -> `{ focus: 'strength' }`.
7. Priority and `unclear`: `"maintenance but also build strength"` -> focus `maintenance` with `unclear` containing `also mentioned: strength`; `"back from injury, peak for comp"` -> `return`, with `also mentioned: peak`.
8. Phrases: `"no deload, test my maxes"` -> `deloadWeek: 'none'`, `checkIn: true`; `"no check-in"` -> `checkIn: false`; `"end with a deload"` -> `deloadWeek: 'last'`; `"mix it up"` -> `rotate: 0.7`; `"slow and steady"` -> `progression: 'conservative'`; `"three days a week"`, `"3-day"`, `"3x a week"`, `"3 training days"` -> `daysPerWeek: 3`; `"9 days a week"` -> no `daysPerWeek` and an `unclear` line.
9. Weeks: `"12 weeks"` -> `weeks: 8` plus `unclear` `12 weeks is outside 3-8; using 8`; `"two weeks"` -> `weeks: 3` plus the matching `unclear` line; word numbers one..eight work.
10. Empty, whitespace, gibberish and non-strings (`undefined`, `42`, `{}`) -> `options: {}`, `understood: []`, `unclear: ['I did not recognise a goal; pick one below.']`, `summary: ''`.
11. Case and punctuation insensitivity; `defaults` is accepted but never alters `options` (it only exists so callers can pass context later).
12. No mutation of inputs; a 5,000-character input of repeated words returns in under 50 ms (assert with `performance.now()` and a generous bound of 200 ms).

## Done When
- [ ] Every example above has a passing test (Codex runs `cd lifting-tracker && node --test test/core/request.test.js` and reports the output).
- [ ] No file outside the allowlist changed.
- [ ] Claude re-runs the suite and tries a few extra phrasings before merging.

## Verify
```
cd lifting-tracker && node --test test/core/request.test.js    # not yet run
```

## Stop Conditions
Report UNKNOWN / CHECKED / NEEDED rather than guessing. If an example is wrong, say so with your reasoning and flag the value you used. Two failed repairs on one test: stop.
