# Task SS-2b: host Social Studio over HTTPS so it installs on a phone (approved by the user 2026-11-23: "Yes, build it")

Owner Claude; risky (deployment) → Codex verifier run before publishing. Publishing is L4: nothing is pushed or published until the user approves the exact push in chat (`ccx gate -Action push`).

## Recommendation
Serve it from the existing free GitHub Pages site, next to the lifting tracker:
**https://madinator6.github.io/crucible/social-studio/** (HTTPS, installable on Android and iPhone, no new account, no cost).

Alternatives considered: a new repo (`madinator6.github.io/social-studio/`) is the same origin, so it has the same cache conflict below and needs a new repo (also L4); Netlify/Cloudflare Pages need a new account. Neither is simpler.

## What has to change (and why)
Both apps would share one origin (`madinator6.github.io`), so:
1. **Lifting tracker deletes every other cache.** `lifting-tracker/sw.js:22-24` deletes all caches except its own on activate, which would wipe Social Studio's offline copy on every tracker update. Change: delete only `lt-` caches. Its data (IndexedDB) is untouched either way.
2. **Lifting tracker's worker covers the subfolder.** Its scope `/crucible/` includes `/crucible/social-studio/`; before Social Studio's own worker installs, the tracker's worker would cache Social Studio files and, offline, answer with the tracker's page. Change: the tracker's fetch handler ignores `/social-studio/` paths.
3. Bump the tracker `VERSION` in `sw.js` and `APP_VERSION` in `src/ui/updates.js` (lt-v28 → lt-v29), per CLAUDE.md, so installed phones pick it up via Data → Apply update and reload.
4. **`.github/workflows/pages.yml`:** also trigger on `social-studio/**`, run `cd social-studio && node --test`, and copy only Social Studio's runtime files (`index.html styles.css manifest.webmanifest sw.js icon.svg icons src`) to `_site/social-studio/`. Tests, README, task files and the dev server are not published.
5. Social Studio needs no code change: all its paths are relative, its worker scope is its own folder, and its cache cleanup already touches only `ss-` caches.

Write allowlist: `lifting-tracker/sw.js`, `lifting-tracker/src/ui/updates.js`, `lifting-tracker/test/ui/sw.test.js`, `.github/workflows/pages.yml`, `tasks/SS-2.md`.

## Getting it onto main
Pages publishes from `main`. This branch (`ccr-758d6acf-lig1d9`) is 10+ commits ahead of `main`, including earlier skill/doc commits (blender, generate); merging it publishes only the app files above, but all those commits land on `main`. Options: merge this branch (one push), or open a PR from it and merge on GitHub.

## Checks before the push (CLAUDE.md publish rules)
- `cd lifting-tracker && node --test` and `npx.cmd playwright test` green (the tracker changed).
- `cd social-studio && node --test` green, and the Social Studio browser loop.
- Codex verifier on the diff (risky: deployment + shared origin).
- Nothing private: `git diff origin/main --stat` reviewed; no workbook, `nursing-a2/`, keys.

## After the push
- Watch the Pages run (`gh run watch`), then fetch the live `social-studio/` page, `sw.js` and manifest.
- Tracker: fetch live `sw.js` for `lt-v29` (do not trust a reload; see AGENTS.md service-worker update path).
- On your phone: open the URL in Chrome (Android) → menu → Install app / Add to Home screen; iPhone: Safari → Share → Add to Home Screen. Then add your Claude key in Setup on the phone (each device keeps its own data and key).

## Good to know
- The site is public: anyone with the link gets an empty app. Your research, posts and key stay on your phone only.
- Data does not sync between phone and PC; use Setup → Export/Import backup to move it.

## Stop conditions
Any tracker suite red; Codex verifier finds a defect it cannot be fixed within the allowlist; the gate is not approved.

## Built (SS-2b, worktree `claude/ss-2b`)
SS-2 was abandoned and replaced by SS-2b: its owned files missed `lifting-tracker/test/ui/sw.test.js`, and the base checkout gained another session's uncommitted files mid-task.
- `lifting-tracker/sw.js`: VERSION lt-v29; activate deletes only `lt-` caches; fetch ignores `/social-studio/` paths. `src/ui/updates.js` APP_VERSION lt-v29.
- `lifting-tracker/test/ui/sw.test.js`: new test pins both rules.
- `.github/workflows/pages.yml`: triggers on `social-studio/**`, runs its `node --test`, copies only its runtime files to `_site/social-studio/`.

Checks: tracker `node --test` 445 pass / 1 opt-in skip; tracker `npx.cmd playwright test` 26 passed / 1 skipped (run in the base checkout on identical files before moving them); Social Studio `node --test` 29/29; `ccx verify -TaskId SS-2b` PASS. Shared-origin rehearsal (scratchpad `rehearse.mjs`: the `_site` layout served at `/crucible/` on one origin, Pixel 5): each app controlled by its own worker, two registrations, tracker cache holds no Social Studio files, a real tracker update applied via ACTIVATE_UPDATE removed only old `lt-` caches and kept `ss-v1`, both apps open offline as themselves, manifest scope relative.
Untested → after push (Claude): live deploy run and live URLs. → user: install on the real phone.

## Codex verifier (capture codex-bb7ed79c…): VERIFIED WITH CAVEATS
One P2 finding: allowlist omitted `lifting-tracker/test/ui/sw.test.js` → fixed above. Codex re-ran tracker and Social Studio suites (PASS), executed the worker in memory (cleanup keeps other caches; Social Studio, cross-origin and non-GET requests bypass the tracker worker; offline fallback and explicit update still work), checked the deploy copy inputs. BLOCKED for Codex: Playwright (absent in the worktree). Claude's run of `npx.cmd playwright test` (26 passed, 1 skipped) used a byte-identical diff in the base checkout (`git diff | diff -q` against the saved patch).
