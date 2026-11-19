# LT-POL-AV: review batch A of the design polish (read-only)

## Mode and owner
LT-POL-AV · verify role · read-only. Codex implemented LT-POL-A (`tasks/LT-POL-A.md`); this run tries to break it. Do not edit, create or delete repository files. Temporary files only under `%TEMP%`. Synthetic data only.

## Change under test
The working-tree diff of `lifting-tracker/styles/app.css`, `lifting-tracker/src/ui/app.js`, `lifting-tracker/src/ui/views/muscles.js`, `lifting-tracker/UI-CLASSES.md` against HEAD (`git diff -- <those paths>`). Ignore other dirty paths; they belong to other work.

## Verify commands
- `cd lifting-tracker && node --test` (expect 386 pass, 1 skip).
- `node --check lifting-tracker/src/ui/app.js` and `lifting-tracker/src/ui/views/muscles.js`.
- Recompute contrast for every changed token pair in both theme blocks AND the `prefers-color-scheme: light` copy (they must match).

## Attack
- Behaviour change hidden in CSS: `.btn[disabled]` lost `pointer-events: none` — can any disabled control still act (a `label.btn` wrapping a file input, an element with `disabled` that isn't a form control)? `.wk-bar` lost `outline: none` — any double focus ring?
- `--line-ctl` used on controls inside `.seg`, `.rest-timer`, `.toast`, `.banner`, sheets, `.bb-stage` or anywhere it now looks wrong or overrides a deliberate border (grep every `.btn`/`input`/`.chip` override that set its own border before).
- The light tokens: are `--line-ctl`, `--good-text`, `--example-ink` defined in all three places (dark `:root`, `[data-theme=light]`, the media-query block), and does `[data-theme="dark"]` on a light-preferring system get the dark values?
- Nav underline: `.tab[aria-current] span` — does the rail (wide screens) and tab bar both still fit; is anything else using `span` inside `.tab`?
- A1–A14 in the task file that the diff doesn't actually address, or addresses differently from the report.
- Checkbox 20 px with `flex: none`: any checkbox used outside `label.row` (tables, `.field`) that this breaks?

## Report
HANDOFF.md Verifier instruction and Report format. Each problem: reproduction, file:line, severity.
