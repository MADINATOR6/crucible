> **WITHDRAWN 2026-11-26:** under the user's conflict-of-interest rule, Gemini must not author changes to its own routing policy; Claude makes these edits instead. Never registered or dispatched.

# UPGRADE-3-DOCS: bring the ccx docs up to date with Gemini's new access

Do this now: edit only the two owned files below, then report. Follow HANDOFF.md, Implementer instruction. This task owns two launcher files on purpose (UPGRADE-3 owned-path parity); touch nothing else.

Write allowlist: `ccx/ARCHITECTURE.md`, `ccx/policy.json`.

1. `ccx/policy.json`, `providers.gemini.note` (around line 48): its text still says headless runs "deny shell commands". Replace that part so it says what UPGRADE-3 made true (source: `tasks/UPGRADE-3.md` and the Gemini paragraph in `AGENTS.md`, Roles): a shell inside Antigravity's read-only, offline terminal sandbox; writes to any path the task owns; turbo with `-Sandbox danger-full-access` behind the `codex-full-access` approval; AI-credit purchases off. Change only the `note` string value. The file must stay valid JSON: no other key, value, order or formatting changes.
2. `ccx/ARCHITECTURE.md`, the `gemini` provider paragraph (around line 165): make the same correction in its existing style, one or two sentences.

Use your shell to check your work: `git diff -- ccx/policy.json ccx/ARCHITECTURE.md` must show only those changes, and `node -e "JSON.parse(require('fs').readFileSync('ccx/policy.json','utf8'))"` must exit 0 (both are read-only and work in your sandbox). Report per HANDOFF.md Report format with `Untested:`.
