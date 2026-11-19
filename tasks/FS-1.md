# Task FS-1: break the finance-shorts compliance guardrails (verifier run)

Task ID `FS-1`. Mode Dispatch, `-Role verify` (read-only). `tool: none`. Baseline HEAD `6289ead` on `main`, 2026-10-10. Claude owns fixes, commits and push; Codex edits nothing.

## What is under test

`finance-shorts/src/checks.py` is the gate between an LLM- or human-written Short script and a published video. It must stop any script that (a) states or shows a number that is not in the human-reviewed fact brief, (b) makes guarantees, get-rich claims or predictions, (c) names a specific stock or ticker or tells the viewer what to buy or sell, or (d) rests on a brief that is not reviewed or does not cite two real trusted-domain sources. Also read `finance-shorts/src/pipeline.py` (`generate_script`, `render`) for how the checks are called, the sample `finance-shorts/briefs/*.json` and `finance-shorts/examples/compound-interest.script.json`, and `finance-shorts/tests/test_checks.py`.

## Write allowlist

None. Never edit, create or delete repository files. Temporary files only under `%TEMP%\fs1-verify\`. Set `PYTHONDONTWRITEBYTECODE=1` so running Python leaves no `__pycache__`.

## Out of scope

Network calls, the Anthropic API, rendering video, the Instagram work (`instagram/`, `tasks/IG-*.md`, `finance-shorts/style/instagram-playbook.md`), `finance-shorts/style/persona.md`, `.gitignore`, and anything under `.ccx-worktrees/`. Pre-existing uncommitted paths to ignore: `.gitignore` (M), `finance-shorts/style/instagram-playbook.md` (D), `finance-shorts/style/persona.md` (M), `instagram/`, `tasks/IG-1.md`, `tasks/IG-2.md`, `tasks/WP-1.md`, `prompts/crucible-overall-upgrade.md`, `roblox-videos/`, `wallpaper/`.

## Verify commands (run these first)

```powershell
cd finance-shorts
$env:PYTHONDONTWRITEBYTECODE = "1"
.\.venv\Scripts\python.exe -m unittest discover -s tests -t .
```

Expect 15 tests passing. Then attack with small `python -c` or temp-file scripts that import `src.checks` (`check_brief`, `check_script`, `numbers`, `visual_numbers`) and build a reviewed copy of `briefs/compound-interest.json` in `%TEMP%`.

## Attacks to try (add your own)

1. Numbers: spelled-out numbers ("one thousand", "seven percent", "twenty"), "1k", "1.5M", fractions, ranges ("5-7%"), unicode digits, digits split by spaces or periods ("1 000", "1.000"), numbers inside `title`, ledger `label`, `lines`, `text`, `keywords`, the metadata fields `title`/`description`/`tags` (are these checked at all?), and `narration` vs `visual` mismatches.
2. Banned claims by paraphrase: "guaranteed" variants, "sure thing", "can't go wrong", "never lose money", "double your money", "financial freedom", "retire early", "beat the market", hype without the exact regex words.
3. Picks and advice: tickers without `$` ("TSLA", "AAPL stock"), company or fund names ("Vanguard", "S&P 500 ETF" as a recommendation), "you should/must/need to" variants ("you ought to", "I'd put it all in", "go buy").
4. `check_brief`: spoofed domains (`investor.gov.evil.com`, `notinvestor.gov`, `evil.com/investor.gov`, userinfo `https://investor.gov@evil.com/`, uppercase or punycode hosts), duplicate source URLs that differ only by trailing slash or fragment, `reviewed` as the string "false" or "true", a fact whose `source` index is a bool/float/negative, facts with a missing `text`.
5. Structure: a `hook` first scene with an empty `text`, `upto` of 0 or negative, a `counter` with `years` 0 or negative or `rate` negative, `lines` containing non-strings, scenes where `visual` is missing or not a dict, `fact_ids` that are not lists, a script with `scenes` not a list, huge scene counts. Anything here that raises an unhandled exception instead of returning a problem list is a finding.
6. Anything the unit tests claim to cover but do not really exercise.

## Done When (all Codex-owned)

- Every attack above has a Checks line in the report (PASS = the guardrail held, FAIL = a script or brief got through or a crash occurred).
- Each FAIL has a reproduction (exact command or input, expected, observed), `file:line`, and a severity (high = non-compliant content publishable; medium = bypass needs unusual input; low = cosmetic or crash on malformed input).
- A short ranked list of suggested fixes (no edits made).

## Stop conditions

If the sandbox blocks running Python or reading the `.venv`, name the exact denied command and report BLOCKED. Do not install anything or widen permissions.
