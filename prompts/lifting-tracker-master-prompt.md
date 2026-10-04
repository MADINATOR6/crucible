# Lifting Tracker Master Prompt

Paste everything below the line into Claude Code, started in `C:\Users\Madison\code\claude-codex-collab` (PowerShell, normal non-admin terminal).

This is a build brief for a personal powerlifting and strength training tracker. It replaces the retired `claude-codex-template` powerlifting repo, which must not be read or reused. Start from the requirements below, not from old code.

---

You are building a lifting tracker for me, a single user who trains on a phone in the gym and reviews on a laptop. Work in phases. Do not skip ahead. Follow this repo's AGENTS.md and HANDOFF.md throughout.

## Product goal
Log a workout in under 20 seconds per set with one hand, with no signal, then show me whether I am actually getting stronger. Every feature must serve one of those two things. If it does neither, leave it out.

## Hard rules
- Smallest correct change at every step. No speculative features, no unrelated refactors.
- Never invent a command, path, API or formula constant. AGENTS.md Commands and Stack stay "Not set" until a command has run successfully in this repo; then record it with the verified output.
- Label every claim FACT (you ran or measured it), ESTIMATE or UNKNOWN. For UNKNOWN give: what is uncertain, what you checked, what would resolve it.
- Do not read the retired `claude-codex-template` folder. Do not read `.env`, `*.pem`, `*.key`, or any path in `privacy.excludePaths`.
- No secrets, personal data, real training logs or bodyweight history in the repo, task specs, tests or telemetry. Use synthetic fixtures only. Anything committed reaches the OneDrive mirror.
- In PowerShell use `npm.cmd`, `npx.cmd`, `codex.cmd`. Edit text files with the file-editing tools, not `Get-Content`/`Set-Content` round-trips (BOM and encoding corruption).
- Adding a dependency needs a one-line justification (compatible, maintained, established) recorded in the task spec. Prefer the platform and the standard library.
- No push, PR, publish or hosting without `ccx gate` and my approval. Local commits are fine.

## Product requirements

### Must have (v1)
1. **Fast logging.** Start a session, add an exercise, log sets as weight × reps (+ optional RPE). Pre-fill from my last session of that exercise. One tap to repeat the previous set. Large touch targets, usable with gym chalk on my hands, readable in bright light.
2. **Offline first.** Everything works with no network. Data lives on the device. No account, no backend, no analytics, no third-party scripts at runtime.
3. **Units.** kg and lb, switchable per user setting. Store one canonical unit (kg) internally and convert only at the display edge. Round-trip conversions must not drift.
4. **Estimated 1RM.** Compute from any set with 1 to 10 reps, using Epley and Brzycki. Show which formula is used. Do not show an e1RM for sets over 10 reps, or for RPE-less AMRAPs presented as true maxes.
5. **PR detection.** Rep-max PRs (best weight at 1, 2, 3 … 10 reps) and e1RM PRs, per exercise. A PR is flagged the moment the set is logged, and never flagged twice for the same set. Define ties explicitly (a tie is not a PR).
6. **Plate calculator.** Given a target weight, bar weight and the plates I own, show the plates per side. Handle impossible targets by showing the nearest loadable weight, never silently rounding.
7. **Warm-up generator.** From a working weight, produce a warm-up ladder using my bar and plates. Editable defaults.
8. **Core lifts as first-class.** Squat, bench, deadlift, with competition-style variants (paused, tempo, close-grip, deficit) tracked as variants of their parent lift so progress rolls up correctly.
9. **History and progress.** Per-exercise history, and a trend of e1RM and volume over time. Weekly volume per lift. Read from the data, no stored derived numbers that can go stale.
10. **Bodyweight log** with a smoothed trend line (moving average), not just raw points.
11. **Export and import.** Full-fidelity JSON export and import (round-trips with no loss), plus CSV of sets. Export is the backup story, so it must be one tap and must work offline. Import validates and rejects bad files with a clear message and without partial writes.

### Should have (v1.x, only after v1 is accepted)
- Program templates: percentage-of-1RM blocks, linear progression, 5/3/1 style waves, with auto-calculated working weights from a training max.
- Competition planner: opener, second and third attempt selection from a projected max, with a rule such as "opener ≈ 90–92% of projected best, never above a confirmed rep PR", clearly labelled as a suggestion.
- Strength scores: IPF GL Points and DOTS from bodyweight, sex category and total. Constants must come from the published formula and be validated against worked examples. If no worked example can be verified, mark UNKNOWN and do not ship the feature.
- RPE/RIR to estimated %1RM table, user-editable.
- Rest timer that survives screen lock.
- Weight-class tracking against federation limits (state which federation and date the table is from).
- Optional encrypted cloud sync. Out of scope for v1. Do not design v1 to depend on it, but do not paint it into a corner: give every record a stable id, `createdAt`, `updatedAt` and a schema version.

### Explicitly out of scope
Social features, leaderboards, coaching marketplace, nutrition tracking, wearable integration, AI-generated programs, ads, payments.

## Engineering requirements
- **Domain logic is pure and separate from UI.** One module for calculations (e1RM, plate maths, unit conversion, PR rules, warm-ups, scores), no UI or storage imports. This is the part Codex implements and tests.
- **Calculation tests are the contract.** Table-driven tests with hand-checked values, including boundaries: 1 rep (e1RM equals the weight), 10 reps, 0 and negative inputs rejected, lb↔kg round-trip, plate edge cases (bar only, odd remainders, unavailable plates), PR ties and ordering of sets logged out of order, editing or deleting a past set recalculating PRs correctly.
- **Data model is versioned.** Record shapes carry a `schemaVersion`; write a migration path before the first schema change, not after. Prefer an append-friendly structure (a set is an immutable-ish record; edits update `updatedAt`).
- **Storage is durable and checked.** Handle storage being unavailable, full or cleared. Never lose a session in progress: persist each set as it is logged, not at "finish workout". Ask the browser for persistent storage if the platform supports it, and tell me when it is not granted.
- **Accessibility and ergonomics.** Works one-handed at phone width, respects system dark mode, text scales, touch targets at least 44 px, no colour-only meaning, no hover-only controls.
- **Performance.** Opens to the "log set" screen in under 2 seconds on a mid-range phone (ESTIMATE until measured). A year of daily training (about 20,000 sets) must not make history or charts noticeably slower; measure it with synthetic data.
- **No dead ends.** Every destructive action (delete a set, a session, all data) is undoable or confirmed, and "delete all data" is reachable but deliberate.

## Phase 0: Inspect and decide (read-only, no code)
1. Run `git status`, read recent `git log`, read AGENTS.md, HANDOFF.md, `ccx/policy.json` routing, and the existing task specs in `tasks/` for format. Read nothing else unless needed.
2. Check what tooling actually exists on this machine (Node, a package manager, a browser to test with) by running version commands. Report FACT only.
3. Propose the stack. My strong default is a **local-first installable web app (PWA)** that stays dependency-light, with data in IndexedDB, hosted as static files, because it works on both phone and laptop with one codebase and no server. Challenge that if the evidence says otherwise. Give: the recommendation, the one realistic alternative, the trade-off in two lines each, and what would change your mind.
4. Propose the repo layout (where the app lives; the calculation module path), keeping workflow files untouched.
5. List the top 5 risks (for example: browser storage eviction on iOS, floating-point rounding in plate maths, PR logic on edited history, formula constants copied wrongly, import corrupting data).

**STOP after Phase 0 and wait for me to approve the stack and layout.** If I am away, do the non-blocking work in Phase 1 only (writing the written spec and test cases, not implementation) and wait.

## Phase 1: Spec and test contract (Claude, no implementation)
1. Write `docs/lifting-tracker-spec.md` (or the layout I approved): data model, screens and the log-a-set flow, the exact PR rules, the e1RM rules, unit and rounding rules, and the export format with a sample.
2. Write the calculation test cases as a table of inputs and hand-checked expected outputs, before any implementation exists. Show your working for each expected value so I can check it. Mark any value you could not verify as UNKNOWN.
3. Register work with `ccx task add` for each task below, with type, class, risk, owner and the write allowlist. Calculations, storage and import/export are **risky** (data integrity); UI screens are normal.

## Phase 2: Build, in order, one task at a time
Each item is its own task spec in `tasks/`, with goal, write allowlist, Done When, stop conditions, and the line `Do not use computer-use, browser or chrome tools. Only write files inside this repo.` under Constraints.

1. **Calculations module + tests** (Codex, risky: Codex verifier tries to break it).
2. **Storage layer + schema versioning + migration scaffold + tests** (Codex, risky).
3. **Export/import with validation, round-trip tests and corrupted-file tests** (Codex, risky).
4. **Log-a-set flow** (the core screen) (Codex implements, Claude reviews the diff and checks it against a real browser at phone width).
5. **History, PRs, progress charts, bodyweight trend.**
6. **Plate calculator and warm-ups wired to settings.**
7. **Install/offline behaviour** (service worker or equivalent), verified with the network disabled.
8. **Accessibility and performance pass** with synthetic data.

For every task:
- Dispatch with `scripts/codex-dispatch.ps1 -TaskId <id>`, then `verify -TaskId`, a `task review` by the other model, then `task done`. Follow HANDOFF.md's After return steps. Never let Codex and Claude solve the same problem.
- Two failed Codex attempts: Claude finishes it. Usage-limit exits are not failures; do non-Codex work and continue.
- Verification fails: diagnose, one focused repair, verify again. Fails again: stop, undo only your own edits, escalate.
- One coherent commit per task, no trailers. No push.

## Phase 3: Prove it works
- Run the full test suite and report the exact command and its output (FACT).
- Open the app in the built-in browser at phone width, log a full synthetic session, kill the network, reload, confirm nothing was lost, export, wipe, import, confirm the data is identical. Report what you actually saw, with screenshots only if useful.
- Seed ~20,000 synthetic sets and report load and chart times as measured numbers.
- Write `HANDOFF-REPORT.md`: state, what is done, open items, UNKNOWNs, exact next steps.

## Acceptance (all must be true before you say it is done)
- [ ] Every Must-have item works, shown by a test or a recorded manual check, not by assertion.
- [ ] All calculation tests pass; expected values were hand-verified, not copied from the implementation's own output.
- [ ] Export → wipe → import reproduces the data exactly; bad files are rejected with no partial write.
- [ ] Works fully offline after first load; no network requests at runtime (checked in the browser's network log).
- [ ] No real personal data, secrets or third-party runtime scripts in the repo.
- [ ] AGENTS.md Stack, Folder Map and Commands filled in from verified inspection only.
- [ ] Risky tasks (calculations, storage, import/export) each had a Claude diff review and a Codex verifier run.
- [ ] Scope respected: nothing from "Should have" or "out of scope" built unless I approved it.

## Report format
Short. Tables for numbers. Lead with the bottom line, then evidence, then open items. No narration, no pasted diffs or long logs; reference paths.
