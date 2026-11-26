# UPGRADE-3 Round-2 Adversarial Review (Gemini)

Verdict: **REFUTED**
Status: READY_FOR_CLAUDE_REVIEW
Task / start HEAD: UPGRADE-3-REVIEW-R2 / e2f0bb2
Target reviewed: commit `0ae6b3e` and `handoffs/UPGRADE-3-fix.diff` (verified byte-identical to `git diff 0ae6b3e^ 0ae6b3e -- scripts/`, 23,153 bytes; `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md` reviewed via `git show 0ae6b3e`)

## Executive Summary

Every round-1 fix in `0ae6b3e` works as intended: plain backslash paths (1a), comma smuggling (1b), existing launcher-owning task hijacking (1c), timeout masking of exit `9` (2b), and the read-only `agy` prompt are all closed, and restoring `Invoke-Run`'s unconditional `$tampered` check (`scripts/crucible.ps1:303`) blocks round 1's immediate unsandboxed `Invoke-Check` / `ccx verify` execution chain.

However, the core invariant *"Obsidian briefs still cannot own the launcher stack"* / *"a brief can never own the launcher stack (Test-Brief, Invoke-Launch)"* (`AGENTS.md:126`, `scripts/crucible.ps1:301`) is still **refuted** by **two concrete `Test-Brief` → `ccx task add` normalization bypasses** (both verified in PowerShell against `scripts/ccx-core.ps1` + `ccx/policy.json`):

1. **Leading whitespace inside quoted `owns:`** (`owns: " scripts/ccx.ps1"`, `owns: [" scripts/"]`, block list `- " scripts/ccx.ps1"`, or Unicode whitespace `\u00A0scripts/ccx.ps1`) — **High**.
2. **Existing directory without a trailing `/`** (`owns: lifting-tracker`) — **High** (a realistic accidental input in Obsidian's New Brief modal as well as hand-edited briefs).

Both inputs pass `Test-Brief`, register a `ccx` task whose `task.owns` covers `agentProtectedPaths`, lift runtime `write_file(...)` denies and exempt the path from `codex-dispatch.ps1:581-582` (`codex-dispatch.ps1` exits `0` and leaves modified protected files on disk; `Invoke-Run:303` only catches the tampering *after* the write). Both fixes are ~5 lines in `scripts/crucible.ps1` (already in UPGRADE-3's allowlist).

## Claims Table (Judge Checklist)

| Claim (`tasks/UPGRADE-3-REVIEW-R2.md` / `0ae6b3e`) | Observed |
| --- | --- |
| `handoffs/UPGRADE-3-fix.diff` holds all UPGRADE-3 script changes | Confirmed (`FIX_DIFF_MATCH=True`, 23,153 bytes against `git diff 0ae6b3e^ 0ae6b3e -- scripts/`). |
| `Test-Brief` closes 1a (backslash) and 1b (comma) (`scripts/crucible.ps1:98-107`) | **Confirmed for 1a and 1b**, verified in PowerShell (`scripts\ccx.ps1` -> `REJECT(protected:scripts/)`, `Reference/a.md,scripts/` -> `REJECT(comma)`, `- Reference/a.md,AGENTS.md` -> `REJECT(comma)`). **REFUTED** for the broader invariant that briefs cannot own the launcher stack (Findings R2-1 and R2-2 below). |
| `Invoke-Launch` refuses a brief whose existing ccx task owns a launcher path (1c) (`scripts/crucible.ps1:233-237`) | Confirmed statically (checks every `$owned` in `$task.owns` against `agentProtectedPaths` via `Test-CcxPathOverlap`). Note: runs only on an *existing* task, not after `ccx task add` creates one via R2-1/R2-2. |
| `Invoke-Run`'s tamper check is unconditional again for brief runs (`scripts/crucible.ps1:303`) | Confirmed (`$tampered = @(Compare-CcxProtectedHashes $protectedBefore $protectedAfter)` with no `$task.owns` filter; lines `312, 318` skip `Invoke-Check` and `ccx verify` when `$tampered.Count` is nonzero). |
| Exit `9` now outranks a timeout (2b) (`scripts/codex-dispatch.ps1:623-625`) | Confirmed (`if ($timedOut) { $code = 5 }` precedes `if ($protectedChanged.Count) { $code = 9 }`). |
| Read-only `agy` runs get a no-edit prompt (`scripts/codex-dispatch.ps1:433-434`) | Confirmed (`elseif ($Sandbox -eq 'read-only')` sets `'This run is read-only: do not edit files...'`; minor cosmetic carryover on line `438` noted below). |
| Turbo keeps `allowNonWorkspaceAccess` false (`scripts/codex-dispatch.ps1:446`) | Confirmed in code (`allowNonWorkspaceAccess = $false`), though still unasserted in `scripts/test-codex-dispatch.ps1:907`. |
| New regression tests added; Claude's runs (`test-codex-dispatch` 77/77, `test-crucible` 23/23) and live turbo probes | New tests verified statically (`test-codex-dispatch.ps1:865-883`, `test-crucible.ps1:296-306`, no test weakening). Suite runs and live `agy` probes **NOT RUN** here (read-only offline sandbox). |

## Open / Newly Introduced Findings

### R2-1 (High) — Leading whitespace inside quoted `owns:` bypasses `Test-Brief` and registers protected launcher paths in `ccx`
- **Location:** `scripts/crucible.ps1:56, 59, 61` (`Read-Brief`), `scripts/crucible.ps1:96-108` (`Test-Brief`), interacting with `scripts/ccx.ps1:22` and `scripts/ccx-core.ps1:344, 354, 1222-1228`.
- **Concrete inputs (all verified in PowerShell against `scripts/ccx-core.ps1` + `ccx/policy.json`):**
  - Scalar: `owns: " scripts/ccx.ps1"` (or `owns: " .obsidian/plugins/crucible/main.js"`, `owns: " AGENTS.md"`, `owns: " lifting-tracker/package.json"`, `owns: " scripts\ccx.ps1"`, or NBSP `\u00A0scripts/ccx.ps1`)
  - Inline list: `owns: [" scripts/"]`
  - Block list:
    ```yaml
    owns:
      - " scripts/ccx.ps1"
    ```
- **Expected:** `Test-Brief` rejects the brief with exit `2` (`launcher stack`), and `ccx task add` never registers it.
- **Observed:**
  - `Read-Brief` (`scripts/crucible.ps1:56, 59, 61`) runs `.Trim().Trim('"', "'")` — stripping whitespace *before* quotes and never trimming afterward — so `$fm.owns` holds `' scripts/ccx.ps1'` (or `' scripts/'`, `"\u00A0scripts/ccx.ps1"`).
  - `Test-Brief` (`scripts/crucible.ps1:98-107`) finds no comma; `ConvertTo-CcxOwnedPath` (`scripts/ccx-core.ps1:354`) only rejects *trailing* spaces (`EndsWith(' ')`), not leading spaces, returning `' scripts/ccx.ps1'`; `Test-CcxPathOverlap` returns `False` for every `agentProtectedPaths` entry (`TestBrief=PASS`).
  - `Invoke-Launch` (`scripts/crucible.ps1:227-228`) passes `-Owns ' scripts/ccx.ps1'` to `ccx task add`, where `Split-CcxList` (`scripts/ccx.ps1:22`, `scripts/ccx-core.ps1:344, 1222`) calls `$part.Trim()`, trimming both ASCII space and `\u00A0` and storing `task.owns = ['scripts/ccx.ps1']` (and for `' scripts'`, `ccx-core.ps1:1224` further upgrades it to `['scripts/']`).
  - During the first run, `codex-dispatch.ps1:384` lifts the runtime `write_file(C:\...\scripts\)` deny (and Claude's `Edit(scripts/**)`), `codex-dispatch.ps1:581-582` exempts the path from `$protectedChanged`, and `codex-dispatch.ps1` exits `0` (recording `lastDispatch.exit = 0` in `ccx` state) with the modified protected file left on disk (e.g. `.obsidian/plugins/crucible/main.js` loaded by Obsidian, or `scripts/ccx.ps1` executed on the next command). `Invoke-Run:303` does catch `$tampered` after the run and skips `Invoke-Check` / `ccx verify` (preventing round 1's immediate auto-RCE), and a *second* launch is rejected by `Invoke-Launch:235`.

### R2-2 (High) — Existing directory `owns:` without a trailing `/` bypasses `Test-Brief` and owns protected files inside it
- **Location:** `scripts/crucible.ps1:100, 106` (`Test-Brief`), `scripts/crucible.ps1:150-154` (`Invoke-New`), interacting with `scripts/ccx-core.ps1:364-370, 1224-1227`.
- **Concrete input (verified in PowerShell against `scripts/ccx-core.ps1` + `ccx/policy.json` in this checkout):**
  - `owns: lifting-tracker` or `owns: [lifting-tracker]` (or `crucible.ps1 new -Title x -Owns lifting-tracker`).
- **Expected:** Rejected with exit `2` (`launcher stack`), matching `owns: lifting-tracker/`.
- **Observed:**
  - `Test-Brief` (`scripts/crucible.ps1:100, 106`) calls `ConvertTo-CcxOwnedPath 'lifting-tracker'`, which returns `'lifting-tracker'` (no trailing `/`).
  - `Test-CcxPathOverlap 'lifting-tracker' 'lifting-tracker/package.json'` returns `False` (neither ends with `/` and they are unequal). Same for `lifting-tracker/package-lock.json` and `lifting-tracker/playwright.config.js` -> `TestBriefOverlap=[]` (`Test-Brief` passes; `crucible.ps1 new -Owns lifting-tracker` also accepts it).
  - `Invoke-Launch` (`scripts/crucible.ps1:227-228`) runs `ccx task add ... -Owns lifting-tracker`. `ccx-core.ps1:1224-1227` sees `Test-Path (Join-Path $root 'lifting-tracker') -PathType Container` is `True` and upgrades `$owned` to `lifting-tracker/`, which overlaps all three protected files (`lifting-tracker/package.json`, `lifting-tracker/package-lock.json`, `lifting-tracker/playwright.config.js`).
  - `codex-dispatch.ps1:384` lifts all three `write_file(...)` denies and `codex-dispatch.ps1:581-582` exempts them (`codex-dispatch.ps1` exits `0`; only `Invoke-Run:303` flags `$tampered` afterwards).

### R2-3 (Low) — Remaining test-coverage & prompt polish gaps
- **`scripts/test-codex-dispatch.ps1:906-907`:** Turbo test still does not assert `$s.allowNonWorkspaceAccess -eq $false`, unowned `permissions.deny` presence in turbo, or single-use approval consumption (a second turbo launch exiting `10`). Headless Claude owned-path parity (`scripts/codex-dispatch.ps1:462, 581-582`) still has no automated case.
- **`scripts/codex-dispatch.ps1:438`:** On read-only `agy` runs (`$Sandbox -eq 'read-only'`), `$prompt` says `"This run is read-only: do not edit files..."` and then appends `"Inspect existing owned outputs before editing."` (cosmetic contradiction).

## Deferred Items Assessment (Should Any Block UPGRADE-3?)

None of the three out-of-allowlist deferred items need to block UPGRADE-3, with clear follow-up notes:
1. **`.git` pointer files and reparse points in `Get-CcxProtectedHashes` (`scripts/ccx-core.ps1:453-470`, `ccx/policy.json:138`):** **Do not block UPGRADE-3**, but track as a prompt follow-up (`ccx-core.ps1` task). In default normal `agy` runs, the terminal sandbox is read-only so Gemini cannot create junctions/symlinks; the dangling-symlink crash (`Get-FileHash` throwing exit `1` instead of `9`) and worktree `.git` pointer exposure mainly matter for L4-approved turbo or worktree runs.
2. **Content-hash baselines for pre-dirty files (`scripts/ccx-core.ps1:450`):** **Do not block.** Pre-existing `Test-CcxScope` limitation shared with Codex and Claude; protected launcher paths already use SHA-256 hashing.
3. **Obsidian writing `.obsidian/graph.json` during a run (false exit `9`):** **Do not block.** Fails closed safely; when adding a follow-up exclusion beside `.obsidian/workspace.json` (`scripts/ccx-core.ps1:465`), keep `.obsidian/` in `agentProtectedPaths` so runtime write denies still cover it.

## Smallest Fixes (All Inside `scripts/crucible.ps1` + `scripts/test-crucible.ps1`)

1. **`scripts/crucible.ps1:56, 59, 61` (`Read-Brief`):** Trim after stripping quotes: `.Trim().Trim('"', "'").Trim()`.
2. **`scripts/crucible.ps1:96-108` (`Test-Brief`):**
   - Reject leading/trailing whitespace on `$path`: `if ($path -ne $path.Trim()) { Fail "owns path '$path' has leading or trailing whitespace." }`.
   - Mirror `ccx-core.ps1:1224` before the overlap loop: `if (-not $normalized.EndsWith('/') -and [IO.Directory]::Exists((Join-Path $root $normalized))) { $normalized += '/' }` (or also test `Test-CcxPathOverlap ($normalized.TrimEnd('/') + '/') $protected` so even a not-yet-created directory matching a protected ancestor is rejected).
3. **`scripts/test-crucible.ps1:295-307`:** Add two regression cases alongside `S3`/`S4`/`S5`:
   - `S6`: brief with `owns: " scripts/ccx.ps1"` (and/or `owns: [" scripts/"]`) rejected with exit `2` and never registered.
   - `S7`: brief with `owns: lifting-tracker` (no trailing `/`, existing directory in the test repo) rejected with exit `2` (`launcher stack`) and never registered.

## Untested

- `scripts/test-codex-dispatch.ps1` (Claude's claimed 77/77) and `scripts/test-crucible.ps1` (Claude's claimed 23/23) — **NOT RUN** in Antigravity's read-only offline sandbox — **claude / codex (post-reset)**
- Claude's live `agy` turbo probes (file-tool denies enforced, shell writes bypassing denies and caught by post-run hash check) — **NOT RUN** here — **claude / user**

Next owner: claude - close R2-1 (leading whitespace in `Read-Brief`/`Test-Brief`) and R2-2 (existing folder without trailing `/` in `Test-Brief`) in `scripts/crucible.ps1`, add `S6`/`S7` to `scripts/test-crucible.ps1`, re-run `scripts/test-crucible.ps1` and `scripts/test-codex-dispatch.ps1`, and keep the 3 deferred items for a follow-up `ccx-core.ps1` task.
