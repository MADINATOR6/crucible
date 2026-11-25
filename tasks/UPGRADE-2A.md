# UPGRADE-2A: New brief modal asks for work type and output file

Source: `handoffs/UPGRADE-ux-review.md` item 1; Codex plan for UPGRADE-2 (part A). Owner: Claude.

Write allowlist: `scripts/crucible.ps1`, `scripts/test-crucible.ps1`, `.obsidian/plugins/crucible/main.js`.

- `crucible.ps1 new` takes optional `-Owns <path>`. When given, the new brief's frontmatter is validated with the same `Test-Brief` rules a launch uses (type eligible, no gate, owns not protected, no cmd metacharacters, plus no comma, which the inline list cannot hold) **before** the file is written; a refusal creates no note. Without `-Owns` the old scaffold is unchanged.
- `crucible.ps1 types` prints the brief-eligible types (route not `tool`, no gates), one per line, so the plugin offers only valid choices.
- `NewBriefModal` adds a Work type dropdown (default: chosen by owner) and an Output file field; `create` passes `-Type`/`-Owns` when set.

Done When:
- [Claude] `scripts/test-crucible.ps1` case `new validates a launch-ready brief` passes (type + spaced path round-trip; gated type and protected path refused with no file; types lists eligible types only), and the suite exits 0.
- [Claude, by hand / NEEDED] reload the plugin in Obsidian and create one brief through the modal (user, next session: the agent cannot drive Obsidian).
- [Codex] review the diff.
