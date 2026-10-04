# Block generator: design

Goal: continue training inside the app by generating the next block from the athlete's own history, in the same overall shape as their recent blocks (day structure, main-lift schemes, accessory style, volume) but as a new plan with its own progression logic. It is a planning aid, not coaching advice: every load and exercise is editable, and the app says so.

Nothing here copies a coach's text, branding or exact programming. It learns structure and numbers from the athlete's imported blocks at runtime; nothing about any particular coach is built into the code.

All maths is in kg. Pure functions, no DOM, no storage, no clock (pass `asOf` / `now`), no randomness (a string `seed` drives any choice).

## Pipeline

```
history (events + programme)  ->  buildAthleteModel()  ->  AthleteModel
programme (recent blocks)     ->  learnTemplate()      ->  Template
Template + AthleteModel + options -> generateBlock()   ->  { block, rationale, warnings, volume }
block + newer AthleteModel    ->  reviseBlock()        ->  { block, changes }   (re-load the weeks not yet done)
```

## RPE chart (`src/core/rpe-chart.js`, exists)
`pctOfE1rm(reps, rpe)` (half-step table), `pctSmooth(reps, rpe)` (any RPE 6..10), `loadFor`, `e1rmFrom`. Reps 1..12, RPE 6..10. Outside the chart these return `null`.

## AthleteModel (`src/core/athlete.js`)

`buildAthleteModel({ events, catalogue, asOf, windowWeeks = 8 })` -> object. `events` are set events (`core/sets.js` shape: `{ date, exerciseId, weightKg, reps, rpe, isWarmup, order, source }`).

```
{
  asOf: 'YYYY-MM-DD',                      // options.asOf, else the latest event date, else null
  lifts: {
    squat|bench|deadlift: {
      e1rmKg: number | null,               // working estimate, see rules
      n: number,                           // sources used
      confidence: 'high' | 'medium' | 'low' | 'none',
      basis: string,                       // one human sentence: what it was based on
      sources: [{ date, exerciseId, weightKg, reps, rpe, e1rmKg }]   // up to 5 best, newest-first ties by e1rm desc
    },
    deadlift also has stance: 'sumo' | 'conventional' | null
  },
  rpeBias: { squat, bench, deadlift },     // mean(actual RPE - target RPE) from the optional programme; 0 when unknown
  exercises: { [exerciseId]: { lastDate, lastWeightKg, lastReps, lastRpe, count, bestE1rmKg } }
}
```

**Working e1RM per lift** (rules, in order):
1. Window = working sets (`isWarmup === false`, reps 1..8, `weightKg > 0`) dated in `(asOf - windowWeeks*7 days, asOf]`.
2. A *source* is a set of a **competition** exercise of that lift (catalogue `lift` equal and `competition: true`) with a numeric `rpe` in 6..10 (RPE above 10 or missing is not a source). Its e1RM = `e1rmFrom(weightKg, reps, rpe)`; sets whose reps/RPE are outside the chart are skipped.
3. If fewer than 3 competition sources exist, add *variant* sources (catalogue `lift` equal, not competition, RPE 6..10) with their e1RM multiplied by 0.95.
4. If there are still 0 sources, widen the window to 2 x `windowWeeks` and repeat once; any source found this way lowers confidence one step.
5. Working e1RM = mean of the top 3 source e1RMs (or all if fewer), capped at 1.04 x the median of all source e1RMs. Round to 0.1 kg.
6. confidence: n >= 6 high, 3..5 medium, 1..2 low, 0 none (`e1rmKg: null`). Step down one level when rule 4 applied or the newest source is older than 4 weeks before `asOf`.
7. `basis` example: `"top 3 of 9 sets at RPE 6-10 in the last 8 weeks (squat)"`.

**Stance** (deadlift): count working sets in the window for sumo exercises (`sumo_deadlift`, `tempo_to_knee_sumo_deadlift`, `cluster_sumo_deadlift`) versus conventional ones (`conventional_deadlift`, `deadlift`, `tempo_to_knee_deadlift`); the larger count wins, a tie or zero gives `null`.

**rpeBias**: needs planned target RPE. `buildAthleteModel` accepts an optional `programme` (Programme model) and computes, per lift family, the mean of `actualRpe - targetRpe` over completed planned sets of that family in the window with both values <= 10 and at least 8 such sets; otherwise 0. Clamp to [-1, 1], round to 0.05.

**exercises**: for every exercise with working sets in the last 16 weeks (relative to `asOf`): `lastDate` (newest), the weight/reps/RPE of the heaviest-e1RM set on that newest date, `count` of working sets, `bestE1rmKg` (Epley, reps <= 12).

## Template (`src/core/template.js`)

`learnTemplate({ programme, catalogue, blockNumber = null })` -> Template or `null` when there is no usable block.

Choose the block: `blockNumber` if given, else the highest-numbered block that has at least 2 weeks with at least one completed set; if none, the highest-numbered block with any week. Representative week: the second week of that block when it has one, else the first.

```
Template {
  fromBlock: number, blockName: string, weeksInBlock: number, daysPerWeek: number,
  days: [ { number, slots: [Slot] } ]
}
Slot {
  slotId: 'd<day>s<position>',             // position is 1-based order in the day
  exerciseId: string | null, name: string, supersetGroup: string | null, tempo: string | null, cues: [string],
  role: 'main' | 'variation' | 'accessory',
  family: 'squat' | 'bench' | 'deadlift' | null,
  scheme: 'top-backoff' | 'straight' | 'singles' | 'accessory',
  sets: number,                            // sets in the representative week
  reps: number | [min, max],               // from the first set; ranges stay ranges
  rpe: number | null,                      // target RPE of the first set (11 = to failure marker, kept)
  loadKg: number | null,                   // planned load of the first set (kg; lb converted exactly)
  k: number | null                         // main/variation only, see below
}
```
- `role`: the entry's exercise has catalogue `lift` and `competition: true` -> `main`; `lift` set but not competition -> `variation`; otherwise `accessory`. Unknown exercise ids (`exerciseId` null or not in the catalogue) -> `accessory`, `family: null`.
- `scheme`: accessory role -> `accessory`. Otherwise: a single set with reps 1 -> `singles`; all sets reps 1 -> `singles`; more than one set and the first set's load is greater than the last set's load -> `top-backoff`; else `straight`.
- `k` (how this slot's load relates to the chart): `loadKg / (referenceE1rm[family] * pct)`, where `referenceE1rm` is an input of `learnTemplate` (the athlete's e1RM per lift when that block was run; the caller computes it, for example with `buildAthleteModel` on events up to the end of the block), and `pct = pctSmooth(reps, rpe ?? 7)` (lower bound of a rep range; `rpe` null or 11 -> 7). Clamp `k` to [0.5, 1.05]; `null` when the load, reps, family or reference is missing. Signature: `learnTemplate({ programme, catalogue, referenceE1rm: { squat, bench, deadlift }, blockNumber })`.
- `cues`: the entry's `cues` plus its distinct `coachComment` texts (max 3 strings, each cut to 160 chars). `tempo`, `supersetGroup` copied.
- Days with no entries are dropped; `daysPerWeek` = remaining days.

## Generator (`src/core/generator.js`)

```
generateBlock({
  catalogue, template, athlete,            // AthleteModel
  blockNumber,                             // number of the new block
  weeks = default by focus (below; strength/volume/peak/specialise: template.weeksInBlock clamped 3..8),
  focus = 'strength',                      // 'strength' | 'volume' | 'peak' | 'deload' | 'maintenance' | 'return' | 'specialise'
  emphasis = null,                         // 'squat' | 'bench' | 'deadlift' (focus 'specialise' only; required there)
  layoffWeeks = 4,                         // integer 1..52, focus 'return' only: weeks since last proper training
  checkIn = true,                          // focus 'maintenance': last week's top sets become a heavy single at RPE 8
  daysPerWeek = default by focus (maintenance 3, else template.daysPerWeek),   // fewer than the template drops days; more is not supported
  progression = 'standard',                // 'conservative' | 'standard' | 'aggressive'
  rotate = 0.3 (maintenance 0.5),          // 0..1 share of accessory slots to swap for a same-pattern alternative
  deloadWeek = focus === 'deload' ? 'all' : (['maintenance','return'].includes(focus) ? 'none' : (weeks >= 6 ? 'last' : 'none')),   // 'none' | 'last' | 'all'
  deadliftStance = athlete.lifts.deadlift.stance,    // 'sumo' | 'conventional' | null
  seed = 'seed', now = () => new Date(), name = null
}) -> { block, rationale: [{ scope, text }], warnings: [string], volume: { perWeek: [{ week, muscles }], typical } }
```

`block` follows the Programme model (see ARCHITECTURE.md) plus: block `generated: { at, focus, weeks, daysPerWeek, progression, rotate, seed, deloadWeek, fromBlock, athleteAsOf, e1rmStart: {squat,bench,deadlift}, confidence: {squat,bench,deadlift} }`; per planned set `gen: { slotId, kind: 'top'|'backoff'|'single'|'straight'|'accessory', family, reps, rpe, e1rmRef, k, week }`. A generated set is `completed: false`, `actualRpe/actualReps/actualLoad: null`, `source: { sheet: 'generated', row: 0, col: 0 }`, `warnings: []`, load `{ value, unit: 'kg', raw: String(value) }` or `null`.

### Progression ("the wave")
Let `w` be the 1-based week, `n = weeks`, `g` = weekly e1RM drift: conservative 0.002, standard 0.004, aggressive 0.006 (focus `peak`: x1.0; `volume`: x0.75). Projected e1RM of family f in week w: `E(f, w) = e1rmStart(f) * (1 + g)^(w-1)` where `e1rmStart(f)` is `athlete.lifts[f].e1rmKg`. If it is `null`, loads for that family are `null` and a warning explains (accessories still get loads).

Bias: `eff = clamp(rpeBias[f], -0.5, 0.5)`; load RPE used for the chart is `rpeLoad = rpePlan - eff` (a negative bias means the athlete reports lower RPE than planned, so planned loads were light, so the chart RPE is raised), clamped to [6, 10].

Main-lift RPE by week (family primary exposure, see below), with `r0` = template slot rpe (null or > 9 -> 7): strength: `rpe(w) = min(r0 + 1, r0 + 0.5 * (w - 1))`, capped at 8.5; peak: the same, then the final non-deload week `+0.5` (cap 9); volume: `rpe(w) = r0` for all weeks (cap 8).
Singles scheme (`singles`) uses the template reps (1) and `rpe(w)`: weeks 1-2 -> 8, weeks 3-4 -> 8.5, weeks 5 and later -> 9; focus `peak` makes the final non-deload week 9; focus `volume` caps at 8.5.

**Primary vs secondary exposure:** for each family, among the main slots across all days, the slot with the lowest reps (ties: highest rpe, then earliest day) is `primary`; every other main slot of that family is `secondary`. Primary slots follow the wave above. Secondary slots hold: `rpe = 7` (or the template rpe when lower) every week and the load uses `E(f, 1)` (no drift), so they stay constant across the block.

**Loads.** `unrounded = E * pctSmooth(reps, rpeLoad) * k`, with `k` = the slot's template `k` (1 for a main role slot whose `k` is null). The first (top) set uses `unrounded`; each back-off set `j = 1..` uses `unrounded * (1 - 0.03 * j)`. Round every load to the nearest 2.5 kg, ties up (`roundToStep` in `core/attempts.js`). **Safety cap:** no planned load (and no revised load) goes above the load of an all-out RPE 10 set for its reps at the athlete's *current* e1RM (`e1rmStart`), whatever `k`, the projected drift or the wave say; a capped load is rounded down to the step, never up past the cap. Variation slots use their own `k`, family E and the same wave as their family's primary slot unless the family has no primary slot of its own role (then the variation's own week-by-week rule is the secondary rule).

**Set structure.** `top-backoff`: 1 top set + (sets - 1) back-off sets, same reps. `straight`: all sets at the same load, `kind: 'straight'`. `singles`: `sets` singles, first `kind: 'single'`, loads equal (no back-off). Sets/reps come from the template unchanged, except: focus `volume` adds 1 set to `straight`/`top-backoff` main and variation slots in weeks 2..n-1 (never more than 6 sets); focus `peak` removes 1 set (min 1) from variations and accessories in the final non-deload week.

**Accessories.** `scheme: 'accessory'`: sets and rep range from the template, `rpe` copied (11 stays 11), all weeks the same load. Load = `athlete.exercises[id].lastWeightKg` when present (the weight the athlete last used for it), else the template slot `loadKg`, else `null` (cue: `Find a load that reaches the target effort inside the rep range.`). Add the cue `When every set reaches the top of the rep range, go up one step next week.` to every accessory slot that has a rep range.

**Deload.** Week is a deload when `deloadWeek === 'all'`, or `'last'` and `w === n`. Focus `deload` is a deload every week, so it rejects any `deloadWeek` other than `'all'` (RangeError); the request interpreter drops a stray "no deload" / "deload at the end" from a deload request and says so in `unclear`. Deload weeks: main/variation sets = `max(1, round(sets * 0.6))`, `rpe = max(6, rpe - 1)` (singles stay singles with rpe 7), accessories `max(1, sets - 1)` sets and rpe 11 -> 9, 9 -> 8. Week label `Deload`. Deload weeks use `E(f, w-1)` for the family (no further drift).

**Dropping days (daysPerWeek < template).** Repeat until the day count matches: score each day by `3 * (main slots) + 2 * (variation slots) + (accessory slots)`; remove the lowest score (ties: highest day number). Each removed accessory slot whose `pattern` (catalogue `pattern`) is absent from the surviving days is appended to the surviving day with the fewest slots (max 7 slots per day), else discarded. Re-number the days from 1. Add a rationale line per removed day and per moved/discarded accessory. If `daysPerWeek > template.daysPerWeek`, keep the template's days and add a warning.

**Deadlift stance.** If `deadliftStance` is `sumo` or `conventional` and a deadlift-family slot's exercise is the other stance, swap it to the equivalent: `conventional_deadlift` <-> `sumo_deadlift`, `deadlift` -> stance exercise, `tempo_to_knee_deadlift` <-> `tempo_to_knee_sumo_deadlift`, `cluster_sumo_deadlift` has no conventional equivalent (leave it). Rationale line per swap.

**Accessory rotation.** Accessory slots whose exercise has a catalogue `pattern`, sorted by `hash(seed + slotId)` ascending (use the 32-bit FNV-1a hash of the UTF-8 string); the first `ceil(rotate * count)` are rotated. For each, candidates are catalogue exercises with the same `pattern`, different id, no `lift`, and not already used in the block. Prefer candidates that never appear in `athlete.exercises` (not done in the last 16 weeks), then the oldest `lastDate`, then catalogue order. No candidate -> keep the exercise (no warning). The swapped slot keeps sets/reps/rpe; load = the athlete's `lastWeightKg` for the new exercise if any, else `null`. Rationale line per swap.

**Names and labels.** Block `id = 'b' + blockNumber`, `number`, `name = name ?? 'Block ' + blockNumber + ' ' + focusTitle` (strength -> Strength, volume -> Volume, peak -> Peak, deload -> Deload), `goal` = one sentence by focus, `instructions` = `Generated by the app from your recent training. Every number is a suggestion: change anything that does not fit.`. Week `number`, `label = 'Week ' + w + ' - ' + sq + '/' + bn + '/' + dl + ' [' + total + 'kg]'` using `E(f, w)` rounded to 2.5 for each family with a known e1RM (omit the `- ...` part when none is known), `Deload` weeks `label = 'Week ' + w + ' - Deload'`. `week.target` = `{ squat, bench, deadlift, total }` from the same numbers (null when unknown), `avgCalories: null`, `avgBodyweightKg: null`, `bodyLog: []`. Entries: `{ exerciseId, name (catalogue name), rawName: name, supersetGroup, tempo, cues, sets }`.

### Volume and warnings
`volume.perWeek[i].muscles` = weekly hard sets per muscle for week i (primary 1, secondary 0.5 per set, `catalogue.weights`), over all planned sets. `volume.typical` = the same computed for the template's representative week. Warnings (strings): for each muscle where block week-2 volume differs from the template's by more than 25% and the template value is at least 4: `"<muscle> volume changes from X to Y sets per week"`; for each of chest, quads, hamstrings, glutes, lats, upper_back, triceps, biceps, lower_back with week-2 volume under 6: `"<muscle> is under 6 hard sets per week"`; a warning for each family whose e1RM is `null`; for `confidence` of `low`/`none` on a family that has loads: `"<lift> e1RM is based on little data: check these loads"`.

### Rationale
Lines in plain English, each `{ scope: 'block'|'week'|'day'|'slot', text }`: where the loads come from (`"Squat e1RM 180.0 kg: top 3 of 9 sets at RPE 6-10 in the last 8 weeks"`), the wave used, drift per week, bias adjustment when non-zero, rotations, day drops, stance swaps, deload placement.

## reviseBlock (`src/core/generator.js`)

`reviseBlock({ block, athlete, catalogue, fromWeek })` -> `{ block, changes: [{ week, day, exerciseId, setIndex, from, to }] }`. For every planned set with `gen` metadata, `completed === false`, and `gen.week >= fromWeek` whose `gen.family` has a known `athlete.lifts[family].e1rmKg`: recompute its load with the same formula, using `E(f, w) = e1rmNow * (1 + g)^(w - fromWeek)` (g from `block.generated.progression`), the athlete's current `rpeBias`, the set's own `gen.rpe`/`gen.reps`/`gen.k` and back-off position, secondary slots holding `E(f, fromWeek)`. Sets with `gen.kind` `accessory` are left alone. Returns a new block (input never mutated) and the list of loads that changed by at least 2.5 kg. `gen.e1rmRef` is updated on revised sets. The same all-out cap as in generation applies, against the new athlete's e1RM.

Applying a revision is guarded by a revision token (`generated.at` plus a `generated.rev` counter that `app.replaceBlock` bumps on every replacement). A revision made from an older token is refused, so two revisions made from the same block cannot overwrite each other.


## Focus: what each request means

`focus` is the athlete's intent. The default wave above is `strength`; the others change the template, the progression or both. Reductions are applied to the template **before** day dropping, rotation and loads.

**maintenance** - hold strength with less fatigue and less time. Defaults: 4 weeks, 3 days, `deloadWeek 'none'`, `rotate 0.5`, drift `g = 0` (no projected gain; `E(f, w) = e1rmStart(f)` for every week).
1. Main slots: for each family keep the primary slot and the first secondary slot (day order); drop other main slots.
2. Variation slots: keep one per family (the first in day order); its sets become `max(2, round(sets * 0.5))`.
3. Remaining main slots: `top-backoff`/`straight` sets become `max(2, round(sets * 0.67))` and reps `min(reps, 3)`; `singles` sets become `min(sets, 2)`.
4. Accessories: at most 3 per day (keep the first slot of each distinct `pattern` in slot order, then fill in slot order); sets become `max(1, sets - 1)`; rpe 11 becomes 9, rpe 9 becomes 8.
5. Primary slots use a flat `rpe = 7.5` every week; secondary slots hold at `rpe = 7` (and at `E(f, 1)` as in the normal secondary rule).
6. Check-in: when `checkIn` is true and `weeks >= 3`, in the final week each family's primary slot's top set becomes 1 rep at RPE 8 (`kind: 'top'`, `reps: 1`); back-off sets are unchanged.
7. Volume warnings (the "changes by more than 25%" and "under 6 sets" ones) are not produced for this focus; rationale instead states the reduction in plain English (about a third fewer main sets, accessories down by one set, intensity kept) and that the aim is to hold e1RM, with the check-in week as the test.

**return** - rebuild after a layoff of `layoffWeeks` weeks (injury, illness, holiday). Defaults: 4 weeks, `deloadWeek 'none'`. Start fraction `s = max(0.8, 1 - 0.01 * layoffWeeks)`; `E(f, w) = e1rmStart(f) * (s + (1 - s) * (w - 1) / (n - 1))` (reaches 100% in the last week; `n = 1` uses `s`), no drift term. Main-lift RPE: `rpe(w) = min(8, max(6, r0 - 1) + 0.5 * (w - 1))`. In weeks 1 and 2, main and variation sets are reduced by 1 (min 2) and accessory sets by 1 (min 1). Everything else as `strength`. Rationale states the start percentage and why.

**specialise** - bring up one lift (`emphasis`, required: `RangeError` otherwise). As `strength`, plus: the emphasised family's main and variation slots gain one set in weeks 2..n-1 (max 6, as the `volume` rule), and the other families' variation slots lose one set (min 1) in all weeks. Rationale names the lift.

**strength / volume / peak / deload**: as written above.

## Request interpreter (`src/core/request.js`)

`interpretRequest(text, { defaults = {} } = {})` -> `{ options, understood: [{ key, value, because }], unclear: [string], summary }`. Rule-based and deterministic (no network, no model): lowercase the text, match the phrases below, and report what was understood so the app can show it for confirmation. `options` only contains keys the text actually set; the caller merges them over its own defaults.

- focus: `maintenance`: maintain, maintenance, hold my strength, keep my strength, stay strong, stay where I am, low fatigue, busy, time poor, "life is crazy". `return`: back from, coming back, return, layoff, lay-off, break, time off, injured, injury, sick, illness, holiday, vacation. `peak`: peak, meet, comp, competition, taper. `deload`: deload, recover, recovery week, easy week. `volume`: volume, size, hypertrophy, muscle, bodybuilding, gain muscle. `specialise`: bring up, specialise, specialize, weak point, focus on / emphasis on + a lift. `strength`: strength, stronger, heavier, build, get strong, progress. If several match, priority: return, peak, deload, specialise, maintenance, volume, strength; the others are listed in `unclear` as `"also mentioned: <x>"`.
- `layoffWeeks`: `<n> weeks? (off|away|out|break)` or `(off|away|out) for <n> weeks?` or `<n> months? (off|away|out|break)` (x 4) -> integer, clamped 1..52 (only with focus `return`).
- `weeks`: `<n> weeks?` or `<n>-week` not already used as a layoff phrase, 1 digit or word one..eight, clamped to 3..8; when the number said is outside 3..8 add an `unclear` line such as `12 weeks is outside 3-8; using 8`.
- `daysPerWeek`: `<n> days?( a| per| each)? week`, `<n>x( a| per)? week`, `<n> training days`, `three/four days`, `3-day`, `4 day` -> n when 1..7.
- `emphasis`: squat, bench, deadlift (also `dead`, `bench press`) after bring up / focus on / emphasis on / specialise in / weak.
- `deadliftStance`: `sumo`, `conventional`, `conv`.
- `progression`: conservative/slow/cautious/gentle -> `conservative`; aggressive/fast/ambitious -> `aggressive`; "standard" or none -> unset.
- `rotate`: `keep (the )?same (exercises|accessories)`, `no (rotation|changes)` -> 0; `fresh|new|different|change(s)? (up )?(the )?(accessories|exercises)`, `mix it up`, `variety` -> 0.7.
- `deloadWeek`: `no deload` -> `'none'`; `deload (at the end|last)` or `end with a deload` -> `'last'`.
- `checkIn`: `no (check.?in|test)` -> false; `test (my )?(strength|maxes)` or `check.?in` -> true.
- `summary`: one plain sentence from `understood`, e.g. `"Maintenance block, 4 weeks, 3 days a week."`
- Empty or unrecognised text: `options: {}`, `unclear: ['I did not recognise a goal; pick one below.']`. Never throws; non-string input is treated as empty.
## Coach's review (`src/core/coach.js`)

`coachReview({ events, programme, catalogue, athlete?, bodyweight?, asOf?, unit? })` -> `{ asOf, headline, priorities, strengths, notes, findings, apply }`. Pure; `asOf` defaults to the latest event date. A finding is `{ id, area, severity: 'high'|'medium'|'low'|'good', title, because: [evidence], suggestion, action?, confidence }`. `priorities` are the top three high/medium findings; `notes` the low ones; `strengths` the good ones. `action` is something the planner can apply: `emphasis` (lift), `focus`, `progression`, `days`, `deloadWeek`, `rotate`, `addExercise` (exerciseId, sets, reps, rpe). `applyExtras(block, extras, catalogue)` adds `addExercise` actions to a generated block.

Rules (thresholds are the named constants `T` in the module):
- **Progress**: weekly best RPE-based e1RM per lift over the last 12 weeks (competition lift, else variants), least-squares slope. At least 6 weekly points spanning 8 weeks are needed. +0.3% a week or better is good; between -0.3% and +0.15% a week is a plateau (medium, action: emphasis); -0.3% a week or worse is a regression (high, action: conservative progression).
- **Balance**: bench 60-78% of squat and deadlift 108-132% of squat are normal for a raw lifter; outside that is a low-confidence note with an emphasis action. Uses the same weekly-best basis as the trends.
- **Effort**: mean of (actual RPE - target RPE) per lift over completed planned sets in the last 12 programme weeks (at least 8 sets): +0.5 or more is "costing more than planned" (conservative progression), -0.4 or less is "loads look light". A rising weekly mean (+0.15 RPE a week or more over 4+ weeks) is effort creep (action: deload block).
- **Consistency**: completed share of planned sets over the last 4 full weeks (a still-running newest week is excluded when under 80%): under 85% is a finding (high under 70%), with the most-skipped day named and a 3-day action; 93% or more is a strength.
- **Volume**: median weekly hard sets over 4 completed weeks; key muscles under 6, any muscle over 22, and calves, side delts, rear delts and abs under 4 (with an `addExercise` action).
- **Specificity**: no set at 85% of e1RM in 6 weeks (with at least 6 sets), or no 90% set for 8 weeks.
- **Weak points** (low confidence): paused bench under 90% of competition bench, tempo-to-knee deadlift under 85% of the full pull, high bar squat stronger than low bar by 5%.
- **Recovery**: deload overdue when no week with 70% or less of the median sets for 8 weeks.
- **Technique**: coach comments that repeat in three or more blocks.
- **Bodyweight**: losing more than 0.7% a week is flagged; steady is a strength.
- Fewer than 30 working sets in the window adds a "not much data" note; no history returns an empty review. The headline names the top two priorities and the first strength.
**reviseBlock semantics (clarified after review).** A `return` block keeps its own ramp: week `w` is projected as `e1rmNow x (s + (1 - s) x (w - 1) / (n - 1))` with `s` from the block's `layoffWeeks`, so revising it with unchanged numbers changes nothing. For drifting focuses the new e1RM is taken as the athlete's level at the start of `fromWeek`, so with no gain since generation projected loads can only come down; from week 1 the formulas equal generation. A secondary slot's `gen.exposure` must survive saving (it is part of the stored metadata). The app marks sets logged in the app as done before revising, and starts at the first week with no logged or completed set.

## Out of scope
UI, storage, the sanitiser, warm-up/plate logic, meet attempts, auto-adding exercises for volume gaps (warn only), mixing lb into the model (all kg).
