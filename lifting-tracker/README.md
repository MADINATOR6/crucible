# Lifting Tracker

A personal powerlifting tracker that follows your coach's programme. It works offline, runs on a phone and a PC, and keeps every byte of your data on your device: no accounts, no server, no analytics, no third-party scripts, system fonts only.

## What it does

- **Train.** Your coach's blocks as Block → Week → Day → Exercise → Set, with the plan (reps or rep range, target RPE, load) next to what you actually did. Tap a set to log weight, reps and RPE, see the bar loaded, and get a PR callout. **+ Quick log** records anything outside the programme.
- **Muscles.** A front/back body map coloured by weekly hard sets per muscle, with the number on every region (colour is only a guide). Tap a region to see which exercises contributed. Programme week or calendar week, done or planned.
- **Progress.** Estimated 1RM per lift, total over time, PR feed, bodyweight with a moving average, and planned vs actual RPE.
- **Plates.** An interactive barbell: tap or drag plates on, type a target, or build a warm-up ladder. kg and lb never mix silently. Includes a meet attempt planner (a suggestion, not advice).
- **Data.** Import the coach's workbook, switch units and theme, export or restore a JSON backup, export sets as CSV.

The first time you open it, it shows clearly labelled **example data** so you can explore. Import your workbook in **Data** to replace it.

## Run it

Requires Node 18 or later (checked here on Node 24). No install step: there are no dependencies.

```bash
node lifting-tracker/dev-server.mjs
```

Open `http://127.0.0.1:5173/`. Tests (from the `lifting-tracker` folder):

```bash
cd lifting-tracker && node --test
```

## Plan: the block generator and the coach's review

Open **Plan** from Train ("Plan next block") or Progress. It does three things.

1. **Coach's review.** It reads your history and says what is working and what to improve, in order of priority, with the numbers behind each point: stalled or falling lifts (weekly best e1RM trend), a lift lagging the other two (strength ratios), effort running above or below the plan (your RPE against the coach's), effort creeping up week on week, missed sessions and which day gets skipped, muscles with very little or very high volume, no heavy work lately, possible weak spots from variation numbers (paused bench, tempo deadlifts, high bar vs low bar), cues your coach keeps repeating, bodyweight trend, and deload timing. Most points come with a button that builds the fix into the next block. It is a set of rules from common powerlifting practice, not a diagnosis, and every point shows its confidence.
2. **Tell it what you need.** Type it ("maintenance block, 3 days a week for 4 weeks", "back from the flu, off for 3 weeks", "bring up my bench") or tap a goal: **Maintain**, **Build strength**, **Build size**, **Back from a break**, **Peak for a meet**, **Bring up a lift**, **Deload**. It shows what it understood and fills in the settings, which you can change.
3. **Generate.** It learns the shape of your last block (days, main-lift scheme, accessories, set and rep style) and your current e1RMs from RPE-rated sets with the RPE chart, then builds a new block: loads rounded to 2.5 kg, a weekly wave, deload and check-in weeks where they make sense, accessories rotated within the same movement pattern, and a volume heat map with arrows against your last block. It explains every choice and warns where its numbers are shaky. Type your own e1RM for any lift if you disagree with the estimate. **Add to my programme** puts it in Train, ready to log; **Re-load remaining weeks** recalculates unfinished weeks later from your latest numbers.

What each goal does: *maintenance* keeps intensity but cuts main-lift sets by about a third and accessories by one set, holds loads flat and ends with a heavy single check-in; *return* starts at about 94% (more for longer breaks, down to 80%) and climbs to 100%; *specialise* adds a set to one lift's work and trims the others' variations; *volume* adds sets; *peak* sharpens towards singles; *deload* is an easy block. Details: `GENERATOR.md`.

## Calibrated plates

The Plates screen has a **Calibration** card. In Calibrated mode (kg) it shows how far the plates you loaded can be from the number on them, using the IPF disc table (25 kg may weigh 24.9375 to 25.0625 kg, and so on), so a loaded bar reads as a band such as 99.75 to 100.25 kg of plates. Gym plates carry no guarantee, and lb plates have no federation table. Under **My plates** you can enter what each plate size actually weighed on a scale; the card then shows your real total.
## Put it on your phone

The app is plain static files with nothing private in them, so it is safe to host anywhere that serves HTTPS (GitHub Pages, Netlify, Cloudflare Pages, your own server). Your training data never goes there: it lives in your browser's storage on each device.

1. Host the `lifting-tracker` folder as a static site over HTTPS.
2. Open the site on your phone. iPhone: Share → Add to Home Screen. Android: menu → Install app.
3. Open it once while online so it can cache itself; after that it works offline.
4. Import your workbook on the phone, or restore a JSON backup exported from your PC. The two devices do not sync; use backups to move data.

Browsers can clear site data. Export a backup now and then (Data → Export backup).

## Importing the coach's workbook

Data → **Choose .xlsx**. The file is read in the browser and never uploaded. The importer:

- finds Week and Day headers by searching (layouts differ between blocks);
- turns Excel's date-mangled rep ranges back into ranges (a cell showing 6 Oct was typed `6-10`);
- ignores `-` and `.` placeholders, keeps tempo and coaching cues, and warns (never silently fixes) about RPE above 10, loads with units like `235 pounds`, and anything it does not understand;
- does not import the athlete name or phone number, and redacts long digit runs in free text.

The import report in Data lists counts, warnings by type and every cell it could not place. Importing again replaces the programme; your logged sets stay.

**Dates.** The workbook has no dates. Charts place sets using a start date you set in Data (default: the START row of the overview sheet) and assume blocks follow each other week by week. Treat those dates as estimates.

## Maths and rules (so you can check them)

- Weights are stored as entered with their unit; all maths is in kg with `1 lb = 0.45359237 kg`.
- Estimated 1RM = Epley `weight × (1 + reps ÷ 30)`; 1 rep returns the weight; above 12 reps there is no estimate. It is an approximation.
- PRs: the first working set is a baseline and never a PR; a PR must strictly beat every earlier working set; ties are not PRs. Types: best e1RM, heaviest single, most reps at an exact weight. Warm-ups never count.
- Weeks run Monday to Sunday.
- Hard sets per muscle: a primary mover counts 1 per set, a secondary mover 0.5. These weights are estimates, not research. Edit them in `data/exercises.json` (the same file defines exercise names, aliases and coaching-cue patterns for the importer).
- Plate colours: 25, 20 and 15 kg follow the IPF Technical Rulebook (red, blue, yellow); 10 kg and under may be any colour, so those are convention and editable in `data/plates.json`. Competition collars are 2.5 kg each (the rulebook gives bar plus collars as 25 kg for the 20 kg bar). Check the rules of the federation you compete in.
- Competition scores (Wilks, DOTS, IPF GL) are not included until their coefficients are verified from an official source.

## Privacy

`.gitignore` blocks `*.xlsx` and `lifting-tracker/private/` so a workbook can't be committed by accident. Tests use synthetic data only. The service worker handles same-origin requests only.

## Layout

```
index.html  manifest.webmanifest  sw.js  styles/app.css  icons/
src/core/    pure logic (units, e1RM, PRs, weeks, muscles, schedule, lifts, RPE chart and deltas, attempts, athlete model, template, generator, request parser, coach)
src/plates/  plate loading and warm-up ladders
src/import/  workbook reader (zip + XML, no dependencies) and programme importer
src/store/   IndexedDB storage, JSON backup/restore, CSV
src/ui/      views, heat map, barbell, charts, state
data/        exercises.json (editable), plates.json (editable)
test/        node:test suites
```

See `ARCHITECTURE.md` for the data model and the verified facts about the workbook layout.
