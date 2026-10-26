# Lifting Tracker

A personal powerlifting tracker that follows your coach's programme. It works offline, runs on a phone and a PC, and keeps every byte of your data on your device: no accounts, no server, no analytics, nothing loaded from other sites, system fonts only.

## What it does

- **Train.** The next unfinished set is shown first with large weight, reps and target RPE, plus a Log set button above the mobile navigation. Logging advances the focus and starts the rest timer. Expand Full workout to see every exercise, edit a set or open warm-ups. **+ Log** records anything outside the programme.
- **Coach.** A primary tab for the training review and block builder: describe a request, review an unsaved draft, then add it to the programme. Editable choice chips and a comparison with the learned template show exactly what will change.
- **Muscles.** A front/back body map coloured by weekly hard sets per muscle, with the number on every region (colour is only a guide). Tap a region to see which exercises contributed. Programme week or calendar week, done or planned. **3D** shows the same colours on a body you can turn and zoom; tap a muscle for its number and exercises. It falls back to the flat map where 3D isn't available.
- **Share images.** Plates, Muscles and each Progress lift chart have a Share image button for an Instagram story: the loaded bar with its total, the front and back heat map with its week and colour key (1080 × 1920), or a lift's estimated max, kg per week and chart. Each carries the app's mark; the background is transparent (to sit on a photo), dark or light, picked beside the button. Android opens the share sheet; elsewhere the file downloads.
- **Weekly summary.** Optional notification (Data screen) with the last 7 days' sessions and sets and each lift's estimated max and trend. Android Chrome with the app installed; the app keeps the text on the device and Android shows it about once a week.
- **Progress.** One chart per lift: each session's estimated max (from the RPE chart when the set has an RPE, Epley otherwise), light days faded and left out of the trend, an outlier-resistant trend with kg per week, block bands, PR stars, and a meet-day projection with its likely range when the data supports one. Tap or drag a chart to read any point. Also: current form with the change on 4 weeks ago, total with IPF GL points, weekly sets and intensity, "same weight, lower RPE" signals, PR feed, planned vs actual RPE, per-block bests and bodyweight with a 7-day average. The meet date and IPF GL category are set in the Progress options.
- **Plates.** An interactive barbell: tap or drag plates on, type a target, or build a warm-up ladder. The side view shows one end of a power bar to scale (real plate diameters and thicknesses, printed weights, collar); **3D** shows the whole loaded bar to turn and zoom. kg and lb never mix silently. Includes a meet attempt planner (a suggestion, not advice).
- **Data and settings.** The persistent gear button opens workbook import, units/theme, JSON backup/restore and CSV export.

The first time you open it, it shows clearly labelled **example data** so you can explore. Import your workbook in **Data** to replace it.

## Run it

Requires Node 18 or later (checked here on Node 24). No install step: the one library, three.js for the 3D map, is already stored in `vendor/three/`.

```bash
node lifting-tracker/dev-server.mjs
```

Open `http://127.0.0.1:5173/`. Tests (from the `lifting-tracker` folder):

```bash
cd lifting-tracker && node --test
```

## Coach: the block generator and training review

Open **Coach** from the main navigation. It does three things.

1. **Coach's review.** It reads your history and says what is working and what to improve, in order of priority, with the numbers behind each point: stalled or falling lifts (weekly best e1RM trend), a lift lagging the other two (strength ratios), effort running above or below the plan (your RPE against the coach's), effort creeping up week on week, missed sessions and which day gets skipped, muscles with very little or very high volume, no heavy work lately, possible weak spots from variation numbers (paused bench, tempo deadlifts, high bar vs low bar), cues your coach keeps repeating, bodyweight trend, and deload timing. Most points come with a button that builds the fix into the next block. It is a set of rules from common powerlifting practice, not a diagnosis, and every point shows its confidence.
2. **Describe.** Type a request (for example, "top single block, 4 days a week, 6 weeks" or "top triple and 3 back-offs at 90%, cap RPE at 8.5") or tap a goal, then **Build draft**. Choice chips show what was understood; tap one to edit its setting. Advanced settings and e1RM overrides stay folded until needed. Unsupported or conflicting wording stays visible for review.
3. **Review and add.** The draft compares days, weekly sets, main-lift style and maximum main-lift/variation RPE with the learned template. Loads use your history, rounded to 2.5 kg; weekly progression, deloads, accessory rotation, volume maps and explanations remain available. Building or applying a coach suggestion never saves a block. **Add to programme** is the separate save step; changing settings or source data requires rebuilding the draft. **Re-load remaining weeks** recalculates unfinished weeks later from your latest numbers.

What each goal does: *maintenance* keeps intensity but cuts main-lift sets by about a third and accessories by one set, holds loads flat and ends with a heavy single check-in; *return* starts at about 94% (more for longer breaks, down to 80%) and climbs to 100%; *specialise* adds a set to one lift's work and trims the others' variations; *volume* adds sets; *peak* sharpens towards singles; *deload* is an easy block. Details: `GENERATOR.md`.

## Calibrated plates

The Plates screen has a **Calibration** card. In Calibrated mode (kg) it shows how far the plates you loaded can be from the number on them, using the IPF disc table (25 kg may weigh 24.9375 to 25.0625 kg, and so on), so a loaded bar reads as a band such as 99.75 to 100.25 kg of plates. Gym plates carry no guarantee, and lb plates have no federation table. Under **My plates** you can enter what each plate size actually weighed on a scale; the card then shows your real total.
## Put it on your phone

The app is plain static files with nothing private in them, so it is safe to host anywhere that serves HTTPS (GitHub Pages, Netlify, Cloudflare Pages, your own server). Your training data never goes there: it lives in your browser's storage on each device.

**Live copy: https://madinator6.github.io/crucible/** — `.github/workflows/pages.yml` runs the tests and publishes only the app's runtime files there on every push to `main` that changes `lifting-tracker/`.

1. Host the `lifting-tracker` folder as a static site over HTTPS.
2. Open the site on your phone. iPhone: Share → Add to Home Screen. Android: menu → Install app.
3. Open it once while online so it can cache itself; after that it works offline.
4. Import your workbook on the phone, or restore a JSON backup exported from your PC. The two devices do not sync; use backups to move data.

**Quick try on the same Wi-Fi (no hosting).** On the PC run `$env:HOST='0.0.0.0'; node lifting-tracker/dev-server.mjs` (allow Node through the firewall on Private networks if Windows asks), then open `http://<the PC's Wi-Fi address>:5173/` on the phone (find it with `ipconfig`). Plain http on a LAN address has no service worker, so there is no offline use or home-screen install; data still saves in the phone's browser. Close the server when you are done; it serves only this folder and never `private/`.

Browsers can clear site data. Export a backup now and then (Data → Export backup).

## Importing the coach's workbook

Data → **Choose .xlsx**. The file is read in the browser and never uploaded. The importer:

- finds Week and Day headers by searching (layouts differ between blocks);
- turns Excel's date-mangled rep ranges back into ranges (a cell showing 6 Oct was typed `6-10`);
- ignores `-` and `.` placeholders, keeps tempo and coaching cues, and warns (never silently fixes) about RPE above 10, loads with units like `235 pounds`, and anything it does not understand;
- does not import the athlete name or phone number, and redacts long digit runs in free text.

The import report in Data lists counts, warnings by type and every cell it could not place. Importing again replaces the programme; your logged sets stay.

**Dates.** The workbook has no dates. Charts place sets using a start date you set in Data (default: the START row of the overview sheet) and assume blocks follow each other week by week. Treat those dates as estimates.

Newly logged sets use the **Actual session date**, initially today. Choose a different date explicitly to backfill a workout. Editing keeps the saved date. Save, edit and remove offer Undo for the latest set change; a later data change makes an older Undo unavailable. Swipe the Undo message or rest timer left or right to dismiss it, or use its close button. Dismissing Undo keeps the saved set; dismissing the timer stops it. Saves retain your expanded workout/settings sections and position.

Unsaved set inputs and Coach requests/settings are kept on this device. After reopening, choose Resume for a set, or build a fresh Coach draft from the recovered inputs. Nothing is logged or added automatically. Cancel/Discard clears the applicable inputs; replacing data clears both drafts. Drafts are excluded from JSON backups. If storage is unavailable, recovery is only temporary and the app warns you.

Workbook import and JSON restore show a preview with counts and replacement details before Apply. You can back up first or cancel. A preview becomes stale if training data changes; choose the file again.

Data shows the loaded app version and update status. A ready update can wait until after your workout; **Apply update** reloads the app only when you choose it. Open online once to install the offline files.

### Samsung workout check

After this change is published, open the installed app online and check its version in Data. When upgrading from version 13, fully close the installed app and every browser tab for this site, then reopen it so version 14 can activate. Back up your data before testing. Check these on your phone:

1. Open a workout and confirm the actual date is today; choose a past date and check the Backdated label.
2. Open a set with the keyboard visible. Enter invalid reps, try Save, and confirm the error focuses Reps without losing your weight.
3. Correct and save, tap Undo, then save again. Check the next set, timer, and form controls remain reachable.
4. Leave an unsaved set, close/reopen the app, then Resume or Discard. Try the same with a Coach request; it must not add a block by itself.
5. Turn on airplane mode and reopen. Confirm the workout and saved data still load. Reconnect, preview a backup, then Cancel and confirm your records are unchanged.
6. If Data offers an update, leave it waiting during a set; apply it after the workout and confirm the data remains.

Browser checks do not verify the Samsung keyboard, home-screen lifecycle, vibration or screen wake lock. Those need this physical-device pass.

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
src/ui/      views, heat map (2D and 3D), barbell, charts, state
data/        exercises.json (editable), plates.json (editable)
assets/      body.glb (3D body), the 2D shading images, and the Blender scripts that make them
vendor/      three.js 0.170.0 (pinned; see vendor/three/VERSION.txt)
test/        node:test suites
```

See `ARCHITECTURE.md` for the data model and the verified facts about the workbook layout.
