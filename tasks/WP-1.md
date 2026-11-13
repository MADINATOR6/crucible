# WP-1 · Agent wallpaper: live status, retry story, polish

## Mode and Owner
WP-1 · complex · risk low · Dispatch in this checkout (clean `main`, nothing else running). Codex implements with gpt-6-astra at high effort; Claude reviews the diff, checks the rendering visually and owns all Git. Personal desktop-wallpaper project for the repo's workflow (not part of `lifting-tracker/`); synthetic and non-private data only.

## Goal
`wallpaper/` holds an animated 1920x1080 SVG scene ("THREE MODELS. ONE REPO.") shown on the user's desktop through Lively Wallpaper (a WebView2 page) and rendered to a PNG with headless Edge. Make it excellent: restructure it, drive it with live ccx status, add a fail-and-retry story beat, and polish the motion. It must still look right and animate when no live data exists (demo mode).

## Relevant Files (baseline, copied from the working version)
- `wallpaper/wallpaper.html`: the scene today (inline script builds the SVG; `#still` freezes a frame for screenshots).
- `wallpaper/status-writer.ps1`: loop that writes `status.js` (`window.PALS_STATUS = {...}`) from `.git/ccx/state.json`.
- `wallpaper/pals.html`, `wallpaper/launch.ps1`: small always-on-top mascot window. Keep them working; reuse sprite code if it removes duplication.
- Facts shown in the scene come from `ccx/policy.json` (providers, class to model/effort table, permission levels) and `EXTERNAL-TOOLS.md` (tools and statuses). Read them to keep the scene truthful; do not copy text beyond short labels.

## Write Allowlist
- `wallpaper/**` only (new files allowed there: `index.html`, `scene.js`, `README.md`, `test/*.test.js`, `test/fixtures/*`, `.gitignore`).
- Nothing outside `wallpaper/`. Do not edit `ccx/`, `scripts/`, `.codex/`, `lifting-tracker/`, workflow files or `TASK.md`.

## Constraints and Resolved Decisions
1. **Structure.** Split into `wallpaper/index.html` (shell: loads `scene.js`, the status loader, the `#still` hook) and `wallpaper/scene.js` (classic script, no ES modules: Chromium blocks module scripts on `file://`). `scene.js` exposes a pure `renderScene(state, options)` returning the SVG markup string, and exports it with a `module.exports` guard so Node tests can import it. Keep `wallpaper.html` working or replace it with a thin redirect; say which in the report. No build step, no dependencies, no network, no external fonts or images.
2. **Live data.** The page loads `status.js` (try relative `status.js`, then the absolute `file:///` path of the same folder) every 5 s with a cache-busting query, using a script tag, never `fetch`/XHR. If it is missing, `live` is false, or `updated` is older than 60 s, use demo mode. Re-render the scene only when the status key changes (so SMIL animations are not restarted every poll).
3. **Status schema** (written by `status-writer.ps1`, consumed by the page). Fields: `live` (bool), `updated` (ISO UTC), `codex`, `gemini`, `claude` (each `working|idle|limit`), `stage` (`""|active|verifying`), `activeIds` (task id strings), `done`, `open`, `approvals` (numbers), optional `codexUntil` and `geminiUntil` (`HH:mm UTC`). The page maps stage to the lifecycle bar: `active` highlights DISPATCH, `verifying` highlights VERIFY, empty cycles the demo highlight; unknown values fall back to DISPATCH. Treat every field as untrusted: validate types, clamp numbers, and escape or reject text before it enters SVG (task ids match `^[A-Za-z0-9._-]{1,24}$`).
4. **Privacy.** `status-writer.ps1` exports only the fields above. It must not emit task titles, notes, approval quotes, paths or branch names. `status.js` is generated and git-ignored (`wallpaper/.gitignore`). Add `-Once` (write one snapshot and exit) and write atomically (temp file in the same folder, then move) so the page never reads a half-written file.
5. **Live visuals.** Show lane state per mascot: working (faster hop and a "..." marker), idle (normal), limit (dimmed, sleeping "z"). Add a LIVE or DEMO badge and a one-line stats strip (for example `done 18 · open 1 · approvals 0`, plus the limit-until time when present). The fallback-chain panel highlights the provider actually in use (codex unless limited, then gemini unless limited, then ollama). Keep the existing panels, their facts and the lifecycle bar.
6. **Demo story.** Lengthen the demo loop to 16 s with a fail-and-retry beat: Claude plans, Codex builds, Gemini reviews and finds a bug (a red packet returns to Codex, a "found a bug" bubble), Codex fixes, Gemini approves, hearts. Bubbles never overlap each other or text.
7. **Polish.** Eye blinks, a Gemini twinkle, slow star drift, clean glow on active items. Keep the safe areas clear: nothing important in the left 220 px (desktop icons) or the bottom 50 px (taskbar). Respect `prefers-reduced-motion` (render the still frame).
8. **Quality.** Every dynamic value that reaches markup goes through one escape helper. No `innerHTML` of untrusted strings. Keep code idiomatic and compact; no dead code. Do not run the repo's `lifting-tracker` tests here.
9. **No installs, no network, no Git.** Do not start Edge, Lively or background processes that outlive the run. Do not stage or commit.

## Out of Scope
- Anything outside `wallpaper/`; the lifting tracker; changing Lively's own settings; startup tasks or autostart; committing.

## Done When
1. (Codex) `wallpaper/index.html` + `wallpaper/scene.js` implement items 1 to 7; `status-writer.ps1` implements item 4 (`-Once`, atomic write, privacy fields only).
2. (Codex) `node --test wallpaper/test/` is not used (Node 24 rejects a directory); use `node --test "wallpaper/test/*.test.js"`. Tests cover: demo render contains the three names and the lifecycle steps; each lane state (`working|idle|limit`) changes the markup; hostile status values (script tags, quotes, huge numbers, wrong types) are escaped or rejected; stale or missing status falls back to demo; stage mapping including the unknown fallback.
3. (Codex) `powershell -NoProfile -ExecutionPolicy Bypass -File wallpaper\status-writer.ps1 -Once` writes `wallpaper/status.js` that parses as the schema and contains none of: `title`, `quote`, a drive path, or `claude/` branch text. Cite the command and the parsed output (counts only).
4. (Codex) A short `wallpaper/README.md`: what it is, how to add it to Lively, how to run and stop the helper, and the privacy statement. Under 40 lines.
5. (Claude) Render `index.html#still` with headless Edge for demo and for a synthetic live fixture, and check the layout, overlaps and safe areas.
6. (Claude) `ccx verify -TaskId WP-1`, a cross-model review, and the user's decision on committing `wallpaper/`.

## Verify
```powershell
node --test "wallpaper/test/*.test.js"
powershell -NoProfile -ExecutionPolicy Bypass -File wallpaper\status-writer.ps1 -Once
node -e "require('./wallpaper/scene.js').renderScene({live:false},{})" 
```

## Stop Conditions
- A check still fails after one focused repair: stop and report with the failing output.
- Needing a path outside `wallpaper/`, a dependency, or a Git action: stop that part and report UNKNOWN / CHECKED / NEEDED.
- Report by 60 minutes after start.
