# Task IG-2: standalone Instagram carousel renderer (AI tools and productivity niche)

Task ID `IG-2`, Dispatch mode, `tool: none`. Replaces the parked first attempt `instagram/carousel-draft/` (finance-coupled, visually bland). Read `instagram/playbook.md` first (sections "What the videos agree on" points 3-5 and "Decision for us").

**Separation rule (owner, 2026-10-10):** Instagram is a separate project from `finance-shorts/` (YouTube) and `roblox-videos/`. Everything lives in `instagram/`. Do not import, read from, copy from or edit anything in `finance-shorts/` or `roblox-videos/` (no `checks.py`, no mascot, no persona, no briefs). `instagram/carousel-draft/` may be consulted for ideas but not imported; delete nothing.

## Write allowlist

`instagram/carousel.py`, `instagram/brand.json`, `instagram/posts/prompts-that-save-hours.json` (example post), `instagram/tests/test_carousel.py`, `instagram/tests/__init__.py`, `instagram/README.md` (short: how to run, input format, human review gate). Output goes to `instagram/output/<slug>/` (gitignored). No other writes, no staging, no commits, no installs (a venv with Pillow 12.3.0 already exists at `instagram/.venv`; use `instagram\.venv\Scripts\python.exe`; Pillow only, no other dependency).

## What it does

`cd instagram; .\.venv\Scripts\python.exe -m carousel <slug>` reads `posts/<slug>.json` and `brand.json`, validates, then writes `output/<slug>/slide-01.png` ... (1080x1350, 4:5) and `caption.txt`. Options: `--post <path>`, `--out <dir>`.

### `brand.json`
`{"name": "PAGE NAME TBD", "handle": "@pagehandle", "tagline": "...", "colors": {"bg1": "#...", "bg2": "#...", "accent": "#...", "accent2": "#...", "text": "#FFFFFF", "card": "#..."}}`. Dark-to-violet/teal tech palette, original, no real brand's colors. The name is a placeholder until the owner picks one; code must not hardcode it.

### Post file
```json
{
  "title": "...", "verified_on": "2026-10-10",
  "sources": [{"name": "...", "url": "https://..."}],
  "caption": "Hook line.\nTwo-three keyword-rich sentences.\nSave this for later. Comment WORD and I will send ...",
  "hashtags": ["#a", "#b", "#c", "#d", "#e"],
  "disclosure": "",
  "slides": [
    {"role": "hook", "headline": "...", "kicker": "..."},
    {"role": "point", "kicker": "Prompt 1", "headline": "...", "body": ["..."], "chips": ["For: emails"], "prompt": "Full copy-paste prompt text ..."},
    {"role": "cta", "headline": "Save this for later", "body": ["Comment WORD ..."]}
  ]
}
```
`prompt` is optional and renders as a monospace-style "prompt card" (rounded dark box, wrapped text, tiny label "COPY THIS PROMPT").

## Validation (all of it, in `carousel.py`; fail with exit 1, one problem per line, write nothing)

1. 8 to 10 slides; first role `hook`, last `cta`, rest `point`.
2. `headline` at most 9 words; at most 3 `body` lines of at most 18 words; at most 3 `chips`; `prompt` at most 45 words; exactly 5 hashtags, each starting with `#`.
3. `sources` has at least 1 entry with an `https` URL, and `verified_on` is an ISO date. (The owner verifies tool claims against these before posting; the code only checks that they exist.)
4. Banned claim patterns in every text field and the caption (case-insensitive): guarantee(d), "get rich", "passive income", "make $" / "earn $" with a number, "10x your income", "overnight", "secret that", "they don't want you to know". No `$` followed by digits at all unless the post sets `"allow_money": true` (guards income claims).
5. If the caption or any slide mentions "affiliate" or "link in bio to buy", or the post has `"sponsored": true`, then `disclosure` must be non-empty and is drawn on the cta slide and appended to the caption.
6. Text must fit: if a headline cannot fit within 4 lines at the minimum font size, fail with the slide number instead of clipping.

## Visual requirements (the owner already rejected flat navy slides as "bland")

Canvas 1080x1350, 90 px safe margin on every edge.
1. **Background not flat**: vertical gradient from `bg1` to `bg2` plus a subtle repeating motif (dot grid, faint circuit lines or large faint rings) at low contrast. Slightly different accent per role (hook, point, cta), same palette.
2. **One huge anchor per slide**: headline at least 110 px on hook, 90 px on point slides, bold (Arial Bold, Segoe UI Bold, Bahnschrift or Impact from `C:\Windows\Fonts`), accent color with a dark outline, auto-shrunk to fit.
3. **Kicker** ("Prompt 1", "Step 2") as a filled pill above the headline; **chips** as filled pills with 36+ px text under the headline.
4. **Prompt card** for `prompt` text and a **body card** (rounded translucent box) behind `body` lines, body text at least 44 px; content vertically distributed so no slide has more than about 25% empty space in the central band.
5. **Brand mark**: a simple original logo mark drawn in code (rounded square with a spark or chip glyph in accent colors) plus `@handle` on every slide, top-left inside the margin.
6. **Carousel affordances**: counter "3 / 10" bottom-left, progress bar along the bottom edge, a SWIPE arrow cue on slide 1 only. The `cta` slide shows the `disclosure` (28+ px) when present.
7. Hook slide gets extra punch: oversized headline, a large icon-style illustration drawn in code (for example a stylized chat bubble or lightning bolt) filling the lower third.

## Example post

`posts/prompts-that-save-hours.json`: 10 slides, "5 copy-paste prompts that save hours" for everyday work (email reply, meeting notes summary, study plan, decision pros/cons, plain-language rewrite). Use only generic prompts: NO claims about any specific tool's features, limits, prices or names (the example must be true regardless of vendor). Original wording, no income claims, helpful and concrete. `sources` may cite a general reference such as `https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers` only if used; otherwise use one official guidance URL the post truly relies on, or set `"sources"` to a single entry naming the owner's own testing with an `https` URL to the repo README. Caption ends with a "Comment PROMPTS" call to action.

## Done When

| # | Item | Owner |
| --- | --- | --- |
| 1 | `cd instagram; .\.venv\Scripts\python.exe -m unittest discover -s tests -t .` passes. Tests (synthetic data in temp dirs): valid post renders 10 PNGs of 1080x1350 plus caption.txt; rendered slide has more than 50 distinct colors and is not a single flat fill; each validation rule 1-6 has a failing case; a failure writes nothing; no import from `finance-shorts` or `roblox-videos` anywhere (a test greps `carousel.py`). | Codex |
| 2 | `.\.venv\Scripts\python.exe -m carousel prompts-that-save-hours` exits 0 and writes `output/prompts-that-save-hours/` with 10 slides + caption. Use `--out` with a NEW directory name if the default path is not writable; do not fight Windows ACLs. | Codex |
| 3 | Claude opens slides 1, 4 and 10 and judges them against the visual requirements. | Claude |
| 4 | Diff touches only the allowlist; nothing under `finance-shorts/` or `roblox-videos/` changed. | Claude |

## Stop conditions

Stop and report UNKNOWN / CHECKED / NEEDED if a requirement needs a file outside the allowlist, a font is missing, or text fitting cannot be done within Pillow alone. One repair attempt, then report. Report format: `HANDOFF.md`.
