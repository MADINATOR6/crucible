# HF-1: Higgsfield media tasks in ccx (gate, credit cap, ledger, inventory, tests)

Task ID: HF-1. Type implement, class normal, risk high (routes as complex), owner codex, Dispatch mode with full access: Codex's elevated Windows sandbox cannot start processes (`codex doctor`: provisioning failed, `helper_unknown_error`), and the user approved full access in chat on 2026-10-25.
Base: `main` at `8fb51f2`. The working tree has unrelated uncommitted edits (`finance-shorts/`, `.gitignore`, `.claude/skills/nursing-notes/`, `tasks/FS-1.md` and others). They are not yours: never touch, stage or revert them.

## Goal

Make Higgsfield media work a ccx task type with a paid-action gate, a per-task credit cap and a ledger check, reusing the existing gate, approval and verification mechanics (no parallel system). Later media tasks run in these types; this task only builds the plumbing. No Higgsfield calls, no network and no spend in this task.

## Write allowlist

`ccx/policy.json`, `scripts/ccx.ps1`, `scripts/ccx-core.ps1`, `scripts/codex-dispatch.ps1`, `scripts/higgsfield.ps1`, `scripts/check-external-tools.ps1`, `scripts/test-higgsfield.ps1`, `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-external-tools.ps1`. Temporary files only under `%TEMP%`, as the existing suites do.

## Out of scope

All Markdown docs (`AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `ccx/ARCHITECTURE.md`, `EXTERNAL-TOOLS.md`, `FRICTION.md`, `.claude/**`): Claude writes them in HF-2. `media-out/`, `.codex/`, `.mcp.json`, `.claude/settings.json`. Any Higgsfield CLI or MCP call. Git staging or commits. Installs.

## Changes

1. **`ccx/policy.json`**
   - `taskTypes`: add `"media-generate": {"route": "worker", "agent": "codex", "codexRole": "implement", "level": "L4", "gates": ["paid-action"], "ledger": "media-out/higgsfield/", "note": "Spends Higgsfield credits: task add needs -CreditCap and one owned media-out/higgsfield/<project>/ folder; the launcher consumes a paid-action approval; task done checks it and the ledger."}` and `"media-edit": {"route": "worker", "agent": "codex", "codexRole": "implement", "level": "L2", "note": "Local ffmpeg edits of existing media only; no Higgsfield calls."}`.
   - `mcp.codexAllowedServers`: `["node_repl", "higgsfield"]`; `mcp.projectAllowedServers`: `["higgsfield"]`.
   - `verify.stages`, after `tests-mirror`: `{"name": "tests-higgsfield", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\test-higgsfield.ps1", "when": ["scripts/higgsfield.ps1", "scripts/test-higgsfield.ps1"], "timeoutMinutes": 10}` and `{"name": "tests-external-tools", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\test-external-tools.ps1", "when": ["scripts/check-external-tools.ps1", "scripts/test-external-tools.ps1", "AGENTS.md", "CLAUDE.md"], "timeoutMinutes": 15}`.
2. **Policy validation** (`Get-CcxPolicy`): the policy is invalid if a task type's `gates` names anything that is not a key of `permissions.actions`, or its `ledger` is not a repo-relative folder ending in `/` that `ConvertTo-CcxOwnedPath` accepts.
3. **`task add`** (`scripts/ccx.ps1`, `scripts/ccx-core.ps1`)
   - `ccx.ps1` gains `[string]$CreditCap`, passed through like the other parameters.
   - A type whose `gates` contain `paid-action` requires `-CreditCap`: a finite number above 0, parsed with the invariant culture (0, negative, NaN and text are refused with exit 2 and a clear message). `-CreditCap` on any other type is refused with exit 2.
   - A type with a `ledger` requires at least one owned path that starts with the ledger root and ends with `/` (a project folder such as `media-out/higgsfield/poodle-sneeze/`); otherwise exit 2.
   - Every task stores `creditCap` (the number, or null). All existing fields stay.
4. **`route`** (`Invoke-CcxRoute`): the decision gains `gates` (the type's gates, an empty array when none) and `creditCap` (the task's, or null). Nothing else about routing changes. `media-generate` routes to codex with codexRole implement and permissionLevel L4; `media-edit` to L2.
5. **`task done`**: for a type whose gates contain `paid-action`, in addition to every current check (same exit 8, same `Task not done:` list):
   - a `paid-action` approval for this task (its `taskId` or `target` equals the task id) with status `approved` or `used`, else `paid-action approval`;
   - ledger: for each owned path under the type's ledger root that ends with `/`, read `<task root><owned>log.jsonl` when it exists (through `Get-CcxSafeFile`; task root = its worktree, else the repo root) and sum `credits` over rows whose `task` equals the task id exactly. Over `creditCap` adds `ledger total <sum> exceeds credit cap <cap>`; a row that is not valid JSON adds `readable ledger`. Rows of other tasks or without `task` are ignored; a missing `log.jsonl` counts as 0.
6. **`scripts/codex-dispatch.ps1`** (with `-TaskId` only)
   - Required approvals for a run, each with the task id as target: `codex-full-access` when `-Sandbox danger-full-access` (as today), plus `paid-action` when the role is implement and the task type's gates contain `paid-action`.
   - Before consuming any approval, check from state, without consuming, that every required one exists with status `approved`. If any is missing, call `Invoke-CcxGate` only for the missing ones (that records them as pending and prints the approve command), exit 10, and leave the approved ones unconsumed.
   - When all are present, consume each through `Invoke-CcxGate`, print its message, then dispatch. Runs that need only full access keep today's behaviour and messages.
7. **`scripts/higgsfield.ps1`** (bookkeeping only; it still never calls Higgsfield)
   - New parameters `[string]$Task` and `[double]$Next` (default 0).
   - `new`: `-Budget` above 0 stores `budget` in `project.json` (omitted otherwise).
   - `log`: `-Task <id>` adds `task` to the row; the id must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`, else exit 2.
   - `summary`: the cap is `-Budget` when above 0, else the project's `budget`, else none; print the cap when set. `-Task <id>` limits totals to that task's rows and says so. `-Next <credits>` adds a pending call: exit 1 with `OVER BUDGET: <spent> + next <n> > <cap>` when spent plus next exceeds the cap; keep the existing `OVER BUDGET: <total> > <cap>` exit 1 when already over.
   - `show`, `new`, `element`, `log` and `summary` otherwise keep their behaviour and output.
8. **`scripts/check-external-tools.ps1`** (inventory mode only; the strict checks stay unchanged): after the generate row add Tool `higgsfield`, AvailableTo `Both`. Status `cli-pass` when `higgsfield.ps1 show` exits 0 (through `Invoke-Version`, like generate) and `$RepoRoot/.mcp.json` declares `mcpServers.higgsfield` and `$RepoRoot/.codex/config.toml` has a `[mcp_servers.higgsfield]` table; otherwise `unavailable`. Check text: `show + both MCP configs (offline); higgsfield CLI present|absent; sign-in and credits UNKNOWN (never spends)`, where CLI presence is `Get-Command higgsfield.cmd`, never executed. No network, no credentials read.
9. **Tests** (synthetic, offline, no Higgsfield or network calls)
   - `test-higgsfield.ps1`: `new -Budget` stores the budget; `log -Task` adds `task` and refuses a bad id; `summary` uses the project budget (exit 1 when over) and `-Budget` overrides it; `-Task` filters; `-Next` exits 1 when spent plus next exceeds the cap and 0 within it. Existing checks keep passing.
   - `test-ccx.ps1` (existing `Case` style):
     - (a) `media-generate` add refused without `-CreditCap`, with 0 or text, and without an owned ledger folder; accepted with 60 and owns `media-out/higgsfield/demo/`; its route shows gates `paid-action`, creditCap 60 and L4. `implement` with `-CreditCap` refused. `media-edit` add and route show no gates and L2.
     - (b) `media-generate` done: write the ledger before `Set-Verification` (the fingerprint covers owned files). Done is refused without a paid-action approval. After `gate` plus `approve -Chat`, it is refused when this task's rows exceed the cap (rows of another task or without a task are ignored), and it passes within the cap.
     - (c) a policy whose gates name an unknown action is rejected.
   - `test-codex-dispatch.ps1` (`Ccx-Case` style, modelled on `full access requires and consumes chat approval`):
     - A `media-generate` implement dispatch exits 10 without a paid-action approval, and the fake never runs. After `approve` it runs and the approval is `used`.
     - With `-Sandbox danger-full-access` and only paid-action approved: exit 10, paid-action stays `approved`, and codex-full-access is pending. After approving that too, the run succeeds and both are `used`.
   - `test-external-tools.ps1`:
     - the inventory has 6 rows;
     - the readiness case expects 5 `cli-pass`, `rows[3]` still `files-present`, and a last row `higgsfield` with `cli-pass`;
     - the unavailable case passes `-RepoRoot` to an empty temp folder, so all 6 rows are `unavailable`;
     - add `higgsfield.ps1` to the documentation-symmetry name list.

## Verify (Codex runs each and reports PASS/FAIL with counts and durations)

Run the suites one at a time (FRICTION.md: parallel runs flake; test-ccx takes about 12 minutes).

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-higgsfield.ps1`
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-external-tools.ps1`
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx.ps1`
4. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-ccx-ops.ps1`
5. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-codex-dispatch.ps1`
6. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 route -Type media-generate -Class normal -Risk low -Json`
7. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-external-tools.ps1 -Json`

## Done When

- [Codex] Changes 1-9 made inside the allowlist; Verify 1-7 PASS with evidence from this run.
- [Claude] Diff review; `ccx verify -TaskId HF-1` full PASS; Codex verifier run; `task review`; `task done`; commit.

## Stop conditions

- Needing a file outside the allowlist, or a behaviour change not listed here: stop that part and report UNKNOWN / CHECKED / NEEDED with a proposal.
- A suite that already fails on unchanged code: report it; do not fix it.
- Never call Higgsfield (CLI or MCP), never use the network, never install, never stage or commit.
