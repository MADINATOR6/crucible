# Lifting Tracker: UI upgrade (neat, organised, convenient, plus a 3D muscle map)

Paste this into a Claude Code session started in `C:\Users\Madison\code\claude-codex-collab`.

---

Upgrade `lifting-tracker/` so it looks neat and organised and is quicker to use, then add an interactive 3D muscle heat map. Split the work about 50/50 between you (Claude) and Codex: each side owns its own files, and you never both work on the same problem. Follow AGENTS.md, CLAUDE.md and HANDOFF.md (Dispatch mode). Register every non-trivial piece with `ccx task add` and finish each one through `verify`, a cross-review by the other model, and `task done`.

## Fixed rules
- Keep everything the app promises today: works offline, no accounts, no server, no analytics, no third-party scripts at runtime, system fonts only, data stays on the device. Nothing in the README's Maths, rules or Privacy sections changes.
- The athlete's workbook and anything derived from it never goes to Codex or to any outside tool. Tests use synthetic data only.
- `cd lifting-tracker && node --test` must pass after every task (250 passing and 1 opt-in skip at last check; the count may only go up).
- The 2D heat map stays: it's the default on phones without WebGL and the accessible version (numbers on every region).
- Breaking the no-dependencies rule is allowed for exactly one thing: three.js (a pinned version, stored inside `lifting-tracker/vendor/`, cached by the service worker, never loaded from a CDN). Record the reason in ARCHITECTURE.md.
- Test at 375×812 (phone) and on desktop, in dark and light themes, using the built-in browser and `node lifting-tracker/dev-server.mjs`.

## What the analysis found (the before state)
- **Train:** block, week and day each get their own row of buttons, plus three small stat boxes, so the first exercise is cut off on the first phone screen. Set rows wrap onto two lines ("5 reps / @ 7", "147.5 / kg"). Logging a set always means tapping Log and filling in a form, even when you did exactly what was planned.
- **Muscles:** three rows of switches sit above the map. The number labels on the body are tiny, the figure is small with a lot of empty space, and the colour key is below the fold.
- **Progress:** settings ("With variants", "5/8/12 reps") come before the numbers. Chart axis labels are too small to read on a phone. Personal record rows wrap onto two or three lines.
- **Plates:** the neatest screen; small touches only.
- **Everywhere:** spacing and text sizes vary between screens; too many all-caps labels; section headers aren't consistent. `styles/app.css` line 1 has a garbled character (`â€”`, should be `—`): check other files for the same encoding damage and fix it with the file-editing tools, not PowerShell (see AGENTS.md, Windows).

## Who owns what

| Phase | Claude (about 50%) | Codex (about 50%) |
| --- | --- | --- |
| 0. Foundation | `styles/app.css` design tokens (spacing scale, type scale, radii, one section-header pattern, fewer all-caps labels) plus a short **class contract** in `lifting-tracker/UI-CLASSES.md` listing the classes views may use. Commit this before any Codex dispatch. | None; it waits for the contract. |
| 1. Train | `src/ui/views/train.js` and its CSS: opens on today's session (next unfinished day); one header "Block 1 · Week 3 · Day 2 ▾" that opens a picker sheet; session progress bar ("4 of 12 sets"); one-line set rows `1  5 × 147.5 kg @7  ✓`; tapping ✓ logs the set as planned, tapping the row opens the existing edit sheet; the rest timer starts after each logged set. | **LT-UI-1** in `src/ui/state.js` and `src/core/` (plus tests): a `nextSession(programme, log)` selector that returns the next unfinished day, and a `logAsPlanned(setRef)` action that writes the planned weight, reps and RPE as the actual (same validation, PR detection and undo as the normal log path). Write allowlist: `src/ui/state.js`, the new core file, `test/ui/state.test.js`, the new test file. |
| 2. Muscles and Progress | CSS for both screens and the review of Codex's markup against the class contract. | **LT-UI-2** in `src/ui/views/muscles.js`, `src/ui/views/progress.js`, `src/ui/charts.js`, `src/ui/heatmap.js` (plus tests): one compact filter row on Muscles; a bigger figure; number labels at least 11 px; the colour key next to the map; Progress leads with the three best estimated maxes and the chart, with settings folded away under "Options"; chart axis labels at least 11 px on a phone; one-line personal record rows. Codex uses only classes in `UI-CLASSES.md`. If it needs a new class, it says so in its report and Claude adds the CSS. |
| 3. 3D muscle map | Use the Blender MCP to build a low-poly body where each muscle is its own mesh, named to match `data/exercises.json`. Export one Draco-compressed `.glb` under 2 MB to `lifting-tracker/assets/body.glb`. Build it yourself (not Z-Anatomy, which is too heavy and CC BY-SA). Also write the CSS for the 3D view and the final acceptance pass on a phone. | **LT-UI-3**: `src/ui/heatmap3d.js` loads `assets/body.glb` with the vendored three.js; colours each mesh from the same hard-set bands as the 2D map; drag to rotate, pinch to zoom, tap a muscle to open the existing "contributing exercises" panel; a 2D/3D switch on Muscles that falls back to 2D without WebGL or with reduced motion; adds `vendor/` and `assets/` to `sw.js` so they're cached; tests for the band mapping, the name-matching (a mesh name missing from `exercises.json` is reported, not silently dropped) and the fallback. Codex has no Blender access, so it works from the exported `.glb`. Until Claude's model exists it uses a placeholder `.glb` with two named meshes. |
| Cross-review | Reviews LT-UI-1, LT-UI-2 and LT-UI-3 diffs (`ccx task review`). | Reviews Claude's phase 0, 1 and 3 work read-only as a verifier (HANDOFF.md, Verifier instruction). |

Order: phase 0 first. Then Claude's phase 1 runs at the same time as LT-UI-1 (separate files), and Claude wires train.js to `nextSession` and `logAsPlanned` once LT-UI-1 is accepted. Phase 2 and phase 3 follow the same pattern. Show the user before-and-after phone screenshots at the end of each phase and wait for a go-ahead before the next one.

## External tools (use only where they help; each is optional)
- **Higgsfield or Generate (paid):** an app icon (for `manifest.webmanifest` and `icons/`), a splash or empty-state illustration, and optional texture or concept art for the 3D body. Use `/generate` for cheap images and Higgsfield only for what Generate can't do. Quote first (`--dry-run`, or `get_cost: true`), get the user's approval of the amount in chat, and record it with `ccx gate -Action paid-action`. Prompts contain no private data. Files go to `media-out/` (gitignored); copy only the final chosen assets into `lifting-tracker/icons/` or `assets/`, resized and compressed, and keep total app size small. No AI-generated exercise demo videos: generated lifts often have bad form.
- **Blender MCP (Claude only):** the 3D body model in phase 3. Codex's equivalent is working from the exported `.glb` file.
- **claw:** an optional read-only second opinion on the phase 1 Train redesign (usability, tap targets, accessibility), run after Claude's own review. It gives evidence, not acceptance.
- **gjc:** optional, only if LT-UI-3's three.js loading needs a throwaway spike. Use a task-owned isolated worktree and an exact file allowlist (HANDOFF.md, Optional external-tool trial). Never in the base checkout.
- **design-expert agent:** Claude's UI/UX review of each phase's screens before showing them to the user.
- Not used: claude-red (no security work here), nursing-notes, video-vision.

## Done when
- [ ] On a 375×812 phone screen, Train shows today's session and the first exercise's sets without scrolling past navigation.
- [ ] A planned set logs with one tap, PRs are still detected, and undo works.
- [ ] Set rows and personal record rows fit on one line at 375 px for typical names and loads.
- [ ] Muscles and Progress show their content before their settings; all chart and map labels are at least 11 px.
- [ ] The 3D map rotates, zooms and opens the contributing-exercises panel on tap. It falls back to 2D without WebGL. It works offline after the first load, and `body.glb` is under 2 MB.
- [ ] Spacing, text sizes and section headers are consistent across all five screens in both themes; no garbled characters remain.
- [ ] `node --test` passes; README, ARCHITECTURE.md (three.js reason, 3D asset) and `UI-CLASSES.md` are updated.
- [ ] Each task went through verify, cross-review and `task done`; Claude made the commits (no trailers), then synced the mirror.

## Stop and ask the user if
- A design choice would remove an existing feature or change any calculation.
- A paid generation would cost more than the approved amount.
- Codex fails a task twice (then Claude finishes it, per policy) or the 50/50 split stops making sense.
