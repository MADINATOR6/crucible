---
crucible: brief
owner: gemini
owns: handoffs/UPGRADE-friction-audit.md
---
# UPGRADE-0-AUDIT: check six known workflow problems against the current code

Do this now: read the files named below with your file tools and write `handoffs/UPGRADE-friction-audit.md`. Follow HANDOFF.md, Implementer instruction; your only write location is that one file. Do not edit anything else. You have no shell: report shell checks as NOT RUN.

For each item give a verdict `already fixed`, `partly fixed` or `still open`, then the evidence as `path:line` with a short quote of the code that decides it, then one line on what would close it. Read the code, not FRICTION.md's own "fixed" notes: a note is a claim.

1. **Baseline of unrelated dirty files** (FRICTION.md rows dated 2026-11-06, 2026-11-10, 2026-11-14). Where is `baselineDirty` recorded (search `scripts/ccx-core.ps1`, `scripts/ccx-ops.ps1`, `scripts/codex-dispatch.ps1`)? Is it recorded by `task add`, by `task start`, or only by a dispatch? Does `ccx verify`'s scope stage subtract it?
2. **Transient provider failures counted as attempts** (FRICTION.md rows dated 2026-11-05: "at capacity", Higgsfield HTTP 500). In `scripts/codex-dispatch.ps1`, how is a usage limit (exit 4) kept from counting toward `maxDispatches`? Is there any handling of capacity errors or provider 5xx? Quote the matching patterns.
3. **Gemini fallback** (`ccx health` reports `provider-gemini not set`). Find that health check in `scripts/ccx-ops.ps1` or `scripts/ccx-core.ps1`: what does it test (an environment key? the `agy` command?), and does the Codex-usage-limit fallback in `Invoke-CcxRoute` reach the `gemini` provider (`cli: agy` in `ccx/policy.json`)?
4. **Sandbox cannot create TEMP scratch folders** (FRICTION.md row dated 2026-11-12). How do `scripts/test-ccx.ps1`, `scripts/test-codex-dispatch.ps1`, `scripts/test-crucible.ps1` create their scratch root? Is there any fallback when TEMP is denied?
5. **AGENTS.md / CLAUDE.md symmetry**. Is there any verify stage in `ccx/policy.json` (`verify.stages`) or code in `scripts/ccx-ops.ps1` that checks that a change to one file comes with a change to the other?
6. **Retiring slug `gpt-oss-120b-medium`** (retires 2026-11-30). List every file and line that names it, and say whether any is a route, fallback or default (policy or script) rather than prose.

End with: `Status`, a one-line summary table (item, verdict), `Untested:` (what you could not check without a shell) and `Next owner: claude - reads the verdicts before planning`.
